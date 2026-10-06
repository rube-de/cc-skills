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
| Job name | Each new request sends one small Haiku call, at low effort, to name the job in 2 to 6 words. |
| Hidden rows | `ToolUse`, `ToolResult` and `ToolGroup` rows, and the "run in background" hint. |
| States | Working, **Needs you** (permission prompt, question, waiting for your reply), Stuck (you said no, repeated failures, API errors in one plain sentence), Stopped (Esc), All done (shrinks to one line after 5 seconds). |

## For other mods

The checklist lives in `$.state` under the `clean-view` key, typed in [`types/index.d.ts`](./types/index.d.ts): `cleanViewEnabled`, `checklist` and `tick`. List `clean-view` under `dependencies` in your mod's `plugin.json` to get the types laid beside it.

## Development

```bash
claude --plugin-dir plugins/clean-view    # run it from this checkout
claude plugin validate plugins/clean-view
claude plugin test plugins/clean-view
```

`hooks/register.tsx` is the entry point and calls `registerCleanView(on)` from `hooks/clean-view.tsx`, so more mods can sit beside it. Every step name goes through `hooks/clean-name.ts`. Claude Code writes the API types into `.claude-plugin/types/` (gitignored) when it loads the plugin, and `tsconfig.json` extends them, so `tsc -p plugins/clean-view` works after one load.
