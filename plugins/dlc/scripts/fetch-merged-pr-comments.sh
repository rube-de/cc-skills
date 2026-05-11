#!/bin/sh
# fetch-merged-pr-comments.sh — Fetch merged PRs in a window + their review comments
# for the update-review-checklist skill.
#
# Usage:
#   fetch-merged-pr-comments.sh [OWNER/REPO] [--lookback Nd] [--skip-prefix PREFIX]
#
# Defaults:
#   --lookback     30d
#   --skip-prefix  chore/update-review-checklist-
#
# Emits a single JSON document on stdout with this shape:
#   {
#     "repo": "owner/name",
#     "lookback_days": 30,
#     "cutoff_date": "YYYY-MM-DD",
#     "merged_prs_inspected": N,   // PRs actually analyzed (post-skip, post-fetch)
#     "merged_prs_listed": N,       // raw `gh pr list` count before --skip-prefix filtering
#     "skipped_own_prs": N,         // PRs dropped by --skip-prefix (head branch startswith match, NOT author-based)
#     "prs": [
#       {
#         "number": 123,
#         "title": "...",
#         "url": "...",
#         "merged_at": "ISO8601",
#         "author": "login",
#         "head_branch": "feat/...",
#         "comments": [
#           {
#             "id": "...",
#             "type": "thread|review_body|issue_comment",
#             "author": "login",
#             "is_bot": false,
#             "body": "...",
#             "path": "src/foo.ts" | null,
#             "line": 42 | null,
#             "created_at": "ISO8601",
#             "resolved_by_commit": true,
#             "severity": "high" | "medium" | "low" | null  // string or JSON null (unquoted)
#           }
#         ]
#       }
#     ],
#     "summary": { ... }
#   }

set -u

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

OWNER_REPO=""
LOOKBACK="30d"
SKIP_PREFIX="chore/update-review-checklist-"

while [ $# -gt 0 ]; do
  case "$1" in
    --lookback)
      [ -n "${2:-}" ] || die_json "--lookback requires a value (e.g. 30d, 60d)" "ARG_LOOKBACK"
      LOOKBACK="$2"
      shift 2
      ;;
    --lookback=*)
      LOOKBACK="${1#--lookback=}"
      shift
      ;;
    --skip-prefix)
      [ -n "${2:-}" ] || die_json "--skip-prefix requires a value" "ARG_SKIP_PREFIX"
      SKIP_PREFIX="$2"
      shift 2
      ;;
    --skip-prefix=*)
      SKIP_PREFIX="${1#--skip-prefix=}"
      shift
      ;;
    --help|-h)
      sed -n '2,40p' "$0" >&2
      exit 0
      ;;
    */*)
      OWNER_REPO="$1"
      shift
      ;;
    *)
      die_json "Unknown argument: $1" "ARG_UNKNOWN"
      ;;
  esac
done

# Validate --lookback format: a positive integer followed by 'd'.
case "$LOOKBACK" in
  *d)
    _lb_n="${LOOKBACK%d}"
    if ! printf '%s' "$_lb_n" | grep -qE '^[1-9][0-9]*$'; then
      die_json "Invalid --lookback value: $LOOKBACK (expected NNd, e.g. 30d)" "ARG_LOOKBACK"
    fi
    LOOKBACK_DAYS="$_lb_n"
    ;;
  *)
    die_json "Invalid --lookback value: $LOOKBACK (expected NNd, e.g. 30d)" "ARG_LOOKBACK"
    ;;
esac

# --- repo detection --------------------------------------------------------

if [ -n "$OWNER_REPO" ]; then
  OWNER=$(printf '%s\n' "$OWNER_REPO" | cut -d/ -f1)
  REPO=$(printf '%s\n' "$OWNER_REPO" | cut -d/ -f2)
else
  _repo_json=$(gh repo view --json owner,name 2>/dev/null) || die_json "Could not detect repository — pass OWNER/REPO as argument" "REPO_DETECT"
  OWNER=$(printf '%s\n' "$_repo_json" | jq -r '.owner.login')
  REPO=$(printf '%s\n' "$_repo_json" | jq -r '.name')
fi
[ -n "$OWNER" ] && [ -n "$REPO" ] || die_json "Could not parse owner/repo" "REPO_PARSE"

# --- compute cutoff date (BSD + GNU date compatible) -----------------------

CUTOFF_DATE=$(date -u -v-"${LOOKBACK_DAYS}"d +%Y-%m-%d 2>/dev/null \
  || date -u --date="${LOOKBACK_DAYS} days ago" +%Y-%m-%d 2>/dev/null) \
  || die_json "Failed to compute cutoff date" "DATE_FAIL"

# --- temp files ------------------------------------------------------------

_tmpdir=$(mktemp -d "${TMPDIR:-/tmp}/fetch-merged-pr-comments.XXXXXX") || die_json "Failed to create temporary directory" "TMPDIR_CREATE"
trap 'rm -rf "$_tmpdir"' EXIT

# --- list merged PRs in window ---------------------------------------------
#
# Use `gh pr list` with a search query. `--limit` upper-bounds the page;
# very busy repos can blow past it — flag in summary if hit.

LIST_LIMIT=200

if ! gh pr list \
  --repo "$OWNER/$REPO" \
  --state merged \
  --search "merged:>=$CUTOFF_DATE" \
  --json number,title,url,headRefName,author,mergedAt \
  --limit "$LIST_LIMIT" \
  > "$_tmpdir/pr-list.json" 2>"$_tmpdir/list_err.txt"; then
  die_json "gh pr list failed: $(tr '"' "'" < "$_tmpdir/list_err.txt")" "PR_LIST_FAIL"
fi

_total_merged=$(jq 'length' "$_tmpdir/pr-list.json")

# Drop PRs whose branch starts with SKIP_PREFIX so we never re-ingest our own
# previous update PRs (acceptance criterion #8 in issue #216).

jq --arg prefix "$SKIP_PREFIX" '
  [ .[] | select(.headRefName | startswith($prefix) | not) ]
' "$_tmpdir/pr-list.json" > "$_tmpdir/pr-list-filtered.json"

_kept=$(jq 'length' "$_tmpdir/pr-list-filtered.json")
_skipped=$((_total_merged - _kept))

# --- per-PR fetch ----------------------------------------------------------
#
# For each PR we need:
#   * review threads (inline comments) — author, body, path, line, created_at
#   * review bodies — top-level review comments (Copilot/CodeRabbit/Codex summaries, council reports)
#   * issue comments — general PR-level comments
#   * commits with author login + committed_at — for the resolved-by-commit heuristic
#
# Use a single GraphQL query per PR (with nested connections) to minimise round trips.

PR_DETAIL_QUERY='
query($owner: String!, $repo: String!, $number: Int!) {
  repository(owner: $owner, name: $repo) {
    pullRequest(number: $number) {
      number title url headRefName mergedAt
      author { login }
      comments(first: 100) {
        totalCount
        nodes {
          id databaseId body createdAt
          author { login __typename }
        }
      }
      reviews(first: 100) {
        totalCount
        nodes {
          id databaseId body state createdAt
          author { login __typename }
        }
      }
      reviewThreads(first: 100) {
        totalCount
        nodes {
          id isResolved path line
          comments(first: 50) {
            totalCount
            nodes {
              id databaseId body createdAt
              author { login __typename }
            }
          }
        }
      }
      commits(first: 100) {
        totalCount
        nodes {
          commit {
            oid
            committedDate
            author { user { login } email name }
          }
        }
      }
    }
  }
}
'

# Collect per-PR results as JSON Lines; `--slurpfile` at the end converts the
# whole thing into an array. Avoids manual comma-and-bracket assembly.
: > "$_tmpdir/prs.jsonl"
_idx=0

# Counters for the summary block.
_sum_comments=0
_sum_bot_filtered=0
_sum_resolved=0
_sum_severity=0
_truncated_any=false
# Count per-PR GraphQL / transform failures so the summary distinguishes
# "no PRs/comments found" from "every fetch failed silently".
_failures=0

# Iterate the filtered PR list.
_pr_count=$(jq 'length' "$_tmpdir/pr-list-filtered.json")
while [ "$_idx" -lt "$_pr_count" ]; do
  _pr_number=$(jq -r ".[$_idx].number" "$_tmpdir/pr-list-filtered.json")
  _idx=$((_idx + 1))

  if ! gh api graphql \
    -f query="$PR_DETAIL_QUERY" \
    -F owner="$OWNER" -F repo="$REPO" -F number="$_pr_number" \
    > "$_tmpdir/pr-$_pr_number.json" 2>"$_tmpdir/pr-$_pr_number-err.txt"; then
    echo "Warning: GraphQL query for PR #$_pr_number failed, skipping: $(tr '"' "'" < "$_tmpdir/pr-$_pr_number-err.txt")" >&2
    _failures=$((_failures + 1))
    continue
  fi

  if jq -e '(.errors // []) | length > 0' "$_tmpdir/pr-$_pr_number.json" >/dev/null 2>&1; then
    echo "Warning: PR #$_pr_number returned GraphQL errors, skipping: $(jq -r '[.errors[].message] | join("; ")' "$_tmpdir/pr-$_pr_number.json")" >&2
    _failures=$((_failures + 1))
    continue
  fi

  # Track if any nested totalCount exceeded what we fetched (data is incomplete).
  _pr_trunc=$(jq -r '
    .data.repository.pullRequest as $pr |
    ( ($pr.comments.totalCount       > ($pr.comments.nodes       | length)) or
      ($pr.reviews.totalCount        > ($pr.reviews.nodes        | length)) or
      ($pr.reviewThreads.totalCount  > ($pr.reviewThreads.nodes  | length)) or
      ($pr.commits.totalCount        > ($pr.commits.nodes        | length)) or
      ([ $pr.reviewThreads.nodes[] | (.comments.totalCount > (.comments.nodes | length)) ] | any)
    )
  ' "$_tmpdir/pr-$_pr_number.json")
  if [ "$_pr_trunc" = "true" ]; then
    _truncated_any=true
  fi

  # Transform the raw GraphQL response into the canonical per-PR shape.
  # The jq program does three things:
  #   1. Pulls the latest "author commit timestamp" for the PR — used to gate resolved_by_commit.
  #   2. Flattens threads / review_bodies / issue_comments into a single comments array.
  #   3. Per comment: marks is_bot (author.__typename == "Bot"), detects severity from body,
  #      and stamps resolved_by_commit when ≥1 PR-author commit landed AFTER the comment.

  jq '
    .data.repository.pullRequest as $pr |
    ($pr.author.login // "ghost") as $pr_author |

    # Commits by the PR author, sorted by committedDate ascending. Used to score
    # resolved_by_commit: a comment is "resolved by commit" iff ≥1 author commit
    # lands AFTER the comment.created_at. We compare ISO strings — safe because
    # ISO8601 is lexicographically orderable.
    #
    # Primary identity: commit.author.user.login (the GitHub-linked identity).
    # Fallback: GitHub returns author.user = null when the commit email is not
    # linked to a GitHub account, which would otherwise zero out the signal for
    # the whole PR. In that case we fall back to using ALL commit dates —
    # degraded mode (a co-author commit could resolve a comment) but better
    # than dropping every comment as unresolved-by-commit in Step 3.
    ( [ $pr.commits.nodes[] |
        .commit |
        select((.author.user.login // null) == $pr_author) |
        .committedDate
      ] | sort
    ) as $strict_author_dates |
    ( if ($strict_author_dates | length) > 0
        then $strict_author_dates
        else [ $pr.commits.nodes[] | .commit.committedDate ] | sort
      end
    ) as $author_commit_dates |

    # Severity detection regex applied across two formats:
    #   * council / deep-review prose:  "Severity: High" / "Confidence: Medium"
    #   * label-style mentions in body: "[severity/high]", "deep-review/critical"
    # Returns "high" | "medium" | "low" | null.
    # NOTE: jq parameters are filters, not values — rebind to a local var first
    # so we do not accidentally re-evaluate the filter against the inner `.`.
    def detect_severity(body_filter):
      (body_filter // "") as $body |
      ($body | ascii_downcase) as $b |
      if ($b | test("severity:\\s*(critical|high)|confidence:\\s*high|severity/(high|critical)|deep-review/critical"))
        then "high"
      elif ($b | test("severity:\\s*medium|confidence:\\s*medium|severity/medium"))
        then "medium"
      elif ($b | test("severity:\\s*low|confidence:\\s*low|severity/low"))
        then "low"
      else null
      end;

    # Marks a comment as resolved_by_commit when ≥1 PR-author commit landed
    # after the comment was created.
    def resolved(created_filter):
      (created_filter) as $created |
      [ $author_commit_dates[] | select(. > $created) ] | length > 0;

    # Threads → per-comment entries. Iterate all non-author comments per
    # thread so reviewer follow-ups (not just the root) reach clustering.
    # Filter PR-author comments and DLC reply sentinels with the same rules
    # used by the review-bodies and issue-comments blocks below.
    [ $pr.reviewThreads.nodes[] as $thread |
      $thread.comments.nodes[] |
      . as $c |
      select(($c.author.login // "ghost") != $pr_author) |
      select(($c.body // "") | contains("<!-- dlc-reply:") | not) |
      {
        id:                 ($c.id // $thread.id),
        type:               "thread",
        author:             ($c.author.login // "ghost"),
        is_bot:             (($c.author.__typename // "") == "Bot"),
        body:               (($c.body // "") | .[0:2000]),
        path:               $thread.path,
        line:               $thread.line,
        created_at:         $c.createdAt,
        resolved_by_commit: resolved($c.createdAt),
        severity:           detect_severity($c.body // "")
      }
    ] as $thread_comments |

    # Review bodies → comments[]. Exclude PR-author review bodies and DLC
    # reply sentinels — same rule as issue comments below; neither carries
    # reviewer signal.
    [ $pr.reviews.nodes[] |
      select(.body != null and (.body | gsub("\\s"; "") | length > 0)) |
      select((.author.login // "ghost") != $pr_author) |
      select(.body | contains("<!-- dlc-reply:") | not) |
      {
        id:                 .id,
        type:               "review_body",
        author:             (.author.login // "ghost"),
        is_bot:             ((.author.__typename // "") == "Bot"),
        body:               (.body | .[0:2000]),
        path:               null,
        line:               null,
        created_at:         .createdAt,
        resolved_by_commit: resolved(.createdAt),
        severity:           detect_severity(.body)
      }
    ] as $review_bodies |

    # Issue comments → comments[]. Exclude PR-author comments and DLC reply
    # sentinels — neither carries reviewer signal.
    [ $pr.comments.nodes[] |
      select(.body != null and (.body | gsub("\\s"; "") | length > 0)) |
      select((.author.login // "ghost") != $pr_author) |
      select(.body | contains("<!-- dlc-reply:") | not) |
      {
        id:                 .id,
        type:               "issue_comment",
        author:             (.author.login // "ghost"),
        is_bot:             ((.author.__typename // "") == "Bot"),
        body:               (.body | .[0:2000]),
        path:               null,
        line:               null,
        created_at:         .createdAt,
        resolved_by_commit: resolved(.createdAt),
        severity:           detect_severity(.body)
      }
    ] as $issue_comments |

    ($thread_comments + $review_bodies + $issue_comments) as $all_comments |

    {
      number:      $pr.number,
      title:       $pr.title,
      url:         $pr.url,
      merged_at:   $pr.mergedAt,
      author:      $pr_author,
      head_branch: $pr.headRefName,
      comments:    $all_comments,
      counts: {
        total:              ($all_comments | length),
        bots:               ([ $all_comments[] | select(.is_bot) ] | length),
        resolved_by_commit: ([ $all_comments[] | select(.resolved_by_commit) ] | length),
        with_severity:      ([ $all_comments[] | select(.severity != null) ] | length)
      }
    }
  ' "$_tmpdir/pr-$_pr_number.json" > "$_tmpdir/pr-$_pr_number-out.json" 2>"$_tmpdir/pr-$_pr_number-jq-err.txt"

  if [ ! -s "$_tmpdir/pr-$_pr_number-out.json" ]; then
    echo "Warning: jq transform for PR #$_pr_number produced no output, skipping: $(cat "$_tmpdir/pr-$_pr_number-jq-err.txt")" >&2
    _failures=$((_failures + 1))
    continue
  fi

  # Tally counters by inspecting the transformed per-PR record.
  _c_total=$(jq -r '.counts.total // 0 | tostring' "$_tmpdir/pr-$_pr_number-out.json")
  _c_bots=$(jq -r '.counts.bots // 0 | tostring' "$_tmpdir/pr-$_pr_number-out.json")
  _c_res=$(jq -r '.counts.resolved_by_commit // 0 | tostring' "$_tmpdir/pr-$_pr_number-out.json")
  _c_sev=$(jq -r '.counts.with_severity // 0 | tostring' "$_tmpdir/pr-$_pr_number-out.json")
  _sum_comments=$((_sum_comments + _c_total))
  _sum_bot_filtered=$((_sum_bot_filtered + _c_bots))
  _sum_resolved=$((_sum_resolved + _c_res))
  _sum_severity=$((_sum_severity + _c_sev))

  # One JSON object per line; --slurpfile turns this back into a JSON array.
  jq -c '.' "$_tmpdir/pr-$_pr_number-out.json" >> "$_tmpdir/prs.jsonl"
done

# If we had PRs to process but every one failed, exit non-zero so callers can
# distinguish "no PRs/comments found" from "every fetch errored". A silent
# empty-array would otherwise look like "no clusters to propose" in unattended
# runs and the issue would never surface.
if [ "$_kept" -gt 0 ] && [ ! -s "$_tmpdir/prs.jsonl" ]; then
  die_json "all $_failures per-PR fetches/transforms failed; no PR data produced" "ALL_FETCHES_FAILED"
fi

# --- assemble final document ----------------------------------------------

jq -n \
  --arg repo "$OWNER/$REPO" \
  --argjson lookback "$LOOKBACK_DAYS" \
  --arg cutoff "$CUTOFF_DATE" \
  --argjson listed "$_total_merged" \
  --argjson list_limit "$LIST_LIMIT" \
  --argjson skipped "$_skipped" \
  --argjson sum_total "$_sum_comments" \
  --argjson sum_bots "$_sum_bot_filtered" \
  --argjson sum_resolved "$_sum_resolved" \
  --argjson sum_severity "$_sum_severity" \
  --argjson failures "$_failures" \
  --argjson truncated "$([ "$_truncated_any" = true ] && echo true || echo false)" \
  --slurpfile prs "$_tmpdir/prs.jsonl" \
  '{
    repo:                  $repo,
    lookback_days:         $lookback,
    cutoff_date:           $cutoff,
    merged_prs_inspected:  ($prs | length),
    merged_prs_listed:     $listed,
    skipped_own_prs:       $skipped,
    prs:                   $prs,
    summary: {
      total_prs:                  ($prs | length),
      total_comments:             $sum_total,
      bot_comments:               $sum_bots,
      comments_resolved_by_commit: $sum_resolved,
      comments_with_severity:     $sum_severity,
      pr_fetch_failures:          $failures,
      truncated:                  $truncated,
      list_limit_hit:             ($listed >= $list_limit)
    }
  }'
