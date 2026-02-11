#!/bin/sh
# Syncs GitHub issue state in Projects v2
# Usage: sync-github-issue.sh <start|review>
#   start  — assign self + move to "In Progress"
#   review — move to "In Review" (after PR creation)
# Best-effort — always exits 0, never blocks

ACTION="${1:-start}"
ISSUE_FILE=".claude/.cdt-issue"

# No issue file → nothing to sync
[ ! -f "$ISSUE_FILE" ] && exit 0

ISSUE_NUM=$(cat "$ISSUE_FILE" 2>/dev/null)
[ -z "$ISSUE_NUM" ] && exit 0

# Verify prerequisites
command -v gh >/dev/null 2>&1 || exit 0
command -v jq >/dev/null 2>&1 || exit 0

# --- Map action to target status ---
case "$ACTION" in
  start)
    TARGET_STATUS="in.progress"
    # Self-assign on start only
    gh issue edit "$ISSUE_NUM" --add-assignee @me 2>/dev/null
    ;;
  review)
    TARGET_STATUS="in.review"
    ;;
  *)
    exit 0
    ;;
esac

# --- Move to target status in GitHub Projects v2 (best-effort) ---
REPO_INFO=$(gh repo view --json owner,name 2>/dev/null) || exit 0
OWNER=$(echo "$REPO_INFO" | jq -r '.owner.login' 2>/dev/null)
REPO=$(echo "$REPO_INFO" | jq -r '.name' 2>/dev/null)
[ -z "$OWNER" ] || [ -z "$REPO" ] && exit 0

# Find issue's project items
ITEMS_JSON=$(gh api graphql -f query='
query($owner: String!, $repo: String!, $num: Int!) {
  repository(owner: $owner, name: $repo) {
    issue(number: $num) {
      projectItems(first: 10) {
        nodes {
          id
          project { id }
        }
      }
    }
  }
}' -f owner="$OWNER" -f repo="$REPO" -F num="$ISSUE_NUM" 2>/dev/null) || exit 0

# For each project item, set Status to target
echo "$ITEMS_JSON" | jq -r '
  .data.repository.issue.projectItems.nodes[]
  | "\(.id) \(.project.id)"
' 2>/dev/null | while read -r ITEM_ID PROJECT_ID; do
  [ -z "$ITEM_ID" ] || [ -z "$PROJECT_ID" ] && continue

  # Get Status field ID and target option ID
  FIELD_JSON=$(gh api graphql -f query='
  query($pid: ID!) {
    node(id: $pid) {
      ... on ProjectV2 {
        field(name: "Status") {
          ... on ProjectV2SingleSelectField {
            id
            options { id name }
          }
        }
      }
    }
  }' -f pid="$PROJECT_ID" 2>/dev/null) || continue

  FIELD_ID=$(echo "$FIELD_JSON" | jq -r '.data.node.field.id // empty' 2>/dev/null)
  [ -z "$FIELD_ID" ] && continue

  # Case-insensitive match for target status (dots match any char in jq regex)
  OPTION_ID=$(echo "$FIELD_JSON" | jq -r --arg pat "$TARGET_STATUS" '
    .data.node.field.options[]
    | select(.name | test($pat; "i"))
    | .id
  ' 2>/dev/null | head -1)
  [ -z "$OPTION_ID" ] && continue

  # Move the item
  gh api graphql -f query='
  mutation($pid: ID!, $iid: ID!, $fid: ID!, $oid: String!) {
    updateProjectV2ItemFieldValue(input: {
      projectId: $pid, itemId: $iid, fieldId: $fid
      value: { singleSelectOptionId: $oid }
    }) { projectV2Item { id } }
  }' -f pid="$PROJECT_ID" -f iid="$ITEM_ID" -f fid="$FIELD_ID" -f oid="$OPTION_ID" 2>/dev/null
done

exit 0
