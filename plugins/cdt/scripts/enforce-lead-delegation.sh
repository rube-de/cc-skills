#!/bin/sh
# Blocks lead from editing source files during active team sessions
# Called on PreToolUse for Edit and Write tools

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

# No file path -> allow (shouldn't happen for Edit/Write)
if [ -z "$FILE_PATH" ] || [ "$FILE_PATH" = "null" ]; then
  exit 0
fi

# --- Path allowlist (lead may edit these during active team) ---
case "$FILE_PATH" in
  */.claude/plans/*|.claude/plans/*|./.claude/plans/*)       exit 0 ;;
  */.claude/files/*|.claude/files/*|./.claude/files/*)       exit 0 ;;
  */docs/adrs/*|docs/adrs/*|./docs/adrs/*)                   exit 0 ;;
  */package.json|package.json)             exit 0 ;;
  */tsconfig*.json|tsconfig*.json)         exit 0 ;;
  */eslint.config.*|eslint.config.*|./eslint.config.*|*/vite.config.*|vite.config.*|./vite.config.*) exit 0 ;;
  */jest.config.*|jest.config.*|./jest.config.*|*/vitest.config.*|vitest.config.*|./vitest.config.*) exit 0 ;;
  */next.config.*|next.config.*|./next.config.*|*/postcss.config.*|postcss.config.*|./postcss.config.*) exit 0 ;;
  */tailwind.config.*|tailwind.config.*|./tailwind.config.*) exit 0 ;;
  */webpack.config.*|webpack.config.*|./webpack.config.*|*/rollup.config.*|rollup.config.*|./rollup.config.*) exit 0 ;;
  */babel.config.*|babel.config.*|./babel.config.*) exit 0 ;;
esac

# --- Extension blocklist (source/test/doc files) ---
case "$FILE_PATH" in
  *.ts|*.js|*.mjs|*.cjs|*.py|*.go|*.rs|*.tsx|*.jsx)    ;;
  *.vue|*.svelte|*.css|*.scss|*.html)      ;;
  *.md)                                    ;;
  *)  exit 0 ;;  # Unknown extension -> allow
esac

# Blocked -- source/doc file edit during active team
TEAM_NAME=$(cat "$STATE_FILE" 2>/dev/null || echo "active team")
echo "BLOCKED: Lead cannot edit source or project doc files during active ${TEAM_NAME}." >&2
echo "Delegate to the developer or architect teammate via SendMessage." >&2
echo "File: ${FILE_PATH}" >&2
exit 2
