#!/bin/bash
# council-config.sh — Manage Council consultant enablement and configuration
# Usage:
#   council-config.sh path [--global]
#   council-config.sh exists [--global]
#   council-config.sh read [--global]
#   council-config.sh write <consultant> <true|false> [--global]
#   council-config.sh detect [--json]
#   council-config.sh init [--auto] [--force] [--global]
#   council-config.sh show [--global]
#   council-config.sh check-cli
#   council-config.sh get-enabled [--global]
#   council-config.sh get-available [--global]
#   council-config.sh get-quick [--global]
#   council-config.sh set-quick <consultant|auto> [--global]
#   council-config.sh get-subagent-backend [--global]
#   council-config.sh set-subagent-backend <native|omp|claude-cli> [--global]
#   council-config.sh get-deep-model [--global]
#   council-config.sh set-deep-model <opus|sonnet> [--global]
#   council-config.sh get-enabled-subagents [--global]
#   council-config.sh write-subagent <subagent> <true|false> [--global]
#   council-config.sh get-timeout [--global]
#   council-config.sh set-timeout <seconds> [--global]
set -e

if ! command -v jq >/dev/null 2>&1; then
  if command -v jaq >/dev/null 2>&1; then
    jq() { jaq "$@"; }
  else
    echo "Error: 'jq' (or 'jaq') is required by council-config.sh but was not found in PATH." >&2
    exit 1
  fi
fi
DEFAULT_GLOBAL_PATH="${HOME}/.config/council/config.json"

get_repo_root() {
  if command -v git >/dev/null 2>&1; then
    git rev-parse --show-toplevel 2>/dev/null || pwd
  else
    pwd
  fi
}

get_project_path() {
  echo "$(get_repo_root)/.dev/council/config.json"
}

resolve_read_path() {
  target_global=false
  for arg in "$@"; do
    if [ "$arg" = "--global" ]; then
      target_global=true
      break
    fi
  done

  if [ "$target_global" = "true" ]; then
    echo "$DEFAULT_GLOBAL_PATH"
    return 0
  fi

  repo_root="$(get_repo_root)"
  proj_path="$(get_project_path)"
  proj_is_tracked=false

  if [ -f "$proj_path" ]; then
    # Security check (CWE-15): verify .dev/council/config.json is not tracked in git
    # Only local, untracked runtime configuration is honored from repository trees
    if command -v git >/dev/null 2>&1 && git -C "$repo_root" ls-files --error-unmatch -- .dev/council/config.json >/dev/null 2>&1; then
      proj_is_tracked=true
      echo "Security warning: .dev/council/config.json is tracked in git repository. Ignoring untrusted repo config." >&2
    else
      echo "$proj_path"
      return 0
    fi
  fi

  if [ -f "$DEFAULT_GLOBAL_PATH" ]; then
    echo "$DEFAULT_GLOBAL_PATH"
    return 0
  fi

  if [ "$proj_is_tracked" = "true" ]; then
    echo ""
    return 0
  fi

  echo "$proj_path"
}

resolve_write_path() {
  for arg in "$@"; do
    if [ "$arg" = "--global" ]; then
      echo "$DEFAULT_GLOBAL_PATH"
      return 0
    fi
  done

  repo_root="$(get_repo_root)"
  proj_path="$(get_project_path)"

  # Security check: refuse to write to a tracked repo file (checks git index regardless of working tree existence)
  if command -v git >/dev/null 2>&1 && git -C "$repo_root" ls-files --error-unmatch -- .dev/council/config.json >/dev/null 2>&1; then
    echo "Security error: $proj_path is tracked in git repository. Refusing to write to tracked repo file. Use --global or remove from git tracking." >&2
    exit 1
  fi

  echo "$proj_path"
}

resolve_config_path() {
  resolve_read_path "$@"
}

default_config() {
  cat <<'EOF'
{
  "version": 1,
  "consultants": {
    "gemini": {
      "enabled": true
    },
    "codex": {
      "enabled": true
    },
    "glm": {
      "enabled": false
    },
    "kimi": {
      "enabled": false
    }
  },
  "subagents": {
    "backend": "native",
    "deep_review_model": "opus",
    "claude-deep-review": {
      "enabled": true
    },
    "claude-codebase-context": {
      "enabled": true
    },
    "review-scorer": {
      "enabled": true
    }
  },
  "settings": {
    "timeout_seconds": 120,
    "quick_consultant": "auto"
  }
}
EOF
}

cmd_path() {
  resolve_read_path "$@"
}

cmd_exists() {
  cfg="$(resolve_read_path "$@")"
  if [ -n "$cfg" ] && [ -f "$cfg" ]; then
    exit 0
  else
    exit 1
  fi
}

cmd_read() {
  cfg="$(resolve_read_path "$@")"
  if [ -n "$cfg" ] && [ -f "$cfg" ]; then
    def_tmp="$(mktemp "${TMPDIR:-/tmp}/council-def.XXXXXX")"
    default_config > "$def_tmp"
    merged="$(jq -n --slurpfile def "$def_tmp" --slurpfile custom "$cfg" '$def[0] * ($custom[0] // {})')"
    rm -f "$def_tmp"
    echo "$merged"
  else
    default_config
  fi
}

cmd_write() {
  consultant="$1"
  state="$2"
  shift 2 || true

  case "$consultant" in
    gemini|codex|glm|kimi) ;;
    *)
      echo "Error: Unknown consultant '$consultant'. Valid: gemini, codex, glm, kimi" >&2
      exit 1
      ;;
  esac

  case "$state" in
    true|on|enable|enabled) bool_val="true" ;;
    false|off|disable|disabled) bool_val="false" ;;
    *)
      echo "Error: Invalid state '$state'. Valid: true, false, on, off, enable, disable" >&2
      exit 1
      ;;
  esac

  cfg="$(resolve_write_path "$@")"
  cfg_dir="$(dirname "$cfg")"
  mkdir -p "$cfg_dir"

  current="$(cmd_read "$@")"
  tmp_file="$(mktemp "${cfg_dir}/.config.tmp.XXXXXX")"
  echo "$current" | jq --arg c "$consultant" --argjson v "$bool_val" \
    '.consultants[$c].enabled = $v' > "$tmp_file"
  mv "$tmp_file" "$cfg"

  echo "Updated $consultant enabled=$bool_val in $cfg"
}

cmd_detect() {
  json_mode=false
  if [ "$1" = "--json" ]; then
    json_mode=true
  fi

  # Check codex CLI and auth
  has_codex_cli=false
  has_codex_auth=false
  if command -v codex >/dev/null 2>&1; then
    has_codex_cli=true
    if [ -n "$OPENAI_API_KEY" ]; then
      has_codex_auth=true
    elif codex login status 2>&1 | grep -qi "Logged in" && ! codex login status 2>&1 | grep -qi "Not logged in"; then
      has_codex_auth=true
    fi
  fi

  # Check omp CLI and providers
  has_omp_cli=false
  omp_usage=""
  if command -v omp >/dev/null 2>&1; then
    has_omp_cli=true
    omp_usage="$(omp usage 2>/dev/null || true)"
  fi

  # Check gemini
  has_gemini_cli="$has_omp_cli"
  has_gemini_auth=false
  if [ "$has_omp_cli" = "true" ]; then
    if [ -n "$GEMINI_API_KEY" ]; then
      has_gemini_auth=true
    elif echo "$omp_usage" | grep -qi "Google Antigravity"; then
      has_gemini_auth=true
    fi
  fi

  # Check glm
  has_glm_cli="$has_omp_cli"
  has_glm_auth=false
  if [ "$has_omp_cli" = "true" ]; then
    if [ -n "$ZAI_API_KEY" ]; then
      has_glm_auth=true
    elif echo "$omp_usage" | grep -Eiq "Zai|Z\.AI"; then
      has_glm_auth=true
    fi
  fi

  # Check kimi
  has_kimi_cli="$has_omp_cli"
  has_kimi_auth=false
  if [ "$has_omp_cli" = "true" ]; then
    if [ -n "$KIMI_API_KEY" ]; then
      has_kimi_auth=true
    elif echo "$omp_usage" | grep -qi "Kimi Code"; then
      has_kimi_auth=true
    fi
  fi

  if [ "$json_mode" = "true" ]; then
    jq -n \
      --argjson codex_cli "$has_codex_cli" --argjson codex_auth "$has_codex_auth" \
      --argjson gemini_cli "$has_gemini_cli" --argjson gemini_auth "$has_gemini_auth" \
      --argjson glm_cli "$has_glm_cli" --argjson glm_auth "$has_glm_auth" \
      --argjson kimi_cli "$has_kimi_cli" --argjson kimi_auth "$has_kimi_auth" \
      '{
        gemini: { cli: $gemini_cli, auth: $gemini_auth, recommended: ($gemini_cli and $gemini_auth) },
        codex:  { cli: $codex_cli,  auth: $codex_auth,  recommended: ($codex_cli and $codex_auth) },
        glm:    { cli: $glm_cli,    auth: $glm_auth,    recommended: ($glm_cli and $glm_auth) },
        kimi:   { cli: $kimi_cli,   auth: $kimi_auth,   recommended: ($kimi_cli and $kimi_auth) }
      }'
  else
    echo "Detected Consultant Capabilities:"
    printf "  %-8s | CLI: %-5s | Auth: %-5s | Recommended: %s\n" \
      "gemini" "$([ "$has_gemini_cli" = "true" ] && echo "yes" || echo "no")" \
      "$([ "$has_gemini_auth" = "true" ] && echo "yes" || echo "no")" \
      "$([ "$has_gemini_cli" = "true" ] && [ "$has_gemini_auth" = "true" ] && echo "YES" || echo "no")"
    printf "  %-8s | CLI: %-5s | Auth: %-5s | Recommended: %s\n" \
      "codex" "$([ "$has_codex_cli" = "true" ] && echo "yes" || echo "no")" \
      "$([ "$has_codex_auth" = "true" ] && echo "yes" || echo "no")" \
      "$([ "$has_codex_cli" = "true" ] && [ "$has_codex_auth" = "true" ] && echo "YES" || echo "no")"
    printf "  %-8s | CLI: %-5s | Auth: %-5s | Recommended: %s\n" \
      "glm" "$([ "$has_glm_cli" = "true" ] && echo "yes" || echo "no")" \
      "$([ "$has_glm_auth" = "true" ] && echo "yes" || echo "no")" \
      "$([ "$has_glm_cli" = "true" ] && [ "$has_glm_auth" = "true" ] && echo "YES" || echo "no")"
    printf "  %-8s | CLI: %-5s | Auth: %-5s | Recommended: %s\n" \
      "kimi" "$([ "$has_kimi_cli" = "true" ] && echo "yes" || echo "no")" \
      "$([ "$has_kimi_auth" = "true" ] && echo "yes" || echo "no")" \
      "$([ "$has_kimi_cli" = "true" ] && [ "$has_kimi_auth" = "true" ] && echo "YES" || echo "no")"
  fi
}

cmd_init() {
  auto_mode=false
  force_mode=false
  for arg in "$@"; do
    case "$arg" in
      --auto) auto_mode=true ;;
      --force) force_mode=true ;;
    esac
  done

  cfg="$(resolve_write_path "$@")"
  cfg_dir="$(dirname "$cfg")"
  mkdir -p "$cfg_dir"

  if [ -f "$cfg" ] && [ "$force_mode" = "false" ]; then
    echo "Configuration already exists at $cfg (use --force to overwrite)"
    return 0
  fi

  if [ "$auto_mode" = "true" ]; then
    detected="$(cmd_detect --json)"
    gemini_rec="$(echo "$detected" | jq -r '.gemini.recommended')"
    codex_rec="$(echo "$detected" | jq -r '.codex.recommended')"
    glm_rec="$(echo "$detected" | jq -r '.glm.recommended')"
    kimi_rec="$(echo "$detected" | jq -r '.kimi.recommended')"

    # If none recommended, fallback to gemini & codex default
    if [ "$gemini_rec" = "false" ] && [ "$codex_rec" = "false" ] && [ "$glm_rec" = "false" ] && [ "$kimi_rec" = "false" ]; then
      gemini_rec="true"
      codex_rec="true"
    fi

    tmp_file="$(mktemp "${cfg_dir}/.config.tmp.XXXXXX")"
    default_config | jq \
      --argjson g "$gemini_rec" \
      --argjson c "$codex_rec" \
      --argjson gl "$glm_rec" \
      --argjson k "$kimi_rec" \
      '.consultants.gemini.enabled = $g |
       .consultants.codex.enabled = $c |
       .consultants.glm.enabled = $gl |
       .consultants.kimi.enabled = $k' > "$tmp_file"
    mv "$tmp_file" "$cfg"
    echo "Initialized configuration with auto-detected consultants at $cfg"
  else
    default_config > "$cfg"
    echo "Initialized default configuration at $cfg"
  fi
}

cmd_show() {
  cfg="$(resolve_read_path "$@")"
  data="$(cmd_read "$@")"

  echo "Council Consultant Configuration"
  echo "Active config: $cfg"
  if [ -f "$cfg" ]; then
    echo "Status: Saved on disk"
  else
    echo "Status: Unsaved defaults (run 'council-config.sh init' to save)"
  fi
  echo ""

  for c in gemini codex glm kimi; do
    en="$(echo "$data" | jq -r ".consultants.${c}.enabled // false")"
    cli_type="omp"
    model_info=""
    case "$c" in
      gemini)
        model_info="google-antigravity/gemini-3.8-flash"
        ;;
      codex)
        cli_type="codex"
        model_info="codex CLI"
        ;;
      glm)
        model_info="zai/glm-5.3:max"
        ;;
      kimi)
        model_info="kimi-code/k3"
        ;;
    esac

    if [ "$en" = "true" ]; then
      status_tag="[ENABLED] "
    else
      status_tag="[DISABLED]"
    fi
    printf "  %-8s %s (via %s: %s)\n" "$c" "$status_tag" "$cli_type" "$model_info"
  done

  quick_cfg="$(echo "$data" | jq -r '.settings.quick_consultant // "auto"')"
  quick_resolved="$(cmd_get_quick "$@")"
  echo ""
  echo "Quick Mode Consultant: $quick_resolved (setting: $quick_cfg)"

  sub_backend="$(cmd_get_subagent_backend "$@")"
  deep_mod="$(cmd_get_deep_model "$@")"
  echo ""
  echo "Claude Subagent Configuration:"
  echo "  Backend:           $sub_backend (options: native, omp, claude-cli)"
  echo "  Deep Review Model: $deep_mod (options: opus, sonnet)"
  for s in claude-deep-review claude-codebase-context review-scorer; do
    en="$(echo "$data" | jq -r --arg s "$s" '((.subagents // {})[$s] // {}).enabled as $v | if $v != null then $v else true end')"
    if [ "$en" = "true" ]; then
      status_tag="[ENABLED] "
    else
      status_tag="[DISABLED]"
    fi
    role_desc=""
    case "$s" in
      claude-deep-review) role_desc="Layer 2: security, bugs, performance" ;;
      claude-codebase-context) role_desc="Layer 2: quality, compliance, docs" ;;
      review-scorer) role_desc="Layer 3: confidence scoring" ;;
    esac
    printf "  %-24s %s (%s)\n" "$s" "$status_tag" "$role_desc"
  done

  timeout="$(cmd_get_timeout "$@")"
  echo ""
  echo "Operational Settings:"
  echo "  Timeout:                 ${timeout}s"
}

cmd_get_enabled() {
  data="$(cmd_read "$@")"
  echo "$data" | jq -r '
    .consultants
    | to_entries
    | map(select(.value.enabled == true) | .key)
    | join(" ")
  '
}

cmd_get_available() {
  detected="$(cmd_detect --json)"
  data="$(cmd_read "$@")"
  available=()
  for c in gemini codex glm kimi; do
    en="$(echo "$data" | jq -r ".consultants.${c}.enabled // false")"
    rec="$(echo "$detected" | jq -r ".${c}.recommended // false")"
    if [ "$en" = "true" ] && [ "$rec" = "true" ]; then
      available+=("$c")
    fi
  done
  echo "${available[*]}"
}
cmd_set_quick() {
  val="$1"
  shift || true

  case "$val" in
    auto|gemini|codex|glm|kimi) ;;
    *)
      echo "Error: Unknown quick consultant '$val'. Valid: auto, gemini, codex, glm, kimi" >&2
      exit 1
      ;;
  esac

  cfg="$(resolve_write_path "$@")"
  cfg_dir="$(dirname "$cfg")"
  mkdir -p "$cfg_dir"

  current="$(cmd_read "$@")"
  tmp_file="$(mktemp "${cfg_dir}/.config.tmp.XXXXXX")"
  echo "$current" | jq --arg q "$val" '.settings.quick_consultant = $q' > "$tmp_file"
  mv "$tmp_file" "$cfg"

  echo "Updated quick_consultant=$val in $cfg"
}

cmd_get_quick() {
  data="$(cmd_read "$@")"
  detected="$(cmd_detect --json)"
  configured="$(echo "$data" | jq -r '.settings.quick_consultant // "auto"')"

  # Check if explicitly configured consultant is enabled and recommended (CLI + auth)
  if [ "$configured" != "auto" ] && [ -n "$configured" ]; then
    en="$(echo "$data" | jq -r ".consultants.${configured}.enabled // false")"
    rec="$(echo "$detected" | jq -r ".${configured}.recommended // false")"
    if [ "$en" = "true" ] && [ "$rec" = "true" ]; then
      echo "$configured"
      return 0
    fi
  fi

  # Auto resolution: iterate enabled consultants in priority order, checking recommended
  for c in gemini codex glm kimi; do
    en="$(echo "$data" | jq -r ".consultants.${c}.enabled // false")"
    rec="$(echo "$detected" | jq -r ".${c}.recommended // false")"
    if [ "$en" = "true" ] && [ "$rec" = "true" ]; then
      echo "$c"
      return 0
    fi
  done

  echo "none"
  return 0
}
cmd_set_subagent_backend() {
  val="$1"
  shift || true

  case "$val" in
    native|omp|claude-cli) ;;
    *)
      echo "Error: Unknown subagent backend '$val'. Valid: native, omp, claude-cli" >&2
      exit 1
      ;;
  esac

  cfg="$(resolve_write_path "$@")"
  cfg_dir="$(dirname "$cfg")"
  mkdir -p "$cfg_dir"

  current="$(cmd_read "$@")"
  tmp_file="$(mktemp "${cfg_dir}/.config.tmp.XXXXXX")"
  echo "$current" | jq --arg b "$val" '.subagents.backend = $b' > "$tmp_file"
  mv "$tmp_file" "$cfg"

  echo "Updated subagents.backend=$val in $cfg"
}

cmd_get_subagent_backend() {
  data="$(cmd_read "$@")"
  echo "$data" | jq -r '.subagents.backend // "native"'
}

cmd_set_deep_model() {
  val="$1"
  shift || true

  case "$val" in
    opus|sonnet) ;;
    *)
      echo "Error: Unknown deep review model '$val'. Valid: opus, sonnet" >&2
      exit 1
      ;;
  esac

  cfg="$(resolve_write_path "$@")"
  cfg_dir="$(dirname "$cfg")"
  mkdir -p "$cfg_dir"

  current="$(cmd_read "$@")"
  tmp_file="$(mktemp "${cfg_dir}/.config.tmp.XXXXXX")"
  echo "$current" | jq --arg m "$val" '.subagents.deep_review_model = $m' > "$tmp_file"
  mv "$tmp_file" "$cfg"

  echo "Updated subagents.deep_review_model=$val in $cfg"
}

cmd_get_deep_model() {
  data="$(cmd_read "$@")"
  echo "$data" | jq -r '.subagents.deep_review_model // "opus"'
}

cmd_write_subagent() {
  agent="$1"
  state="$2"
  shift 2 || true

  case "$agent" in
    claude-deep-review|claude-codebase-context|review-scorer) ;;
    *)
      echo "Error: Unknown subagent '$agent'. Valid: claude-deep-review, claude-codebase-context, review-scorer" >&2
      exit 1
      ;;
  esac

  case "$state" in
    true|on|enable|enabled) bool_val="true" ;;
    false|off|disable|disabled) bool_val="false" ;;
    *)
      echo "Error: Invalid state '$state'. Valid: true, false, on, off, enable, disable" >&2
      exit 1
      ;;
  esac

  cfg="$(resolve_write_path "$@")"
  cfg_dir="$(dirname "$cfg")"
  mkdir -p "$cfg_dir"

  current="$(cmd_read "$@")"
  tmp_file="$(mktemp "${cfg_dir}/.config.tmp.XXXXXX")"
  echo "$current" | jq --arg a "$agent" --argjson v "$bool_val" \
    '.subagents[$a].enabled = $v' > "$tmp_file"
  mv "$tmp_file" "$cfg"

  echo "Updated subagent $agent enabled=$bool_val in $cfg"
}

cmd_get_enabled_subagents() {
  data="$(cmd_read "$@")"
  echo "$data" | jq -r '
    .subagents // {}
    | to_entries
    | map(select(.key != "backend" and .key != "deep_review_model" and .value.enabled == true) | .key)
    | join(" ")
  '
}

cmd_get_timeout() {
  data="$(cmd_read "$@")"
  echo "$data" | jq -r '.settings.timeout_seconds // 120'
}

cmd_set_timeout() {
  val="$1"
  shift || true
  case "$val" in
    ''|*[!0-9]*)
      echo "Error: timeout must be a positive integer" >&2
      exit 1
      ;;
  esac
  cfg="$(resolve_write_path "$@")"
  cfg_dir="$(dirname "$cfg")"
  mkdir -p "$cfg_dir"
  current="$(cmd_read "$@")"
  tmp_file="$(mktemp "${cfg_dir}/.config.tmp.XXXXXX")"
  echo "$current" | jq --argjson t "$val" '.settings.timeout_seconds = $t' > "$tmp_file"
  mv "$tmp_file" "$cfg"
  echo "Updated timeout_seconds=$val in $cfg"
}

cmd_check_cli() {
  enabled_consultants="$(cmd_get_enabled "$@")"

  need_codex=false
  need_omp=false

  for c in $enabled_consultants; do
    case "$c" in
      codex) need_codex=true ;;
      gemini|glm|kimi) need_omp=true ;;
    esac
  done

  missing=()
  if [ "$need_codex" = "true" ]; then
    command -v codex >/dev/null 2>&1 || missing+=("codex")
  fi
  if [ "$need_omp" = "true" ]; then
    command -v omp >/dev/null 2>&1 || missing+=("omp")
  fi

  enabled_subagents="$(cmd_get_enabled_subagents "$@")"
  if [ -n "$enabled_subagents" ]; then
    sub_backend="$(cmd_get_subagent_backend "$@")"
    if [ "$sub_backend" = "omp" ]; then
      command -v omp >/dev/null 2>&1 || missing+=("omp (subagent backend)")
    elif [ "$sub_backend" = "claude-cli" ]; then
      command -v claude >/dev/null 2>&1 || missing+=("claude CLI (subagent backend)")
    fi
  fi

  if [ ${#missing[@]} -gt 0 ]; then
    echo "Council plugin: missing required CLIs: ${missing[*]}"
    return 1
  fi
  return 0
}

case "$1" in
  path)
    shift
    cmd_path "$@"
    ;;
  exists)
    shift
    cmd_exists "$@"
    ;;
  read)
    shift
    cmd_read "$@"
    ;;
  write)
    shift
    cmd_write "$@"
    ;;
  detect)
    shift
    cmd_detect "$@"
    ;;
  init)
    shift
    cmd_init "$@"
    ;;
  show)
    shift
    cmd_show "$@"
    ;;
  check-cli)
    shift
    cmd_check_cli "$@"
    ;;
  get-enabled)
    shift
    cmd_get_enabled "$@"
    ;;
  set-quick)
    shift
    cmd_set_quick "$@"
    ;;
  get-quick)
    shift
    cmd_get_quick "$@"
    ;;
  get-available)
    shift
    cmd_get_available "$@"
    ;;
  set-subagent-backend)
    shift
    cmd_set_subagent_backend "$@"
    ;;
  get-subagent-backend)
    shift
    cmd_get_subagent_backend "$@"
    ;;
  set-deep-model)
    shift
    cmd_set_deep_model "$@"
    ;;
  get-deep-model)
    shift
    cmd_get_deep_model "$@"
    ;;
  write-subagent)
    shift
    cmd_write_subagent "$@"
    ;;
  get-enabled-subagents)
    shift
    cmd_get_enabled_subagents "$@"
    ;;
  get-timeout)
    shift
    cmd_get_timeout "$@"
    ;;
  set-timeout)
    shift
    cmd_set_timeout "$@"
    ;;
  *)
    echo "Usage: $0 {path|exists|read|write|detect|init|show|check-cli|get-enabled|get-available|get-quick|set-quick|get-subagent-backend|set-subagent-backend|get-deep-model|set-deep-model|get-enabled-subagents|write-subagent|get-timeout|set-timeout} [args...]" >&2
    exit 1
    ;;
esac
