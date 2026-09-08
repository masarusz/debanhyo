#!/usr/bin/env node
// Builds public/data/talents.json — a name -> official talent id map.
//
// WHY THIS IS A BUILD STEP AND NOT A RUNTIME LOOKUP:
// profile.yoshimoto.co.jp sends no Access-Control-Allow-Origin header, so a
// static page cannot resolve these in the browser. Measured 2026-09-08.
//
// It imports parseMembers from the SHIPPED module rather than reimplementing
// it, so the names resolved here are exactly the names the app displays.
//
//   node scripts/build-talents.mjs [--full]
//     default: incremental — only unmapped names are looked up
//     --full : re-resolve everything

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { parseMembers, combiName } from '../public/assets/members.js';

const here = dirname(fileURLToPath(import.meta.url));
const OUT = join(here, '../public/data/talents.json');
const FEED = 'https://feed-api.yoshimoto.co.jp/fany/theater/v1?theater=lumine&venue=01';
const SEARCH = 'https://profile.yoshimoto.co.jp/talent/list/?keywords=';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)';
const FULL = process.argv.includes('--full');

// A known-good pair. If this stops resolving, the site's markup has changed and
// EVERY lookup starts returning "no match" — which is indistinguishable from a
// run where nothing needed updating. Abort instead of writing that away.
const CONTROL = { name: 'ちょんまげラーメン', id: '5204' };

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const norm = (s) => String(s).normalize('NFKC').trim().toLowerCase();

async function search(name) {
  const res = await fetch(SEARCH + encodeURIComponent(name), { headers: { 'User-Agent': UA } });
  const html = await res.text();
  const out = [];
  const re = /\/assets\/data\/profile\/(\d+)\/[\s\S]*?resultBox_name js-resultText">([^<]+)</g;
  let m;
  while ((m = re.exec(html))) out.push([m[1], m[2].trim()]);
  return out;
}

// Exact normalised match only. No fuzzy fallback: an unmapped name degrades to
// a search link, which is always correct, whereas a near-match links to the
// wrong comedian's profile. No signal beats a false one.
async function resolve(name) {
  const hit = (await search(name)).find(([, n]) => norm(n) === norm(name));
  if (hit) return { id: hit[0], via: null };
  const combi = combiName(name);
  if (combi && combi !== name) {
    await sleep(400);
    const h2 = (await search(combi)).find(([, n]) => norm(n) === norm(combi));
    // Product decision 2026-09-08: a compound token links to the コンビ.
    if (h2) return { id: h2[0], via: combi };
  }
  return null;
}

async function main() {
  process.stdout.write('control probe... ');
  const probe = await resolve(CONTROL.name);
  if (!probe || probe.id !== CONTROL.id) {
    console.error(`FAILED: ${CONTROL.name} resolved to ${probe ? probe.id : 'nothing'}, expected ${CONTROL.id}.`);
    console.error('The search page markup has probably changed. Writing nothing.');
    process.exit(1);
  }
  console.log('ok');

  const feed = await (await fetch(FEED, { headers: { 'User-Agent': UA } })).json();
  const month = new Date().toISOString().slice(0, 7).replace('-', '/');
  const names = [...new Set(feed.filter((r) => r.date >= month)
    .flatMap((r) => parseMembers(r.member)))].sort();

  const prev = (!FULL && existsSync(OUT)) ? JSON.parse(readFileSync(OUT, 'utf8')) : { ids: {}, via_combi: {} };
  const ids = { ...(prev.ids || {}) };
  const via = { ...(prev.via_combi || {}) };
  const todo = names.filter((n) => FULL || !(n in ids));
  console.log(`${names.length} performers, ${todo.length} to resolve`);

  for (const [i, n] of todo.entries()) {
    try {
      const r = await resolve(n);
      if (r) { ids[n] = r.id; if (r.via) via[n] = r.via; }
      else { delete ids[n]; }
    } catch (e) { console.error(`  error ${n}: ${e.message}`); }
    if ((i + 1) % 25 === 0) console.log(`  ${i + 1}/${todo.length}`);
    await sleep(500);
  }

  // Which tokens are 「コンビ名 個人名」 and should collapse onto the コンビ's row?
  // Whitespace alone is NOT a safe test: 「NON STYLE」 and 「kento fukaya」 are
  // single billed names containing a space, and splitting them invents rows for
  // performers nobody is billed as. So ask the official talent database whether
  // the head is itself a real talent, and fold only when it says yes.
  const combiOf = { ...(prev.combi_of || {}) };
  const compound = names.filter((n) => /[ 　（(]/.test(n) && !(n in combiOf));
  if (compound.length) console.log(`checking ${compound.length} compound names for a コンビ head`);
  for (const n of compound) {
    const head = combiName(n);
    if (!head || head === n) { combiOf[n] = null; continue; }
    try {
      const hit = (await search(head)).find(([, nm]) => norm(nm) === norm(head));
      combiOf[n] = hit ? head : null;
    } catch (e) { combiOf[n] = null; }
    await sleep(500);
  }

  const kept = names.filter((n) => n in ids);
  // Never let a bad run gut a good map.
  const before = Object.keys(prev.ids || {}).length;
  if (before > 0 && kept.length < before * 0.8) {
    console.error(`REFUSING: map would shrink from ${before} to ${kept.length} entries.`);
    process.exit(1);
  }
  const finalIds = Object.fromEntries(names.filter((n) => n in ids).map((n) => [n, ids[n]]));
  writeFileSync(OUT, JSON.stringify({
    generated: new Date().toISOString().slice(0, 10),
    source: 'profile.yoshimoto.co.jp/talent/list/?keywords=',
    ids: finalIds,
    via_combi: Object.fromEntries(Object.entries(via).filter(([k]) => k in finalIds)),
    unresolved: names.filter((n) => !(n in finalIds)),
    // token -> コンビ name it should be displayed under (null = stands alone)
    combi_of: Object.fromEntries(Object.entries(combiOf)
      .filter(([k, v]) => v && names.includes(k))),
  }, null, 1) + '\n');
  console.log(`\nwrote ${OUT}`);
  console.log(`${kept.length}/${names.length} linked (${Math.round(kept.length / names.length * 100)}%), ${names.length - kept.length} fall back to search`);
}
main();
