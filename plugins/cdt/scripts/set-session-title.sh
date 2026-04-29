#!/bin/bash
# UserPromptSubmit hook: on the first CDT-related prompt for a branch, set the
# session title once — sourced from the linked GitHub issue title if the branch
# encodes an issue number, else from the branch name itself. The choice of
# UserPromptSubmit (vs. PreToolUse:TeamCreate) is forced: hookSpecificOutput.sessionTitle
# is only honoured on UserPromptSubmit; other hook events accept the field but
# silently drop it.

INPUT=$(cat)
PROMPT=$(echo "$INPUT" | jq -r '.prompt // ""')

BRANCH=$(git branch --show-current 2>/dev/null)
[ -z "$BRANCH" ] && exit 0

BRANCH_SLUG=$(echo "$BRANCH" | tr '/' '-')
BRANCH_DIR=".dev/cdt/${BRANCH_SLUG}"
TEAM_ACTIVE="${BRANCH_DIR}/.cdt-team-active"
TITLE_SET="${BRANCH_DIR}/.cdt-session-titled"

# One-shot per branch: once we've named the session, stay silent forever.
[ -f "$TITLE_SET" ] && exit 0

# Activation: the prompt invokes /cdt OR a CDT team is already live for this
# branch. This covers both the first /cdt:plan-task invocation and resumed
# sessions where the team was created in an earlier process.
if ! echo "$PROMPT" | grep -qE '^\s*/cdt(\s|:|$)' && [ ! -f "$TEAM_ACTIVE" ]; then
  exit 0
fi

# Prefer GitHub issue title if the branch encodes an issue reference. The
# `issue-N` form is canonical; bare-number prefixes (e.g. `123-foo`) are also
# accepted because semantic-release-style branch names use them.
TITLE=""
ISSUE_NUM=$(echo "$BRANCH" | grep -oE '(^|[/_-])(issue-|#)?[0-9]+' | grep -oE '[0-9]+' | head -1)
if [ -n "$ISSUE_NUM" ] && command -v gh >/dev/null 2>&1; then
  TITLE=$(gh issue view "$ISSUE_NUM" --json title --jq .title 2>/dev/null)
fi

# Fallback to branch name with conventional prefix stripped.
if [ -z "$TITLE" ]; then
  TITLE=$(echo "$BRANCH" \
    | sed -E 's#^(feature|bugfix|refactor|cdt|chore|hotfix|test|docs)/##')
fi

SLUG=$(echo "$TITLE" \
  | tr '[:upper:]' '[:lower:]' \
  | sed -E 's#[^a-z0-9]+#-#g; s#^-+##; s#-+$##')

[ -z "$SLUG" ] && exit 0

# Persist the marker BEFORE emitting JSON so a downstream crash can't trigger a
# rename on every retry.
mkdir -p "$BRANCH_DIR"
date +%s > "$TITLE_SET"

jq -n --arg t "cdt-${SLUG}" '{
  hookSpecificOutput: {
    hookEventName: "UserPromptSubmit",
    sessionTitle: $t
  }
}'
