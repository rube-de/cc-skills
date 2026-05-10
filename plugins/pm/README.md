# pm

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Skills](https://img.shields.io/badge/Skills-5-blue.svg)](skills/)
[![Claude Code](https://img.shields.io/badge/Claude%20Code-Plugin-purple.svg)]()
[![Install](https://img.shields.io/badge/Install-Plugin%20%7C%20Skill-informational.svg)]()

GitHub issue lifecycle for LLM agent teams: **brainstorm** design approaches, **create** structured issues, **triage** what to work on next, and **audit** stale/orphaned issues. Produces machine-parseable issues that AI coding agents can execute autonomously.

> [!NOTE]
> **Agent-First Design**: Every template section is a contract that agents parse. Acceptance criteria use `VERIFY:` prefixes for testable assertions, and scope boundaries are always explicit to prevent over-engineering.

## Features

### Type-Specific Question Flows

Structured discovery conversations tailored to each issue type:

| Type | Questions | Key Outputs |
|------|-----------|-------------|
| **Bug** | Severity, reproducibility, steps, error output | Root cause analysis, reproduction steps |
| **Feature** | Scope, user story, boundaries, dependencies | Acceptance criteria, implementation guide |
| **Epic** | Vision, task breakdown, risks, timeline | Sub-issues with dependency ordering |
| **Refactor** | Motivation, current vs desired state, risk | Files to modify/create/delete, constraints |
| **New Project** | Tech stack, architecture, MVP scope | Bootstrap tasks, project structure |
| **Chore** | Type, urgency, risks | Scoped task with acceptance criteria |
| **Research Spike** | Question, options, criteria, timebox | Evaluation matrix, deliverable format |

### Agent-Optimized Templates

8 templates with special tags for machine parsing:

- `VERIFY:` — testable acceptance criterion
- `AGENT-DECIDED:` — PM skill made this choice (transparent)
- `NEEDS CLARIFICATION:` — gap that must be resolved before work starts

### Codebase-Aware Drafting

Before drafting, the plugin explores the repo to ensure:
- File paths reference real files
- Implementation hints match existing patterns
- Similar features are identified for consistency
- Test patterns are detected and followed

### Smart Defaults

- **Duplicate check**: Searches existing issues before creating
- **Repo detection**: Auto-detects current repo via `gh repo view`
- **Label system**: Type, priority (P0-P3), size (S/M/L/XL), status labels

## Skills

| Skill | Command | Purpose | Triggers |
|-------|---------|---------|----------|
| **pm** | `/pm` | Create structured issues | `create issue`, `write ticket`, `plan work`, `/pm` |
| **brainstorm** | `/pm:brainstorm` | Explore approaches before creating issues | `brainstorm`, `explore idea`, `think through`, `design approach`, `what should we build`, `explore options`, `weigh approaches`, `compare solutions` |
| **next** | `/pm:next` | Triage & recommend next issue | `what should I work on next`, `triage backlog` |
| **review** | `/pm:review ISSUE_NUMBER` | Deep-validate a single issue against codebase | `review issue`, `validate issue`, `is this still needed` |
| **update** | `/pm:update` | Audit & clean up issues | `audit issues`, `clean up issues`, `backlog cleanup` |

## Usage

```bash
/pm                       # Create a new issue (interactive flow)
/pm -quick fix the login  # Create issue with smart defaults
/pm:brainstorm caching    # Explore approaches before creating issues
/pm:next                  # Triage: recommend next issue to work on
/pm:update                # Audit: find stale/orphaned issues
```

## Brainstorm Workflow

```text
┌─────────────────────────────────────────────────────┐
│            /pm:brainstorm [topic]                    │
├─────────────────────────────────────────────────────┤
│                                                     │
│  1. Context — silently gather project awareness     │
│                                                     │
│  2. Clarify — one question at a time, multiple      │
│     choice preferred over open-ended                │
│                                                     │
│  3. Propose — 2-3 approaches with trade-offs        │
│     and a recommendation (not neutral)              │
│                                                     │
│  4. Converge — flesh out chosen approach with       │
│     codebase exploration for real file paths        │
│                                                     │
│  5. Write Spec — save to .dev/pm/specs/             │
│     (tier-scaled: simple/medium/complex)            │
│                                                     │
│  6. Self-Review — check for placeholders,           │
│     contradictions, scope creep                     │
│                                                     │
│  7. User Review — approve or request changes        │
│                                                     │
│  8. Transition — hand off to /pm or /cdt            │
│                                                     │
└─────────────────────────────────────────────────────┘
```

> **Proactive triggering**: `/pm` detects ambiguous requests (unclear scope, multiple approaches, exploration language) and suggests brainstorming before issue creation.

## Create Workflow

```
┌─────────────────────────────────────────────────────┐
│            /pm [-quick]                              │
├─────────────────────────────────────────────────────┤
│                                                     │
│  1. Classify — determine issue type                 │
│     (bug, feature, epic, refactor, etc.)            │
│                                                     │
│  2. Discover — type-specific question flow          │
│     (bounded choices + open-ended details)          │
│                                                     │
│  3. Challenge — probe underspecified requirements   │
│     (critical: block on gaps, quick: smart defaults)│
│                                                     │
│  4. Explore Codebase — find relevant files          │
│     (Glob, Grep, Read for real paths)               │
│                                                     │
│  5. Draft — generate issue from template            │
│     (agent-optimized with VERIFY: criteria)         │
│                                                     │
│  6. Review — present draft to user                  │
│     (approve, revise, or cancel)                    │
│                                                     │
│  7. Create — gh issue create with labels            │
│     (title prefix, labels, body-file)               │
│                                                     │
└─────────────────────────────────────────────────────┘
```

## Issue Title Prefixes

| Type | Prefix | Label |
|------|--------|-------|
| Bug | `fix:` | `bug` |
| Feature | `feat:` | `enhancement` |
| Epic | `epic:` | `epic` |
| Refactor | `refactor:` | `refactor` |
| New Project | `project:` | `project` |
| Chore | `chore:` | `chore` |
| Research | `spike:` | `research` |

## Installation

This is a **skills-only plugin** — no hooks, agents, or commands. Both install methods are equivalent.

### Plugin Install

```bash
# 1. Add the marketplace (once)
claude plugin marketplace add rube-de/cc-skills

# 2. Install the plugin
claude plugin install pm@rube-cc-skills

# 3. Restart Claude Code
claude
```

### Skill Install (via [skills.sh](https://skills.sh))

```bash
npx skills add rube-de/cc-skills --skill pm
```

## Usage Examples

```bash
# Brainstorm (before issue creation)
/pm:brainstorm                 # Explore approaches for ambiguous work
/pm:brainstorm plugin discovery  # Start with a topic
"I'm not sure how to approach this"  # Natural language trigger

# Issue creation
/pm                            # Interactive flow
/pm -quick fix login redirect  # Quick mode with smart defaults

# Triage
/pm:next                       # Recommend highest-impact issue
"What should I work on next?"  # Natural language trigger

# Audit
/pm:update                     # Find stale/orphaned issues
"Clean up the backlog"         # Natural language trigger
```

## Dependencies

| Component | Required | Purpose |
|-----------|----------|---------|
| Claude Code | Yes | Plugin host |
| gh CLI | Yes | `gh issue create` for GitHub integration |

## Troubleshooting

| Issue | Cause | Solution |
|-------|-------|----------|
| "gh: not found" | gh CLI not installed | `brew install gh` then `gh auth login` |
| Issue creation fails | Not authenticated | Run `gh auth login` |
| Wrong issue type detected | Ambiguous request | Plugin will ask for clarification |
| Missing file paths in template | Codebase not explored | Ensure you're in the repo root directory |
| Labels not applied | Labels don't exist in repo | Create labels first or remove from command |

## References

- [pm/SKILL.md](skills/pm/SKILL.md) — Router + create workflow
- [brainstorm/SKILL.md](skills/brainstorm/SKILL.md) — Pre-creation design exploration
- [next/SKILL.md](skills/next/SKILL.md) — Triage & recommendation workflow
- [update/SKILL.md](skills/update/SKILL.md) — Audit & cleanup workflow
- [TEMPLATES.md](skills/pm/references/TEMPLATES.md) — All 8 issue templates
- [WORKFLOWS.md](skills/pm/references/WORKFLOWS.md) — Type-specific question flows

## License

MIT
