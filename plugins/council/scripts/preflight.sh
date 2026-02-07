#!/bin/bash
# Council plugin pre-flight check — runs on SessionStart
# Verifies external CLI tools are available for council consultants

missing=()
for cli in gemini codex qwen opencode; do
  command -v "$cli" >/dev/null 2>&1 || missing+=("$cli")
done

if [ ${#missing[@]} -gt 0 ]; then
  echo "Council plugin: missing CLIs: ${missing[*]}. Some consultants will be unavailable."
fi
