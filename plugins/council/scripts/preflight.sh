#!/bin/bash
# Council plugin pre-flight check — runs on SessionStart
# Verifies external CLI tools are available for enabled council consultants

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
CONFIG_UTIL="${SCRIPT_DIR}/council-config.sh"

if [ -x "$CONFIG_UTIL" ]; then
  if ! "$CONFIG_UTIL" exists; then
    echo "Council plugin: no config found. Run /council:config to set active consultants."
  fi
  # Check CLIs solely for enabled consultants
  "$CONFIG_UTIL" check-cli || true
else
  # Fallback if config utility unavailable
  missing=()
  for cli in codex omp; do
    command -v "$cli" >/dev/null 2>&1 || missing+=("$cli")
  done
  if [ ${#missing[@]} -gt 0 ]; then
    echo "Council plugin: missing CLIs: ${missing[*]}. Some consultants will be unavailable."
  fi
fi

exit 0
