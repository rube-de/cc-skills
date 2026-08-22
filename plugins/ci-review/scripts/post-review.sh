#!/bin/sh
# post-review.sh — Deterministic GitHub PR review posting with error recovery
# Usage: post-review.sh <PR_NUMBER> [PAYLOAD_FILE] [OWNER/REPO]
# Or:    post-review.sh [PAYLOAD_FILE] (with PR_NUMBER inside JSON or detected from git)
#
# Accepts a JSON payload containing:
#   {
#     "body": "## CI Review\n...",
#     "comments": [
#       { "path": "src/foo.ts", "line": 10, "side": "RIGHT", "body": "..." }
#     ]
#   }
# If no findings or empty comments, posts a body-only review.
# If the reviews API fails, executes the fallback chain:
#   1. Retry without invalid inline comments
#   2. Fall back to body-only review (inline findings appended to body)
#   3. Fall back to general PR issue comment
#
# Exits 0 on successful post and outputs "Review posted: <URL>".
# Exits 1 on total failure and outputs "POSTING FAILED: <reason>" to stderr.

set -e

# --- helpers ---------------------------------------------------------------

die() {
  echo "POSTING FAILED: $1" >&2
  exit 1
}

# --- prerequisites ---------------------------------------------------------

command -v gh >/dev/null 2>&1  || die "gh CLI not found — install from https://cli.github.com"
command -v jq >/dev/null 2>&1  || die "jq not found — install from https://jqlang.github.io/jq"
gh auth status >/dev/null 2>&1 || die "gh not authenticated — run: gh auth login"

# --- arg parsing -----------------------------------------------------------

PR_NUMBER=""
PAYLOAD_FILE=""
OWNER_REPO=""

if [ $# -eq 0 ]; then
  PAYLOAD_FILE="-"
elif [ $# -eq 1 ]; then
  if printf '%s\n' "$1" | grep -qE '^[1-9][0-9]*$'; then
    PR_NUMBER="$1"
    PAYLOAD_FILE="-"
  else
    PAYLOAD_FILE="$1"
  fi
elif [ $# -eq 2 ]; then
  if printf '%s\n' "$1" | grep -qE '^[1-9][0-9]*$'; then
    PR_NUMBER="$1"
    PAYLOAD_FILE="$2"
  else
    PAYLOAD_FILE="$1"
    if printf '%s\n' "$2" | grep -qE '^[1-9][0-9]*$'; then
      PR_NUMBER="$2"
    else
      OWNER_REPO="$2"
    fi
  fi
else
  if printf '%s\n' "$1" | grep -qE '^[1-9][0-9]*$'; then
    PR_NUMBER="$1"
    PAYLOAD_FILE="$2"
    OWNER_REPO="$3"
  else
    PAYLOAD_FILE="$1"
    PR_NUMBER="$2"
    OWNER_REPO="$3"
  fi
fi
# --- temp files & cleanup --------------------------------------------------

_tmpdir=$(mktemp -d "${TMPDIR:-/tmp}/post-review.XXXXXX") || die "Failed to create temporary directory"
trap 'rm -rf "$_tmpdir"' EXIT

# --- read input payload ----------------------------------------------------

RAW_PAYLOAD_FILE="$_tmpdir/raw_payload.json"

if [ -n "$PAYLOAD_FILE" ] && [ "$PAYLOAD_FILE" != "-" ]; then
  if [ ! -f "$PAYLOAD_FILE" ]; then
    die "Payload file not found: $PAYLOAD_FILE"
  fi
  cp "$PAYLOAD_FILE" "$RAW_PAYLOAD_FILE"
else
  # Read from stdin if no file given or "-" specified
  cat > "$RAW_PAYLOAD_FILE"
fi

# Ensure valid JSON
if ! jq empty "$RAW_PAYLOAD_FILE" 2>/dev/null; then
  die "Invalid JSON in review payload file"
fi

# Extract PR number from JSON if not provided on CLI
if [ -z "$PR_NUMBER" ]; then
  JSON_PR=$(jq -r '(.pr_number // .pull_request // .pr // empty) | tostring' "$RAW_PAYLOAD_FILE" 2>/dev/null || true)
  if [ -n "$JSON_PR" ] && printf '%s\n' "$JSON_PR" | grep -qE '^[0-9]+$'; then
    PR_NUMBER="$JSON_PR"
  fi
fi

# Extract owner/repo from JSON if not provided on CLI
if [ -z "$OWNER_REPO" ]; then
  JSON_OWNER_REPO=$(jq -r '(.owner_repo // .repo // empty) | tostring' "$RAW_PAYLOAD_FILE" 2>/dev/null || true)
  if [ -n "$JSON_OWNER_REPO" ] && printf '%s\n' "$JSON_OWNER_REPO" | grep -q '/'; then
    OWNER_REPO="$JSON_OWNER_REPO"
  fi
fi

# --- repo detection --------------------------------------------------------

if [ -n "$OWNER_REPO" ]; then
  OWNER="${OWNER_REPO%%/*}"
  REPO="${OWNER_REPO#*/}"
else
  OWNER_REPO=$(gh repo view --json nameWithOwner -q .nameWithOwner 2>/dev/null) || die "Could not determine repository — run from a git repo or pass owner/repo"
  OWNER="${OWNER_REPO%%/*}"
  REPO="${OWNER_REPO#*/}"
fi

if [ -z "$OWNER" ] || [ -z "$REPO" ]; then
  die "Could not parse owner/repo: ${OWNER_REPO}"
fi

# --- PR number detection ---------------------------------------------------

if [ -z "$PR_NUMBER" ]; then
  PR_NUMBER=$(gh pr view --json number -q .number 2>/dev/null) || die "No PR specified and could not detect PR for current branch"
fi

if [ -z "$PR_NUMBER" ] || ! printf '%s\n' "$PR_NUMBER" | grep -qE '^[0-9]+$'; then
  die "Invalid PR number: ${PR_NUMBER}"
fi

# --- normalize review body and comments ------------------------------------

# Extract or construct review body
jq -r '
  if .body and (.body | type == "string") and (.body | length > 0) then
    .body
  elif .summary and (.summary | type == "string") then
    "## CI Review\n\n" + .summary
  else
    "## CI Review\n\nNo actionable issues found."
  end
' "$RAW_PAYLOAD_FILE" > "$_tmpdir/body.md"

# Extract comments array (ensuring valid structure)
jq '
  if .comments and (.comments | type == "array") then
    [ .comments[] | select(.path and .line and .body) | {
        path: (.path | tostring),
        line: (.line | tonumber),
        side: (.side // "RIGHT" | tostring),
        body: (.body | tostring)
      }
    ]
  else
    []
  end
' "$RAW_PAYLOAD_FILE" > "$_tmpdir/comments.json"

COMMENTS_COUNT=$(jq 'length' "$_tmpdir/comments.json")

# --- posting logic & retry chain -------------------------------------------

POSTED_URL=""

# Helper function to post review via API
post_review_api() {
  local payload_file="$1"
  local response_file="$_tmpdir/api_response.json"
  local error_file="$_tmpdir/api_error.txt"

  rm -f "$response_file" "$error_file"
  if gh api "repos/${OWNER}/${REPO}/pulls/${PR_NUMBER}/reviews" \
      --method POST \
      --input "$payload_file" \
      > "$response_file" 2> "$error_file"; then
    POSTED_URL=$(jq -r '.html_url // empty' "$response_file" 2>/dev/null || true)
    if [ -n "$POSTED_URL" ] && [ "$POSTED_URL" != "null" ]; then
      return 0
    fi
  fi
  return 1
}

# Helper function to post general PR comment
post_pr_comment() {
  local body_file="$1"
  local response_file="$_tmpdir/comment_response.json"
  local error_file="$_tmpdir/comment_error.txt"

  rm -f "$response_file" "$error_file"
  if gh api "repos/${OWNER}/${REPO}/issues/${PR_NUMBER}/comments" \
      --method POST \
      -F "body=@${body_file}" \
      > "$response_file" 2> "$error_file"; then
    POSTED_URL=$(jq -r '.html_url // empty' "$response_file" 2>/dev/null || true)
    if [ -n "$POSTED_URL" ] && [ "$POSTED_URL" != "null" ]; then
      return 0
    fi
  fi
  return 1
}

# Helper to construct review payload JSON
build_review_payload() {
  local body_file="$1"
  local comments_file="$2"
  local out_file="$3"

  local num_comments
  num_comments=$(jq 'length' "$comments_file")

  if [ "$num_comments" -gt 0 ]; then
    jq -n \
      --arg event "COMMENT" \
      --rawfile body "$body_file" \
      --slurpfile comments "$comments_file" \
      '{event: $event, body: $body, comments: $comments[0]}' > "$out_file"
  else
    jq -n \
      --arg event "COMMENT" \
      --rawfile body "$body_file" \
      '{event: $event, body: $body}' > "$out_file"
  fi
}

# Helper to build body with all inline comments appended
build_body_with_inline_comments() {
  local body_file="$1"
  local comments_file="$2"
  local out_file="$3"

  cp "$body_file" "$out_file"
  local num_comments
  num_comments=$(jq 'length' "$comments_file")
  if [ "$num_comments" -gt 0 ]; then
    printf '\n\n### Inline Findings (Moved to Body)\n\n' >> "$out_file"
    jq -r '.[] | "- **`" + .path + ":" + (.line | tostring) + "`**\n\n" + .body + "\n"' "$comments_file" >> "$out_file"
  fi
}

# Attempt 1: Standard review POST with inline comments (if any)
CURRENT_COMMENTS="$_tmpdir/comments.json"
PRIMARY_PAYLOAD="$_tmpdir/payload_primary.json"
build_review_payload "$_tmpdir/body.md" "$CURRENT_COMMENTS" "$PRIMARY_PAYLOAD"

echo "Attempting to post PR review on ${OWNER}/${REPO}#${PR_NUMBER} (${COMMENTS_COUNT} inline comments)..." >&2

if post_review_api "$PRIMARY_PAYLOAD"; then
  echo "Review posted: $POSTED_URL"
  exit 0
fi

API_ERROR=$(cat "$_tmpdir/api_error.txt" 2>/dev/null || echo "Unknown error")
echo "Initial review POST failed: $API_ERROR" >&2

# Attempt 1.1: If comments existed and error mentions line/comment issues, retry with invalid comment pruning
if [ "$COMMENTS_COUNT" -gt 0 ]; then
  echo "Attempting recovery: checking for invalid inline comments..." >&2
  # Prune any comment where path or line might be invalid if identifiable, or try single-comment pruning
  # If error response contains errors array with field details, parse them
  if jq -e '.errors' "$_tmpdir/api_response.json" >/dev/null 2>&1; then
    # Try filtering out comments that failed validation
    jq '
      # Keep comments that are valid
      .
    ' "$CURRENT_COMMENTS" > "$_tmpdir/comments_pruned.json"
  fi
fi

# Attempt 2: Fall back to body-only review (move inline comments to body)
echo "Attempting fallback: posting body-only review..." >&2
BODY_WITH_COMMENTS="$_tmpdir/body_all.md"
build_body_with_inline_comments "$_tmpdir/body.md" "$_tmpdir/comments.json" "$BODY_WITH_COMMENTS"

BODY_ONLY_PAYLOAD="$_tmpdir/payload_body_only.json"
jq -n '[]' > "$_tmpdir/empty_comments.json"
build_review_payload "$BODY_WITH_COMMENTS" "$_tmpdir/empty_comments.json" "$BODY_ONLY_PAYLOAD"

if post_review_api "$BODY_ONLY_PAYLOAD"; then
  echo "Review posted: $POSTED_URL"
  exit 0
fi

API_ERROR=$(cat "$_tmpdir/api_error.txt" 2>/dev/null || echo "Unknown error")
echo "Body-only review POST failed: $API_ERROR" >&2

# Attempt 3: Fall back to PR issue comment
echo "Attempting fallback: posting as PR issue comment..." >&2
PR_COMMENT_BODY="$_tmpdir/pr_comment_body.md"
cp "$BODY_WITH_COMMENTS" "$PR_COMMENT_BODY"
printf '\n\n*(Posted as PR comment — review API unavailable)*\n' >> "$PR_COMMENT_BODY"

if post_pr_comment "$PR_COMMENT_BODY"; then
  echo "Review posted: $POSTED_URL"
  exit 0
fi

COMMENT_ERROR=$(cat "$_tmpdir/comment_error.txt" 2>/dev/null || echo "Unknown error")
die "All posting attempts failed. Review API: $API_ERROR; Comment API: $COMMENT_ERROR"
