#!/bin/sh
# The Status Line Dock's renderer: Claude Code runs it as the status line.
#
#   sh statusline.sh <layout.json>
#
# It reads the session's JSON on stdin and the Layout the Dock saved, runs the
# Base status line in Extend mode, gathers git and the Agent Dock's count, and
# hands it all to statusline.jq beside it, which draws the blocks.
#
# The Dock's preview runs it too, with MODS_TOOLBOX_LAYOUT (a Layout not yet
# applied) and MODS_TOOLBOX_PREVIEW=1: it then prints one JSON object and keeps
# no copy of its input.

input=$(cat)
here=$(dirname "$0")
config="${CLAUDE_CONFIG_DIR:-$HOME/.claude}"
config="${config%/}"
tab=$(printf '\t')

if ! command -v jq >/dev/null 2>&1; then
  echo "status line needs jq"
  exit 0
fi

layout="${MODS_TOOLBOX_LAYOUT:-}"
if [ -z "$layout" ] && [ -n "${1:-}" ] && [ -f "$1" ]; then
  layout=$(cat "$1")
fi
if [ -z "$layout" ] || ! printf '%s' "$layout" | jq -e 'type == "object"' >/dev/null 2>&1; then
  echo "status line layout missing: open /status-dock"
  exit 0
fi

session=""
cwd=""
project=""
wants_git=0
mode=replace
base_kind=""
base_command=""
base_path=""
eval "$(printf '%s' "$input" | jq -r --argjson layout "$layout" '
  "session=\(.session_id // "" | @sh)",
  "cwd=\(.workspace.current_dir // .cwd // "" | @sh)",
  "project=\(.workspace.project_dir // "" | @sh)",
  "wants_git=\(if [($layout.lines // [])[][]] | index("branch") then 1 else 0 end)",
  "mode=\($layout.mode // "replace" | @sh)",
  "base_kind=\($layout.base.kind // "" | @sh)",
  "base_command=\($layout.base.command // "" | @sh)",
  "base_path=\($layout.base.path // "" | @sh)"
' 2>/dev/null)"

depth="${MODS_TOOLBOX_DEPTH:-0}"
case $depth in '' | *[!0-9]*) depth=0 ;; esac
name=$(printf '%s' "$session" | tr -c 'A-Za-z0-9._-' '_')

# The last input Claude Code sent, so the Dock's preview shows this session's real figures.
if [ "${MODS_TOOLBOX_PREVIEW:-}" != 1 ] && [ "$depth" -eq 0 ] && [ -n "$session" ]; then
  captured="$config/mods-toolbox/last-input"
  mkdir -p "$captured" 2>/dev/null &&
    printf '%s' "$input" | jq -c --arg columns "${COLUMNS:-}" '. + { columns: ($columns | tonumber? // null) }' >"$captured/$name.json.tmp" 2>/dev/null &&
    mv "$captured/$name.json.tmp" "$captured/$name.json"
fi

# The Base status line, in Extend mode. A base that is itself this renderer runs
# with MODS_TOOLBOX_BASE_ONLY, so it adds only its own base and no block shows
# twice, and with a deeper MODS_TOOLBOX_DEPTH, so a chain of them ends after two.
base=""
if [ "$mode" = extend ] && [ "$depth" -lt 2 ]; then
  command=""
  if [ "$base_kind" = command ]; then
    command=$base_command
  elif [ "$base_kind" = file ] && [ -f "$base_path" ]; then
    command=$(jq -r '.statusLine.command // empty' "$base_path" 2>/dev/null)
  fi
  if [ -n "$command" ]; then
    base=$(printf '%s' "$input" | MODS_TOOLBOX_DEPTH=$((depth + 1)) MODS_TOOLBOX_BASE_ONLY=1 MODS_TOOLBOX_LAYOUT='' MODS_TOOLBOX_PREVIEW='' sh -c "$command" 2>/dev/null)
  fi
fi
if [ "${MODS_TOOLBOX_BASE_ONLY:-}" = 1 ]; then
  [ -n "$base" ] && printf '%s\n' "$base"
  exit 0
fi

# Git status is slow in a big repo, so each repo's answer is kept for 5 seconds.
git_branch=""
git_dirty=0
if [ "$wants_git" = 1 ] && [ -n "$cwd" ] && command -v git >/dev/null 2>&1; then
  root=$(git -C "$cwd" rev-parse --show-toplevel 2>/dev/null)
  if [ -n "$root" ]; then
    cache_dir="$config/mods-toolbox/cache"
    cache="$cache_dir/git-$(printf '%s' "$root" | cksum | cut -d' ' -f1)"
    now=$(date +%s)
    stamp=0
    if [ -f "$cache" ]; then
      IFS="$tab" read -r stamp git_branch git_dirty <"$cache"
    fi
    case $stamp in '' | *[!0-9]*) stamp=0 ;; esac
    if [ $((now - stamp)) -gt 5 ]; then
      git_branch=$(git -C "$root" branch --show-current 2>/dev/null)
      [ -z "$git_branch" ] && git_branch=$(git -C "$root" rev-parse --short HEAD 2>/dev/null)
      # git status runs programs a repo's own config names (core.fsmonitor, clean
      # filters), so it runs only in the repo the session started in, which Claude
      # Code trusted and runs git status in itself. A repo the session moved into,
      # such as an unpacked archive, shows its branch alone.
      trusted=""
      [ -n "$project" ] && trusted=$(git -C "$project" rev-parse --show-toplevel 2>/dev/null)
      git_dirty=0
      if [ -n "$trusted" ] && [ "$root" = "$trusted" ] &&
        [ -n "$(git --no-optional-locks -c core.fsmonitor=false -C "$root" status --porcelain 2>/dev/null | head -n 1)" ]; then
        git_dirty=1
      fi
      mkdir -p "$cache_dir" 2>/dev/null && printf '%s\t%s\t%s\n' "$now" "$git_branch" "$git_dirty" >"$cache"
    fi
  fi
fi

agents=0
count_file="$config/agent-dock/agents-now/$name.json"
if [ -n "$session" ] && [ -f "$count_file" ]; then
  agents=$(jq -r '.working // 0' "$count_file" 2>/dev/null)
fi
# The preview shows a sample count while no helper runs.
if [ "${MODS_TOOLBOX_PREVIEW:-}" = 1 ] && [ -n "${MODS_TOOLBOX_AGENTS:-}" ]; then
  agents=$MODS_TOOLBOX_AGENTS
fi

color=1
[ -n "${NO_COLOR:-}" ] && color=0

printf '%s' "$input" | jq -rc \
  --argjson layout "$layout" \
  --arg base "$base" \
  --arg git_branch "$git_branch" \
  --arg git_dirty "$git_dirty" \
  --arg agents "$agents" \
  --arg columns "${COLUMNS:-}" \
  --arg home "${HOME:-}" \
  --arg color "$color" \
  --arg preview "${MODS_TOOLBOX_PREVIEW:-}" \
  -f "$here/statusline.jq" 2>/dev/null
exit 0
