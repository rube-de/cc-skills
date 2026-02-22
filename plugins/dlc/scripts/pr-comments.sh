#!/bin/sh
# pr-comments.sh — Fetch PR review comments via GitHub GraphQL API
# Usage: pr-comments.sh [PR_NUMBER] [OWNER/REPO]
# Returns structured JSON with PR metadata, review threads, and summary stats.

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
  OWNER=$(echo "$OWNER_REPO" | cut -d/ -f1)
  REPO=$(echo "$OWNER_REPO" | cut -d/ -f2)
else
  _repo_json=$(gh repo view --json owner,name 2>/dev/null) || die_json "Could not detect repository — pass OWNER/REPO as argument" "REPO_DETECT"
  OWNER=$(echo "$_repo_json" | jq -r '.owner.login')
  REPO=$(echo "$_repo_json" | jq -r '.name')
fi

if [ -z "$OWNER" ] || [ -z "$REPO" ]; then
  die_json "Could not parse owner/repo" "REPO_PARSE"
fi

# --- PR number detection ---------------------------------------------------

if [ -z "$PR_NUMBER" ]; then
  PR_NUMBER=$(gh pr view --json number -q .number 2>/dev/null) || die_json "No PR found for current branch — push and open a PR first" "PR_DETECT"
fi

if [ -z "$PR_NUMBER" ] || ! echo "$PR_NUMBER" | grep -qE '^[0-9]+$'; then
  die_json "Invalid PR number: ${PR_NUMBER}" "PR_INVALID"
fi

# --- GraphQL query ---------------------------------------------------------

QUERY='
query($owner: String!, $repo: String!, $number: Int!) {
  repository(owner: $owner, name: $repo) {
    pullRequest(number: $number) {
      number title url headRefName state reviewDecision
      author { login }
      reviews(first: 50) {
        totalCount
        nodes {
          id databaseId body state createdAt
          author { login }
        }
      }
      reviewThreads(first: 100) {
        totalCount
        nodes {
          id isResolved isOutdated path line
          comments(first: 50) {
            nodes {
              id databaseId body createdAt
              author { login }
            }
          }
        }
      }
    }
  }
}
'

_err=$(mktemp)
trap 'rm -f "$_err"' EXIT
RAW=$(gh api graphql \
  -f query="$QUERY" \
  -F owner="$OWNER" \
  -F repo="$REPO" \
  -F number="$PR_NUMBER" 2>"$_err")
_status=$?
if [ $_status -ne 0 ]; then
  die_json "GraphQL query failed: $(tr '"' "'" <"$_err")" "GRAPHQL_FAIL"
fi
rm -f "$_err"

# --- null check ------------------------------------------------------------

echo "$RAW" | jq -e '.data.repository.pullRequest' >/dev/null 2>&1 \
  || die_json "PR #${PR_NUMBER} not found in ${OWNER}/${REPO}" "PR_NOT_FOUND"

# --- jq transform ----------------------------------------------------------

echo "$RAW" | jq --arg owner "$OWNER" --arg repo "$REPO" '
  .data.repository.pullRequest as $pr |

  # Extract PR author for has_author_reply detection
  ($pr.author.login // "unknown") as $pr_author |

  # Extract review bodies (top-level PR review comments, e.g. bot summaries)
  [ $pr.reviews.nodes[] |
    select(.body != null and (.body | gsub("\\s"; "") | length > 0)) |
    {
      id:          .id,
      database_id: (.databaseId // null),
      author:      (.author.login // "ghost"),
      body:        .body,
      state:       .state,
      created_at:  .createdAt,
      reply_type:  "pr_comment"
    }
  ] as $review_bodies |

  # Flatten threads
  [ $pr.reviewThreads.nodes[] |
    . as $thread |
    ($thread.comments.nodes[0]) as $first |
    {
      id:              $thread.id,
      rest_id:         ($first.databaseId // null),
      author:          ($first.author.login // "ghost"),
      body:            $first.body,
      path:            $thread.path,
      line:            $thread.line,
      created_at:      $first.createdAt,
      is_resolved:     $thread.isResolved,
      is_outdated:     $thread.isOutdated,
      has_author_reply: ([ $thread.comments.nodes[1:][] | select(.author.login == $pr_author) ] | length > 0),
      reply_count:     ([ $thread.comments.nodes[1:][] ] | length),
      reply_type:      "inline",
      replies: [ $thread.comments.nodes[1:][] | {
        id:         .id,
        rest_id:    (.databaseId // null),
        author:     (.author.login // "ghost"),
        body:       .body,
        created_at: .createdAt
      }]
    }
  ] as $threads |

  # Build reviewer inventory (from both threads and review bodies)
  ([ $threads[] | .author ] + [ $review_bodies[] | .author ] | unique) |
  map(. as $login | {
    login: $login,
    total_comments: (([ $threads[] | select(.author == $login) ] | length) +
                     ([ $threads[].replies[] | select(.author == $login) ] | length) +
                     ([ $review_bodies[] | select(.author == $login) ] | length)),
    top_level_threads: ([ $threads[] | select(.author == $login) ] | length),
    review_bodies: ([ $review_bodies[] | select(.author == $login) ] | length)
  }) as $reviewers |

  # Truncation flag (check both threads and reviews)
  ($pr.reviewThreads.totalCount > ($threads | length) or
   $pr.reviews.totalCount > ($review_bodies | length)) as $truncated |

  {
    pr: {
      number:         $pr.number,
      title:          $pr.title,
      url:            $pr.url,
      branch:         $pr.headRefName,
      state:          $pr.state,
      author:         ($pr.author.login // "unknown"),
      reviewDecision: ($pr.reviewDecision // null),
      owner:          $owner,
      repo:           $repo
    },
    reviewers: $reviewers,
    threads: $threads,
    review_bodies: $review_bodies,
    summary: {
      total_comments:                (([ $threads[] | 1 + .reply_count ] | add // 0) +
                                      ($review_bodies | length)),
      total_threads:                 ($threads | length),
      total_review_bodies:           ($review_bodies | length),
      review_bodies_with_content:    ($review_bodies | length),
      resolved_threads:              ([ $threads[] | select(.is_resolved) ] | length),
      unresolved_threads:            ([ $threads[] | select(.is_resolved | not) ] | length),
      outdated_threads:              ([ $threads[] | select(.is_outdated) ] | length),
      threads_with_author_reply:     ([ $threads[] | select(.has_author_reply) ] | length),
      threads_without_author_reply:  ([ $threads[] | select(.has_author_reply | not) ] | length),
      reviewer_count:                ($reviewers | length),
      truncated:                     $truncated
    }
  }
'
