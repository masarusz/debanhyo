#!/usr/bin/env node
// 出番表 test harness.
//
// It imports the REAL shipped source (public/assets/members.js), never a copy.
// Every assertion announces what it checked, so a green run is readable rather
// than a wall of [PASS]. An empty fixture is a failure, not a pass - a suite
// that asserts nothing is the failure mode this rule exists to prevent.

import { readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  parseMembers, formatYen, combiName, displayName, safeTicketUrl, profileUrl,
} from '../public/assets/members.js';

const here = dirname(fileURLToPath(import.meta.url));
const G = JSON.parse(readFileSync(join(here, 'golden/members_golden.json'), 'utf8'));

let pass = 0, fail = 0;
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);

function check(group, why, got, want) {
  if (eq(got, want)) { pass++; console.log(`  ok   ${group}: ${why}`); }
  else {
    fail++;
    console.log(`  FAIL ${group}: ${why}`);
    console.log(`         want ${JSON.stringify(want)}`);
    console.log(`         got  ${JSON.stringify(got)}`);
  }
}

const runners = {
  parseMembers:  (c) => parseMembers(c.in),
  formatYen:     (c) => formatYen(c.in),
  combiName:     (c) => combiName(c.in),
  displayName:   (c) => displayName(c.in, c.combiOf),
  safeTicketUrl: (c) => safeTicketUrl(c.in),
  profileUrl:    (c) => profileUrl(c.in, c.ids),
};

let total = 0;
for (const [group, run] of Object.entries(runners)) {
  const cases = G[group];
  // Non-vacuity: a group that lost its cases must go red, not quietly pass.
  if (!Array.isArray(cases) || cases.length === 0) {
    console.log(`  FAIL ${group}: fixture is empty - a suite that asserts nothing proves nothing`);
    fail++; continue;
  }
  for (const c of cases) { check(group, c.why, run(c), c.out); total++; }
}

// The golden file must actually carry work. Guards against a truncated fixture
// still exiting 0 - the deployment-shaped version of the same rule.
const MIN_CASES = 35;
if (total < MIN_CASES) {
  console.log(`  FAIL harness: only ${total} cases, expected at least ${MIN_CASES}`);
  fail++;
}

// --- iOS zoom guard -------------------------------------------------------
// Not a golden case: a stylesheet invariant. iOS Safari zooms the page when a
// form control with font-size < 16px is focused, which cropped the header and
// shifted the layout when the search box was tapped. Checking the CSS excludes
// the bug for every form control at once, including ones not written yet.
{
  const css = readFileSync(join(here, '../public/assets/app.css'), 'utf8');
  const rules = css.split('}');
  let checked = 0;
  for (const rule of rules) {
    const [selector, body] = rule.split('{');
    if (!body || !/\b(input|select|textarea)\b/.test(selector)) continue;
    const m = body.match(/font-size\s*:\s*([\d.]+)px/);
    if (!m) continue;
    checked++;
    const px = parseFloat(m[1]);
    if (px >= 16) {
      pass++; console.log(`  ok   ios-zoom: ${selector.trim()} font-size ${px}px >= 16px`);
    } else {
      fail++; console.log(`  FAIL ios-zoom: ${selector.trim()} font-size ${px}px < 16px`);
      console.log('         iOS Safari will zoom the page when this field is focused');
    }
  }
  if (checked === 0) {
    fail++;
    console.log('  FAIL ios-zoom: found no form-control font-size to check - the guard is vacuous');
  }
}

// --- version-drift guard --------------------------------------------------
// The version must appear in the HTML only as an asset cache-buster (?v=X).
// A hand-typed "v1.3.0" in the body went stale across a release and shipped a
// wrong version on the page that exists to say what is current.
for (const page of ['index.html', 'about.html']) {
  const html = readFileSync(join(here, '../public/' + page), 'utf8');
  const stray = html.replace(/\?v=[\d.]+/g, '').match(/v\d+\.\d+\.\d+/g);
  if (stray) {
    fail++;
    console.log(`  FAIL version: ${page} hard-codes ${stray.join(', ')} - derive it instead`);
  } else {
    pass++; console.log(`  ok   version: ${page} has no hand-typed version string`);
  }
}

// --- local-information guard ----------------------------------------------
// NOTHING about the machine this was built on may reach a public repository:
// no absolute home path, no username, no local directory layout, no toolchain
// install path. This is checked over every TRACKED file, because a file that
// is merely gitignored today is one `git add -f` away from being published.
{
  const tracked = execSync('git ls-files', { cwd: join(here, '..'), encoding: 'utf8' })
    .split('\n').filter(Boolean);
  // Patterns are assembled from fragments so this file does not match itself.
  // The alternative - excluding the guard from its own scan - would create the
  // one blind spot an attacker or a careless edit would land in.
  const P = (parts, flags) => new RegExp(parts.join(''), flags);
  const patterns = [
    [P(['/Us', 'ers/[A-Za-z]']),                 'absolute macOS home path'],
    [P(['/ho', 'me/[A-Za-z]']),                  'absolute Linux home path'],
    [P(['\\$H', 'OME']),                          'home-directory variable'],
    [P(['~/(Doc', 'uments|Lib', 'rary|Desk', 'top|Down', 'loads)']), 'local directory layout'],
    [P(['\\.n', 'vm/versions']),                  'node version-manager install path'],
    [P(['/var/fol', 'ders/']),                   'macOS temp path'],
    [P(['Launch', 'Agents']),                    'launchd agent path'],
    [P(['/Volu', 'mes/']),                       'mounted volume path'],
  ];
  let flagged = 0;
  for (const f of tracked) {
    if (/\.(png|jpg|gif|ico|woff2?)$/.test(f)) continue;
    const body = readFileSync(join(here, '..', f), 'utf8');
    body.split('\n').forEach((lineText, i) => {
      for (const [re, what] of patterns) {
        if (re.test(lineText)) {
          fail++; flagged++;
          console.log(`  FAIL local-info: ${f}:${i + 1} contains ${what}`);
          console.log(`         ${lineText.trim().slice(0, 90)}`);
        }
      }
    });
  }
  if (flagged === 0) {
    pass++;
    console.log(`  ok   local-info: ${tracked.length} tracked files carry no local path or machine detail`);
  }
}

console.log(`\n${pass} passed, ${fail} failed, ${total} golden cases`);
process.exit(fail === 0 ? 0 : 1);
