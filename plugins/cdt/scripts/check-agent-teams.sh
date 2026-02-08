#!/bin/bash
# Validates that Agent Teams is enabled (required for claude-dev-team plugin)
# Used by: SessionStart (warning) and PreToolUse (blocking)

if [ "${CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS}" != "1" ]; then
  echo "BLOCKED: claude-dev-team requires Agent Teams." >&2
  echo "Add to your project .claude/settings.json:" >&2
  echo '  { "env": { "CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS": "1" } }' >&2
  exit 2
fi

exit 0
