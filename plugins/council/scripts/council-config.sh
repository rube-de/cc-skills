#!/bin/bash
# council-config.sh — Manage Council consultant enablement and configuration
# Usage:
#   council-config.sh path [--global]
#   council-config.sh exists [--global]
#   council-config.sh read [--global]
#   council-config.sh write <consultant> <true|false> [--global]
#   council-config.sh detect [--json]
#   council-config.sh init [--auto] [--global]
#   council-config.sh show
#   council-config.sh check-cli
#   council-config.sh get-enabled

set -e

DEFAULT_GLOBAL_PATH="${HOME}/.config/council/config.json"

get_repo_root() {
  git rev-parse --show-toplevel 2>/dev/null || pwd
}

get_project_path() {
  echo "$(get_repo_root)/.dev/council/config.json"
}

resolve_config_path() {
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

  proj_path="$(get_project_path)"
  if [ -f "$proj_path" ]; then
    echo "$proj_path"
    return 0
  fi

  if [ -f "$DEFAULT_GLOBAL_PATH" ]; then
    echo "$DEFAULT_GLOBAL_PATH"
    return 0
  fi

  echo "$proj_path"
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
  "settings": {
    "timeout_seconds": 120
  }
}
EOF
}

cmd_path() {
  resolve_config_path "$@"
}

cmd_exists() {
  cfg="$(resolve_config_path "$@")"
  if [ -f "$cfg" ]; then
    exit 0
  else
    exit 1
  fi
}

cmd_read() {
  cfg="$(resolve_config_path "$@")"
  if [ -f "$cfg" ]; then
    cat "$cfg"
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

  cfg="$(resolve_config_path "$@")"
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
    elif codex login status 2>&1 | grep -qi "Logged in"; then
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
    elif echo "$omp_usage" | grep -qi "Zai"; then
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
  target_global=false
  for arg in "$@"; do
    if [ "$arg" = "--auto" ]; then
      auto_mode=true
    elif [ "$arg" = "--global" ]; then
      target_global=true
    fi
  done

  cfg="$(resolve_config_path "$@")"
  cfg_dir="$(dirname "$cfg")"
  mkdir -p "$cfg_dir"

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
    if [ ! -f "$cfg" ]; then
      default_config > "$cfg"
      echo "Initialized default configuration at $cfg"
    else
      echo "Configuration already exists at $cfg"
    fi
  fi
}

cmd_show() {
  cfg="$(resolve_config_path "$@")"
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

cmd_check_cli() {
  data="$(cmd_read "$@")"
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

  if [ ${#missing[@]} -gt 0 ]; then
    echo "Council plugin: missing CLIs for enabled consultants (${enabled_consultants}): ${missing[*]}"
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
  *)
    echo "Usage: $0 {path|exists|read|write|detect|init|show|check-cli|get-enabled} [args...]" >&2
    exit 1
    ;;
esac
