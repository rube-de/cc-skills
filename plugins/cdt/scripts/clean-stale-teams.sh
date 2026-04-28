#!/bin/sh
# Removes stale CDT team/task dirs from ~/.claude/.
# Matches ^(plan|dev|bugfix)-.*-[0-9]{8}-[0-9]{4,6}$ — accepts both minute
# (HHMM) and second (HHMMSS) resolution timestamps. Legacy bare names
# (plan-team / dev-team / bugfix-team) are intentionally not matched.
#
# Usage:
#   clean-stale-teams.sh                       dry-run, default older-than 7 days
#   clean-stale-teams.sh --yes                 actually delete
#   clean-stale-teams.sh --older-than 1 --yes  delete dirs older than 1 day
#   clean-stale-teams.sh --help                print this help

print_help() {
  cat <<'HELP_END'
clean-stale-teams.sh — remove stale CDT team/task dirs under ~/.claude/.

Matches ^(plan|dev|bugfix)-.*-[0-9]{8}-[0-9]{4,6}$ (minute or second
timestamp). Legacy bare names (plan-team / dev-team / bugfix-team) are
intentionally not matched.

Usage:
  clean-stale-teams.sh                       dry-run, default older-than 7 days
  clean-stale-teams.sh --yes                 actually delete
  clean-stale-teams.sh --older-than 1 --yes  delete dirs older than 1 day
  clean-stale-teams.sh --help                print this help
HELP_END
}

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
      print_help
      exit 0
      ;;
    *)
      echo "clean-stale-teams.sh: unexpected arg '$1'" >&2
      exit 1
      ;;
  esac
done

REGEX='^(plan|dev|bugfix)-.*-[0-9]{8}-[0-9]{4,6}$'
SWEPT=0
REMOVED=0
FAILED=0

for ROOT in "$HOME/.claude/teams" "$HOME/.claude/tasks"; do
  [ -d "$ROOT" ] || continue
  # Iterate immediate children only — replaces non-POSIX `find -mindepth/-maxdepth`.
  for DIR in "$ROOT"/*; do
    [ -d "$DIR" ] || continue
    NAME=$(basename "$DIR")
    echo "$NAME" | grep -qE "$REGEX" || continue
    # POSIX-portable mtime check: `find <path> -prune -mtime +N` evaluates only the path itself.
    AGED=$(find "$DIR" -prune -mtime "+$OLDER_THAN_DAYS" 2>/dev/null)
    [ -n "$AGED" ] || continue
    SWEPT=$((SWEPT + 1))
    if [ "$DRY_RUN" -eq 1 ]; then
      echo "[DRY-RUN] would remove: $DIR"
    else
      if rm -rf "$DIR" 2>/dev/null; then
        REMOVED=$((REMOVED + 1))
        echo "removed: $DIR"
      else
        FAILED=$((FAILED + 1))
        echo "failed to remove: $DIR" >&2
      fi
    fi
  done
done

echo ""
if [ "$DRY_RUN" -eq 1 ]; then
  echo "[DRY-RUN] $SWEPT dir(s) matched. Re-run with --yes to remove."
  exit 0
else
  echo "$REMOVED dir(s) removed."
  if [ "$FAILED" -gt 0 ]; then
    echo "$FAILED dir(s) failed to remove (see stderr)." >&2
    exit 1
  fi
  exit 0
fi
