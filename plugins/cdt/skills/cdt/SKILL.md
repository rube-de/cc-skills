---
name: cdt
description: "Multi-agent development workflow using Agent Teams. Supports four modes: plan (architect teammate + PM teammate debate → plan.md), dev (developer teammate + code-tester teammate + qa-tester teammate + reviewer teammate iterate → code), full (plan → approval gate → dev), and auto (plan → dev, no gate). Use when tasks benefit from collaborative agent teammates with peer messaging."
license: MIT
compatibility: "Requires Claude Code with CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1. Context7 MCP server is bundled via plugin .mcp.json and starts automatically."
allowed-tools: Read Grep Glob Bash Task Teammate TaskCreate TaskUpdate TaskList TaskGet Write Edit AskUserQuestion TeamCreate SendMessage TeamDelete WebSearch WebFetch
metadata:
  author: cdt
  version: "1.0.0"
---

# Claude Dev Team

Multi-agent development workflow with four modes. Pick one based on the user's needs:

| Mode | When to use |
|------|-------------|
| **plan** | Need architecture/design before coding |
| **dev** | Have an approved plan, ready to implement |
| **full** | End-to-end with user approval gate between plan and dev |
| **auto** | End-to-end without approval gate |

Before executing any mode, read [references/plan-workflow.md](references/plan-workflow.md) and [references/dev-workflow.md](references/dev-workflow.md) for detailed step-by-step instructions, spawn prompts, and output templates.

## Architecture

```
Plan Phase (plan/full/auto)     Dev Phase (dev/full/auto)
  Lead (You)                      Lead (You)
  ├── architect  [teammate]       ├── developer    [teammate]
  ├── prod-mgr   [teammate]      ├── code-tester  [teammate]
  └── researcher [subagent]       ├── qa-tester    [teammate]
                                  ├── reviewer     [teammate]
                                  └── researcher   [subagent]
         │                                │
         └──── plan.md (handoff) ─────────┘
```

**Teammates** message each other directly (Architect teammate↔PM teammate, Developer teammate↔Code-tester teammate, Developer teammate↔QA-tester teammate, Developer teammate↔Reviewer teammate).
**Researcher** is a subagent — Lead relays results.

## Roles

### Researcher (subagent — spawn via Task without team_name)

Research specialist for doc lookups. Queries Context7 for library docs, searches web for best practices, returns structured findings with code examples. Bundled as `agents/researcher.md` in this plugin — Context7 MCP is auto-configured via `.mcp.json`.

### Architect (teammate — spawn via Teammate tool, plan phase)

Reads existing Architecture Decision Records (ADRs) from `docs/adrs/` before designing. Designs architecture: components, interfaces, file changes, data flow, testing strategy. Writes new ADRs to `docs/adrs/adr-NNNN-<slug>.md` for each significant decision. References existing ADRs when relevant and supersedes old ones when decisions change. Debates tradeoffs with PM teammate. Messages design to lead and PM teammate.

### Product Manager (teammate — spawn via Teammate tool, plan phase)

Validates architecture against requirements. Challenges design with concerns. Produces verdict: APPROVED or NEEDS_REVISION with specifics.

### Developer (teammate — spawn via Teammate tool, dev phase)

Implements tasks from plan. No stubs, no TODOs. Matches existing patterns. Iterates with code-tester teammate on failures, qa-tester teammate on QA issues, reviewer teammate on code quality.

### Code-Tester (teammate — spawn via Teammate tool, dev phase, always)

Unit/integration tests. Messages developer teammate with failures + root cause. Max 3 cycles.

### QA-Tester (teammate — spawn via Teammate tool, dev phase, always)

Always spawned. Adapts testing approach based on task type: for UI tasks, writes Storybook stories and tests user flows via `npx agent-browser`; for non-UI tasks, runs integration/smoke tests, verifies regression safety, and tests API contracts. Messages developer teammate with issues + evidence. Max 3 cycles.

### Reviewer (teammate — spawn via Teammate tool, dev phase)

Reviews changed files for completeness, correctness, security, quality, plan adherence. Validates review with `/council` (`quick quality` for routine, `review security` or `review architecture` for critical concerns). Scans for stubs. Messages developer teammate with file:line + fix suggestions. Max 3 cycles.

## Rules

- One team at a time — cleanup plan-team before starting dev-team
- Teammates debate directly (Architect teammate↔PM teammate, Developer teammate↔Code-tester teammate, Developer teammate↔QA-tester teammate, Developer teammate↔Reviewer teammate)
- Researcher is always a subagent — Lead relays results
- Plan.md is the single source of truth and handoff artifact
- Every task declares `depends_on`; parallel within waves, sequential between
- Verify build between waves
- Avoid file conflicts between parallel tasks
- Testing + review are mandatory quality gates
- Always cleanup team before finishing
- In dev/full/auto modes, use delegate mode (Shift+Tab) to keep the lead focused on coordination
- Plan mode: do NOT implement — only plan
- If stuck — ask user, don't loop

## Lead Identity

You are a **coordinator**, not an implementer. During active team phases:

### NEVER (hard rules — hooks enforce these)
- Edit or write source code files (*.ts, *.js, *.py, *.go, *.rs, *.tsx, *.jsx, *.vue, *.svelte, *.css, *.scss, *.html)
- Edit or write test files (*.test.*, *.spec.*, __tests__/*)
- Run implementation commands (npm run build, cargo build, etc.) — teammates do this
- Fix code bugs directly — send bug details to the developer teammate

### ALWAYS
- Delegate implementation to the developer teammate via SendMessage
- Delegate testing to code-tester and qa-tester teammates via SendMessage
- Delegate code review to the reviewer teammate via SendMessage
- Relay researcher subagent findings to teammates via SendMessage

### ALLOWED to edit directly
- Plan files: .claude/plans/*
- Reports: .claude/files/*
- ADRs: docs/adrs/*
- Config: CLAUDE.md, AGENTS.md, README.md
- Git operations: commit, push, branch, PR creation
