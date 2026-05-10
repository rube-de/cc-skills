# cdt

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Skills](https://img.shields.io/badge/Skills-1-blue.svg)]()
[![Commands](https://img.shields.io/badge/Commands-4-blue.svg)]()
[![Agents](https://img.shields.io/badge/Agents-1-green.svg)]()
[![Hooks](https://img.shields.io/badge/Hooks-1-orange.svg)]()
[![Claude Code](https://img.shields.io/badge/Claude%20Code-Plugin-purple.svg)]()
[![Install](https://img.shields.io/badge/Install-Plugin%20Only-critical.svg)]()

Multi-agent development workflow using Claude Code Agent Teams. Four operating modes (plan, dev, full, auto) with collaborative roles — Architect, PM, Developer, Code-Tester, QA-Tester, Reviewer — and a Researcher subagent for documentation lookups via Context7.

> [!IMPORTANT]
> **Requires Agent Teams**: This plugin requires the experimental Agent Teams feature. Set `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1` in your environment before use.

## Features

### Team-Based Development

Teammates debate directly within teams, enabling natural collaboration:

```
Planning Phase                    Development Phase
┌─────────────────────┐          ┌──────────────────────────┐
│  Architect ↔ PM     │          │  Developer ↔ Code-Tester  │
│  (design debate)    │          │  (fix cycles, max 3)      │
│                     │          │                           │
│  Researcher         │          │  Developer ↔ QA-Tester    │
│  (subagent, relayed)│          │  (always, adapts to task)  │
├─────────────────────┤          │                           │
│  Output: plan.md    │───────→  │  Developer ↔ Reviewer     │
└─────────────────────┘          │  (review cycles, max 3)   │
                                 │                           │
                                 │  Researcher               │
                                 │  (on-demand lookups)      │
                                 ├───────────────────────────┤
                                 │  Output: session log      │
                                 └───────────────────────────┘
```

### Roles

| Role | Type | Model | When | Responsibility |
|------|------|-------|------|----------------|
| **Architect** | Teammate | Opus | Always | Component design, interfaces, file changes, data flow |
| **Product Manager** | Teammate | Sonnet | Always | Requirements validation, architecture challenges |
| **Developer** | Teammate | Opus | Always | Full implementation — no stubs, no TODOs |
| **Code-Tester** | Teammate | Sonnet | Always | Unit/integration test writing and execution; reports failures directly to Developer |
| **QA-Tester** | Teammate | Sonnet | Always | UX testing (Storybook + agent-browser) for UI tasks; integration/smoke testing for non-UI tasks |
| **Reviewer** | Teammate | Opus | Always | Code quality, security, completeness, plan adherence |
| **Researcher** | Subagent | Sonnet | Always | Documentation via Context7, web research |

### Quality Gates

- **Code Testing**: Code-Tester writes and runs unit/integration tests, iterates with Developer (max 3 cycles)
- **QA Testing**: QA-Tester adapts to task type — UX testing (Storybook + agent-browser) for UI tasks, integration/smoke tests for non-UI tasks. Iterates with Developer (max 3 cycles)
- **Review**: Reviewer checks quality, security, and scans for stubs (TODO/FIXME/HACK/XXX)
- **Build Verification**: Build is verified between execution waves

## Commands

| Command | Purpose | Approval Gate | Output |
|---------|---------|---------------|--------|
| `/cdt:plan-task` | Planning only | N/A | `.dev/cdt/plans/plan-YYYYMMDD-HHMM.md` |
| `/cdt:dev-task` | Develop from existing plan | N/A | Updated plan + `.agentnotes/cdt/<branch-slug>.md` |
| `/cdt:full-task` | Complete workflow | **Yes** (user choice) | `plan.md` + `.agentnotes/cdt/<branch-slug>.md` + PR body with `## Agent Notes` |
| `/cdt:auto-task` | Autonomous end-to-end | No | `plan.md` + `.agentnotes/cdt/<branch-slug>.md` + PR body with `## Agent Notes` |

### `/cdt:plan-task` — Design Phase

Spawns Architect + PM + Researcher. The Architect designs the solution, the PM validates requirements and challenges the architecture, and the Researcher looks up library docs and patterns.

**Output**: `.dev/cdt/plans/plan-YYYYMMDD-HHMM.md` with architecture, file changes, task breakdown with dependency ordering, execution waves, testing strategy, and risk assessment.

### `/cdt:dev-task` — Implementation Phase

Spawns Developer + Code-Tester + Reviewer + Researcher + QA-Tester. Executes tasks wave-by-wave from the plan, with parallel tasks within each wave and sequential ordering between waves.

**Output**: Updated plan + `.agentnotes/cdt/<branch-slug>.md` — a committed, branch-scoped, append-mode session log. Each CDT run on the branch appends one `## Session YYYYMMDD-HHMM` block with What's Done / Open Questions / Context for Next Session / References sub-sections, so future agents on other branches can `rg -l "" .agentnotes/cdt/` to learn cross-branch context.

### `/cdt:full-task` — Plan + Approve + Dev

Runs `/cdt:plan-task`, presents the plan to the user for approval (Approve / Revise / Cancel), then runs `/cdt:dev-task` on approval.

### `/cdt:auto-task` — Autonomous Mode

Same as `/cdt:full-task` but skips the approval gate. Proceeds directly from planning to development.

### PR body enrichment (full-task and auto-task)

When either command opens a PR during Wrap Up, the PR body is enriched with an `## Agent Notes` block mirroring the *latest* session's `### Open Questions` and `### Context for Next Session` content from `.agentnotes/cdt/<branch-slug>.md`. The PR body carries only the most recent session for downstream tooling consumers (e.g. `pr-explainer-action`); the full multi-session history lives in the committed branch log. If both sections are empty, the block is omitted.

### Discovery hint auto-install

On every wrap-up that writes a session log, CDT idempotently appends a one-line discovery hint to the host repo's `AGENTS.md` (or `CLAUDE.md` if no `AGENTS.md` exists). The hint instructs future agents to `rg -l "" .agentnotes/cdt/` when picking up unfamiliar work. Idempotency is anchored on the literal string `.agentnotes/cdt` already being present, so re-runs are no-ops. If neither file exists, CDT skips silently — the plugin will never auto-create project docs.

## Hooks

| Hook | Trigger | Purpose |
|------|---------|---------|
| `check-agent-teams.sh` | SessionStart | Verify `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1` is set |

## Subagent

### Researcher

The Researcher is always a subagent (not a teammate) — the Lead relays findings to the team. This avoids "too many voices in the room" while still enabling on-demand documentation lookups.

**Capabilities**:
- Library documentation via Context7 (`resolve-library-id` + `query-docs`)
- Web research for best practices
- Codebase exploration for existing patterns
- Structured output with code examples and compatibility notes

## Installation

This is a **Claude Code plugin only** — it cannot be installed as a standalone skill via skills.sh. The plugin depends on commands (`/cdt:plan-task`, `/cdt:dev-task`, `/cdt:full-task`, `/cdt:auto-task`), hooks, and an agent definition that are not available through skill-only install.

### Plugin Install

```bash
# 1. Add the marketplace (once)
claude plugin marketplace add rube-de/cc-skills

# 2. Install the plugin
claude plugin install cdt@rube-cc-skills

# 3. Restart Claude Code
claude
```

### Prerequisites

```bash
# Enable Agent Teams (required)
export CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1

# Or add to Claude Code settings
```

## Usage Examples

```bash
# Plan a feature
/cdt:plan-task Add rate limiting to the API endpoints

# Develop from an existing plan
/cdt:dev-task .dev/cdt/plans/plan-20260207-1430.md

# Full workflow with approval gate
/cdt:full-task Implement user authentication with JWT

# Autonomous end-to-end
/cdt:auto-task Add dark mode support to the UI
```

## Dependencies

| Component | Required | Purpose |
|-----------|----------|---------|
| Claude Code | Yes | Plugin host |
| Agent Teams | Yes | `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1` |
| Context7 MCP | Bundled | Researcher documentation lookups |

## Troubleshooting

| Issue | Cause | Solution |
|-------|-------|----------|
| "Agent Teams not enabled" | Missing env var | Set `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1` |
| Researcher returns empty | Context7 unavailable | Falls back to WebSearch; check MCP config |
| Teammates not responding | Team creation failed | Ensure Agent Teams feature is enabled and restart |
| Dev-task can't find plan | Wrong path | Pass the timestamped plan path as argument |
| Stuck in iteration loop | Max cycles exceeded | After 3 cycles, escalates to user automatically |
| File conflicts between tasks | Parallel task overlap | Tasks in same wave should not touch same files |
| Stale team dirs accumulating in `~/.claude/teams/` | Workflow exited before Wrap Up | Run [`sh scripts/clean-stale-teams.sh`](scripts/clean-stale-teams.sh) (dry-run by default; pass `--yes` to delete). If you hit permission-denied errors removing `~/.claude/teams/`, run it from your local shell outside Claude Code. |

## References

- [SKILL.md](skills/cdt/SKILL.md) — Full skill definition
- [WORKFLOW.md](skills/cdt/references/WORKFLOW.md) — Detailed execution workflows
- [researcher-prompt.md](skills/cdt/references/researcher-prompt.md) — Researcher instructions

## License

MIT
