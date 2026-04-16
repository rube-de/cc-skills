#!/bin/sh
# fetch-pr-comments.sh — Fetch existing PR comments for cross-run dedup
# Usage: fetch-pr-comments.sh [PR_NUMBER] [OWNER/REPO]
# Returns structured JSON with inline comments, PR comments, and review bodies.
# Uses REST API with gh api --paginate for automatic pagination.

# --- helpers ---------------------------------------------------------------

die_json() {
  _code="${2:-UNKNOWN}"
  if command -v jq >/dev/null 2>&1; then
    jq -n --arg err "$1" --arg code "$_code" '{error: $err, code: $code}' >&2
  else
    _err_escaped=$(printf '%s' "$1" | sed -e 's/\\/\\\\/g' -e 's/"/\\"/g' | tr '\n' ' ')
    printf '{"error":"%s","code":"%s"}\n' "$_err_escaped" "$_code" >&2
  fi
  exit 1
}

# --- prerequisites ---------------------------------------------------------

command -v gh >/dev/null 2>&1  || die_json "gh CLI not found — install from https://cli.github.com" "GH_NOT_FOUND"
command -v jq >/dev/null 2>&1  || die_json "jq not found — install from https://jqlang.github.io/jq" "JQ_NOT_FOUND"
gh auth status >/dev/null 2>&1 || die_json "gh not authenticated — run: gh auth login" "GH_AUTH"

# --- arg parsing -----------------------------------------------------------

PR_NUMBER=""
OWNER_REPO=""

for arg in "$@"; do
  case "$arg" in
    */*) OWNER_REPO="$arg" ;;
    *)   PR_NUMBER="$arg"  ;;
  esac
done

# --- repo detection --------------------------------------------------------

if [ -n "$OWNER_REPO" ]; then
  OWNER=$(printf '%s\n' "$OWNER_REPO" | cut -d/ -f1)
  REPO=$(printf '%s\n' "$OWNER_REPO" | cut -d/ -f2)
else
  _repo_json=$(gh repo view --json owner,name 2>/dev/null) || die_json "Could not detect repository — pass OWNER/REPO as argument" "REPO_DETECT"
  OWNER=$(printf '%s\n' "$_repo_json" | jq -r '.owner.login')
  REPO=$(printf '%s\n' "$_repo_json" | jq -r '.name')
fi

if [ -z "$OWNER" ] || [ -z "$REPO" ]; then
  die_json "Could not parse owner/repo" "REPO_PARSE"
fi

# --- PR number detection ---------------------------------------------------

if [ -z "$PR_NUMBER" ]; then
  PR_NUMBER=$(gh pr view --json number -q .number 2>/dev/null) || die_json "No PR found for current branch — push and open a PR first" "PR_DETECT"
fi

if [ -z "$PR_NUMBER" ] || ! printf '%s\n' "$PR_NUMBER" | grep -qE '^[0-9]+$'; then
  die_json "Invalid PR number: ${PR_NUMBER}" "PR_INVALID"
fi

# --- temp files & cleanup --------------------------------------------------

_tmpdir=$(mktemp -d "${TMPDIR:-/tmp}/fetch-pr-comments.XXXXXX") || die_json "Failed to create temporary directory" "TMPDIR_CREATE"
trap 'rm -rf "$_tmpdir"' EXIT

# --- fetch REST endpoints --------------------------------------------------

# Inline review comments (file path + line number + body)
gh api --paginate "repos/${OWNER}/${REPO}/pulls/${PR_NUMBER}/comments" \
  > "$_tmpdir/inline_raw.json" 2>"$_tmpdir/inline_err.txt" \
  || die_json "Failed to fetch inline comments: $(cat "$_tmpdir/inline_err.txt")" "INLINE_FETCH"

# General PR-level comments (body only, no file association)
gh api --paginate "repos/${OWNER}/${REPO}/issues/${PR_NUMBER}/comments" \
  > "$_tmpdir/pr_raw.json" 2>"$_tmpdir/pr_err.txt" \
  || die_json "Failed to fetch PR comments: $(cat "$_tmpdir/pr_err.txt")" "PR_COMMENTS_FETCH"

# Review bodies (summary text at top of each review)
gh api --paginate "repos/${OWNER}/${REPO}/pulls/${PR_NUMBER}/reviews" \
  > "$_tmpdir/reviews_raw.json" 2>"$_tmpdir/reviews_err.txt" \
  || die_json "Failed to fetch reviews: $(cat "$_tmpdir/reviews_err.txt")" "REVIEWS_FETCH"

# --- jq transform ----------------------------------------------------------

jq -n \
  --slurpfile inline "$_tmpdir/inline_raw.json" \
  --slurpfile pr "$_tmpdir/pr_raw.json" \
  --slurpfile reviews "$_tmpdir/reviews_raw.json" \
'
  # Merge paginated arrays (--paginate outputs one array per page)
  ($inline | add // []) as $all_inline |
  ($pr | add // []) as $all_pr |
  ($reviews | add // []) as $all_reviews |

  # Inline comments: filter empty bodies, extract dedup fields
  # Truncate bodies to 2000 chars — enough for content-signal matching
  # without bloating LLM context on comment-heavy PRs
  [ $all_inline[] |
    select(.body != null and (.body | gsub("\\s"; "") | length > 0)) |
    {
      path: .path,
      line: (.line // .original_line // null),
      body: (.body | .[0:2000]),
      author: (.user.login // "ghost"),
      created_at: .created_at
    }
  ] as $inline_comments |

  # PR-level comments: filter empty bodies
  [ $all_pr[] |
    select(.body != null and (.body | gsub("\\s"; "") | length > 0)) |
    {
      body: (.body | .[0:2000]),
      author: (.user.login // "ghost"),
      created_at: .created_at
    }
  ] as $pr_comments |

  # Review bodies: filter empty bodies
  [ $all_reviews[] |
    select(.body != null and (.body | gsub("\\s"; "") | length > 0)) |
    {
      body: (.body | .[0:2000]),
      author: (.user.login // "ghost"),
      state: .state,
      created_at: .submitted_at
    }
  ] as $review_bodies |

  {
    inline_comments: $inline_comments,
    pr_comments: $pr_comments,
    review_bodies: $review_bodies,
    summary: {
      total_inline: ($inline_comments | length),
      total_pr_comments: ($pr_comments | length),
      total_review_bodies: ($review_bodies | length)
    }
  }
' || die_json "Failed to transform fetched comment payloads" "TRANSFORM_FAILED"
