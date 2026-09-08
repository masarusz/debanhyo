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

console.log(`\n${pass} passed, ${fail} failed, ${total} golden cases`);
process.exit(fail === 0 ? 0 : 1);
