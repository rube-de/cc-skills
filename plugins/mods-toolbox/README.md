# Mods Toolbox

Function-hook mods that change how Claude Code looks while it works:

- **[Clean View](#clean-view)**: one calm checklist above the prompt instead of tool calls, diffs and command output.
- **[Agent Dock](#agent-dock)**: every request split across a team of parallel helpers you pick, each shown as a live card.
- **[Toolbox](#toolbox)**: one popup above the prompt for both mods' settings, opened from **◆ Toolbox ▾** in the prompt footer.

They ship together because the dock's helpers report through Clean View's `report_progress` tool.

## Requirements

Claude Code **2.1.291 or newer**. Mods use the function-hook plugin API, which is early access, so a later Claude Code release may change it.

## Install

```bash
claude plugin marketplace add rube-de/cc-skills
claude plugin install mods-toolbox@rube-cc-skills
```

Or at the prompt: `/plugin install mods-toolbox --marketplace rube-de/cc-skills`.

**Coming from `clean-view`:** this plugin used to be called `clean-view`. Run `claude plugin uninstall clean-view@rube-cc-skills` before installing it, or both copies register `/simple`, `/dock` and the tools twice. Clean View on/off, Team Size and helper model start back at their defaults.

## Clean View

A calm, friendly Claude Code for people who aren't technical. While Claude works, tool calls, file diffs and command output are hidden, and one checklist above the prompt shows the plan, what's happening now and how far along it is.

```
Build my landing page · 1m 12s
✓ Read your brand notes            ██████████  Done
▶ Build the pricing section        ██████░░░░  60%
○ Add the contact form             ░░░░░░░░░░  Next
○ Polish the footer                ░░░░░░░░░░  Up next
```

Claude's written replies stay visible. Permission prompts and questions stay visible too, and switch the header to **Needs you**.

### Turn it on and off

Clean View starts on. Use the **Clean View** switch in the [Toolbox](#toolbox), or type:

| Command | Effect |
|---------|--------|
| `/simple` | Flip it |
| `/simple on` | Turn it on |
| `/simple off` | Turn it off: every hidden row comes back |

Both work while Claude is busy, and the choice is remembered after a restart.

### What it changes

| Area | Behaviour |
|------|-----------|
| Plan first | Claude is asked to lay out 2 to 8 plain-English steps (`plan_steps`) before anything else, and other tools are refused until it has. A to-do list (TodoWrite, TaskCreate) also counts as a plan. Subagents are never gated. Off while Clean View is off. |
| Progress | Claude reports progress per step (`report_progress`); 100% checks a step off and starts the next. While Clean View is off, both tools stay registered but Claude's own calls change nothing, and `plan_steps` waits behind ToolSearch. `report_progress` stays in front because helpers' reports still reach the Agent Dock. |
| Job name | While Clean View is on, each new request sends one small Haiku call, at low effort, to name the job in 2 to 6 words. |
| Hidden rows | `ToolUse`, `ToolResult` and `ToolGroup` rows, and the "run in background" hint. |
| States | Working (also while background helpers are still out: `· waiting for 3 helpers to finish`), **Needs you** (permission prompt, question, waiting for your reply), Stuck (you said no, repeated failures, API errors in one plain sentence), Stopped (Esc), All done (shrinks to one line after 5 seconds). |

## Agent Dock

Pick a **Team Size** and every request you send is split across exactly that many helper agents running in parallel, each shown as its own card in a pane called **Agent Dock**.

```
◆  A G E N T   D O C K                                           ● L I V E
────────────────────────────────────────────────────────────────────────────
T E A M   S I Z E   ╭  1  3  5  10  20 [50] 100  │  Custom  ╮
Splits each request across 50 helpers  ·  20 at a time  ·  Fast & Cheap

M I S S I O N   Research bakery pricing                         45%   1:12
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
● 20 working    ○ 10 queued    ✓ 20 done    ✕ 0 stuck
```

| Command | Effect |
|---------|--------|
| `/dock` | Open the dock, or fold it. While helpers run, a folded dock shows a badge under the prompt (`20 working · 10 queued · 20 done`); an idle one shows nothing |
| `/dock 10` | Set the Team Size (1 to 100) and open the dock |
| **Agent Dock** | The Toolbox's Launch entry opens it too |

- **Size 1**: nothing is added to your requests. Claude decides how many helpers to use, and skills that launch their own agents work as before. The dock still shows any helpers they launch.
- **Size above 1**: each request carries an instruction to split the work into exactly N pieces, one helper per piece, all launched at once. A helper past N is refused. If Claude uses fewer than N, it gets one follow-up asking it to split the rest.
- **Not split**: slash commands and skills (their helpers show in the dock but are never capped, held, moved to Haiku or nudged), and a request you send while helpers from the last one are still running (it joins their mission).
- **Big teams**: a size above 20 asks you to confirm first, and a new session always starts back at 1.
- **Helper model**: *Fast & Cheap* runs helpers on Haiku (only when the size is above 1 and the call names no model). *Same as me* leaves the model alone.
- **Queueing**: Claude Code refuses an Agent call past `CLAUDE_CODE_MAX_CONCURRENT_SUBAGENTS` (default 20) instead of queueing it. The dock holds those calls until a slot frees up. "At a time" is the lower of that limit and `CLAUDE_CODE_MAX_TOOL_USE_CONCURRENCY` (default 10). Set both to 20 in the `env` block of your user settings for waves of 20.
- **Progress**: helpers are asked to call `report_progress` at about 25, 50, 75 and 100%, and each card's meter follows its own helper.

**Status line count:** run `/mods-toolbox:dock-setup` to add `◇ N agents` to your status line, either globally or for one project only. While helpers run, the dock writes the live count to `~/.claude/agent-dock/agents-now/<session id>.json` (under `$CLAUDE_CONFIG_DIR` when set) and removes the file when they finish or the session ends. The skill installs a small add-on, `~/.claude/agent-dock/statusline.sh`, that wraps your own status line command and adds the segment to its first line, so your script stays untouched. It also sets the status line to refresh every 2 seconds (`refreshInterval`), so the count keeps moving while Claude waits for helpers. `/mods-toolbox:dock-setup uninstall` undoes it in every project the skill touched (it keeps a list), puts each status line back as it was, removes any status line block or settings file the setup itself created, and deletes the add-on.

Every face is a colored two-letter badge. Past 12 helpers the cards shrink to one-line tiles so 50 or 100 still fit. The animation clock runs only while a request is live, so the idle seats are a still row with no twinkle.

**Cost:** at size 50 *every* request becomes 50 agents. Keep the size at 1 unless you mean it.

## Toolbox

**◆ Toolbox ▾** at the right of the prompt footer, or `/toolbox`, opens one popup above the prompt with both mods' settings:

```
╭────────────────────────────────────────────────────────────────╮
│ ◆  T O O L B O X                                             ✕ │
│ ── S E T T I N G S ─────────────────────────────────────────── │
│ ● Clean View    simple checklist                  ● On  ○ Off  │
│ ◇ Team size     per request  1  3 [5] 10  20  50  100  Custom  │
│ ◇ Helpers       model they use       Fast & Cheap  Same as me  │
│ ── L A U N C H ─────────────────────────────────────────────── │
│ ◆ Agent Dock  team of 5                                        │
╰────────────────────────────────────────────────────────────────╯
```

- It always sits at the right edge. With room, Clean View's checklist keeps its rows beside it. On a narrow terminal the checklist folds to its header (`· step 2 of 3`) above it.
- Every switch is the same setting as `/simple` and `/dock`, saved the same way. Team Size above 20 asks first, in gold, inside the popup.
- **Agent Dock** opens the dock and closes the popup to give it room.
- ✕ or a second press on the footer button closes it. Esc doesn't, since the band above the prompt has no close key.
- It stays open across requests, for this session only. On VS Code and mobile, where the band isn't drawn, use `/simple` and `/dock`.

## For other mods

The checklist lives in `$.state` under the `mods-toolbox` key, typed in [`types/index.d.ts`](./types/index.d.ts): `cleanViewEnabled`, `checklist` and `tick`, the dock's `dockTeamSize`, `dockMission` and the rest beside them, and `toolboxIsOpen`. List `mods-toolbox` under `dependencies` in your mod's `plugin.json` to get the types laid beside it.

## Development

```bash
claude --plugin-dir plugins/mods-toolbox    # run it from this checkout
claude plugin validate plugins/mods-toolbox
claude plugin test plugins/mods-toolbox
```

`hooks/register.tsx` is the entry point: it calls `registerToolbox(on)` from `hooks/toolbox.tsx` first, so its band hook sits outside Clean View's, then `registerDock(on)` from `hooks/dock.tsx`, so the dock's hook on a helper's `report_progress` runs before Clean View's, then `registerCleanView(on)` from `hooks/clean-view.tsx`. The engine follows `$` only into functions of the same file, so the Toolbox draws its controls and Clean View and the dock answer their keys in their own `ui.press` and `ui.input` hooks; each file reads the shared values through its own `atom` on the same literal key. While the popup is open the Toolbox lays out the band: Clean View steps aside, and the checklist is drawn through the same `$`-free `hooks/checklist-view.tsx` both use, beside the popup or folded above it. The band's layout math is in `hooks/toolbox-logic.ts`. Every step name goes through `hooks/clean-name.ts`, and both mods take percents and durations from `hooks/progress.ts`. The dock's logic that needs no `$` (sizes, names, instruction texts, counts, meters) lives in `hooks/dock-logic.ts` so tests call it directly. Claude Code writes the API types into `.claude-plugin/types/` (gitignored) when it loads the plugin, and `tsconfig.json` extends them, so `tsc -p plugins/mods-toolbox` works after one load.
