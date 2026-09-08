// 出番表 — the deterministic layer.
//
// This module is the SINGLE implementation of the feed's parsing rules. The
// browser imports it, and scripts/build-talents.mjs imports THIS SAME FILE
// under Node. It is deliberately not ported to another language: web.md's
// dual-golden pattern exists because a ported copy drifts silently, and the
// cheapest way to satisfy it is to have only one copy.
//
// Every rule here was derived from the live feed, not from documentation.

// The feed uses these as lineup placeholders, not as performers. Measured on
// 292 future performances: 「他」 appears on 106 of them (36%), 「メンバー」 on 13.
// (115 counts 他 OCCURRENCES, not performances - 9 bills carry it twice, once
// for the main lineup and once for a 【吉本新喜劇】 sub-bill.)
// This list is enumerated from observed data and WILL rot; an unknown
// placeholder simply shows up as a performer with a search-only profile link.
// A hostile or corrupt feed could put tens of thousands of separators in one
// member field. Real bills carry about 15 names; these caps are far above any
// real value and exist only to bound the work.
export const MAX_MEMBER_TOKENS = 100;
export const MAX_MEMBER_CHARS = 4000;

export const NOT_A_PERSON = ['他', 'ほか', 'メンバー', '未定'];

/**
 * Split a feed `member` string into performer names.
 *
 * Real shapes this must survive, all taken from the live feed:
 *   'A／B／C'                                    plain
 *   'ガベジ\r\n『時代劇コメディ』： 内海仁志'        show title glued on with CRLF
 *   'ゲスト：囲碁将棋'                            guest prefix
 *   'A／他'                                      trailing placeholder
 */
export function parseMembers(raw) {
  if (!raw) return [];
  return String(raw)
    .slice(0, MAX_MEMBER_CHARS)
    .split(/[／/]/)
    .slice(0, MAX_MEMBER_TOKENS)
    .map((t) => {
      t = t.split(/[\r\n]/)[0];              // drop a glued-on show title
      t = t.replace(/^\s*ゲスト[：:]\s*/, ''); // drop a guest marker
      return t.trim();
    })
    .filter((t) => t.length > 0 && !NOT_A_PERSON.includes(t));
}

/**
 * The feed encodes yen as a literal backslash, and one field can carry several
 * with labels between them: '\3,000/学生\2,000'. The theatre's own renderer
 * does exactly this replace, so this matches the official display by
 * construction rather than by taste.
 */
export function formatYen(raw) {
  return String(raw == null ? '' : raw).replace(/\\/g, '¥');
}

/**
 * A compound token like 「アインシュタイン 河井ゆずる」 or 「MC：ガクテンソク 奥田修二」
 * names an individual inside a コンビ. Product decision (2026-09-08): these
 * link to the コンビ's profile, so this returns the コンビ name.
 * Returns the input unchanged when there is nothing to strip.
 */
export function combiName(name) {
  let core = String(name || '').replace(/^\s*(MC|ゲスト)[：:]\s*/, '');
  core = core.replace(/[（(].*$/, '').trim();
  return core.split(/[ 　]+/)[0] || String(name || '');
}

/**
 * Product decision (2026-09-08): 「3時のヒロイン ゆめっち」 is shown under
 * 「3時のヒロイン」, so one コンビ occupies one row.
 *
 * The fold is driven by `combi_of` in talents.json, NOT by whitespace.
 * Measured: 「NON STYLE」 and 「kento fukaya」 are single billed names that
 * contain a space, and splitting on it invents rows for performers nobody is
 * billed as. The generator only records a fold after the official talent
 * database confirms the head is itself a real talent — which is also why
 * 「令和ロマン 松井ケムリ」 stands alone: that database has no 令和ロマン entry.
 */
export function displayName(name, combiOf) {
  const c = combiOf ? combiOf[name] : null;
  return (typeof c === 'string' && c.length) ? c : name;
}

/**
 * Hosts a ticket link may point at. Measured against the live feed 2026-09-08:
 * url1 uses ticket.fany.lol (294) and yoshimoto.funity.jp (1); the theatre's
 * other ticketing host appears in the unrendered url2/url3 fields.
 *
 * A new legitimate host would make its links disappear and show
 * 「チケットリンクなし」 instead. That is the safe direction: a missing link is
 * visibly incomplete, whereas a link to an attacker's page is not.
 */
export const TICKET_HOSTS = [
  'ticket.fany.lol',
  'yoshimoto.funity.jp',
  'online-ticket.yoshimoto.co.jp',
];

/**
 * A ticket URL from the feed is third-party data.
 *
 * A prefix test on 'https://' is NOT sufficient, which a security review
 * caught: `https://ticket.fany.lol@evil.example/phish` passes it, because
 * everything before the @ is URL *userinfo* and the real host is evil.example.
 * So this parses the URL properly, rejects credentials, and requires an
 * allowlisted host. Returns the normalised href, never the raw string.
 */
export function safeTicketUrl(url, hosts = TICKET_HOSTS) {
  if (typeof url !== 'string') return null;
  let u;
  try { u = new URL(url); } catch { return null; }
  if (u.protocol !== 'https:') return null;
  if (u.username || u.password) return null;
  if (!hosts.includes(u.hostname.toLowerCase())) return null;
  return u.href;
}

/** Talent ids are bare digits. Anything else falls back to the search page. */
export function profileUrl(name, ids) {
  const id = ids && Object.prototype.hasOwnProperty.call(ids, name) ? ids[name] : null;
  return /^\d+$/.test(String(id))
    ? { url: 'https://profile.yoshimoto.co.jp/talent/detail?id=' + id, direct: true }
    : { url: 'https://profile.yoshimoto.co.jp/talent/list/?keywords=' + encodeURIComponent(name), direct: false };
}
