#!/bin/sh
# Stop hook: when the lead is about to go idle during an active CDT team,
# block the Stop and emit a system reminder requiring TaskList verification
# before idling.
#
# Output schema: top-level `decision: "block"` + `reason` — the documented
# Stop-hook contract. `hookSpecificOutput` has no Stop variant.
# Pattern matches block-cdt-without-teams.sh.
#
# Active-team marker is maintained by track-team-state.sh.

BRANCH=$(git branch --show-current 2>/dev/null | tr '/' '-')
[ -z "$BRANCH" ] && exit 0

STATE_FILE=".dev/cdt/${BRANCH}/.cdt-team-active"
[ ! -f "$STATE_FILE" ] && exit 0

cat >/dev/null  # drain stdin (hook contract requires consuming JSON event payload)

cat <<'JSON'
{
  "decision": "block",
  "reason": "WAVE-GATE CHECK: Active CDT team detected. Run TaskList now. If ANY task is `status=pending && blockedBy=[] && owner=null`, that task is a wave-gate handoff you owe — send the kickoff message to the appropriate teammate and assign ownership before idling. If NO such task exists, all handoffs are accounted for; reply briefly with what you verified and stop again."
}
JSON

exit 0
