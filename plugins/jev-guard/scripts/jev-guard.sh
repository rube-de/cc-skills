#!/usr/bin/env bash
# jev-guard: PreToolUse hook.
#
# 1. Hard rules in code (secret files, rm -rf of home or /, force-push to main). Always enforced.
# 2. Fast pass for calls that need no judgment (edits inside the project, plain `git status`).
# 3. Everything else is sent to TypeSafe Jev as yes/no questions (config/questions.json);
#    config/policy.json maps the probabilities to deny / ask / pass.
#
# Each setting comes from its environment variable, then ~/.config/jev-guard/config.json, then the
# default here. The API key lives in its own file, never in the config or the environment.
#
# Passing a call means exit 0 with no decision. Never "allow": that would skip the user's own
# permission prompts. If the guard itself breaks, the call passes and the user is told once.
# Written for bash 3.2 (macOS default).

set -uo pipefail
CDPATH=

if ! command -v jq >/dev/null 2>&1; then
  if command -v jaq >/dev/null 2>&1; then jq() { jaq "$@"; }; else exit 0; fi
fi

ROOT="${CLAUDE_PLUGIN_ROOT:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"
DATA="${CLAUDE_PLUGIN_DATA:-${XDG_STATE_HOME:-$HOME/.local/state}/jev-guard}"
CONFIG="${JEV_GUARD_CONFIG:-$HOME/.config/jev-guard/config.json}"
URL="${JEV_GUARD_URL:-https://api.typesafe.ai/v1/systemone}"

USER_CONF='{}'
CONFIG_PROBLEMS=""
if [ -e "$CONFIG" ]; then
  if USER_CONF=$(jq -c 'if type == "object" then . else error("not an object") end' "$CONFIG" 2>/dev/null); then
    CONFIG_PROBLEMS=$(jq -r -f "$ROOT/scripts/config-problems.jq" <<<"$USER_CONF" 2>/dev/null)
    # Valid values only; anything invalid was reported above and falls back to the default.
    eval "$(jq -r '
      def pick($k; ok): if has($k) and (.[$k] | ok) then .[$k] | tostring else "" end;
      @sh "C_MODE=\(pick("mode"; IN("shadow", "enforce", "off")))",
      @sh "C_ON_ERROR=\(pick("on_error"; IN("open", "ask")))",
      @sh "C_MODEL=\(pick("model"; type == "string"))",
      @sh "C_KEY_FILE=\(pick("key_file"; type == "string"))",
      @sh "C_BUDGET_S=\(pick("budget_s"; type == "number" and . > 0))",
      @sh "C_BACKOFF_S=\(pick("backoff_s"; type == "number" and . >= 0))",
      @sh "C_USER_REQUEST=\(pick("send_user_request"; type == "boolean"))"
    ' <<<"$USER_CONF" 2>/dev/null)"
  else
    USER_CONF='{}'
    CONFIG_PROBLEMS="it is not a JSON object, so the defaults apply"
  fi
fi

MODE="${JEV_GUARD_MODE:-${C_MODE:-shadow}}"  # shadow | enforce | off
case "$MODE" in shadow | enforce | off) ;; *)
  CONFIG_PROBLEMS="${CONFIG_PROBLEMS:+$CONFIG_PROBLEMS; }JEV_GUARD_MODE must be shadow, enforce or off"
  MODE=shadow
  ;;
esac
ON_ERROR="${JEV_GUARD_ON_ERROR:-${C_ON_ERROR:-open}}"  # open | ask
MODEL="${JEV_GUARD_MODEL:-${C_MODEL:-jev-1.13.0}}"     # pinned: thresholds are tuned per model version
KEY_FILE="${JEV_GUARD_KEY_FILE:-${C_KEY_FILE:-$HOME/.config/jev-guard/key}}"
case "$KEY_FILE" in "~/"*) KEY_FILE="$HOME/${KEY_FILE#\~/}" ;; esac
BUDGET_S="${JEV_GUARD_BUDGET_S:-${C_BUDGET_S:-1.5}}"  # total wait for Jev; a later answer is ignored
CONNECT_S="${JEV_GUARD_CONNECT_S:-0.3}"                # per connection try; raise it on a high-latency link
BACKOFF_S="${JEV_GUARD_BACKOFF_S:-${C_BACKOFF_S:-60}}"
BACKOFF_S=${BACKOFF_S%%.*}
USER_REQUEST="${JEV_GUARD_USER_REQUEST:-}"
[ -n "$USER_REQUEST" ] || { [ "${C_USER_REQUEST:-true}" = true ] && USER_REQUEST=1 || USER_REQUEST=0; }

[ "$MODE" = off ] && exit 0

INPUT=$(cat)
eval "$(jq -r '
  @sh "TOOL=\(.tool_name // "") CWD=\(.cwd // "") SESSION=\(.session_id // "none") TRANSCRIPT=\(.transcript_path // "") PERM_MODE=\(.permission_mode // "")",
  (.tool_input // {} | @sh "T_PATH=\(.file_path // .notebook_path // "" | tostring) T_DIR=\(.path // "" | tostring) T_GLOB=\(.glob // "" | tostring) T_CMD=\(.command // "" | tostring)")
' <<<"$INPUT" 2>/dev/null)"
TOOL=${TOOL:-}
[ -n "$TOOL" ] || exit 0
CWD=${CWD:-$PWD}
PROJECT="${CLAUDE_PROJECT_DIR:-$CWD}"
SESSION=$(printf '%s' "${SESSION:-none}" | tr -cd 'A-Za-z0-9-')
TRANSCRIPT=${TRANSCRIPT:-}
T_PATH=${T_PATH:-} T_DIR=${T_DIR:-} T_GLOB=${T_GLOB:-} T_CMD=${T_CMD:-} PERM_MODE=${PERM_MODE:-}

# With --dangerously-skip-permissions, Claude Code (2.1.304) applies a hook's "ask" on an edit to
# files it treats as special (.claude/, .vscode/) without showing it, so edits get a deny instead.
# Asks on Bash are still shown there.
ASK=ask
if [ "$PERM_MODE" = bypassPermissions ]; then
  case "$TOOL" in Write | Edit | MultiEdit | NotebookEdit) ASK=deny ;; esac
fi

log_line() {  # decision source detail [verdict-json]
  local decision=$1
  [ "$decision" = ask ] && decision=$ASK
  mkdir -p "$DATA" 2>/dev/null || return 0
  jq -nc --arg ts "$(date -u +%Y-%m-%dT%H:%M:%SZ)" --arg session "$SESSION" --arg mode "$MODE" \
    --arg tool "$TOOL" --arg decision "$decision" --arg source "$2" --arg detail "$3" --argjson verdict "${4:-null}" \
    '{ts: $ts, session: $session, mode: $mode, tool: $tool, decision: $decision, source: $source, detail: $detail}
     + (if $verdict == null then {} else {model: $verdict.model, probs: $verdict.probs, latency_s: $verdict.latency_s, input: $verdict.input} end)' \
    >>"$DATA/decisions.jsonl" 2>/dev/null
}

NOTE=""

note_once() {  # kind message — queue a note for the user, shown once per session for each kind
  mkdir -p "$DATA" 2>/dev/null || return 0
  local stamp="$DATA/noted-$SESSION-$1"
  [ -e "$stamp" ] && return 0
  : >"$stamp"
  NOTE="${NOTE:+$NOTE }jev-guard: $2"
}

finish() {  # decision reason message — print the hook's answer and exit; empty parts are left out
  jq -n --arg d "$1" --arg r "$2" --arg m "${NOTE:+$NOTE }$3" '
    (if $d == "" then {} else
      {hookSpecificOutput: {hookEventName: "PreToolUse", permissionDecision: $d, permissionDecisionReason: ("jev-guard: " + $r)}}
    end)
    + (if ($m | test("^\\s*$")) then {} else {systemMessage: ($m | sub("\\s+$"; ""))} end)
    | select(. != {})'
  exit 0
}

pass() { finish "" "" "${1:-}"; }

decide() {  # deny|ask reason
  if [ "$1" = ask ] && [ "$ASK" = deny ]; then
    finish deny "$2 Permissions are skipped in this session, so the user can't be asked; ask them to make this change themselves." ""
  fi
  finish "$1" "$2" ""
}

rule() {  # deny|ask reason — hard rules apply in every mode except off
  log_line "$1" rule "$2"
  decide "$1" "$2"
}

# Two transient failures in a row switch Jev off for BACKOFF_S, so an outage doesn't slow every
# call; a single slow answer doesn't. The file holds "<failures in a row> <epoch of the last one>".
FAILS_FILE="$DATA/down-$SESSION"

on_error() {  # message [transient] — Jev unreachable or its answer unusable
  log_line error jev "$1"
  if [ -n "${2:-}" ] && mkdir -p "$DATA" 2>/dev/null; then
    local count=0 since=0
    [ -r "$FAILS_FILE" ] && read -r count since <"$FAILS_FILE"
    case "$count" in '' | *[!0-9]*) count=0 ;; esac
    echo "$((count + 1)) $(date +%s)" >"$FAILS_FILE"
  fi
  if [ "$ON_ERROR" = ask ] && [ "$MODE" = enforce ]; then
    decide ask "Jev was unavailable ($1), so this call needs your OK."
  fi
  note_once jev "Jev could not check a call ($1), so calls pass unchecked while that lasts. Hard rules still apply."
  pass
}

[ -n "$CONFIG_PROBLEMS" ] && note_once config "$CONFIG: $CONFIG_PROBLEMS."

# Paths are resolved in-process (results in globals) because this runs before every tool call.
HERE=$PWD

lexical() {  # LEX = the absolute path with ".", "//" and ".." resolved, without touching the disk
  local seg out="" IFS=/
  set -f
  for seg in $1; do
    case "$seg" in
      "" | .) ;;
      ..) out="${out%/*}" ;;
      *) out="$out/$seg" ;;
    esac
  done
  set +f
  LEX="${out:-/}"
}

real_prefix() {  # REAL = symlinks resolved in the longest part of the path that exists, the rest as written
  local p="$1" rest=""
  while [ -n "$p" ] && [ "$p" != / ]; do
    if cd -P "$p" 2>/dev/null; then
      REAL="${PWD%/}$rest"
      cd "$HERE" 2>/dev/null
      return
    fi
    rest="/${p##*/}$rest"
    p=${p%/*}
  done
  REAL="${rest:-/}"
}

resolve() {  # R = the real path a tool call would touch: "..", "." and symlinks resolved
  local p="$1" target hops=0
  case "$p" in
    "~") p="$HOME" ;;
    "~/"*) p="$HOME/${p#\~/}" ;;
    /*) ;;
    *) p="$CWD/$p" ;;
  esac
  lexical "$p"
  real_prefix "$LEX"
  p=$REAL
  while [ -L "$p" ] && [ "$hops" -lt 8 ]; do  # the file itself is a link
    target=$(readlink "$p")
    case "$target" in /*) ;; *) target="${p%/*}/$target" ;; esac
    lexical "$target"
    real_prefix "$LEX"
    p=$REAL
    hops=$((hops + 1))
  done
  R=$p
}

# Everything a target is compared against, in the same resolved form.
resolve "$HOME" && HOME_R=$R
resolve "$PROJECT" && PROJECT_R=$R
resolve "$CWD" && CWD_R=$R
resolve "${TMPDIR:-/tmp}" && TMP_R=$R
resolve "$KEY_FILE" && KEY_R=$R
resolve "$CONFIG" && CONFIG_R=$R

secret_path() {  # resolved-path — live secret stores; templates like .env.example are fine
  case "${1##*/}" in
    .env.example | .env.sample | .env.template | .env.dist | *.pub) return 1 ;;
    .env | .env.* | *.pem | *.p12 | *.pfx | id_rsa | id_dsa | id_ecdsa | id_ed25519) return 0 ;;
  esac
  case "$1" in
    "$HOME_R"/.ssh/id_* | "$HOME_R"/.aws/credentials | "$HOME_R"/.config/gcloud/* | "$HOME_R"/.netrc | "$KEY_R") return 0 ;;
  esac
  return 1
}

control_path() {  # resolved-path — files that change what the agent may do or what runs later
  case "$1" in
    "$CONFIG_R" | "$HOME_R"/.claude/settings*.json | */.claude/settings*.json | "$HOME_R"/.claude.json | */.git/hooks/* | */.git/config | \
      "$HOME_R"/.zshrc | "$HOME_R"/.zprofile | "$HOME_R"/.bashrc | "$HOME_R"/.bash_profile | "$HOME_R"/.profile | "$HOME_R"/.ssh/*) return 0 ;;
  esac
  return 1
}

inside_workspace() {  # resolved-path
  case "$1" in
    "$PROJECT_R"/* | "$CWD_R"/* | "$TMP_R"/* | /tmp/* | /private/tmp/*) return 0 ;;
  esac
  return 1
}

bash_floor() {  # FLOOR = why the command must never run, or empty
  local c="$1"
  local s='(^|[;&|(`[:space:]])'
  local e='([[:space:];&|)`]|$)'
  local flags='(-[[:alnum:]-]+[[:space:]]+)*'
  local recursive='(-[[:alnum:]]*[rR][[:alnum:]]*|--recursive)[[:space:]]+'
  local target='(/|/\*|~|~/|~/\*|\$HOME|\$HOME/|\$HOME/\*|\$\{HOME\}|\$\{HOME\}/|"\$HOME"|"\$HOME/")'
  local push="${s}git[[:space:]]+([^;&|]*[[:space:]])?push([[:space:]][^;&|]*)?"
  FLOOR=""
  if [[ $c =~ ${s}rm[[:space:]]+${flags}${recursive}${flags}${target}${e} ]]; then
    FLOOR="recursive delete of / or the home directory"
  elif [[ $c =~ ${push}(--force|[[:space:]]-[[:alnum:]]*f[[:alnum:]]*([[:space:]]|$)|[[:space:]]\+) && $c =~ [[:space:]:/+](main|master)${e} ]]; then
    FLOOR="force-push to main or master"
  else
    case "$c" in *"$KEY_FILE"* | *"$KEY_R"* | *jev-guard/key*) FLOOR="reads the jev-guard API key" ;; esac
  fi
}

git_display_only() {  # args — every option is a known display flag; refs and paths are fine
  local a
  for a in "$@"; do
    case "$a" in
      --stat | --shortstat | --numstat | --name-only | --name-status | --oneline | --graph | --decorate | \
        --short | --branch | --cached | --staged | --porcelain | --all | --no-color | --color=never | \
        --format=* | --pretty=* | --since=* | --until=* | --author=* | -n | -n[0-9]* | -[0-9]* | -p | -s | -b | -v | --) ;;
      -*) return 1 ;;  # anything else, e.g. --output=FILE (writes) or --no-index (reads any file)
    esac
  done
}

bash_fast_pass() {  # plain read-only commands with nothing to judge
  local c="$1" lc
  case "$c" in *[\;\&\|\$\`\<\>\(\)]* | *$'\n'*) return 1 ;; esac
  lc=$(printf '%s' "$c" | tr '[:upper:]' '[:lower:]')
  case "$lc" in *env* | *secret* | *token* | *passw* | *credential* | *.ssh* | *.aws* | *key*) return 1 ;; esac
  case "$c" in
    ls | "ls "* | pwd | eza | "eza "* | "wc "* | "which "* | "git branch") return 0 ;;
    "git status" | "git status "* | "git diff" | "git diff "* | "git log" | "git log "* | "git show" | "git show "*)
      set -f
      set -- $c
      set +f
      shift 2
      git_display_only "$@"
      return
      ;;
  esac
  return 1
}

to_ms() {  # MS = seconds like "1.5" or "0.301234" as whole milliseconds (bash has no floats)
  local whole=${1%%.*} frac=000
  case "$1" in *.*) frac="${1#*.}000" ;; esac
  case "$whole$frac" in *[!0-9]*) MS=0; return ;; esac
  MS=$((10#${whole:-0} * 1000 + 10#${frac:0:3}))
}

to_s() {  # milliseconds -> seconds with three decimals, for curl and the log
  local ms=$1
  [ "$ms" -lt 0 ] && ms=0
  local frac="00$((ms % 1000))"
  printf '%d.%s' $((ms / 1000)) "${frac: -3}"
}

ask_jev() {
  local count=0 since=0
  [ -r "$FAILS_FILE" ] && read -r count since <"$FAILS_FILE"
  case "$count$since" in *[!0-9]*) count=0 since=0 ;; esac
  if [ "${count:-0}" -ge 2 ] && [ $(($(date +%s) - ${since:-0})) -lt "$BACKOFF_S" ]; then
    log_line skipped jev "backing off after $count failed calls"
    if [ "$ON_ERROR" = ask ] && [ "$MODE" = enforce ]; then
      decide ask "Jev was unavailable a moment ago, so this call needs your OK."
    fi
    pass
  fi

  command -v curl >/dev/null 2>&1 || on_error "curl is missing"
  if [ ! -r "$KEY_FILE" ]; then
    log_line error jev "no key file"
    note_once key "no TypeSafe key at $KEY_FILE, so Jev checks are off. Hard rules still apply."
    pass
  fi
  local key
  key=$(tr -d '[:space:]' <"$KEY_FILE")
  if [ -z "$key" ]; then
    log_line error jev "empty key file"
    note_once key "the key file $KEY_FILE is empty, so Jev checks are off. Hard rules still apply."
    pass
  fi

  local request=""
  if [ "$USER_REQUEST" = 1 ] && [ -r "$TRANSCRIPT" ]; then
    request=$(tail -n 400 "$TRANSCRIPT" | jq -nrR '
      [inputs | fromjson? | select(.type == "user" and (.isMeta | not) and (.message.content | type) == "string")]
      | last | .message.content // ""' 2>/dev/null)
  fi

  # Facts code can check exactly go into the state, so Jev only judges the fuzzy part.
  # `git status` can run programs a repo's .git/config names (core.fsmonitor, filters), so it
  # only runs in the project the user opened. `rev-parse` runs none.
  local in_git=false dirty='"unknown"' top
  top=$(git -C "$CWD" rev-parse --show-toplevel 2>/dev/null)
  if [ -n "$top" ]; then
    in_git=true
    if [ -n "${CLAUDE_PROJECT_DIR:-}" ] && [ "$top" = "$(git -C "$CLAUDE_PROJECT_DIR" rev-parse --show-toplevel 2>/dev/null)" ]; then
      dirty=false
      [ -n "$(git -C "$CWD" status --porcelain --untracked-files=no 2>/dev/null | head -n 1)" ] && dirty=true
    fi
  fi

  BODY=$(mktemp "${TMPDIR:-/tmp}/jev-guard.XXXXXX") || on_error "no temp file"
  trap 'rm -f "$BODY"' EXIT
  jq --arg model "$MODEL" --arg home "$HOME" --arg project "$PROJECT" --arg request "$request" \
    --argjson in_git "$in_git" --argjson dirty "$dirty" --argjson user "$USER_CONF" \
    --slurpfile questions "$ROOT/config/questions.json" -f "$ROOT/scripts/build-request.jq" <<<"$INPUT" >"$BODY" ||
    on_error "could not build the request"

  # Everything shares one time budget. A connection that hasn't opened after CONNECT_S is dropped for
  # a fresh one: a lost connect packet otherwise costs a 1-2 s resend, while a new connection usually
  # opens in ~30 ms. A slow answer on an open connection is not retried; it can't fit the budget.
  # The key goes to curl on stdin, so it never shows up in `ps`.
  to_ms "$BUDGET_S"
  local budget=$MS left=$MS tries=0 stalled=0 out status secs connect resp
  while :; do
    tries=$((tries + 1))
    out=$(printf 'header = "Authorization: Bearer %s"\n' "$key" |
      curl -sS -K - --connect-timeout "$CONNECT_S" --max-time "$(to_s "$left")" \
        -H 'Content-Type: application/json' --data-binary @"$BODY" \
        -w '\n%{http_code} %{time_total} %{time_connect}' "$URL" 2>/dev/null)
    resp=${out%$'\n'*}
    read -r status secs connect <<<"${out##*$'\n'}"
    to_ms "${secs:-0}"
    left=$((left - MS))
    to_ms "${connect:-0}"
    [ "${status:-000}" = 000 ] && [ "$MS" = 0 ] || break
    stalled=$((stalled + 1))
    [ "$tries" -lt 3 ] && [ "$left" -gt 600 ] || break
  done
  secs=$(to_s $((budget - left)))

  case "$status" in
    200) ;;
    401 | 403)
      log_line error jev "HTTP $status"
      note_once key "TypeSafe rejected the key (HTTP $status), so Jev checks are off. Hard rules still apply."
      pass
      ;;
    000 | "")
      if [ "$stalled" = "$tries" ]; then
        on_error "no connection to TypeSafe in $tries tries" transient
      fi
      on_error "no answer within ${BUDGET_S}s" transient
      ;;
    429 | 5??) on_error "HTTP $status" transient ;;
    *) on_error "HTTP $status" ;;
  esac

  local verdict decision why
  verdict=$(jq -c --slurpfile policy "$ROOT/config/policy.json" --argjson user "$USER_CONF" \
    --slurpfile body "$BODY" --arg secs "$secs" -f "$ROOT/scripts/verdict.jq" <<<"$resp" 2>/dev/null) ||
    on_error "unreadable answer"
  [ -n "$verdict" ] || on_error "unreadable answer"
  rm -f "$FAILS_FILE"

  eval "$(jq -r '@sh "decision=\(.decision) why=\(.why)"' <<<"$verdict")"
  log_line "$decision" jev "$why" "$verdict"

  [ "$decision" = pass ] && pass
  # Shadow mode shows what would have happened, so thresholds can be tuned from real calls.
  if [ "$MODE" != enforce ]; then
    [ "$decision" = ask ] && decision=$ASK
    pass "jev-guard (shadow): would $decision this $TOOL call: $why."
  fi
  case "$decision" in
    deny) decide deny "Jev judged this call unsafe: $why. Find another way, or ask the user to run it themselves." ;;
    ask) decide ask "Jev flagged this call: $why." ;;
  esac
  pass
}

case "$TOOL" in
  Read | Grep)
    for p in "$T_PATH" "$T_DIR"; do
      [ -n "$p" ] || continue
      resolve "$p"
      secret_path "$R" && rule deny "$p looks like a live secret store. Use a template such as .env.example, or ask the user for the value you need."
    done
    case "$T_GLOB" in
      *.env.example* | *.env.sample* | *.env.template*) ;;
      *.env* | *id_rsa* | *id_ed25519* | *.pem*) rule deny "searching inside secret files ($T_GLOB) would print their values." ;;
    esac
    pass
    ;;
  Write | Edit | MultiEdit | NotebookEdit)
    [ -n "$T_PATH" ] || pass
    resolve "$T_PATH"
    [ "$R" = "$KEY_R" ] && rule deny "that file holds the jev-guard API key."
    secret_path "$R" && rule ask "writes to a secret file ($T_PATH)."
    control_path "$R" && rule ask "changes agent settings, the guard's config, git hooks or shell startup files ($T_PATH)."
    inside_workspace "$R" && pass
    ask_jev
    ;;
  Bash)
    bash_floor "$T_CMD"
    [ -n "$FLOOR" ] && rule deny "blocked: $FLOOR."
    case "$T_CMD" in *"$CONFIG"* | *jev-guard/config*) rule ask "touches the guard's own config ($CONFIG)." ;; esac
    bash_fast_pass "$T_CMD" && pass
    ask_jev
    ;;
  WebFetch | mcp__*)
    ask_jev
    ;;
esac
pass
