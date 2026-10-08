# Clean View

A calm, friendly Claude Code for people who aren't technical. While Claude works, tool calls, file diffs and command output are hidden, and one checklist above the prompt shows the plan, what's happening now and how far along it is.

```
Build my landing page · 1m 12s                     [ ● Clean View: ON ]
✓ Read your brand notes            ██████████  Done
▶ Build the pricing section        ██████░░░░  60%
○ Add the contact form             ░░░░░░░░░░  Next
○ Polish the footer                ░░░░░░░░░░  Up next
```

Claude's written replies stay visible. Permission prompts and questions stay visible too, and switch the header to **Needs you**.

## Requirements

Claude Code **2.1.291 or newer**. Clean View is a function-hook plugin (a "mod"), and that plugin API is early access, so a later Claude Code release may change it.

## Install

```bash
claude plugin marketplace add rube-de/cc-skills
claude plugin install clean-view@rube-cc-skills
```

Or at the prompt: `/plugin install clean-view --marketplace rube-de/cc-skills`.

## Turn it on and off

Clean View starts on. Click **[ ● Clean View: ON ]** above the prompt, or type:

| Command | Effect |
|---------|--------|
| `/simple` | Flip it |
| `/simple on` | Turn it on |
| `/simple off` | Turn it off: every hidden row comes back, only the button stays |

Both work while Claude is busy, and the choice is remembered after a restart.

## What it changes

| Area | Behaviour |
|------|-----------|
| Plan first | Claude is asked to lay out 2 to 8 plain-English steps (`plan_steps`) before anything else, and other tools are refused until it has. A to-do list (TodoWrite, TaskCreate) also counts as a plan. Subagents are never gated. Off while Clean View is off. |
| Progress | Claude reports progress per step (`report_progress`); 100% checks a step off and starts the next. |
| Job name | While Clean View is on, each new request sends one small Haiku call, at low effort, to name the job in 2 to 6 words. |
| Hidden rows | `ToolUse`, `ToolResult` and `ToolGroup` rows, and the "run in background" hint. |
| States | Working, **Needs you** (permission prompt, question, waiting for your reply), Stuck (you said no, repeated failures, API errors in one plain sentence), Stopped (Esc), All done (shrinks to one line after 5 seconds). |

## Agent Dock

A second mod in the same plugin. Pick a **Team Size** and every request you send is split across exactly that many helper agents running in parallel, each shown as its own card in a pane called **Agent Dock**.

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
| `/dock` | Open the dock, or fold it to a badge under the prompt (`20 working · 10 queued · 20 done`) |
| `/dock 10` | Set the Team Size (1 to 100) and open the dock |
| **◆ Dock** | The button at the right of the prompt footer opens it too |

- **Size 1**: nothing is added to your requests. Claude decides how many helpers to use, and skills that launch their own agents work as before. The dock still shows any helpers they launch.
- **Size above 1**: each request carries an instruction to split the work into exactly N pieces, one helper per piece, all launched at once. A helper past N is refused. If Claude uses fewer than N, it gets one follow-up asking it to split the rest.
- **Not split**: slash commands and skills (their helpers show in the dock but are never capped, held, moved to Haiku or nudged), and a request you send while helpers from the last one are still running (it joins their mission).
- **Big teams**: a size above 20 asks you to confirm first, and a new session always starts back at 1.
- **Helper model**: *Fast & Cheap* runs helpers on Haiku (only when the size is above 1 and the call names no model). *Same as me* leaves the model alone.
- **Queueing**: Claude Code refuses an Agent call past `CLAUDE_CODE_MAX_CONCURRENT_SUBAGENTS` (default 20) instead of queueing it. The dock holds those calls until a slot frees up. "At a time" is the lower of that limit and `CLAUDE_CODE_MAX_TOOL_USE_CONCURRENCY` (default 10). Set both to 20 in the `env` block of your user settings for waves of 20.
- **Progress**: helpers are asked to call `report_progress` at about 25, 50, 75 and 100%, and each card's meter follows its own helper.

**Status line count:** run `/clean-view:dock-setup` to add `◇ N agents` to your status line, either globally or for one project only. While helpers run, the dock writes the live count to `~/.claude/agent-dock/agents-now/<session id>.json` (under `$CLAUDE_CONFIG_DIR` when set) and removes the file when they finish or the session ends. The skill installs a small add-on, `~/.claude/agent-dock/statusline.sh`, that wraps your own status line command and adds the segment to its first line, so your script stays untouched. It also sets the status line to refresh every 2 seconds (`refreshInterval`), so the count keeps moving while Claude waits for helpers. `/clean-view:dock-setup uninstall` undoes it in every project the skill touched (it keeps a list), puts each status line back as it was, removes any status line block or settings file the setup itself created, and deletes the add-on.

Every face is a colored two-letter badge. Past 12 helpers the cards shrink to one-line tiles so 50 or 100 still fit. The animation clock runs only while a request is live, so the idle seats are a still row with no twinkle.

**Cost:** at size 50 *every* request becomes 50 agents. Keep the size at 1 unless you mean it.

## For other mods

The checklist lives in `$.state` under the `clean-view` key, typed in [`types/index.d.ts`](./types/index.d.ts): `cleanViewEnabled`, `checklist` and `tick`, and the dock's `dockTeamSize`, `dockMission` and the rest beside them. List `clean-view` under `dependencies` in your mod's `plugin.json` to get the types laid beside it.

## Development

```bash
claude --plugin-dir plugins/clean-view    # run it from this checkout
claude plugin validate plugins/clean-view
claude plugin test plugins/clean-view
```

`hooks/register.tsx` is the entry point: it calls `registerDock(on)` from `hooks/dock.tsx` first, so the dock's hook on a helper's `report_progress` runs before Clean View's, then `registerCleanView(on)` from `hooks/clean-view.tsx`. Every step name goes through `hooks/clean-name.ts`, and both mods take percents and durations from `hooks/progress.ts`. The dock's logic that needs no `$` (sizes, names, instruction texts, counts, meters) lives in `hooks/dock-logic.ts` so tests call it directly. Claude Code writes the API types into `.claude-plugin/types/` (gitignored) when it loads the plugin, and `tsconfig.json` extends them, so `tsc -p plugins/clean-view` works after one load.
