#!/bin/sh
# Agent Dock status line add-on: runs your own status line command, then adds
# "◇ N agents" to the end of its first line while this session's helpers work.
#
#   statusline.sh                    the segment alone
#   statusline.sh '<your command>'   your status line, plus the segment
#
# Claude Code pipes the session's JSON on stdin. The dock writes the live count
# to ${CLAUDE_CONFIG_DIR:-$HOME/.claude}/agent-dock/agents-now/<session_id>.json.

input=$(cat)

base=""
if [ -n "${1:-}" ]; then
  base=$(printf '%s' "$input" | sh -c "$1")
fi

# field <json> <key>: a top-level string or number, with jq or without it.
field() {
  if command -v jq >/dev/null 2>&1; then
    printf '%s' "$1" | jq -r --arg key "$2" '.[$key] // empty' 2>/dev/null
  else
    printf '%s' "$1" | tr -d '\n' | sed -n "s/^[^{]*{.*\"$2\"[[:space:]]*:[[:space:]]*\"\{0,1\}\([^\",}]*\).*/\1/p"
  fi
}

segment=""
session=$(field "$input" session_id)
if [ -n "$session" ]; then
  name=$(printf '%s' "$session" | tr -c 'A-Za-z0-9._-' '_')
  file="${CLAUDE_CONFIG_DIR:-$HOME/.claude}/agent-dock/agents-now/$name.json"
  if [ -f "$file" ]; then
    working=$(field "$(cat "$file")" working)
    case "$working" in '' | *[!0-9]*) working=0 ;; esac
    if [ "$working" -gt 0 ]; then
      label=agents
      [ "$working" -eq 1 ] && label=agent
      if [ -n "${NO_COLOR:-}" ]; then
        segment="◇ $working $label"
      else
        segment=$(printf '\033[38;2;255;122;102m◇ %s %s\033[0m' "$working" "$label")
      fi
    fi
  fi
fi

if [ -z "$segment" ]; then
  [ -n "$base" ] && printf '%s\n' "$base"
elif [ -z "$base" ]; then
  printf '%s\n' "$segment"
else
  printf '%s\n' "$base" | awk -v segment="  $segment" 'NR == 1 { print $0 segment; next } { print }'
fi
exit 0
