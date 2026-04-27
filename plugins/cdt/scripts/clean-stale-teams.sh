#!/bin/sh
# Removes stale CDT team/task dirs from ~/.claude/.
# Matches ^(plan|dev|bugfix)-.*-[0-9]{8}-[0-9]{4}$
# Legacy bare names (plan-team / dev-team / bugfix-team) are intentionally not matched.
#
# Usage:
#   clean-stale-teams.sh                       # dry-run, default older-than 7 days
#   clean-stale-teams.sh --yes                 # actually delete
#   clean-stale-teams.sh --older-than 1 --yes  # delete dirs older than 1 day
#   clean-stale-teams.sh --help                # print this help

DRY_RUN=1
OLDER_THAN_DAYS=7

while [ $# -gt 0 ]; do
  case "$1" in
    --yes)
      DRY_RUN=0
      shift
      ;;
    --older-than)
      OLDER_THAN_DAYS="$2"
      if [ -z "$OLDER_THAN_DAYS" ] || ! echo "$OLDER_THAN_DAYS" | grep -qE '^[0-9]+$'; then
        echo "clean-stale-teams.sh: --older-than requires a non-negative integer" >&2
        exit 1
      fi
      shift 2
      ;;
    -h|--help)
      sed -n '2,10p' "$0" | sed 's/^# \{0,1\}//'
      exit 0
      ;;
    *)
      echo "clean-stale-teams.sh: unexpected arg '$1'" >&2
      exit 1
      ;;
  esac
done

REGEX='^(plan|dev|bugfix)-.*-[0-9]{8}-[0-9]{4}$'
SWEPT=0
REMOVED=0

for ROOT in "$HOME/.claude/teams" "$HOME/.claude/tasks"; do
  [ -d "$ROOT" ] || continue
  while IFS= read -r DIR; do
    [ -z "$DIR" ] && continue
    NAME=$(basename "$DIR")
    echo "$NAME" | grep -qE "$REGEX" || continue
    SWEPT=$((SWEPT + 1))
    if [ "$DRY_RUN" -eq 1 ]; then
      echo "[DRY-RUN] would remove: $DIR"
    else
      rm -rf "$DIR"
      REMOVED=$((REMOVED + 1))
      echo "removed: $DIR"
    fi
  done <<HEREDOC_END
$(find "$ROOT" -mindepth 1 -maxdepth 1 -type d -mtime "+$OLDER_THAN_DAYS" 2>/dev/null)
HEREDOC_END
done

echo ""
if [ "$DRY_RUN" -eq 1 ]; then
  echo "[DRY-RUN] $SWEPT dir(s) matched. Re-run with --yes to remove."
else
  echo "$REMOVED dir(s) removed."
fi

exit 0
