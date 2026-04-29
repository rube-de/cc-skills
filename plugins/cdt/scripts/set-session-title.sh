#!/bin/bash
# Stop hook: when a CDT team is active on a feature branch, rename the
# Claude Code session by appending a `custom-title` event directly to the
# session's JSONL transcript. Fires once per branch via marker.
#
# Why this design (vs. hookSpecificOutput.sessionTitle on UserPromptSubmit):
#   - UserPromptSubmit fires too early: /cdt:plan-task and friends ship the
#     first prompt while still on `main`, before the workflow checks out the
#     feature branch. Naming the session there produces "cdt-main" and burns
#     the per-branch marker on `main` itself.
#   - Stop fires after every assistant turn, including the final turn of an
#     autonomous /auto-task — which is the one prompt that case ever sends.
#   - hookSpecificOutput.sessionTitle is only honoured on UserPromptSubmit, so
#     we cannot use the API field from Stop. We instead write the same
#     `{"type":"custom-title", ...}` JSONL event Plan Mode writes; the
#     /resume picker indexes that event regardless of who appended it.

INPUT=$(cat)
SESSION_ID=$(printf '%s\n' "$INPUT" | jq -r '.session_id // ""')
TRANSCRIPT_PATH=$(printf '%s\n' "$INPUT" | jq -r '.transcript_path // ""')

[ -z "$SESSION_ID" ] && exit 0
[ -z "$TRANSCRIPT_PATH" ] && exit 0
[ ! -f "$TRANSCRIPT_PATH" ] && exit 0

BRANCH=$(git branch --show-current 2>/dev/null)
[ -z "$BRANCH" ] && exit 0

# Skip on the default branch. CDT always cuts a feature branch as step 1, so
# any Stop firing on main/master means we're outside a CDT run — and writing
# the marker on main would block renames forever for plain main usage.
case "$BRANCH" in
  main|master) exit 0 ;;
esac

BRANCH_SLUG=$(printf '%s\n' "$BRANCH" | tr '/' '-')
BRANCH_DIR=".dev/cdt/${BRANCH_SLUG}"
TEAM_ACTIVE="${BRANCH_DIR}/.cdt-team-active"
TITLE_SET="${BRANCH_DIR}/.cdt-session-titled"

# Only act when a CDT team has been created on this branch.
[ ! -f "$TEAM_ACTIVE" ] && exit 0

# One-shot per branch: once we've named the session, stay silent forever.
[ -f "$TITLE_SET" ] && exit 0

# Prefer GitHub issue title if the branch encodes an explicit issue reference.
# Only matches `issue-N` or `#N` forms to avoid false positives from bare
# numeric segments (e.g. `feature/release-2026-04` → 2026).
TITLE=""
ISSUE_NUM=$(printf '%s\n' "$BRANCH" | grep -oE '(issue-|#)[0-9]+' | grep -oE '[0-9]+' | head -1)
if [ -n "$ISSUE_NUM" ] && command -v gh >/dev/null 2>&1; then
  TITLE=$(gh issue view "$ISSUE_NUM" --json title --jq .title 2>/dev/null)
fi

# Fallback to branch name with conventional prefix stripped.
if [ -z "$TITLE" ]; then
  TITLE=$(printf '%s\n' "$BRANCH" \
    | sed -E 's#^(feat|feature|bugfix|refactor|cdt|chore|hotfix|test|docs)/##')
fi

SLUG=$(printf '%s\n' "$TITLE" \
  | tr '[:upper:]' '[:lower:]' \
  | sed -E 's#[^a-z0-9]+#-#g; s#^-+##; s#-+$##')

[ -z "$SLUG" ] && exit 0

# Append the custom-title event the /resume picker indexes, then mark the
# branch as titled. Marker writes only on successful append so a transient
# failure leaves the marker absent and the next Stop firing retries.
if jq -nc --arg s "$SESSION_ID" --arg t "cdt-${SLUG}" '{
  type: "custom-title",
  customTitle: $t,
  sessionId: $s
}' >> "$TRANSCRIPT_PATH"; then
  mkdir -p "$BRANCH_DIR"
  date +%s > "$TITLE_SET"
fi

exit 0
