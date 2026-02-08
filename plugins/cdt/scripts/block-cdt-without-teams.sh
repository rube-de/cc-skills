#!/bin/bash
# Blocks /cdt commands unless CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1

INPUT=$(cat)
PROMPT=$(echo "$INPUT" | jq -r '.prompt')

# Check if prompt contains a /cdt command
if echo "$PROMPT" | grep -qE '^\s*/cdt(\s|:|$)'; then
  if [ "${CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS}" != "1" ]; then
    jq -n '{
      decision: "block",
      reason: "CDT requires Agent Teams. Add to your .claude/settings.json:\n  { \"env\": { \"CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS\": \"1\" } }"
    }'
    exit 0
  fi
fi

exit 0
