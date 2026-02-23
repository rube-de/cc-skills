#!/bin/sh
# open-issues.sh — Fetch open GitHub issues with dependency graph
# Usage: open-issues.sh [OWNER/REPO] [--include-assigned]
# Returns structured JSON with issues, blocker parsing, and dependency edges.

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
INCLUDE_ASSIGNED=false

for arg in "$@"; do
  case "$arg" in
    --include-assigned) INCLUDE_ASSIGNED=true ;;
    */*)                OWNER_REPO="$arg" ;;
  esac
done

# --- repo detection --------------------------------------------------------

if [ -n "$OWNER_REPO" ]; then
  true  # use as-is
else
  OWNER_REPO=$(gh repo view --json nameWithOwner -q .nameWithOwner 2>/dev/null) \
    || die_json "Could not detect repository — pass OWNER/REPO as argument" "REPO_DETECT"
fi

if [ -z "$OWNER_REPO" ]; then
  die_json "Could not determine repository" "REPO_EMPTY"
fi

# --- fetch issues ----------------------------------------------------------

RAW=$(gh issue list \
  --repo "$OWNER_REPO" \
  --state open \
  --limit 100 \
  --json number,title,body,labels,assignees,milestone,createdAt,updatedAt 2>&1) \
  || die_json "Failed to fetch issues: $(printf '%s' "$RAW" | tr '"' "'")" "FETCH_FAIL"

# --- jq transform ----------------------------------------------------------

NOW=$(date -u +%Y-%m-%dT%H:%M:%SZ)

printf '%s\n' "$RAW" | jq --arg now "$NOW" --argjson include_assigned "$INCLUDE_ASSIGNED" --arg repo "$OWNER_REPO" '

  # Accurate age calculation using epoch math
  def days_since_created:
    (.created_at // .createdAt) as $created |
    ((($now | fromdateiso8601) - ($created | fromdateiso8601)) / 86400 | floor) as $delta |
    (if $delta < 0 then 0 else $delta end);

  # Set of all open issue numbers for blocker resolution
  ([.[].number]) as $open_set |

  # Parse each issue
  [ .[] | {
    number:      .number,
    title:       .title,
    labels:      [(.labels // [])[].name],
    assignees:   [(.assignees // [])[].login],
    milestone:   (.milestone.title // null),
    milestone_due_on: (.milestone.due_on // null),
    created_at:  .createdAt,
    updated_at:  .updatedAt,
    age_days:    days_since_created,

    # Parse blocker patterns from body
    blocked_by: (
      [(.body // "") | scan("[Bb]locked by:?\\s*([^\\n]+)") | .[0] |
        scan("#([0-9]+)") | .[0] | tonumber]
    + [(.body // "") | scan("[Dd]epends on:?\\s*([^\\n]+)") | .[0] |
        scan("#([0-9]+)") | .[0] | tonumber]
      | unique
    ),
    blocks: (
      [(.body // "") | scan("[Bb]locks:?\\s*([^\\n]+)") | .[0] |
        scan("#([0-9]+)") | .[0] | tonumber]
      | unique
    )
  }] |

  # Compute resolved status and unblocked flag
  [ .[] | . + {
    blockers_resolved: (
      [.blocked_by[] | select(. as $b | $open_set | index($b) | not)] | length
    ) == (.blocked_by | length),
    unblocked: (
      [.blocked_by[] | select(. as $b | $open_set | index($b))] | length == 0
    )
  }] as $augmented_issues |

  # Count unassigned from full list (before assignment filter)
  ([$augmented_issues[] | select(.assignees | length == 0)] | length) as $unassigned |

  # Filter by assignment — default excludes assigned issues
  (if $include_assigned then $augmented_issues else [$augmented_issues[] | select(.assignees | length == 0)] end) as $all_issues |

  # Build dependency graph edges [blocker, blocked]
  [ $all_issues[] |
    .number as $blocked |
    .blocked_by[] | [., $blocked]
  ] as $blocker_edges |
  [ $all_issues[] |
    .number as $blocker |
    .blocks[] | [$blocker, .]
  ] as $blocks_edges |
  ($blocker_edges + $blocks_edges | unique) as $edges |

  {
    repo:             $repo,
    total_open:       ($all_issues | length),
    total_unassigned: $unassigned,
    issues:           $all_issues,
    dependency_graph: {
      edges:  $edges,
      cycles: []
    }
  }
' || die_json "jq transform failed — check RAW input or jq syntax" "JQ_FAIL"
