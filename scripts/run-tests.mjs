#!/usr/bin/env node
// 出番表 test harness.
//
// It imports the REAL shipped source (public/assets/members.js), never a copy.
// Every assertion announces what it checked, so a green run is readable rather
// than a wall of [PASS]. An empty fixture is a failure, not a pass - a suite
// that asserts nothing is the failure mode this rule exists to prevent.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  parseMembers, formatYen, combiName, safeTicketUrl, profileUrl,
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
const MIN_CASES = 20;
if (total < MIN_CASES) {
  console.log(`  FAIL harness: only ${total} cases, expected at least ${MIN_CASES}`);
  fail++;
}

console.log(`\n${pass} passed, ${fail} failed, ${total} golden cases`);
process.exit(fail === 0 ? 0 : 1);
