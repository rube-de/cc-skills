# claude-dev-team

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Skills](https://img.shields.io/badge/Skills-1-blue.svg)]()
[![Commands](https://img.shields.io/badge/Commands-4-blue.svg)]()
[![Agents](https://img.shields.io/badge/Agents-1-green.svg)]()
[![Hooks](https://img.shields.io/badge/Hooks-1-orange.svg)]()
[![Claude Code](https://img.shields.io/badge/Claude%20Code-Plugin-purple.svg)]()
[![Install](https://img.shields.io/badge/Install-Plugin%20Only-critical.svg)]()

Multi-agent development workflow using Claude Code Agent Teams. Four operating modes (plan, dev, full, auto) with collaborative roles — Architect, PM, Developer, Tester, Reviewer — and a Researcher subagent for documentation lookups via Context7.

> [!IMPORTANT]
> **Requires Agent Teams**: This plugin requires the experimental Agent Teams feature. Set `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1` in your environment before use.

## Features

### Team-Based Development

Teammates debate directly within teams, enabling natural collaboration:

```
Planning Phase                    Development Phase
┌─────────────────────┐          ┌─────────────────────┐
│  Architect ↔ PM     │          │  Developer ↔ Tester  │
│  (design debate)    │          │  (fix cycles, max 3) │
│                     │          │                      │
│  Researcher         │          │  Developer ↔ Reviewer│
│  (subagent, relayed)│          │  (review cycles, 3)  │
├─────────────────────┤          │                      │
│  Output: plan.md    │───────→  │  Researcher          │
└─────────────────────┘          │  (on-demand lookups) │
                                 ├──────────────────────┤
                                 │  Output: dev-report  │
                                 └──────────────────────┘
```

### Roles

| Role | Type | Model | Responsibility |
|------|------|-------|----------------|
| **Architect** | Teammate | Opus | Component design, interfaces, file changes, data flow |
| **Product Manager** | Teammate | Sonnet | Requirements validation, architecture challenges |
| **Developer** | Teammate | Opus | Full implementation — no stubs, no TODOs |
| **Tester** | Teammate | Sonnet | Test writing and execution, failure reporting |
| **Reviewer** | Teammate | Opus | Code quality, security, completeness, plan adherence |
| **Researcher** | Subagent | Sonnet | Documentation via Context7, web research |

### Quality Gates

- **Testing**: Tester writes and runs tests, iterates with Developer (max 3 cycles)
- **Review**: Reviewer checks quality, security, and scans for stubs (TODO/FIXME/HACK/XXX)
- **Build Verification**: Build is verified between execution waves

## Commands

| Command | Purpose | Approval Gate | Output |
|---------|---------|---------------|--------|
| `/plan-task` | Planning only | N/A | `.claude/plans/plan.md` |
| `/dev-task` | Develop from existing plan | N/A | Updated plan + `dev-report.md` |
| `/full-task` | Complete workflow | **Yes** (user choice) | `plan.md` + `dev-report.md` |
| `/auto-task` | Autonomous end-to-end | No | `plan.md` + `dev-report.md` |

### `/plan-task` — Design Phase

Spawns Architect + PM + Researcher. The Architect designs the solution, the PM validates requirements and challenges the architecture, and the Researcher looks up library docs and patterns.

**Output**: `.claude/plans/plan.md` with architecture, file changes, task breakdown with dependency ordering, execution waves, testing strategy, and risk assessment.

### `/dev-task` — Implementation Phase

Spawns Developer + Tester + Reviewer + Researcher. Executes tasks wave-by-wave from the plan, with parallel tasks within each wave and sequential ordering between waves.

**Output**: Updated `plan.md` + `.claude/files/dev-report.md` with execution summary, changes made, test results, and review outcomes.

### `/full-task` — Plan + Approve + Dev

Runs `/plan-task`, presents the plan to the user for approval (Approve / Revise / Cancel), then runs `/dev-task` on approval.

### `/auto-task` — Autonomous Mode

Same as `/full-task` but skips the approval gate. Proceeds directly from planning to development.

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

This is a **Claude Code plugin only** — it cannot be installed as a standalone skill via skills.sh. The plugin depends on commands (`/plan-task`, `/dev-task`, `/full-task`, `/auto-task`), hooks, and an agent definition that are not available through skill-only install.

### Plugin Install

```bash
# 1. Add the marketplace (once)
claude plugin marketplace add rube-de/cc-skills

# 2. Install the plugin
claude plugin install claude-dev-team@rube-cc-skills

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
/plan-task Add rate limiting to the API endpoints

# Develop from an existing plan
/dev-task .claude/plans/plan.md

# Full workflow with approval gate
/full-task Implement user authentication with JWT

# Autonomous end-to-end
/auto-task Add dark mode support to the UI
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
| Dev-task can't find plan | Wrong path | Default is `.claude/plans/plan.md`; pass custom path as argument |
| Stuck in iteration loop | Max cycles exceeded | After 3 cycles, escalates to user automatically |
| File conflicts between tasks | Parallel task overlap | Tasks in same wave should not touch same files |

## References

- [SKILL.md](skills/claude-dev-team/SKILL.md) — Full skill definition
- [WORKFLOW.md](skills/claude-dev-team/references/WORKFLOW.md) — Detailed execution workflows
- [researcher-prompt.md](skills/claude-dev-team/references/researcher-prompt.md) — Researcher instructions

## License

MIT
