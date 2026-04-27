#!/bin/sh
# Stop hook: when the lead is about to go idle during an active CDT dev-team,
# remind the lead to verify TaskList for unowned wave-gate handoffs.
#
# Last-resort safety net. The normal workflow rules (Step 6a/6b in
# dev-workflow.md + the Lead Verification Rule in SKILL.md) should catch every
# wave-gate handoff before idle. If a handoff slips through, this hook fires at
# most once per cooldown window per branch.
#
# I/O channel: this script writes its decision JSON to stdout (Stop hooks
# consume hook output from stdout). The filesystem-marker pattern is shared
# with sibling guard `block-cdt-without-teams.sh` via `track-team-state.sh`;
# STATE_FILE below points at that shared marker.
#
# Scope: dev-team only. plan-team and bugfix-team have different topologies
# without the same wave-gate handoff shape, so the marker contents (team name
# written by track-team-state.sh) gate this guardrail.
#
# stop_hook_active: when a Stop hook caused the model to keep going, Claude
# Code re-fires Stop with stop_hook_active=true. Re-blocking in that state
# would prevent any turn from ever completing — exit silently and let the
# model's response close out naturally.

# Drain stdin first (hook contract requires consuming the JSON payload). Skip
# when stdin is a TTY so interactive smoke tests don't hang on `cat`.
PAYLOAD=""
if [ ! -t 0 ]; then
  PAYLOAD=$(cat)
fi

if [ -n "$PAYLOAD" ]; then
  if command -v jq >/dev/null 2>&1; then
    if printf '%s' "$PAYLOAD" | jq -e '.stop_hook_active == true' >/dev/null 2>&1; then
      exit 0
    fi
  else
    # jq-less fallback: a literal "stop_hook_active": true match is sufficient
    # because Claude Code emits this field as a top-level boolean only.
    if printf '%s' "$PAYLOAD" | grep -Eq '"stop_hook_active"[[:space:]]*:[[:space:]]*true'; then
      exit 0
    fi
  fi
fi

BRANCH=$(git branch --show-current 2>/dev/null | tr '/' '-')
[ -z "$BRANCH" ] && exit 0

BRANCH_DIR=".dev/cdt/${BRANCH}"
STATE_FILE="${BRANCH_DIR}/.cdt-team-active"
[ ! -f "$STATE_FILE" ] && exit 0

TEAM_NAME=$(cat "$STATE_FILE" 2>/dev/null)
# Match both legacy bare "dev-team" and scoped "dev-<branch>-<timestamp>" forms.
case "$TEAM_NAME" in
  dev-*) ;;
  *) exit 0 ;;
esac

WARNED_FILE="${BRANCH_DIR}/.cdt-wave-gate-warned"
COOLDOWN_SECONDS=300

if [ -f "$WARNED_FILE" ]; then
  NOW=$(date +%s)
  # GNU stat first (-c %Y), then BSD stat (-f %m). On Linux, `stat -f` means
  # --file-system, which would emit filesystem-status text and break the
  # arithmetic below — so the GNU form must be tried first.
  LAST=$(stat -c %Y "$WARNED_FILE" 2>/dev/null || stat -f %m "$WARNED_FILE" 2>/dev/null || echo 0)
  DELTA=$((NOW - LAST))
  if [ "$DELTA" -ge 0 ] && [ "$DELTA" -lt "$COOLDOWN_SECONDS" ]; then
    exit 0
  fi
fi

touch "$WARNED_FILE"

COOLDOWN_MIN=$((COOLDOWN_SECONDS / 60))
cat <<JSON
{
  "decision": "block",
  "reason": "WAVE-GATE SAFETY NET (fires at most once per ${COOLDOWN_MIN}min during an active CDT dev-team — if you are seeing this, the Step 6a/6b rules and the Lead Verification Rule in SKILL.md did not catch a handoff in time): Run TaskList. If ANY task is \`status=pending && blockedBy=[] && owner=null\`, that task is a wave-gate handoff you owe — send the kickoff message and assign ownership. If NO such task exists, all handoffs are accounted for; reply briefly with what you verified and stop again."
}
JSON

exit 0
