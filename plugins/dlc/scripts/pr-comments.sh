#!/bin/sh
# pr-comments.sh — Fetch PR review comments via GitHub GraphQL API
# Usage: pr-comments.sh [PR_NUMBER] [OWNER/REPO]
# Returns structured JSON with PR metadata, review threads, and summary stats.
# Automatically paginates to fetch all data regardless of count.

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

_tmpdir=$(mktemp -d)
trap 'rm -rf "$_tmpdir"' EXIT

# Safety limit: prevents infinite loops if the API returns hasNextPage
# indefinitely. 20 pages × 50–100 nodes/page = 1000–2000 items per resource.
MAX_PAGES=20

# --- GraphQL queries -------------------------------------------------------

# Initial query — includes pageInfo for cursor-based pagination
QUERY='
query($owner: String!, $repo: String!, $number: Int!) {
  repository(owner: $owner, name: $repo) {
    pullRequest(number: $number) {
      number title url headRefName state reviewDecision
      author { login }
      comments(first: 50) {
        totalCount
        pageInfo { hasNextPage endCursor }
        nodes {
          id databaseId body createdAt
          author { login }
        }
      }
      reviews(first: 50) {
        totalCount
        pageInfo { hasNextPage endCursor }
        nodes {
          id databaseId body state createdAt
          author { login }
        }
      }
      reviewThreads(first: 100) {
        totalCount
        pageInfo { hasNextPage endCursor }
        nodes {
          id isResolved isOutdated path line
          comments(first: 50) {
            totalCount
            pageInfo { hasNextPage endCursor }
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

# Per-resource pagination queries (fetch one resource at a time using cursor)
COMMENTS_PAGE_QUERY='
query($owner: String!, $repo: String!, $number: Int!, $cursor: String!) {
  repository(owner: $owner, name: $repo) {
    pullRequest(number: $number) {
      comments(first: 50, after: $cursor) {
        pageInfo { hasNextPage endCursor }
        nodes {
          id databaseId body createdAt
          author { login }
        }
      }
    }
  }
}
'

REVIEWS_PAGE_QUERY='
query($owner: String!, $repo: String!, $number: Int!, $cursor: String!) {
  repository(owner: $owner, name: $repo) {
    pullRequest(number: $number) {
      reviews(first: 50, after: $cursor) {
        pageInfo { hasNextPage endCursor }
        nodes {
          id databaseId body state createdAt
          author { login }
        }
      }
    }
  }
}
'

THREADS_PAGE_QUERY='
query($owner: String!, $repo: String!, $number: Int!, $cursor: String!) {
  repository(owner: $owner, name: $repo) {
    pullRequest(number: $number) {
      reviewThreads(first: 100, after: $cursor) {
        pageInfo { hasNextPage endCursor }
        nodes {
          id isResolved isOutdated path line
          comments(first: 50) {
            totalCount
            pageInfo { hasNextPage endCursor }
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

# Thread reply pagination uses GraphQL node interface to fetch a specific thread
REPLIES_PAGE_QUERY='
query($nodeId: ID!, $cursor: String!) {
  node(id: $nodeId) {
    ... on PullRequestReviewThread {
      comments(first: 50, after: $cursor) {
        pageInfo { hasNextPage endCursor }
        nodes {
          id databaseId body createdAt
          author { login }
        }
      }
    }
  }
}
'

# --- pagination helper -----------------------------------------------------

# Fetches all remaining pages for a top-level PR connection field and merges
# them into $_tmpdir/raw.json. Uses cursor from the previous page's pageInfo.
# Args: $1 = resource name (comments|reviews|reviewThreads), $2 = query
paginate_resource() {
  _pg_res="$1"
  _pg_query="$2"
  _pg_cursor=$(jq -r ".data.repository.pullRequest.${_pg_res}.pageInfo.endCursor // empty" "$_tmpdir/raw.json")
  _pg_has_next=$(jq -r ".data.repository.pullRequest.${_pg_res}.pageInfo.hasNextPage" "$_tmpdir/raw.json")
  _pg_n=0

  while [ "$_pg_has_next" = "true" ] && [ -n "$_pg_cursor" ] && [ "$_pg_n" -lt "$MAX_PAGES" ]; do
    _pg_n=$((_pg_n + 1))
    if ! gh api graphql \
      -f query="$_pg_query" \
      -F owner="$OWNER" -F repo="$REPO" -F number="$PR_NUMBER" \
      -f cursor="$_pg_cursor" \
      > "$_tmpdir/page.json" 2>/dev/null; then
      break
    fi
    jq --slurpfile page "$_tmpdir/page.json" --arg res "$_pg_res" '
      .data.repository.pullRequest[($res)].nodes += $page[0].data.repository.pullRequest[($res)].nodes
    ' "$_tmpdir/raw.json" > "$_tmpdir/merged.json" && mv "$_tmpdir/merged.json" "$_tmpdir/raw.json"
    _pg_cursor=$(jq -r ".data.repository.pullRequest.${_pg_res}.pageInfo.endCursor // empty" "$_tmpdir/page.json")
    _pg_has_next=$(jq -r ".data.repository.pullRequest.${_pg_res}.pageInfo.hasNextPage" "$_tmpdir/page.json")
  done
}

# --- initial fetch ---------------------------------------------------------

if ! gh api graphql \
  -f query="$QUERY" \
  -F owner="$OWNER" \
  -F repo="$REPO" \
  -F number="$PR_NUMBER" \
  > "$_tmpdir/raw.json" 2>"$_tmpdir/err.txt"; then
  die_json "GraphQL query failed: $(tr '"' "'" < "$_tmpdir/err.txt")" "GRAPHQL_FAIL"
fi

# --- null check ------------------------------------------------------------

jq -e '.data.repository.pullRequest' "$_tmpdir/raw.json" >/dev/null 2>&1 \
  || die_json "PR #${PR_NUMBER} not found in ${OWNER}/${REPO}" "PR_NOT_FOUND"

# --- paginate top-level resources ------------------------------------------

paginate_resource "comments" "$COMMENTS_PAGE_QUERY"
paginate_resource "reviews" "$REVIEWS_PAGE_QUERY"
paginate_resource "reviewThreads" "$THREADS_PAGE_QUERY"

# --- paginate nested thread replies ----------------------------------------

# Each review thread has its own comments connection. If any thread has >50
# replies, fetch the remaining pages via the GraphQL node interface.
_thread_count=$(jq '.data.repository.pullRequest.reviewThreads.nodes | length' "$_tmpdir/raw.json")
_ti=0

while [ "$_ti" -lt "$_thread_count" ]; do
  _tr_has_next=$(jq -r ".data.repository.pullRequest.reviewThreads.nodes[$_ti].comments.pageInfo.hasNextPage" "$_tmpdir/raw.json")
  if [ "$_tr_has_next" = "true" ]; then
    _tr_node_id=$(jq -r ".data.repository.pullRequest.reviewThreads.nodes[$_ti].id" "$_tmpdir/raw.json")
    _tr_cursor=$(jq -r ".data.repository.pullRequest.reviewThreads.nodes[$_ti].comments.pageInfo.endCursor" "$_tmpdir/raw.json")
    _tr_n=0

    while [ "$_tr_has_next" = "true" ] && [ -n "$_tr_cursor" ] && [ "$_tr_n" -lt "$MAX_PAGES" ]; do
      _tr_n=$((_tr_n + 1))
      if ! gh api graphql \
        -f query="$REPLIES_PAGE_QUERY" \
        -f nodeId="$_tr_node_id" \
        -f cursor="$_tr_cursor" \
        > "$_tmpdir/reply_page.json" 2>/dev/null; then
        break
      fi
      jq --slurpfile page "$_tmpdir/reply_page.json" --argjson idx "$_ti" '
        .data.repository.pullRequest.reviewThreads.nodes[$idx].comments.nodes += $page[0].data.node.comments.nodes
      ' "$_tmpdir/raw.json" > "$_tmpdir/merged.json" && mv "$_tmpdir/merged.json" "$_tmpdir/raw.json"
      _tr_cursor=$(jq -r '.data.node.comments.pageInfo.endCursor // empty' "$_tmpdir/reply_page.json")
      _tr_has_next=$(jq -r '.data.node.comments.pageInfo.hasNextPage' "$_tmpdir/reply_page.json")
    done
  fi
  _ti=$((_ti + 1))
done

# --- jq transform ----------------------------------------------------------

jq --arg owner "$OWNER" --arg repo "$REPO" '
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

  # Extract issue comments (general PR-level comments via pullRequest.comments)
  # Keep all issue comments (including those from the PR author) for "already replied"
  # detection; PR author is excluded from reviewer inventory below, not here.
  [ $pr.comments.nodes[] |
    select(.body != null and (.body | gsub("\\s"; "") | length > 0)) |
    {
      id:          .id,
      database_id: (.databaseId // null),
      author:      (.author.login // "ghost"),
      body:        .body,
      created_at:  .createdAt,
      reply_type:  "issue_comment"
    }
  ] as $issue_comments |

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

  # Filter issue comments for reviewer inventory and summary totals:
  # exclude PR author comments and DLC sentinel replies (both retained in
  # the raw $issue_comments array for "already replied" detection).
  [ $issue_comments[] |
    select(.author != $pr_author and (.body | contains("<!-- dlc-reply:") | not))
  ] as $reviewer_issue_comments |

  # Build reviewer inventory (from threads, review bodies, and filtered issue comments)
  ([ $threads[] | .author ] + [ $review_bodies[] | .author ] + [ $reviewer_issue_comments[] | .author ] | unique) |
  map(. as $login |
    ([ $threads[] | select(.author == $login) ]) as $user_threads |
    ([ $threads[].replies[] | select(.author == $login) ]) as $user_replies |
    ([ $review_bodies[] | select(.author == $login) ]) as $user_review_bodies |
    ([ $reviewer_issue_comments[] | select(.author == $login) ]) as $user_issue_comments |
    {
      login: $login,
      total_comments: (($user_threads | length) + ($user_replies | length) + ($user_review_bodies | length) + ($user_issue_comments | length)),
      top_level_threads: ($user_threads | length),
      review_bodies: ($user_review_bodies | length),
      issue_comments: ($user_issue_comments | length)
    }
  ) as $reviewers |

  # Truncation flag — compares totalCount (from initial query) against node
  # arrays (accumulated across all pages). True only when pagination left data
  # behind (e.g. API error mid-pagination or MAX_PAGES hit).
  # Uses unfiltered node counts to avoid false positives from content filtering.
  (($pr.reviewThreads.totalCount > ($threads | length)) or
   ($pr.reviews.totalCount > ($pr.reviews.nodes | length)) or
   ($pr.comments.totalCount > ($pr.comments.nodes | length)) or
   ([$pr.reviewThreads.nodes[] |
     select(.comments.totalCount > (.comments.nodes | length))] | length > 0)) as $truncated |

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
    issue_comments: $issue_comments,
    reviewer_issue_comments: $reviewer_issue_comments,
    summary: {
      total_comments:                (([ $threads[] | 1 + .reply_count ] | add // 0) +
                                      ($review_bodies | length) +
                                      ($reviewer_issue_comments | length)),
      total_threads:                 ($threads | length),
      total_review_bodies:           ($review_bodies | length),
      total_issue_comments:          ($reviewer_issue_comments | length),
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
' "$_tmpdir/raw.json"
