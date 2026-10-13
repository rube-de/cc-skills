# Mods Toolbox

Function-hook mods that change how Claude Code looks while it works:

- **[Clean View](#clean-view)**: one calm checklist above the prompt instead of tool calls, diffs and command output.
- **[Agent Dock](#agent-dock)**: every request split across a team of parallel helpers you pick, each shown as a live card.
- **[Status Line Dock](#status-line-dock)**: Claude Code's status line built from blocks you pick, with a live preview.
- **[Toolbox](#toolbox)**: one popup above the prompt for the mods' settings, opened from **◆ Toolbox ▾** in the prompt footer.

They ship together because the dock's helpers report through Clean View's `report_progress` tool, and the Status Line Dock's Agents block shows the Agent Dock's helper count.

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

**Status line count:** the [Status Line Dock](#status-line-dock)'s Agents block shows `◇ N agents` while helpers run. The dock writes the live count to `~/.claude/agent-dock/agents-now/<session id>.json` (under `$CLAUDE_CONFIG_DIR` when set) and removes the file when they finish or the session ends.

Every face is a colored two-letter badge. Past 12 helpers the cards shrink to one-line tiles so 50 or 100 still fit. The animation clock runs only while a request is live, so the idle seats are a still row with no twinkle.

**Cost:** at size 50 *every* request becomes 50 agents. Keep the size at 1 unless you mean it.

## Status Line Dock

Builds Claude Code's status line from blocks, with a live preview, and installs it for every project or for this one. Open it with **◆ Status Line Dock** in the Toolbox's Launch section, or `/status-dock`. It takes the band above the prompt, full width, right above the real status line, so it shows in the terminal and the desktop app but not in VS Code or on mobile, which don't draw the band:

```
╭────────────────────────────────────────────────────────────────────────────────────────────────╮
│ ◆  S T A T U S   L I N E   D O C K                   Global · installed · 2 lines · 9 blocks  ✕ │
│ Mode      Replace [Extend]     Scope  [Global] This project     Icons  [Glyph] Emoji  None     │
│ Keeps  ~/.claude/statusline.sh                                                                 │
│ ── B L O C K S ─────────────────────────────────────────────────────────────────────────────── │
│ Line 1    Folder  Branch [Model] Effort                                                        │
│ Line 2    Context  Cost  Lines changed  Session time  Agents                                   │
│ Off       Version  Style  Rate limits                                                          │
│ ── P R E V I E W ────────────────────────────────────────────── at 180 columns · nothing drops │
│ 📁 ~/code/app  🌿 main ✗  🤖 Opus 5.5                                                           │
│ ⌂ ~/code/app  ⎇ main ✗  ◆ Opus 5.5  ◎ high                                                     │
│ ███░░░░░░░ 34%  $0.53  +42 -18  ◷ 2m15s  ◇ 3 agents                                            │
│ h: ←  l: →  k: ↑  j: ↓  o: on/off  i: icons  a: Apply  u: Uninstall  ctrl+x tab, then the keys │
╰────────────────────────────────────────────────────────────────────────────────────────────────╯
```

- **Blocks**: Folder (at most 30 columns: a longer path keeps whole folders from its end, as `.../oasis/flexvaults-service`), Branch (✗ while there are uncommitted changes, checked only in the repo the session started in, since `git status` runs programs a repo's own config names), Model (with the context size short, as `Opus 5.5(1M)`), Effort, Version, Style (the output style), Context (bar and % used), Cost, Lines changed, Session time, Rate limits (5-hour and 7-day) and Agents (the Agent Dock's helpers working right now). A block Claude Code has no figure for yet is left out of the line.
- **Keys**: `ctrl+x tab` hands the band the keys. Tab to a block and Enter, or a click, selects it; one that is Off is turned on too, at the end of the last line in use. Then `h` and `l` move it along its line, `k` and `j` move it between Line 1, Line 2 and Off, `o` turns it off or on, `i` cycles the icons (Glyph, Emoji, None, also chips to click), `a` applies, `r` reverts edits not applied yet and `u` uninstalls. Letters only: a digit typed into an empty prompt would press a band button.
- **Replace or Extend**: Replace makes the blocks the whole status line. Extend keeps the status line you had on top (the Base status line) and adds the blocks below it. One wrapped by the Agent Dock's old add-on is unwrapped: the Base is your own command, and the Agents block shows the count.
- **Global or This project**: Global sets `statusLine` in your user `settings.json`; This project sets it in `.claude/settings.local.json`, with a reminder to keep that out of git. Each scope has its own Layout, and a project's starts from the global one. In Extend, a project with no status line of its own keeps following the one it inherits, read on every refresh, so a later change there still shows. When that is the Dock's own global line, the project keeps what the global Layout keeps instead, so no block shows twice.
- **Install**: the first Apply asks in gold, showing the command now and the new one. It writes only the `statusLine` block, in the file's own indentation, writes through a settings file that is a symlink into a dotfiles repo, and sets `refreshInterval` to 2 seconds unless yours is already 1 or 2. Once installed, Apply saves only the Layout, and the status line picks it up at its next refresh.
- **Preview**: runs the same renderer the status line runs, on the Layout you're editing, with this session's real figures: once installed, the input Claude Code last gave it. Blocks with no figure yet show sample ones, named under the preview. The rule above it gives your terminal's width and which blocks drop there: a line too wide loses whole blocks from its end rather than a cut-off one.
- **Uninstall** asks, saying what goes back, then puts the `statusLine` block back exactly as the install found it (or takes it out, or deletes the settings file the install created), and deletes `~/.claude/mods-toolbox/` once no scope uses it. With no record of the install on this machine, as with a settings file from another machine's dotfiles, it takes the Dock's line out. A status line you changed by hand since is left alone.
- **Left alone**: a settings file with comments, which isn't plain JSON, and a status line your organization's managed settings set.
- **Needs `jq`** (macOS 15 ships `/usr/bin/jq`); without it the status line reads `status line needs jq`. The renderer and Layouts live in `~/.claude/mods-toolbox/` (under `$CLAUDE_CONFIG_DIR` when set), so the status line keeps working if the plugin goes; use Uninstall first to take it out. A settings file shared through a dotfiles repo gets the renderer on another machine at that machine's next session; open the Dock there and Apply to write its Layout. [ADR 0001](../../docs/adrs/0001-status-line-shell-renderer.md) says why it's a shell script.

**Coming from `/mods-toolbox:dock-setup`:** that skill is gone. Open the Dock and Install: it unwraps the add-on, and deletes it once no other project's settings run it.

## Toolbox

**◆ Toolbox ▾** at the right of the prompt footer, or `/toolbox`, opens one popup above the prompt with Claude's model and effort and both mods' settings:

```
╭────────────────────────────────────────────────────────────────╮
│ ◆  T O O L B O X                       Opus 5.5 · 1M · high  ✕ │
│ ── M O D E L   C O N F I G ─────────────────────────────────── │
│ ◇ Model         saved as default   Haiku  Sonnet [Opus] Fable  │
│ ◇ Effort        thinking depth  Low  Medium [High] XHigh  Max  │
│ ○ Ultracode     workflows on every task           ○ On  ● Off  │
│ ── S E T T I N G S ─────────────────────────────────────────── │
│ ● Clean View    simple checklist                  ● On  ○ Off  │
│ ◇ Team size     per request  1  3 [5] 10  20  50  100  Custom  │
│ ◇ Helpers       model they use       Fast & Cheap  Same as me  │
│ ── L A U N C H ─────────────────────────────────────────────── │
│ ◆ Agent Dock  team of 5                                        │
│ ◆ Status Line Dock  2 lines · 9 blocks                         │
╰────────────────────────────────────────────────────────────────╯
```

- **Model config** switches the model and effort the way typing `/model` and `/effort` does: for this chat now, and saved as your default for new sessions (in your user `settings.json`; effort per model). Claude Code runs those commands only when Claude isn't working, so a pick made mid-task shows in gold with `◷ switches when Claude is done working`. Each switch adds the command's one-line confirmation to the chat.
- **Model** offers the families your `/config` model row lists, and keeps 1M context when the chat is on it. The row is left out when your organization locks the model.
- **Ultracode** (Max plans) runs `/effort ultracode on` or `off`: dynamic workflows on every task, which Claude Code reports as for this session only. No API reads it, so the row starts at Off and follows the toggle and a typed `/effort ultracode`. If Claude Code refuses it, as on a plan without Ultracode, the refusal shows as a toast and the row goes for the rest of the session. A mistyped `/effort ultracode` leaves the row as it was.
- **Effort** shows the level the last answer ran at. Before the first answer it comes from `settings.json`, so a session started with `--effort` shows the real level after its first answer. Each model has its own effort, so after a model switch the row shows the new model's from `settings.json` (its own level, else the general one), the way Claude Code picks it.
- A switch Claude Code refuses shows its reason as a toast, and the row keeps what's really running. A typed `/model` or `/effort`, or the `/config` model row, moves the popup too.
- It always sits at the right edge. With room, Clean View's checklist keeps its rows beside it. On a narrow terminal the checklist folds to its header (`· step 2 of 3`) above it.
- Every switch is the same setting as `/simple` and `/dock`, saved the same way. Team Size above 20 asks first, in gold, inside the popup.
- **Agent Dock** opens the dock and closes the popup to give it room. **Status Line Dock** opens in the popup's place: the band shows one of them at a time.
- ✕ or a second press on the footer button closes it. Esc doesn't, since the band above the prompt has no close key.
- It stays open across requests, for this session only. On VS Code and mobile, where the band isn't drawn, use `/simple` and `/dock`; the Status Line Dock has no command-only form, so set the status line up from the terminal or the desktop app.

## For other mods

The checklist lives in `$.state` under the `mods-toolbox` key, typed in [`types/index.d.ts`](./types/index.d.ts): `cleanViewEnabled`, `checklist` and `tick`, the dock's `dockTeamSize`, `dockMission` and the rest beside them, the Toolbox's `bandView` (`'toolbox'`, `'statusLineDock'` or `null`), `chatModel` (the session's model id) and `chatEffort` (its effort as last seen), and the Status Line Dock's `statusLineSetup`. List `mods-toolbox` under `dependencies` in your mod's `plugin.json` to get the types laid beside it.

## Development

```bash
claude --plugin-dir plugins/mods-toolbox    # run it from this checkout
claude plugin validate plugins/mods-toolbox
claude plugin test plugins/mods-toolbox
bun test plugins/mods-toolbox/renderer      # the status line renderer, run as a real shell script
```

`hooks/register.tsx` is the entry point: it calls `registerToolbox(on)` from `hooks/toolbox.tsx` first, then `registerStatusLineDock(on)` from `hooks/status-line-dock.tsx`, so both band hooks sit outside Clean View's, then `registerChatPicks(on)` from `hooks/chat-picks.tsx`, which runs `/model` and `/effort` for the popup's model config rows and keeps the effort last seen, then `registerDock(on)` from `hooks/dock.tsx`, so the dock's hook on a helper's `report_progress` runs before Clean View's, then `registerCleanView(on)` from `hooks/clean-view.tsx`. The engine follows `$` only into functions of the same file, so the Toolbox draws its controls and Clean View, the dock and the chat picks answer their keys in their own `ui.press` and `ui.input` hooks; each file reads the shared values through its own `atom` on the same literal key. While the popup is open the Toolbox lays out the band: Clean View steps aside, and the checklist is drawn through the same `$`-free `hooks/checklist-view.tsx` both use, beside the popup or folded above it. The band's layout math is in `hooks/toolbox-logic.ts`, and the model names and `/model` arguments in `hooks/chat-picks-logic.ts`. Every step name goes through `hooks/clean-name.ts`, and both mods take percents and durations from `hooks/progress.ts`. The dock's logic that needs no `$` (sizes, names, instruction texts, counts, meters) lives in `hooks/dock-logic.ts` so tests call it directly, and the Status Line Dock's (Layout edits, what the settings files hold, install and uninstall changes, the preview's input, colors to styled runs) in `hooks/status-line-logic.ts`. The status line itself is `renderer/statusline.sh` and `renderer/statusline.jq`; `claude plugin test` can't spawn a shell, so `renderer/statusline.spec.ts` runs under `bun test`, under `sh` and `dash`. Claude Code writes the API types into `.claude-plugin/types/` (gitignored) when it loads the plugin, and `tsconfig.json` extends them, so `tsc -p plugins/mods-toolbox` works after one load.
