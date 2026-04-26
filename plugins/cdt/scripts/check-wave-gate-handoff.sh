#!/bin/sh
# Stop hook: when the lead is about to go idle during an active CDT team,
# remind the lead to verify TaskList for unowned wave-gate handoffs.
#
# Pattern follows block-cdt-without-teams.sh — filesystem marker + reminder
# via decision:block + reason. Active-team marker is maintained by
# track-team-state.sh.
#
# Cooldown: at most one fire per 5 minutes (300s) per branch. The Stop event
# fires on every assistant turn that ends without further tool use, so
# without a cooldown a single active team session would re-block every Stop
# attempt indefinitely. The 5-minute window scopes this hook to a
# last-resort safety net — if the normal workflow rules (Step 6b in
# dev-workflow.md + the Lead Verification Rule in SKILL.md) fail to catch a
# wave-gate handoff, the next Stop after the cooldown surfaces a reminder.

BRANCH=$(git branch --show-current 2>/dev/null | tr '/' '-')
[ -z "$BRANCH" ] && exit 0

BRANCH_DIR=".dev/cdt/${BRANCH}"
STATE_FILE="${BRANCH_DIR}/.cdt-team-active"
[ ! -f "$STATE_FILE" ] && exit 0

cat >/dev/null  # drain stdin (hook contract requires consuming JSON event payload)

WARNED_FILE="${BRANCH_DIR}/.cdt-wave-gate-warned"
COOLDOWN_SECONDS=300

if [ -f "$WARNED_FILE" ]; then
  NOW=$(date +%s)
  # macOS: stat -f %m, Linux: stat -c %Y. Fall back to 0 (force fire) if neither works.
  LAST=$(stat -f %m "$WARNED_FILE" 2>/dev/null || stat -c %Y "$WARNED_FILE" 2>/dev/null || echo 0)
  DELTA=$((NOW - LAST))
  if [ "$DELTA" -ge 0 ] && [ "$DELTA" -lt "$COOLDOWN_SECONDS" ]; then
    exit 0
  fi
fi

touch "$WARNED_FILE"

cat <<'JSON'
{
  "decision": "block",
  "reason": "WAVE-GATE SAFETY NET (fires at most once per 5min during an active CDT team — if you are seeing this, the Step 6b rules and the Lead Verification Rule in SKILL.md did not catch a handoff in time): Run TaskList. If ANY task is `status=pending && blockedBy=[] && owner=null`, that task is a wave-gate handoff you owe — send the kickoff message and assign ownership. If NO such task exists, all handoffs are accounted for; reply briefly with what you verified and stop again."
}
JSON

exit 0
