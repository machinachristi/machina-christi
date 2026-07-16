#!/usr/bin/env bash
#
# world-diff-guard.sh — independent CI enforcement of the two guards the Eden
# weekly-update automation self-attests in its prompt (SKILL.md, Step 4.2/4.3):
#
#   1. Diff-scope guard    — a feat/world-* / feature/world-* PR may only change
#                            files under world-app/, plus manifest.json and
#                            about-eden.html. Anything else = fail.
#   2. Malicious-pattern   — the ADDED lines of such a PR must not introduce
#      guard                 network / dynamic-code calls: fetch(, XMLHttpRequest,
#                            dynamic import(, eval(, new Function(, or a newly
#                            added http:// / https:// / ws:// / wss:// URL.
#
# The point is an *independent* backstop: the same unattended agent that writes
# the diff also writes the self-check, and this repo pre-approves the push/merge
# commands it uses — so if that self-check is ever buggy or skipped, this job is
# what still catches it before the auto-merge fires.
#
# The guard ONLY applies to the automation's own branch naming convention
# (feat/world-* or feature/world-*). Every other branch — the user's manual work
# on the runner game, Ordo, homepage, etc. — passes trivially and is never
# blocked.
#
# Deliberately portable (bash 3.2 + BSD/GNU grep) so the exact same script can be
# run locally as a self-test and unmodified in CI on ubuntu.
#
# Usage:
#   HEAD_BRANCH=<branch-name> world-diff-guard.sh [BASE_REF] [HEAD_REF]
# Defaults: BASE_REF=origin/main, HEAD_REF=HEAD.
# Exits 0 on pass (including "guard does not apply"), non-zero on a real hit.

set -euo pipefail

HEAD_BRANCH="${HEAD_BRANCH:-}"
BASE_REF="${1:-origin/main}"
HEAD_REF="${2:-HEAD}"

# --- Branch gating -------------------------------------------------------------
# Only the automation's naming convention is enforced. Historically BOTH
# feat/world-* and feature/world-* have been used for Eden PRs (see git log).
case "$HEAD_BRANCH" in
  feat/world-*|feature/world-*)
    echo "Head branch '$HEAD_BRANCH' matches the Eden automation convention — enforcing world diff guard."
    ;;
  *)
    echo "Head branch '${HEAD_BRANCH:-<none>}' is not feat/world-*/feature/world-* — world diff guard does not apply. Passing."
    exit 0
    ;;
esac

BASE_SHA="$(git merge-base "$BASE_REF" "$HEAD_REF")"
echo "Comparing $HEAD_REF against merge-base with $BASE_REF ($BASE_SHA)"
echo

fail=0

# --- Guard 1: file scope -------------------------------------------------------
# Allowed: anything under world-app/, the root manifest.json, and about-eden.html.
echo "== Guard 1: file scope =="
ALLOWED_RE='^(world-app/|manifest\.json$|about-eden\.html$)'
changed_count=0
out_of_scope=""
while IFS= read -r f; do
  [ -z "$f" ] && continue
  changed_count=$((changed_count + 1))
  if [[ ! "$f" =~ $ALLOWED_RE ]]; then
    out_of_scope="${out_of_scope}${f}"$'\n'
  fi
done < <(git diff --name-only "$BASE_SHA" "$HEAD_REF")

if [ -n "$out_of_scope" ]; then
  echo "::error::feat/world-* PR changes files outside the allowed Eden scope."
  echo "Allowed scope: world-app/**, manifest.json, about-eden.html"
  echo "Out-of-scope file(s):"
  printf '%s' "$out_of_scope" | sed 's/^/  /'
  fail=1
else
  echo "OK — all ${changed_count} changed file(s) are within world-app/**, manifest.json, about-eden.html"
fi
echo

# --- Guard 2: malicious patterns on ADDED lines only ---------------------------
# Scan only added ('+') lines within the allowed paths. Removed / context lines
# are ignored so we never flag code a PR is deleting. The (^|[^[:alnum:]_])
# prefix is a portable word-boundary that keeps prefetch(/retrieval( etc. from
# false-positiving fetch(/eval(.
echo "== Guard 2: malicious patterns (added lines only) =="
PATTERN='(^|[^[:alnum:]_])(fetch|eval)[[:space:]]*\(|XMLHttpRequest|(^|[^[:alnum:]_])import[[:space:]]*\(|(^|[^[:alnum:]_])new[[:space:]]+Function[[:space:]]*\(|https?://|wss?://'
added="$(git diff "$BASE_SHA" "$HEAD_REF" -- world-app/ about-eden.html manifest.json \
          | grep '^+' | grep -v '^+++' || true)"
hits="$(printf '%s\n' "$added" | grep -nE "$PATTERN" || true)"
if [ -n "$hits" ]; then
  echo "::error::Disallowed network/dynamic-code pattern found in added lines of this feat/world-* PR."
  echo "Checked for: fetch(, XMLHttpRequest, dynamic import(, eval(, new Function(, http(s):// / ws(s):// URLs"
  echo "Offending added line(s) (line-number within the added-lines stream : content):"
  printf '%s\n' "$hits" | sed 's/^/  /'
  fail=1
else
  echo "OK — no disallowed network/eval/dynamic-import patterns in added lines"
fi
echo

if [ "$fail" -ne 0 ]; then
  echo "----------------------------------------------------------------------"
  echo "world-diff-guard: FAIL — this PR needs manual review before merging."
  echo "A legitimate Eden weekly update only touches world-app/** (plus"
  echo "manifest.json / about-eden.html) and never introduces network or"
  echo "dynamic-code calls. Resolve the findings above, or a human should merge"
  echo "this by hand after reviewing why it falls outside those bounds."
  echo "----------------------------------------------------------------------"
  exit 1
fi

echo "world-diff-guard: PASS"
