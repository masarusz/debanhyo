// Fills the one figure on the About page from live data, so the stated
// limitation cannot drift away from what the feed actually contains.
import { parseMembers } from './members.js?v=1.2.3';

const FEED = 'https://feed-api.yoshimoto.co.jp/fany/theater/v1?theater=lumine&venue=01';
const PLACEHOLDER = ['他', 'ほか'];

function hasHidden(member) {
  return (member || '').split(/[／/]/)
    .some((t) => PLACEHOLDER.includes(t.split(/[\r\n]/)[0].trim()));
}

(async () => {
  const node = document.getElementById('hokaStat');
  try {
    const feed = await (await fetch(FEED)).json();
    const now = new Date();
    const cur = `${now.getFullYear()}/${String(now.getMonth() + 1).padStart(2, '0')}`;
    const future = feed.filter((r) => (r.date || '').slice(0, 7) >= cur);
    if (!future.length) return;
    const n = future.filter((r) => hasHidden(r.member)).length;
    node.textContent = `${future.length}公演中 ${n}公演（約${Math.round(n / future.length * 100)}%）`;

    // Per-month, because the blended figure hides the thing that actually
    // matters: the current month is nearly complete and the far months are not.
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
        const b = by.get(m);
        const p = m.split('/');
        const li = document.createElement('li');
        li.textContent = `${p[0]}年${Number(p[1])}月：${b.n}公演中 ${b.t}公演`
          + `（${Math.round(b.t / b.n * 100)}%）が「他」表記`;
        ul.append(li);
      }
    }
    // parseMembers is imported so this page and the app agree on what a
    // performer token is; referencing it here keeps that link explicit.
    void parseMembers;
  } catch { /* leave the cautious wording in place */ }
})();
