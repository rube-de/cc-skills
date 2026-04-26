#!/bin/sh
# Stop hook: when the lead is about to go idle during an active CDT team,
# emit a system reminder requiring TaskList verification before idling.
# Pattern follows block-cdt-without-teams.sh — filesystem marker + reminder.
# Active-team marker is maintained by track-team-state.sh.

BRANCH=$(git branch --show-current 2>/dev/null | tr '/' '-')
[ -z "$BRANCH" ] && exit 0

STATE_FILE=".dev/cdt/${BRANCH}/.cdt-team-active"
[ ! -f "$STATE_FILE" ] && exit 0

cat >/dev/null  # drain stdin (hook contract requires consuming JSON event payload)

cat <<'JSON'
{
  "hookSpecificOutput": {
    "hookEventName": "Stop",
    "additionalContext": "WAVE-GATE CHECK (REQUIRED before continuing): Active CDT team detected. Run TaskList now. If ANY task is `status=pending && blockedBy=[] && owner=null`, that task is a wave-gate handoff you owe — send the kickoff message to the appropriate teammate and assign ownership before going idle. A pending+unblocked+unowned task during an active team is NEVER 'standing by' time."
  }
}
JSON

exit 0
