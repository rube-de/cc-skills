#!/bin/bash
# audit-hooks.sh — Scan plugin hook/script files for silent failure patterns
# Exit 0 = clean, Exit 1 = findings

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/../../.." && pwd)"
PLUGINS_DIR="$ROOT_DIR/plugins"

findings=0
checked=0

# Colors (disable if not a terminal)
if [ -t 1 ]; then
  RED='\033[0;31m'
  YELLOW='\033[0;33m'
  GREEN='\033[0;32m'
  NC='\033[0m'
else
  RED='' YELLOW='' GREEN='' NC=''
fi

log_finding() {
  local file="$1" line="$2" msg="$3"
  local rel_path="${file#"$ROOT_DIR/"}"
  printf "  ${RED}✗${NC} %s:%s — %s\n" "$rel_path" "$line" "$msg"
  findings=$((findings + 1))
}

echo "Auditing hook and script files..."

# --- Shell scripts ---
while IFS= read -r -d '' file; do
  checked=$((checked + 1))

  # Check if set -e is present (makes error handling implicit)
  has_set_e=false
  if grep -qE '^\s*set\s+-[a-zA-Z]*e' "$file"; then
    has_set_e=true
  fi

  if [ "$has_set_e" = false ]; then
    # Look for destructive commands without error handling
    while IFS=: read -r lineno line_content; do
      # Skip comments
      [[ "$line_content" =~ ^[[:space:]]*# ]] && continue
      # Skip lines that already have || or && error handling
      echo "$line_content" | grep -qE '\|\||&&' && continue
      # Skip lines inside if/while conditions
      [[ "$line_content" =~ ^[[:space:]]*(if|while|elif) ]] && continue

      log_finding "$file" "$lineno" "unguarded command without 'set -e': $(echo "$line_content" | sed 's/^[[:space:]]*//' | head -c 80)"
    done < <(grep -nE '\b(mkdir|cp|mv|rm)\b' "$file" || true)
  fi
done < <(find "$PLUGINS_DIR" -type f -name '*.sh' \( -path '*/hooks/*' -o -path '*/scripts/*' \) -print0 2>/dev/null)

# --- Python scripts ---
while IFS= read -r -d '' file; do
  checked=$((checked + 1))

  while IFS=: read -r lineno line_content; do
    log_finding "$file" "$lineno" "bare except with pass suppresses all errors"
  done < <(grep -nE '^\s*except(\s+Exception)?\s*:\s*pass\s*$' "$file" || true)
done < <(find "$PLUGINS_DIR" -type f -name '*.py' \( -path '*/hooks/*' -o -path '*/scripts/*' \) -print0 2>/dev/null)

# --- Optional: ShellCheck ---
echo ""
if command -v shellcheck >/dev/null 2>&1; then
  echo "Running ShellCheck..."
  sc_findings=0
  while IFS= read -r -d '' file; do
    if ! shellcheck -S warning "$file" >/dev/null 2>&1; then
      rel_path="${file#"$ROOT_DIR/"}"
      printf "  ${YELLOW}⚠${NC} %s has ShellCheck warnings (run: shellcheck %s)\n" "$rel_path" "$rel_path"
      sc_findings=$((sc_findings + 1))
    fi
  done < <(find "$PLUGINS_DIR" -type f -name '*.sh' \( -path '*/hooks/*' -o -path '*/scripts/*' \) -print0 2>/dev/null)

  if [ "$sc_findings" -eq 0 ]; then
    printf "  ${GREEN}✓${NC} ShellCheck: all scripts clean\n"
  fi
else
  printf "  ${YELLOW}ℹ${NC} ShellCheck not installed — skipping (install: brew install shellcheck)\n"
fi

# --- Summary ---
echo ""
echo "Scanned $checked files."
if [ "$findings" -eq 0 ]; then
  printf "${GREEN}✓ No silent failure patterns found.${NC}\n"
  exit 0
else
  printf "${RED}✗ Found %d finding(s).${NC}\n" "$findings"
  exit 1
fi
