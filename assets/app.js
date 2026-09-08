// 出番表 — scaffold entry point.
//
// Phase 2 only proves the pipeline: external module loads under a strict CSP,
// imports the real deterministic layer, and reaches the live feed. The feature
// work replaces the body of render() and nothing else about this wiring.
import { parseMembers, formatYen, safeTicketUrl } from './members.js?v=0.1.0';

const FEED = 'https://feed-api.yoshimoto.co.jp/fany/theater/v1?theater=lumine&venue=01';

function line(label, value) {
  const p = document.createElement('p');
  p.className = 'selfcheck';
  const b = document.createElement('b');
  b.textContent = value;
  p.append(document.createTextNode(label + ' '), b);
  return p;
}

async function main() {
  const app = document.getElementById('app');
  app.textContent = '';
  // The deterministic layer is reachable and behaving, with no network involved.
  app.append(line('scaffold', 'OK'));
  app.append(line('parseMembers("A／B／他") →', parseMembers('A／B／他').join(' / ')));
  app.append(line('formatYen("\\3,300") →', formatYen('\\3,300')));
  app.append(line('safeTicketUrl("javascript:x") →', String(safeTicketUrl('javascript:x'))));
  try {
    const res = await fetch(FEED);
    const data = await res.json();
    app.append(line('feed reachable →', data.length + ' 公演'));
  } catch (e) {
    app.append(line('feed unreachable →', e.message));
  }
}
main();
