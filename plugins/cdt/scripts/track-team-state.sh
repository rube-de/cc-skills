#!/bin/sh
# Manages branch-scoped CDT state under .claude/<branch-slug>/
# Called on TeamCreate (create) and TeamDelete (delete)
ACTION="$1"  # "create" or "delete"

# Derive branch-scoped state directory
BRANCH=$(git branch --show-current 2>/dev/null | tr '/' '-')
if [ -z "$BRANCH" ]; then
  echo "track-team-state.sh: cannot determine current branch" >&2
  exit 1
fi
BRANCH_DIR=".claude/${BRANCH}"

case "$ACTION" in
  create)
    mkdir -p "$BRANCH_DIR"
    TEAM_NAME=$(cat | jq -r '.tool_input.team_name // "unknown"' 2>/dev/null)
    echo "$TEAM_NAME" > "${BRANCH_DIR}/.cdt-team-active"
    # Store plugin scripts path for prompt-level access
    SCRIPT_DIR=$(cd "$(dirname "$0")" && pwd)
    echo "$SCRIPT_DIR" > "${BRANCH_DIR}/.cdt-scripts-path"
    # State files live under .claude/ which should already be gitignored
    # Sync GitHub issue state (assign + move to In Progress)
    if [ -x "$SCRIPT_DIR/sync-github-issue.sh" ]; then
      "$SCRIPT_DIR/sync-github-issue.sh" start >/dev/null 2>&1 &
    fi
    ;;
  delete)
    rm -f "${BRANCH_DIR}/.cdt-team-active"
    ;;
  *)
    echo "track-team-state.sh: unexpected or missing action '$ACTION'; expected 'create' or 'delete'" >&2
    exit 1
    ;;
esac

exit 0
