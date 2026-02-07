# project-manager

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Skills](https://img.shields.io/badge/Skills-1-blue.svg)]()
[![Claude Code](https://img.shields.io/badge/Claude%20Code-Plugin-purple.svg)]()
[![Install](https://img.shields.io/badge/Install-Plugin%20%7C%20Skill-informational.svg)]()

Interactive GitHub issue creation optimized for LLM agent teams. Guides users through type-specific question flows and produces structured, machine-parseable issues that AI coding agents can execute autonomously.

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

| Skill | Purpose | Triggers |
|-------|---------|----------|
| **project-manager** | Interactive issue creation workflow | `create issue`, `write ticket`, `plan work`, `/pm` |

## Workflow

```
┌────────────────────────────────────────────────┐
│               /project-manager                  │
├────────────────────────────────────────────────┤
│                                                │
│  1. Classify — determine issue type            │
│     (bug, feature, epic, refactor, etc.)       │
│                                                │
│  2. Discover — type-specific question flow     │
│     (bounded choices + open-ended details)     │
│                                                │
│  3. Explore Codebase — find relevant files     │
│     (Glob, Grep, Read for real paths)          │
│                                                │
│  4. Draft — generate issue from template       │
│     (agent-optimized with VERIFY: criteria)    │
│                                                │
│  5. Review — present draft to user             │
│     (approve, revise, or cancel)               │
│                                                │
│  6. Create — gh issue create with labels       │
│     (title prefix, labels, body-file)          │
│                                                │
└────────────────────────────────────────────────┘
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
claude plugin install project-manager@rube-cc-skills

# 3. Restart Claude Code
claude
```

### Skill Install (via [skills.sh](https://skills.sh))

```bash
npx skills add rube-de/cc-skills --skill project-manager
```

## Usage Examples

```bash
# Direct invocation
/pm

# Natural language triggers
"Create an issue for the login bug"
"Write a ticket for the new caching feature"
"Plan the database migration as an epic"
"Let's add rate limiting" → auto-detects as feature request
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

- [SKILL.md](skills/project-manager/SKILL.md) — Full skill definition
- [TEMPLATES.md](skills/project-manager/references/TEMPLATES.md) — All 8 issue templates
- [WORKFLOWS.md](skills/project-manager/references/WORKFLOWS.md) — Type-specific question flows

## License

MIT
