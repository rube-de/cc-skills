#!/bin/bash
# Validates that external consultant CLI output contains valid JSON
# Used as a PostToolUse hook on Bash calls from consultant agents
# Reads hook input JSON from stdin (Claude Code hook protocol)

INPUT=$(cat)
TOOL_OUTPUT=$(echo "$INPUT" | jq -r '.tool_output // empty' 2>/dev/null)

# Skip if no output or not a CLI invocation we care about
if [ -z "$TOOL_OUTPUT" ]; then
  exit 0
fi

# Check if output contains a JSON object with expected council fields
if echo "$TOOL_OUTPUT" | jq -e '.consultant // .findings // .summary' >/dev/null 2>&1; then
  exit 0
fi

# If output looks like an error or rate limit, let the agent handle it
if echo "$TOOL_OUTPUT" | grep -qiE '(rate.?limit|429|quota|error|timeout)'; then
  exit 0
fi

# Output doesn't contain expected JSON structure — inform the agent
echo "Warning: CLI output does not contain expected council JSON structure (consultant, findings, summary). The agent should parse or re-request." >&2
exit 0
