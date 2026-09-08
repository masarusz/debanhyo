#!/bin/bash
# 出番表 deploy — publishes public/ to the gh-pages branch, which GitHub Pages
# serves at https://masarusz.github.io/debanhyo/
#
# The shape of this script is prescribed by framework/web.md. Every rule below
# is here because something went wrong without it on an earlier project.
#
#   ./scripts/deploy.sh --dry-run    show what would ship, touch nothing
#   ./scripts/deploy.sh              publish and verify
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"
SITE="https://masarusz.github.io/debanhyo"
BRANCH="gh-pages"
WORKTREE=".publish"
DRY_RUN=0
[[ "${1:-}" == "--dry-run" ]] && DRY_RUN=1

fail() { echo "DEPLOY FAILED: $*" >&2; exit 1; }

# --- 1. Preflight -----------------------------------------------------------
echo "== preflight"
node scripts/run-tests.mjs > /tmp/debanhyo-tests.log 2>&1 \
  || { cat /tmp/debanhyo-tests.log; fail "test suite is red - refusing to deploy"; }
echo "   tests: $(tail -1 /tmp/debanhyo-tests.log)"
if [[ -n "$(git status --porcelain)" ]]; then
  echo "   WARNING: working tree is not clean; deploying committed state only"
fi

# --- 2. The allowlist -------------------------------------------------------
# NAME WHAT PRODUCTION RUNS, never what it must not have. A blocklist is correct
# only for the files that existed when it was written and fails silently every
# time the repo grows. Forgetting an entry here breaks the site loudly on the
# first request, which is the safe direction.
FILES=(
  "index.html"
  "about.html"
  "assets/about.js"
  "assets/app.css"
  "assets/app.js"
  "assets/members.js"
  "assets/apple-touch-icon.png"
  "data/talents.json"
)
echo "== allowlist (${#FILES[@]} files)"
MISSING=0
for f in "${FILES[@]}"; do
  if [[ -f "public/$f" ]]; then printf '   %s (%s bytes)\n' "$f" "$(wc -c < "public/$f" | tr -d ' ')"
  else echo "   MISSING public/$f"; MISSING=1; fi
done
[[ $MISSING -eq 0 ]] || fail "allowlisted file(s) missing from public/"

if [[ $DRY_RUN -eq 1 ]]; then
  echo; echo "== dry run: nothing was written, nothing was pushed"; exit 0
fi

# --- 3. Stage the publish branch -------------------------------------------
echo "== staging $BRANCH"
git worktree remove --force "$WORKTREE" 2>/dev/null || true
rm -rf "$WORKTREE"
if git show-ref --verify --quiet "refs/heads/$BRANCH"; then
  git worktree add "$WORKTREE" "$BRANCH" >/dev/null
else
  git worktree add --detach "$WORKTREE" >/dev/null
  ( cd "$WORKTREE" && git checkout --orphan "$BRANCH" && git rm -rf . >/dev/null 2>&1 || true )
fi
# Remove everything tracked, then lay down exactly the allowlist. Anything that
# used to be published and is no longer allowlisted disappears.
( cd "$WORKTREE" && git rm -rq . 2>/dev/null || true )
for f in "${FILES[@]}"; do
  mkdir -p "$WORKTREE/$(dirname "$f")"
  cp "public/$f" "$WORKTREE/$f"
done
# .nojekyll: without it Pages runs Jekyll, which silently drops files and
# directories beginning with an underscore.
touch "$WORKTREE/.nojekyll"

( cd "$WORKTREE"
  git add -A
  if git diff --cached --quiet; then echo "   no changes to publish"
  else git commit -q -m "Publish $(date -u +%Y-%m-%dT%H:%M:%SZ)"; fi
  git push -q origin "$BRANCH" )
echo "   pushed $BRANCH"

# --- 4. Verify EVERY deployed file against the live host --------------------
# Not a sample and not a hard-coded list: the manifest is built from the same
# file set the upload used, so a new asset cannot be missed. A list someone has
# to remember to extend verifies last month's interests.
# GitHub Pages builds asynchronously, and a fixed sleep is a race: a v1.2.0
# deploy that had actually landed was reported as 5 files differing because the
# build had not finished. Poll until the first file matches, then verify all.
echo "== waiting for Pages to publish (up to 180s)"
FIRST="${FILES[0]}"
want=$(shasum -a 256 "public/$FIRST" | cut -d' ' -f1)
ready=0
for i in $(seq 1 36); do
  got=$(curl -sS -H 'Cache-Control: no-cache' "$SITE/$FIRST" 2>/dev/null | shasum -a 256 | cut -d' ' -f1) || true
  if [[ "$got" == "$want" ]]; then ready=1; echo "   published after ~$((i*5))s"; break; fi
  sleep 5
done
[[ $ready -eq 1 ]] || echo "   WARNING: $FIRST still stale after 180s; verifying anyway"
echo "== verifying ${#FILES[@]} files against $SITE"
DIFFS=0; CHECKED=0
for f in "${FILES[@]}"; do
  local_sum=$(shasum -a 256 "public/$f" | cut -d' ' -f1)
  # Cache-bust the CHECK itself. Verifying via a ?v= URL proves nothing about
  # what a browser gets, so this asks for the real path with a no-cache header.
  live_sum=$(curl -sS --fail -H 'Cache-Control: no-cache' "$SITE/$f" 2>/dev/null | shasum -a 256 | cut -d' ' -f1) || live_sum="FETCH-FAILED"
  CHECKED=$((CHECKED+1))
  if [[ "$local_sum" == "$live_sum" ]]; then echo "   ok    $f"
  else echo "   DIFF  $f  (local ${local_sum:0:12} / live ${live_sum:0:12})"; DIFFS=$((DIFFS+1)); fi
done
# An empty manifest passes vacuously. Comparing nothing to nothing is not a check.
[[ $CHECKED -gt 0 ]] || fail "manifest was empty - verified nothing"

# --- 5. Prove the private paths are not served ------------------------------
# Demonstrated on the live host, not assumed from the branch layout.
echo "== confirming unpublished paths are not reachable"
LEAKS=0
for p in SPEC.md CLAUDE.md README.md scripts/deploy.sh scripts/run-tests.mjs \
         scripts/build-talents.mjs scripts/golden/members_golden.json .gitignore; do
  code=$(curl -sS -o /dev/null -w '%{http_code}' "$SITE/$p" || echo 000)
  if [[ "$code" == "404" ]]; then echo "   404   $p"
  else echo "   LEAK  $p -> HTTP $code"; LEAKS=$((LEAKS+1)); fi
done

# --- 6. A check whose failure still prints "Done." is not a check ----------
echo
if [[ $DIFFS -gt 0 || $LEAKS -gt 0 ]]; then
  fail "$DIFFS file(s) differ from the live host, $LEAKS unpublished path(s) reachable"
fi
echo "Deploy verified: $CHECKED/$CHECKED files match, 0 unpublished paths reachable."
echo "$SITE/"
