#!/bin/sh
# Blocks lead from editing source files during active team sessions
# Called on PreToolUse for Edit and Write tools

STATE_FILE=".claude/.cdt-team-active"

# No team active -> allow everything
[ ! -f "$STATE_FILE" ] && exit 0

# Parse file_path from tool input
INPUT=$(cat)
FILE_PATH=$(echo "$INPUT" | jq -r '.tool_input.file_path // ""' 2>/dev/null)

# No file path -> allow (shouldn't happen for Edit/Write)
if [ -z "$FILE_PATH" ] || [ "$FILE_PATH" = "null" ]; then
  exit 0
fi

# --- Path allowlist (lead may edit these during active team) ---
case "$FILE_PATH" in
  */.claude/plans/*|.claude/plans/*)       exit 0 ;;
  */.claude/files/*|.claude/files/*)       exit 0 ;;
  */docs/adrs/*|docs/adrs/*)               exit 0 ;;
  */CLAUDE.md|CLAUDE.md)                   exit 0 ;;
  */AGENTS.md|AGENTS.md)                   exit 0 ;;
  */README.md|README.md)                   exit 0 ;;
  *.config.*|*.config)                     exit 0 ;;
  */package.json|package.json)             exit 0 ;;
esac

# --- Extension blocklist (source/test files) ---
case "$FILE_PATH" in
  *.ts|*.js|*.py|*.go|*.rs|*.tsx|*.jsx)    ;;
  *.vue|*.svelte|*.css|*.scss|*.html)      ;;
  *)  exit 0 ;;  # Unknown extension -> allow
esac

# Blocked -- source file edit during active team
TEAM_NAME=$(cat "$STATE_FILE" 2>/dev/null || echo "active team")
echo "BLOCKED: Lead cannot edit source files during active ${TEAM_NAME}." >&2
echo "Delegate to the developer or architect teammate via SendMessage." >&2
echo "File: ${FILE_PATH}" >&2
exit 2
