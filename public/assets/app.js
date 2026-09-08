// 出番表 — ルミネtheよしもと の公演を芸人ごとに引く。
//
// Every string that originates in the feed reaches the page through
// textContent, never innerHTML. The feed is third-party data we do not
// control, and show titles and performer names are free text in it.
import {
  parseMembers, formatYen, displayName, safeTicketUrl, profileUrl,
} from './members.js?v=1.2.2';

const FEED = 'https://feed-api.yoshimoto.co.jp/fany/theater/v1?theater=lumine&venue=01';
const TALENTS = 'data/talents.json?v=1.2.2';
const WD = ['日', '月', '火', '水', '木', '金', '土'];
const ALL = 'ALL';
const PLACEHOLDER = ['他', 'ほか'];

/** True when the theatre truncated this show's lineup with 「他」. */
function lineupTruncated(member) {
  return (member || '').split(/[／/]/)
    .some((t) => PLACEHOLDER.includes(t.split(/[\r\n]/)[0].trim()));
}

const state = {
  month: ALL, sort: 'count', q: '', person: null,
  months: [], byMonth: {}, ids: {}, combiOf: {}, showHidden: false,
};

/** Every performer name in the UI passes through here exactly once. */
const shown = (raw) => displayName(raw, state.combiOf);

/* ---------- tiny DOM helpers (no innerHTML anywhere in this file) -------- */
function el(tag, cls, text) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
}
function clear(n) { while (n.firstChild) n.removeChild(n.firstChild); }

/* ---------- derived data ------------------------------------------------ */
function monthLabel(m) { const p = m.split('/'); return `${p[0]}年${Number(p[1])}月`; }
function shortLabel(m) { return `${Number(m.split('/')[1])}月`; }
function rangeLabel() {
  if (!state.months.length) return '';
  const a = state.months[0], b = state.months[state.months.length - 1];
  return a === b ? monthLabel(a) : `${monthLabel(a)}〜${monthLabel(b)}`;
}
function scopeLabel(m) { return m === ALL ? rangeLabel() : monthLabel(m); }
function weekday(d) { const p = d.split('/'); return WD[new Date(+p[0], +p[1] - 1, +p[2]).getDay()]; }

function recordsFor(month) {
  if (month !== ALL) return state.byMonth[month] || [];
  return state.months.flatMap((m) => state.byMonth[m]);
}
function peopleOf(month) {
  const map = new Map();
  for (const r of recordsFor(month)) {
    // A show can bill both 「アインシュタイン」 and 「アインシュタイン 河井ゆずる」;
    // after folding they are one name, and the show must count once.
    for (const name of new Set(parseMembers(r.member).map(shown))) {
      if (!map.has(name)) map.set(name, []);
      map.get(name).push(r);
    }
  }
  return map;
}

/* ---------- fixed header ------------------------------------------------ */
function renderTop() {
  const top = document.getElementById('topinner');
  clear(top);

  const months = el('div', 'months');
  const all = el('button', null, '全期間');
  all.dataset.m = ALL;
  all.setAttribute('aria-pressed', String(state.month === ALL));
  all.append(el('span', 'sm', rangeLabel()));
  months.append(all);
  for (const m of state.months) {
    const b = el('button', null, monthLabel(m));
    b.dataset.m = m;
    b.setAttribute('aria-pressed', String(m === state.month));
    b.append(el('span', 'sm', `${state.byMonth[m].length}公演`));
    months.append(b);
  }
  top.append(months);

  if (state.person) {
    const mine = peopleOf(state.month).get(state.person) || [];
    const bar = el('div', 'pbar');
    const back = el('button', 'back', '← 一覧');
    back.dataset.back = '1';
    bar.append(back, el('h2', null, state.person),
      el('span', 'sub', `${scopeLabel(state.month)} ／ 全${mine.length}公演`));

    top.append(bar);
    // The profile link is NOT pinned. the requirement was for the name and the
    // 月/出演数 line to stay on screen; adding a fourth item wrapped .pbar onto
    // three lines and pushed the fixed region to 26% of a 375x812 phone, past
    // the ~25% budget. It lives at the top of the schedule instead.

    if (state.month === ALL) {
      const per = new Map();
      for (const r of mine) {
        const k = r.date.slice(0, 7);
        per.set(k, (per.get(k) || 0) + 1);
      }
      const bd = el('p', 'breakdown');
      state.months.filter((m) => per.has(m)).forEach((m, i) => {
        if (i) bd.append(document.createTextNode('・'));
        bd.append(document.createTextNode(shortLabel(m)), el('b', null, `${per.get(m)}公演`));
      });
      top.append(bd);
    }
    return;
  }

  const controls = el('div', 'controls');
  const q = document.createElement('input');
  q.type = 'search'; q.id = 'q'; q.placeholder = '芸人を探す'; q.value = state.q;
  const seg = el('div', 'seg');
  for (const [key, label] of [['count', '出演回数順'], ['name', '五十音順']]) {
    const b = el('button', null, label);
    b.dataset.sort = key;
    b.setAttribute('aria-pressed', String(state.sort === key));
    seg.append(b);
  }
  controls.append(q, seg);
  top.append(controls, el('p', 'context'), el('p', 'breakdown'));
}

/* ---------- one performance card ---------------------------------------- */
function showCard(r, exclude) {
  const card = el('div', 'show');
  const times = [r.dateTime2, r.dateTime3].filter(Boolean).join('〜');
  card.append(el('div', 'd', `${r.date}（${weekday(r.date)}）${times}`));
  const title = el('div', 't', r.name || '');
  if (lineupTruncated(r.member)) title.append(el('span', 'hokabadge', 'ほか出演者あり'));
  card.append(title);

  // Labels follow the theatre's own renderer: price1=前売, price2=当日,
  // price3=オンライン on its own row.
  const fare = [];
  if (r.price1) fare.push(`前売：${formatYen(r.price1)}`);
  if (r.price2) fare.push(`当日：${formatYen(r.price2)}`);
  const prices = el('div', 'prices');
  if (fare.length) {
    const row = el('div', 'prow');
    row.append(el('span', 'plab', '料金'));
    const v = el('span', 'pval');
    fare.forEach((t, i) => { if (i) v.append(document.createElement('br')); v.append(document.createTextNode(t)); });
    row.append(v);
    prices.append(row);
  }
  if (r.price3) {
    const row = el('div', 'prow');
    row.append(el('span', 'plab', 'オンライン'), el('span', 'pval', formatYen(r.price3)));
    prices.append(row);
  }
  if (prices.childNodes.length) card.append(prices);

  const ticket = safeTicketUrl(r.url1);
  if (ticket) {
    const a = el('a', 'buy', 'チケットを購入');
    a.href = ticket; a.target = '_blank'; a.rel = 'noopener noreferrer';
    card.append(a);
  } else {
    card.append(el('span', 'nobuy', 'チケットリンクなし'));
  }

  const others = [...new Set(parseMembers(r.member).map(shown))].filter((n) => n !== exclude);
  if (others.length) card.append(el('div', 'with', `共演： ${others.join('、')}`));
  return card;
}

/* ---------- body -------------------------------------------------------- */
function renderBody() {
  const app = document.getElementById('app');
  clear(app);

  if (state.person) {
    const shows = (peopleOf(state.month).get(state.person) || [])
      .slice().sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

    // Shows in scope whose lineup is truncated AND where this performer is not
    // named. These are the ones the page cannot honestly call an absence: the
    // performer may be inside the 「他」. Measured 2026-09-08: truncation tracks
    // how far ahead a show is (Sept 2%, Oct 49%, Nov 61%), because the theatre
    // announces full casts late - so this is usually tiny for the current month
    // and large for 全期間.
    const maybe = recordsFor(state.month)
      .filter((r) => lineupTruncated(r.member)
        && ![...new Set(parseMembers(r.member).map(shown))].includes(state.person))
      .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

    if (maybe.length) {
      const box = el('div', 'caveat');
      const p = el('p', null,
        `この期間には出演者が「他」表記の公演が${maybe.length}件あります。`
        + 'この一覧に出ていない出演が含まれている可能性があります。');
      const btn = el('button', 'caveat-toggle',
        state.showHidden ? '閉じる' : `確認する（${maybe.length}件）`);
      btn.dataset.toggleHidden = '1';
      box.append(p, btn);
      if (state.showHidden) {
        const list = el('div', 'caveat-list');
        let lastM = null;
        for (const r of maybe) {
          const mk = r.date.slice(0, 7);
          if (mk !== lastM) { list.append(el('div', 'caveat-month', monthLabel(mk))); lastM = mk; }
          const row = el('div', 'caveat-row');
          row.append(el('span', 'cd', `${r.date.slice(5)}（${weekday(r.date)}）`));
          row.append(el('span', 'ct', r.name || ''));
          const url = safeTicketUrl(r.url1);
          if (url) {
            const a = el('a', 'cl', 'チケット ↗');
            a.href = url; a.target = '_blank'; a.rel = 'noopener noreferrer';
            row.append(a);
          }
          list.append(row);
        }
        box.append(list);
      }
      app.append(box);
    }

    const prof = profileUrl(state.person, state.ids);
    const a = el('a', 'prof', prof.direct ? '公式プロフィール ↗' : '公式サイトで検索 ↗');
    a.href = prof.url; a.target = '_blank'; a.rel = 'noopener noreferrer';
    app.append(a);

    let last = null;
    for (const r of shows) {
      const mk = r.date.slice(0, 7);
      if (state.month === ALL && mk !== last) {
        const h = el('div', 'mhead', `${monthLabel(mk)} `);
        h.append(el('span', 'mn', `${shows.filter((x) => x.date.slice(0, 7) === mk).length}公演`));
        app.append(h);
        last = mk;
      }
      app.append(showCard(r, state.person));
    }
    return;
  }

  const map = peopleOf(state.month);
  let names = [...map.keys()];
  const q = state.q.trim();
  if (q) names = names.filter((n) => n.includes(q));
  names.sort(state.sort === 'count'
    ? (a, b) => map.get(b).length - map.get(a).length || a.localeCompare(b, 'ja')
    : (a, b) => a.localeCompare(b, 'ja'));

  document.querySelector('#topinner .context').textContent =
    `${scopeLabel(state.month)} ／ 芸人 ${names.length}組 ／ 全${recordsFor(state.month).length}公演`;
  const bd = document.querySelector('#topinner .breakdown');
  clear(bd);
  if (state.month === ALL) {
    bd.textContent = state.months
      .map((m) => `${shortLabel(m)} ${state.byMonth[m].length}公演`).join('・');
  }

  if (!names.length) {
    app.append(el('p', 'status', '該当する芸人がいません'));
    return;
  }
  const ul = el('ul', 'people');
  for (const n of names) {
    const li = document.createElement('li');
    const b = document.createElement('button');
    b.dataset.p = n;
    b.append(el('span', 'nm', n), el('span', 'n', String(map.get(n).length)));
    li.append(b);
    ul.append(li);
  }
  app.append(ul);
}

/* ---------- wiring ------------------------------------------------------ */
function render() {
  renderTop(); renderBody(); wireTop(); wireBody();
}

/**
 * Re-render ONLY the results. The header - and with it the search input - is
 * left completely untouched.
 *
 * This is not an optimisation. Rebuilding the input on every keystroke aborts
 * an in-flight IME composition, and on a Japanese flick keyboard は -> ば IS a
 * composition: は followed by the 「゛」 key. With the element destroyed
 * mid-composition the dakuten key emitted its literal characters instead of
 * combining, so typing ば produced 「はは^_^^_^」 on iOS.
 */
function renderList() {
  renderBody(); wireBody();
}

function wireTop() {
  const top = document.getElementById('topinner');
  top.querySelectorAll('[data-m]').forEach((b) => b.addEventListener('click', () => {
    state.month = b.dataset.m; state.person = null; render();
  }));
  top.querySelectorAll('[data-sort]').forEach((b) => b.addEventListener('click', () => {
    state.sort = b.dataset.sort; render();
  }));
  const back = top.querySelector('[data-back]');
  if (back) back.addEventListener('click', () => {
    state.person = null; window.scrollTo(0, 0); render();
  });
  const q = top.querySelector('#q');
  if (q) {
    let composing = false;
    q.addEventListener('compositionstart', () => { composing = true; });
    q.addEventListener('compositionend', () => {
      composing = false; state.q = q.value; renderList();
    });
    q.addEventListener('input', (e) => {
      // While the IME is composing, the field holds provisional text (は, then
      // はﾞ). Filtering on it is wrong and re-rendering is harmful, so wait for
      // compositionend, which fires once the character is settled.
      if (composing || e.isComposing) return;
      state.q = q.value; renderList();
    });
  }
}

function wireBody() {
  const app = document.getElementById('app');
  app.querySelectorAll('[data-p]').forEach((b) =>
    b.addEventListener('click', () => {
      state.person = b.dataset.p; state.showHidden = false;
      window.scrollTo(0, 0); render();
    }));
  const toggle = app.querySelector('[data-toggle-hidden]');
  if (toggle) toggle.addEventListener('click', () => {
    state.showHidden = !state.showHidden; render();
  });
}

/* ---------- boot -------------------------------------------------------- */
async function main() {
  const app = document.getElementById('app');
  let feed;
  try {
    feed = await (await fetch(FEED)).json();
  } catch (e) {
    clear(app);
    app.append(el('p', 'status', 'スケジュールを取得できませんでした。'));
    app.append(el('p', 'status', '時間をおいて再読み込みしてください。'));
    return;
  }
  // The talent map is an optimisation, never a requirement: without it every
  // performer simply gets a search link instead of a direct profile link.
  try {
    const t = await (await fetch(TALENTS)).json();
    state.ids = (t && typeof t.ids === 'object') ? t.ids : {};
    state.combiOf = (t && typeof t.combi_of === 'object' && t.combi_of) ? t.combi_of : {};
  } catch { state.ids = {}; state.combiOf = {}; }

  const now = new Date();
  const cur = `${now.getFullYear()}/${String(now.getMonth() + 1).padStart(2, '0')}`;
  for (const r of feed) {
    const m = (r.date || '').slice(0, 7);
    if (!m || m < cur) continue;         // current and future months only
    (state.byMonth[m] = state.byMonth[m] || []).push(r);
  }
  state.months = Object.keys(state.byMonth).sort();
  if (!state.months.length) {
    clear(app);
    app.append(el('p', 'status', 'この期間の公演はまだ登録されていません。'));
    return;
  }
  render();
}
main();
