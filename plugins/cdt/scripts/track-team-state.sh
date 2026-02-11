#!/bin/sh
# Manages .claude/.cdt-team-active state file for team lifecycle tracking
# Called on TeamCreate (create) and TeamDelete (delete)
ACTION="$1"  # "create" or "delete"

STATE_DIR=".claude"
STATE_FILE="${STATE_DIR}/.cdt-team-active"

case "$ACTION" in
  create)
    mkdir -p "$STATE_DIR"
    TEAM_NAME=$(cat | jq -r '.tool_input.team_name // "unknown"' 2>/dev/null)
    echo "$TEAM_NAME" > "$STATE_FILE"
    # Store plugin scripts path for prompt-level access
    SCRIPT_DIR=$(cd "$(dirname "$0")" && pwd)
    echo "$SCRIPT_DIR" > "${STATE_DIR}/.cdt-scripts-path"
    # Ensure state files are gitignored
    if [ -f .gitignore ]; then
      if ! grep -qF '.claude/.cdt-team-active' .gitignore; then
        printf '\n.claude/.cdt-team-active\n' >> .gitignore
      fi
      if ! grep -qF '.claude/.cdt-issue' .gitignore; then
        printf '.claude/.cdt-issue\n' >> .gitignore
      fi
      if ! grep -qF '.claude/.cdt-scripts-path' .gitignore; then
        printf '.claude/.cdt-scripts-path\n' >> .gitignore
      fi
    fi
    # Sync GitHub issue state (assign + move to In Progress)
    if [ -x "$SCRIPT_DIR/sync-github-issue.sh" ]; then
      "$SCRIPT_DIR/sync-github-issue.sh" start 2>/dev/null &
    fi
    ;;
  delete)
    rm -f "$STATE_FILE"
    rm -f "${STATE_DIR}/.cdt-scripts-path"
    ;;
esac

exit 0
