---
name: dock-setup
description: "Add the Agent Dock's live helper count (\"◇ N agents\") to Claude Code's status line, globally or for this project only, or uninstall it again. Use when the user runs /dock-setup or /dock-setup uninstall, or asks to show the agent count, helper count or Agent Dock in the status line, or to remove or uninstall it."
argument-hint: "[uninstall]"
allowed-tools:
  - Bash
  - Read
  - Edit
  - Write
  - AskUserQuestion
user-invocable: true
---

# Agent Dock status line setup

While Agent Dock helpers run, the dock writes their live count to `<config>/agent-dock/agents-now/<session_id>.json`. `<config>` is `$CLAUDE_CONFIG_DIR`, or `~/.claude` when that is unset. This skill installs a small add-on, `<config>/agent-dock/statusline.sh`, and points a status line at it.

The add-on wraps the person's own status line instead of editing their script. `statusline.sh '<their command>'` runs their command and adds `◇ N agents` to the end of its first line while helpers work. With no status line of their own, `statusline.sh` alone shows just the segment. Every settings file the skill changes is listed in `<config>/agent-dock/installs`, so an uninstall finds them all, other projects included.

## Workflow

1. **Read the current setup.** Run:
   ```bash
   CONFIG="${CLAUDE_CONFIG_DIR:-$HOME/.claude}"
   echo "config folder: $CONFIG"
   ls -la "$CONFIG/settings.json" .claude/settings.json .claude/settings.local.json 2>&1
   ```
   Read each settings file that exists and note its `statusLine` block. A project's `.claude/settings.local.json` beats its `.claude/settings.json`, and both beat the global `$CONFIG/settings.json`: the status line in force is the first one that exists in that order.

2. **Ask where.** If `$ARGUMENTS` is `uninstall` or `remove`, skip the question: the choice is **Remove it**. Otherwise use AskUserQuestion with one question, "Where should the Agent Dock show its helper count?", and these options:
   - **Global status line (Recommended)**: every project, in `$CONFIG/settings.json`.
   - **This project only**: `.claude/settings.local.json` here, just for this person and never committed.
   - **Remove it**: uninstall it everywhere and put every status line back as it was.

   If the answer comes back empty, ask again. Never assume a choice.

3. **Work out the change.** The add-on's command is `~/.claude/agent-dock/statusline.sh` when `$CONFIG` is `$HOME/.claude`, otherwise `$CONFIG/agent-dock/statusline.sh` spelled out in full.
   - **Global**: the base is the global `statusLine.command`.
   - **This project only**: the base is the status line in force here (step 1's order), because a project's own status line replaces the global one rather than adding to it.
   - **Either install**: if the base already starts with the add-on's command, tell the person it is already set up and stop. With no base, the new command is the add-on's command alone. Otherwise it is the add-on's command, a space and the base in single quotes, with each `'` inside the base written as `'\''`.
   - **Either install**: the block also gets `"refreshInterval": 2`, unless it already has one of 2 or less. Claude Code otherwise redraws the status line only when the conversation changes, and the count would freeze while Claude waits for helpers.
   - **Remove**: the files to check are the global settings, this project's `.claude/settings.local.json`, and every path listed in `$CONFIG/agent-dock/installs` that still exists (`cat "$CONFIG/agent-dock/installs"`). In each one whose `statusLine.command` starts with the add-on's command, the base is its single-quoted argument with `'\''` turned back into `'`. With no argument, the add-on stood alone, so the change removes the whole `statusLine` block. Otherwise it restores the base and drops `refreshInterval` if it is 2, the value this skill sets. If no file has the add-on, the settings need no change; still run step 8 to clear the add-on's files.

4. **Confirm.** Show each file, its old `statusLine` block and the new one; for Remove, also list the files step 8 deletes. Ask with AskUserQuestion, "Change the status line like this?", options **Apply** and **Cancel**. On Cancel, stop and change nothing.

5. **Install the add-on.** Skip this step for Remove. Run:
   ```bash
   CONFIG="${CLAUDE_CONFIG_DIR:-$HOME/.claude}"
   mkdir -p "$CONFIG/agent-dock/agents-now"
   cp "${CLAUDE_SKILL_DIR}/scripts/statusline.sh" "$CONFIG/agent-dock/statusline.sh"
   chmod +x "$CONFIG/agent-dock/statusline.sh"
   ls -la "$CONFIG/agent-dock/statusline.sh"
   ```

6. **Write the settings.** Edit the settings file in place with the Edit tool. Set `statusLine` to the block from step 3: `{ "type": "command", "command": "<new command>", "refreshInterval": 2 }`, keeping any other keys it already had (`padding`, say). Never write the file through a temp file and `mv`: settings files are often symlinks into a dotfiles repo, and replacing one breaks the link. For **This project only** with no `.claude/settings.local.json` yet, create it holding just the `statusLine` block. Then run:
   ```bash
   FILE="<the settings file you changed>"
   if command -v jq >/dev/null 2>&1; then jq empty "$FILE" && echo "valid JSON"; else echo "jq not installed: read the file back to check it"; fi
   git check-ignore -q .claude/settings.local.json 2>/dev/null && echo "local settings are git-ignored"
   ```
   If you created `.claude/settings.local.json` and git does not ignore it, tell the person and offer to add it to `.gitignore`. For Remove, repeat the edit and the check for every file from step 3. For an install, record the file so a later uninstall finds it:
   ```bash
   CONFIG="${CLAUDE_CONFIG_DIR:-$HOME/.claude}"
   FILE="<the settings file you changed, as an absolute path>"
   touch "$CONFIG/agent-dock/installs"
   grep -qxF "$FILE" "$CONFIG/agent-dock/installs" || printf '%s\n' "$FILE" >> "$CONFIG/agent-dock/installs"
   ```

7. **Check it.** Skip this step for Remove. Run this, which reads the new command back from the settings file so its quotes stay intact:
   ```bash
   FILE="<the settings file you changed>"
   CONFIG="${CLAUDE_CONFIG_DIR:-$HOME/.claude}"
   CMD=$(jq -r '.statusLine.command' "$FILE")
   printf '{"working":3,"queued":0}' > "$CONFIG/agent-dock/agents-now/dock-setup-check.json"
   printf '{"session_id":"dock-setup-check"}' | sh -c "$CMD"
   rm -f "$CONFIG/agent-dock/agents-now/dock-setup-check.json"
   ```
   Without jq, write the command with the Write tool to `$CONFIG/agent-dock/check-command`, set `CMD=$(cat "$CONFIG/agent-dock/check-command")` instead, and delete that file afterwards.
   The first line of the output must end with `◇ 3 agents`. Their own status line may draw oddly from this test input; only the segment matters here.

8. **Clear the add-on's files.** Only for Remove. Run:
   ```bash
   CONFIG="${CLAUDE_CONFIG_DIR:-$HOME/.claude}"
   rm -f "$CONFIG/agent-dock/statusline.sh" "$CONFIG/agent-dock/installs" "$CONFIG/agent-dock/check-command"
   rmdir "$CONFIG/agent-dock/agents-now" "$CONFIG/agent-dock" 2>/dev/null
   ls -la "$CONFIG/agent-dock" 2>&1
   ```
   A folder that stays holds a count file of a session whose helpers are running right now; the dock deletes it when they finish. While the Clean View plugin stays installed, the dock still writes those files, and nothing reads them.

9. **Report.** Tell the person what changed and where. After an install, the count shows within a couple of seconds, and only while helpers work; to take it out again, they run `/clean-view:dock-setup uninstall`. After a Remove, every status line is back as it was.
