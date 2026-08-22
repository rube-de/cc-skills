#!/bin/sh
# check-review-posted.sh — Stop hook for ci-review
#
# Intercepts session termination to guarantee a review was posted to GitHub.
# If no review starting with "## CI Review" has been posted, executes
# post-review.sh to ensure the mandatory review contract is fulfilled.

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

OWNER_REPO=$(gh repo view --json nameWithOwner -q .nameWithOwner 2>/dev/null || true)
[ -z "$OWNER_REPO" ] && exit 0
OWNER="${OWNER_REPO%%/*}"
REPO="${OWNER_REPO#*/}"
[ -z "$OWNER" ] || [ -z "$REPO" ] && exit 0

# --- detect PR number ------------------------------------------------------

PR_NUMBER=""

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

if [ -z "$PR_NUMBER" ]; then
  PR_NUMBER=$(gh pr view --json number -q .number 2>/dev/null || true)
fi

[ -z "$PR_NUMBER" ] && exit 0
printf '%s\n' "$PR_NUMBER" | grep -qE '^[1-9][0-9]*$' || exit 0

# --- check if review already posted ----------------------------------------

RECENT_REVIEWS=$(gh api --paginate --slurp "repos/${OWNER}/${REPO}/pulls/${PR_NUMBER}/reviews" 2>/dev/null || echo "[]")
HAS_POST=$(printf '%s' "$RECENT_REVIEWS" | jq '
  [ .[][]? | select((.body // "") | startswith("## CI Review")) ] | length
' 2>/dev/null || echo 0)

if [ "$HAS_POST" -gt 0 ]; then
  # Review already posted successfully
  exit 0
fi

# Also check PR comments fallback
RECENT_COMMENTS=$(gh api --paginate --slurp "repos/${OWNER}/${REPO}/issues/${PR_NUMBER}/comments" 2>/dev/null || echo "[]")
HAS_COMMENT=$(printf '%s' "$RECENT_COMMENTS" | jq '
  [ .[][]? | select((.body // "") | startswith("## CI Review")) ] | length
' 2>/dev/null || echo 0)

if [ "$HAS_COMMENT" -gt 0 ]; then
  # Fallback comment already posted successfully
  exit 0
fi

# --- locate and run post-review.sh -----------------------------------------

POST_SCRIPT=""
if [ -n "$CLAUDE_PLUGIN_ROOT" ] && [ -f "$CLAUDE_PLUGIN_ROOT/scripts/post-review.sh" ]; then
  POST_SCRIPT="$CLAUDE_PLUGIN_ROOT/scripts/post-review.sh"
elif [ -f "plugins/ci-review/scripts/post-review.sh" ]; then
  POST_SCRIPT="plugins/ci-review/scripts/post-review.sh"
fi

if [ -n "$POST_SCRIPT" ] && [ -x "$POST_SCRIPT" ]; then
  if [ -n "$PAYLOAD_FILE" ] && [ -f "$PAYLOAD_FILE" ]; then
    sh "$POST_SCRIPT" "$PR_NUMBER" "$PAYLOAD_FILE" "${OWNER}/${REPO}" >&2 || true
  else
    sh "$POST_SCRIPT" "$PR_NUMBER" "${OWNER}/${REPO}" >&2 || true
  fi
  exit 0
fi

# If script could not be executed directly, block stop to prompt model
cat <<'JSON'
{
  "decision": "block",
  "reason": "MANDATORY REVIEW NOT POSTED: You must execute Step 7 (`sh plugins/ci-review/scripts/post-review.sh <PR#>`) via the Bash tool to post the review to GitHub before finishing."
}
JSON

exit 0
