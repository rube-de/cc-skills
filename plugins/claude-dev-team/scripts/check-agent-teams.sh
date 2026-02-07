#!/bin/bash
# Validates that Agent Teams is enabled (required for claude-dev-team plugin)

if [ "${CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS}" != "1" ]; then
  echo "claude-dev-team requires Agent Teams. Set in your Claude Code settings:" >&2
  echo '  { "env": { "CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS": "1" } }' >&2
  exit 2
fi

exit 0
