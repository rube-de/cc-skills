#!/bin/sh
# Blocks lead from editing source files during active team sessions.
# DORMANT: Not wired in hooks.json as of Issue #59.
# Reason: Claude Code hooks don't expose agent identity, so this blocks
# teammates too. Will need new conditional logic (not just re-wiring) when
# the hook protocol adds agent_role or similar.

# Derive branch-scoped state directory
BRANCH=$(git branch --show-current 2>/dev/null | tr '/' '-')

if [ -z "$BRANCH" ]; then
  # Detached HEAD: fail-closed if any team is active
  for f in .claude/*/.cdt-team-active; do
    if [ -f "$f" ]; then
      echo "BLOCKED: Detached HEAD during active team session. Checkout a branch before editing." >&2
      exit 2
    fi
  done
  exit 0
fi

STATE_FILE=".claude/${BRANCH}/.cdt-team-active"

# No team active -> allow everything
if [ ! -f "$STATE_FILE" ]; then
  exit 0
fi

# Require jq — fail-closed (block) if missing during active team
if ! command -v jq >/dev/null 2>&1; then
  echo "enforce-lead-delegation.sh: jq not found — blocking edit during active team (fail-closed)" >&2
  exit 2
fi

# Parse file_path from tool input (pipe stdin directly to avoid echo fragility on large Write payloads)
# Fail-closed: if jq can't parse the JSON, block rather than allow with empty FILE_PATH
if ! FILE_PATH=$(cat | jq -r '.tool_input.file_path // ""' 2>/dev/null); then
  echo "BLOCKED: Unable to parse tool input JSON during active team session." >&2
  exit 2
fi

# Block all file edits during active team — lead is a coordinator, not an implementer.
TEAM_NAME=$(cat "$STATE_FILE" 2>/dev/null || echo "active team")
FILE_PATH_MSG=""
if [ -n "$FILE_PATH" ] && [ "$FILE_PATH" != "null" ]; then
  FILE_PATH_MSG=" File: ${FILE_PATH}"
fi
echo "BLOCKED: Lead cannot edit files during active ${TEAM_NAME}. Delegate via SendMessage.${FILE_PATH_MSG}" >&2
exit 2
