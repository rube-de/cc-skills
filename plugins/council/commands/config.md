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
/council:config detect                     # Probe installed CLIs & active subscriptions
/council:config init [--auto]              # Initialize configuration (.dev/council/config.json)
```

Add `--global` to any command to target `~/.config/council/config.json` instead of the project-local `.dev/council/config.json`.

## Configuration Precedence

1. **Project-local**: `.dev/council/config.json` (takes precedence; committed to gitignore)
2. **User-global**: `~/.config/council/config.json` (fallback across all projects)
3. **Default**: Gemini & Codex enabled, GLM & Kimi disabled

## Workflow

### 1. Parse Arguments

Inspect `$ARGUMENTS`:

- If `$ARGUMENTS` contains `show` or `status`:
  Run:
  ```bash
  "${CLAUDE_PLUGIN_ROOT}/scripts/council-config.sh" show "$ARGUMENTS"
  ```
  Present the formatted status table to the user.

- If `$ARGUMENTS` starts with `enable `:
  Extract the consultant name and optional flags:
  ```bash
  "${CLAUDE_PLUGIN_ROOT}/scripts/council-config.sh" write <consultant> true [flags]
  ```
  Confirm to user that the consultant was enabled.

- If `$ARGUMENTS` starts with `disable `:
  Extract the consultant name and optional flags:
  ```bash
  "${CLAUDE_PLUGIN_ROOT}/scripts/council-config.sh" write <consultant> false [flags]
  ```
  Confirm to user that the consultant was disabled.

- If `$ARGUMENTS` starts with `quick `:
  Extract the consultant name (or `auto`) and optional flags:
  ```bash
  "${CLAUDE_PLUGIN_ROOT}/scripts/council-config.sh" set-quick <consultant|auto> [flags]
  ```
  Confirm to user that the quick mode consultant was updated.
- If `$ARGUMENTS` contains `detect`:
  Run:
  ```bash
  "${CLAUDE_PLUGIN_ROOT}/scripts/council-config.sh" detect
  ```
  Present detection results and explain which subscriptions/CLIs were found.

- If `$ARGUMENTS` contains `init`:
  Run:
  ```bash
  "${CLAUDE_PLUGIN_ROOT}/scripts/council-config.sh" init [flags]
  ```
  Confirm initialization path.

### 2. Interactive Wizard (Default when no subcommands given)

When invoked without subcommands (or during first-run setup):

1. **Run Capability Detection**:
   ```bash
   "${CLAUDE_PLUGIN_ROOT}/scripts/council-config.sh" detect --json
   ```

2. **Read Existing Config (or defaults)**:
   ```bash
   "${CLAUDE_PLUGIN_ROOT}/scripts/council-config.sh" read
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

6. **Ask Scope Preference**:
   - Save to current project (`.dev/council/config.json`)
   - Save globally (`~/.config/council/config.json`)

7. **Save Configuration**:
   Apply user choices using `council-config.sh write <consultant> <true|false>`:
   ```bash
   "${CLAUDE_PLUGIN_ROOT}/scripts/council-config.sh" write gemini <bool> [flags]
   "${CLAUDE_PLUGIN_ROOT}/scripts/council-config.sh" write codex <bool> [flags]
   "${CLAUDE_PLUGIN_ROOT}/scripts/council-config.sh" write glm <bool> [flags]
   "${CLAUDE_PLUGIN_ROOT}/scripts/council-config.sh" write kimi <bool> [flags]
   "${CLAUDE_PLUGIN_ROOT}/scripts/council-config.sh" set-quick <quick_choice> [flags]
   ```

8. **Verify & Display Summary**:
   Run:
   ```bash
   "${CLAUDE_PLUGIN_ROOT}/scripts/council-config.sh" show
   ```
   Inform the user that `/council` will now dynamically dispatch only the enabled consultants.
