---
allowed-tools: [Bash, Read, Write, Edit, AskUserQuestion]
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

Resolve the config utility path with a fallback when `CLAUDE_PLUGIN_ROOT` is unset:
```bash
CONFIG_SCRIPT="${CLAUDE_PLUGIN_ROOT:-plugins/council}/scripts/council-config.sh"
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
  Run:
  ```bash
  "$CONFIG_SCRIPT" init [flags]
  ```
  Confirm initialization path.

### 2. Interactive Wizard (Default when no subcommands given)

When invoked without subcommands (or during first-run setup):

**Scope Handling**:
- If `$ARGUMENTS` contains the standalone token `--global`: set `SCOPE_FLAG="--global"` and skip Step 6.
- Otherwise: prompt user for scope in Step 6 (set `SCOPE_FLAG="--global"` if user chooses global scope, or leave empty for project scope).

1. **Run Capability Detection**:
   ```bash
   "$CONFIG_SCRIPT" detect --json
   ```

2. **Read Existing Config (or defaults)**:
   ```bash
   "$CONFIG_SCRIPT" read $SCOPE_FLAG
   ```

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
   "$CONFIG_SCRIPT" write gemini <bool> $SCOPE_FLAG
   "$CONFIG_SCRIPT" write codex <bool> $SCOPE_FLAG
   "$CONFIG_SCRIPT" write glm <bool> $SCOPE_FLAG
   "$CONFIG_SCRIPT" write kimi <bool> $SCOPE_FLAG
   "$CONFIG_SCRIPT" set-quick <quick_choice> $SCOPE_FLAG
   ```

8. **Verify & Display Summary**:
   Run:
   ```bash
   "$CONFIG_SCRIPT" show $SCOPE_FLAG
   ```
   Inform the user that `/council` will now dynamically dispatch only the enabled consultants.
