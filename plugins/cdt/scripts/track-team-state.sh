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
    # Ensure state file is gitignored
    if [ -f .gitignore ]; then
      if ! grep -qF '.claude/.cdt-team-active' .gitignore; then
        printf '\n.claude/.cdt-team-active\n' >> .gitignore
      fi
    fi
    ;;
  delete)
    rm -f "$STATE_FILE"
    ;;
esac

exit 0
