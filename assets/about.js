// Fills the figures and dates on the About page from live data, so a stated
// limitation cannot drift away from what the app actually holds.
//
// Deliberate distinction: the feed carries no "last updated" field, so the only
// honest date for the schedule is when THIS page fetched it. Presenting a fetch
// time as the theatre's update time would be a confident falsehood - the exact
// thing the 「他」 section of this page exists to warn about.
import { parseMembers } from './members.js?v=1.3.4';

const FEED = 'https://feed-api.yoshimoto.co.jp/fany/theater/v1?theater=lumine&venue=01';
const TALENTS = 'data/talents.json?v=1.3.4';
const PLACEHOLDER = ['他', 'ほか'];

// The version is derived from this module's own ?v= query, which is bumped on
// every release. It used to be typed into about.html in two places and one of
// them went stale - the page whose whole job is stating what is current was
// reporting a version that was not. Deriving it makes drift impossible.
const VERSION = new URL(import.meta.url).searchParams.get('v') || '';

function hasHidden(member) {
  return (member || '').split(/[／/]/)
    .some((t) => PLACEHOLDER.includes(t.split(/[\r\n]/)[0].trim()));
}
const set = (id, text) => { const n = document.getElementById(id); if (n) n.textContent = text; };
const pad = (n) => String(n).padStart(2, '0');
const jpDate = (d) => `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`;
const jpDateTime = (d) => `${jpDate(d)} ${pad(d.getHours())}:${pad(d.getMinutes())}`;

function jpFromISO(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || ''));
  return m ? `${Number(m[1])}年${Number(m[2])}月${Number(m[3])}日` : '不明';
}

// Deliberately no claim about HOW the map is refreshed. It used to say
// 「手動生成」, which quietly became false the day the refresh was automated -
// the same drift as the hard-coded version string. The date is the ground
// truth, and if it stops moving the page says so on its own.
const STALE_DAYS = 21;
function daysSince(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || ''));
  if (!m) return null;
  const then = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Math.floor((Date.now() - then.getTime()) / 86400000);
}

async function schedule() {
  const feed = await (await fetch(FEED)).json();
  const fetchedAt = new Date();
  const now = new Date();
  const cur = `${now.getFullYear()}/${pad(now.getMonth() + 1)}`;
  const future = feed.filter((r) => (r.date || '').slice(0, 7) >= cur);
  if (!future.length) return;

  const n = future.filter((r) => hasHidden(r.member)).length;
  set('asOf', `${jpDateTime(fetchedAt)} 時点`);
  set('hokaStat', `${future.length}公演中 ${n}公演（約${Math.round(n / future.length * 100)}%）`);
  set('fetchedAt', jpDateTime(fetchedAt));
  set('fetchedAt2', jpDateTime(fetchedAt));

  const dates = future.map((r) => r.date).sort();
  set('dataRange', `${dates[0].replace(/\//g, '/')} 〜 ${dates[dates.length - 1]}`);

  const by = new Map();
  for (const r of future) {
    const m = (r.date || '').slice(0, 7);
    if (!by.has(m)) by.set(m, { n: 0, t: 0 });
    const b = by.get(m); b.n++; if (hasHidden(r.member)) b.t++;
  }
  const ul = document.getElementById('hokaByMonth');
  if (ul) {
    ul.textContent = '';
    for (const m of [...by.keys()].sort()) {
      const b = by.get(m); const p = m.split('/');
      const li = document.createElement('li');
      li.textContent = `${p[0]}年${Number(p[1])}月：${b.n}公演中 ${b.t}公演`
        + `（${Math.round(b.t / b.n * 100)}%）が「他」表記`;
      ul.append(li);
    }
  }
  void parseMembers; // same module the app parses with; kept explicit
}

function version() {
  if (!VERSION) return;
  set('appVer', `v${VERSION}`);
  set('appVerFoot', `出番表 v${VERSION}`);
}

async function talents() {
  const t = await (await fetch(TALENTS)).json();
  const when = jpFromISO(t.generated);
  set('talentsGenerated', when);
  set('talentsGenerated2', when);
  const linked = Object.keys(t.ids || {}).length;
  const missing = (t.unresolved || []).length;
  set('talentsCoverage', `${linked}組（未収録 ${missing}組）`);

  const age = daysSince(t.generated);
  const stale = document.getElementById('talentsStale');
  if (stale) {
    stale.textContent = (age !== null && age > STALE_DAYS)
      ? `　※ ${age}日前から更新されていません` : '';
    stale.className = (age !== null && age > STALE_DAYS) ? 'stale' : '';
  }
}

version();

// Independent: a failure in one must not blank the other.
schedule().catch(() => {
  set('asOf', '現在');
  set('fetchedAt', '取得できませんでした');
  set('fetchedAt2', '取得できませんでした');
});
talents().catch(() => {
  set('talentsGenerated', '不明');
  set('talentsGenerated2', '不明');
});
