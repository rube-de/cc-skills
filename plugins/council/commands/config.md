---
allowed-tools: [Bash, Read, AskUserQuestion]
description: "Configure Council external consultant enablement based on available subscriptions (Gemini, Codex, GLM, Kimi)"
---

# /council:config — Council Consultant Configuration

Configure which external AI consultants are enabled for Council reviews and consultations based on your active subscriptions and installed CLIs.

## Usage

```text
/council:config                            # Interactive setup & detection wizard
/council:config show                       # Display current configuration & CLI status
/council:config enable <consultant>        # Enable a consultant (gemini, codex, glm, kimi)
/council:config disable <consultant>       # Disable a consultant
/council:config quick <consultant|auto>    # Set preferred quick mode external consultant
/council:config subagent backend <type>    # Set Claude subagent backend (native, omp, claude-cli)
/council:config subagent model <model>     # Set deep review model (opus, sonnet)
/council:config subagent enable <name>     # Enable subagent (claude-deep-review, claude-codebase-context, review-scorer)
/council:config subagent disable <name>    # Disable subagent
/council:config timeout <seconds>          # Set per-consultant timeout in seconds
/council:config detect                     # Probe installed CLIs & active subscriptions
/council:config init [--auto] [--force]    # Initialize configuration (.dev/council/config.json)
```

Add `--global` to any command to target `~/.config/council/config.json` instead of the project-local `.dev/council/config.json`.

## Configuration Precedence

1. **Project-local**: `.dev/council/config.json` (takes precedence; should be added to `.gitignore`)
2. **User-global**: `~/.config/council/config.json` (fallback across all projects)
3. **Default**: Gemini & Codex enabled, GLM & Kimi disabled

## Workflow

### 1. Parse Arguments

Resolve the config utility path:
```bash
if [ -n "$CLAUDE_PLUGIN_ROOT" ] && [ -f "$CLAUDE_PLUGIN_ROOT/scripts/council-config.sh" ]; then
  CONFIG_SCRIPT="$CLAUDE_PLUGIN_ROOT/scripts/council-config.sh"
elif [ -f "plugins/council/scripts/council-config.sh" ]; then
  CONFIG_SCRIPT="plugins/council/scripts/council-config.sh"
elif [ -n "$(git rev-parse --show-toplevel 2>/dev/null)" ] && [ -f "$(git rev-parse --show-toplevel)/plugins/council/scripts/council-config.sh" ]; then
  CONFIG_SCRIPT="$(git rev-parse --show-toplevel)/plugins/council/scripts/council-config.sh"
else
  echo "Error: council-config.sh not found. Ensure CLAUDE_PLUGIN_ROOT is set or run within the cc-skills repository." >&2
  exit 1
fi
```
Check if `$ARGUMENTS` contains the standalone flag token `--global` (not as part of another argument like `--globalfoo`). If present, pass `--global` as an explicit, separate flag argument to script commands (e.g. `show --global`).

Inspect `$ARGUMENTS`:

- If `$ARGUMENTS` contains `show` or `status`:
  Run:
  ```bash
  "$CONFIG_SCRIPT" show [flags]
  ```
  Present the formatted status table to the user.

- If `$ARGUMENTS` starts with `enable `:
  Extract the consultant name:
  ```bash
  "$CONFIG_SCRIPT" write <consultant> true [flags]
  ```
  Confirm to user that the consultant was enabled.

- If `$ARGUMENTS` starts with `disable `:
  Extract the consultant name:
  ```bash
  "$CONFIG_SCRIPT" write <consultant> false [flags]
  ```
  Confirm to user that the consultant was disabled.

- If `$ARGUMENTS` starts with `quick `:
  Extract the consultant name (or `auto`):
  ```bash
  "$CONFIG_SCRIPT" set-quick <consultant|auto> [flags]
  ```
  Confirm to user that the quick mode consultant was updated.

- If `$ARGUMENTS` starts with `timeout `:
  Extract the timeout value in seconds:
  ```bash
  "$CONFIG_SCRIPT" set-timeout <seconds> [flags]
  ```
  Confirm to user that the operational timeout was updated.
- If `$ARGUMENTS` starts with `subagent backend `:
  Extract the backend value (`native`, `omp`, `claude-cli`):
  ```bash
  "$CONFIG_SCRIPT" set-subagent-backend <type> [flags]
  ```
  Confirm to user that the subagent backend was updated.

- If `$ARGUMENTS` starts with `subagent model `:
  Extract the model value (`opus`, `sonnet`):
  ```bash
  "$CONFIG_SCRIPT" set-deep-model <model> [flags]
  ```
  Confirm to user that the deep review model was updated.

- If `$ARGUMENTS` starts with `subagent enable `:
  Extract the subagent name:
  ```bash
  "$CONFIG_SCRIPT" write-subagent <name> true [flags]
  ```
  Confirm to user that the subagent was enabled.

- If `$ARGUMENTS` starts with `subagent disable `:
  Extract the subagent name:
  ```bash
  "$CONFIG_SCRIPT" write-subagent <name> false [flags]
  ```
  Confirm to user that the subagent was disabled.

- If `$ARGUMENTS` contains `detect`:
  Run:
  ```bash
  "$CONFIG_SCRIPT" detect
  ```
  Present detection results and explain which subscriptions/CLIs were found.

- If `$ARGUMENTS` contains `init`:
  Extract any passed flags (`--auto`, `--force`, `--global`):
  ```bash
  "$CONFIG_SCRIPT" init [flags]
  ```
  Pass through `--auto` to auto-detect and configure available consultants, and/or `--force` to overwrite existing configuration. Pass `--global` if targeting global configuration.
  Confirm initialization path and configured consultants.
### 2. Interactive Wizard (Default when no subcommands given)

When invoked without subcommands (or during first-run setup):

**Scope Handling**:
- If `$ARGUMENTS` contains the standalone token `--global`: target global scope (pass `--global` explicitly to script commands) and skip Step 6.
- Otherwise: prompt user for scope in Step 6 (pass `--global` if user chooses global scope, or omit for project scope). Note that shell variables do not persist across separate tool calls, so pass `--global` explicitly as an argument on each command rather than relying on an environment variable.

1. **Run Capability Detection**:
   ```bash
   "$CONFIG_SCRIPT" detect --json
   ```

2. **Read Existing Config (or defaults)**:
   ```bash
   "$CONFIG_SCRIPT" read [--global]
   ```
   (Pass `--global` if global scope was specified in arguments.)

3. **Present Status**:
   Display detected capabilities and current enablement state to the user:
   - **Gemini 3.8 Flash**: omp CLI + Google Antigravity account / `GEMINI_API_KEY`
   - **Codex**: codex CLI + ChatGPT login (`codex login status`) / `OPENAI_API_KEY`
   - **GLM-5.3**: omp CLI + Z.AI account / `ZAI_API_KEY`
   - **Kimi K3**: omp CLI + Kimi Code account / `KIMI_API_KEY`

4. **Ask User for Consultant Selection**:
   Prompt user with `AskUserQuestion`:
   - "Which external consultants do you want to enable for Council reviews?"
   - Multi-select options showing detected recommendation (e.g. `Gemini 3.8 Flash (Recommended: Active)`, `Codex (Recommended: Active)`, `GLM-5.3`, `Kimi K3`).

5. **Ask Preferred Quick Mode Consultant**:
   Prompt user with `AskUserQuestion`:
   - "Which consultant should be used for quick triage reviews (/council quick)?"
   - Options: `auto (Recommended: First enabled)`, `gemini`, `codex`, `glm`, `kimi`

6. **Ask Scope Preference** (skipped if `--global` was already passed):
   - Save to current project (`.dev/council/config.json`)
   - Save globally (`~/.config/council/config.json`)

7. **Save Configuration**:
   Apply user choices using `council-config.sh write <consultant> <true|false>`:
   ```bash
   "$CONFIG_SCRIPT" write gemini <bool> [--global]
   "$CONFIG_SCRIPT" write codex <bool> [--global]
   "$CONFIG_SCRIPT" write glm <bool> [--global]
   "$CONFIG_SCRIPT" write kimi <bool> [--global]
   "$CONFIG_SCRIPT" set-quick <quick_choice> [--global]
   ```
   (Pass `--global` explicitly on each command if global scope was chosen.)

8. **Verify & Display Summary**:
   Run:
   ```bash
   "$CONFIG_SCRIPT" show [--global]
   ```
   Inform the user that `/council` will now dynamically dispatch only the enabled consultants.
