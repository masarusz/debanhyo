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
// 292 future performances: 「他」 appears on 115 of them (39%), 「メンバー」 on 13.
// This list is enumerated from observed data and WILL rot; an unknown
// placeholder simply shows up as a performer with a search-only profile link.
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
    .split(/[／/]/)
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
 * names an individual inside a コンビ. the owner's decision (2026-09-08): these
 * link to the コンビ's profile, so this returns the コンビ name.
 * Returns the input unchanged when there is nothing to strip.
 */
export function combiName(name) {
  let core = String(name || '').replace(/^\s*(MC|ゲスト)[：:]\s*/, '');
  core = core.replace(/[（(].*$/, '').trim();
  return core.split(/[ 　]+/)[0] || String(name || '');
}

/** A ticket URL from the feed is third-party data. Only https is ever linked. */
export function safeTicketUrl(url) {
  return typeof url === 'string' && /^https:\/\//.test(url) ? url : null;
}

/** Talent ids are bare digits. Anything else falls back to the search page. */
export function profileUrl(name, ids) {
  const id = ids && Object.prototype.hasOwnProperty.call(ids, name) ? ids[name] : null;
  return /^\d+$/.test(String(id))
    ? { url: 'https://profile.yoshimoto.co.jp/talent/detail?id=' + id, direct: true }
    : { url: 'https://profile.yoshimoto.co.jp/talent/list/?keywords=' + encodeURIComponent(name), direct: false };
}
