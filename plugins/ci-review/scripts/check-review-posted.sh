#!/bin/sh
# check-review-posted.sh — Stop hook for ci-review
#
# Intercepts session termination to guarantee a review was posted to GitHub.
# If no review was posted in this session, executes post-review.sh.

set -e

# --- drain stdin (hook payload) --------------------------------------------

PAYLOAD=""
if [ ! -t 0 ]; then
  PAYLOAD=$(cat)
fi

if [ -n "$PAYLOAD" ]; then
  if command -v jq >/dev/null 2>&1; then
    if printf '%s' "$PAYLOAD" | jq -e '.stop_hook_active == true' >/dev/null 2>&1; then
      exit 0
    fi
  else
    if printf '%s' "$PAYLOAD" | grep -Eq '"stop_hook_active"[[:space:]]*:[[:space:]]*true'; then
      exit 0
    fi
  fi
fi

# --- check prerequisites ---------------------------------------------------

command -v gh >/dev/null 2>&1 || exit 0
command -v jq >/dev/null 2>&1 || exit 0
gh auth status >/dev/null 2>&1 || exit 0

# --- detect repository -----------------------------------------------------

OWNER_REPO="${GITHUB_REPOSITORY}"
if [ -z "$OWNER_REPO" ]; then
  OWNER_REPO=$(gh repo view --json nameWithOwner -q .nameWithOwner 2>/dev/null || true)
fi
[ -z "$OWNER_REPO" ] && exit 0
OWNER="${OWNER_REPO%%/*}"
REPO="${OWNER_REPO#*/}"
[ -z "$OWNER" ] || [ -z "$REPO" ] && exit 0

# --- detect PR number ------------------------------------------------------

PR_NUMBER=""
PAYLOAD_FILE=""

# Check if payload file exists with PR number
for f in "${TMPDIR:-/tmp}"/ci-review-payload-*.json; do
  if [ -f "$f" ]; then
    NUM=$(printf '%s\n' "$f" | sed -n 's/.*ci-review-payload-\([0-9]*\)\.json/\1/p')
    if [ -n "$NUM" ]; then
      PR_NUMBER="$NUM"
      PAYLOAD_FILE="$f"
      break
    fi
  fi
done

if [ -z "$PR_NUMBER" ] && [ -n "$GITHUB_REF" ]; then
  PR_NUMBER=$(printf '%s\n' "$GITHUB_REF" | sed -n 's|refs/pull/\([0-9]*\)/.*|\1|p')
fi

if [ -z "$PR_NUMBER" ]; then
  PR_NUMBER=$(gh pr view --json number -q .number 2>/dev/null || true)
fi

[ -z "$PR_NUMBER" ] && exit 0
printf '%s\n' "$PR_NUMBER" | grep -qE '^[1-9][0-9]*$' || exit 0

# --- check if review already posted in this session ------------------------

SUCCESS_MARKER="${TMPDIR:-/tmp}/ci-review-posted-${PR_NUMBER}.txt"
if [ -f "$SUCCESS_MARKER" ]; then
  # Review already posted successfully in this session
  exit 0
fi

# --- locate and run post-review.sh -----------------------------------------

POST_SCRIPT=""
if [ -n "$CLAUDE_PLUGIN_ROOT" ] && [ -f "$CLAUDE_PLUGIN_ROOT/scripts/post-review.sh" ]; then
  POST_SCRIPT="$CLAUDE_PLUGIN_ROOT/scripts/post-review.sh"
elif [ -f "plugins/ci-review/scripts/post-review.sh" ]; then
  POST_SCRIPT="plugins/ci-review/scripts/post-review.sh"
fi

if [ -n "$POST_SCRIPT" ] && [ -f "$POST_SCRIPT" ]; then
  if [ -n "$PAYLOAD_FILE" ] && [ -f "$PAYLOAD_FILE" ]; then
    sh "$POST_SCRIPT" "$PR_NUMBER" "$PAYLOAD_FILE" "${OWNER}/${REPO}" >&2 || true
  else
    sh "$POST_SCRIPT" "$PR_NUMBER" "${OWNER}/${REPO}" >&2 || true
  fi
  exit 0
fi

exit 0
