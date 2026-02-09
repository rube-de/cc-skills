---
allowed-tools: [Read, Grep, Glob, Bash, Task, Teammate, TaskCreate, TaskUpdate, TaskList, TaskGet, Write, Edit, AskUserQuestion, TeamCreate, SendMessage, TeamDelete]
description: "Create an agent team to plan: Architect teammate + PM teammate + Researcher subagent → outputs plan.md"
---

# /plan-task — Planning Phase

**Target:** $ARGUMENTS

You are the **Lead** for the planning phase. Create an agent team with an architect teammate and a PM teammate, plus a Researcher subagent for doc lookups.

## Team

| Role | How | Why |
|------|-----|-----|
| Architect teammate | **Teammate** | Needs to debate tradeoffs with PM teammate |
| Product Manager teammate | **Teammate** | Needs to challenge architect teammate's design |
| Researcher subagent | **Subagent** (`researcher`) | Focused lookup, no collaboration needed |

## Process

### 0. Git Check

1. Run `git branch --show-current`
2. If on `main` or `master`:
   - Suggest a branch name based on the task (e.g. `feat/rate-limiting`)
   - Run `git checkout -b <branch> origin/main` to create the feature branch automatically
3. Run `git fetch origin && git pull` to ensure up-to-date

### 1. Generate Timestamp

Generate a timestamp in `YYYYMMDD-HHMM` format (e.g. `20260207-1430`). Use this for the plan output path. Store as `$TIMESTAMP`.

### 2. Explore

Read referenced files, explore codebase (Glob/Grep), identify stack and patterns. If requirements are ambiguous — ask the user via AskUserQuestion with recommendations.

### 3. Create Team

```
TeamCreate: team_name "plan-team"
```

### 4. Create Tasks

TaskCreate:
1. "Research libraries and patterns" — you handle via Researcher subagent
2. "Design architecture" — for Architect
3. "Validate requirements" — for PM (blocked by #2)

### 5. Launch (parallel)

Spawn all three simultaneously:

**Architect teammate**:
```
Teammate tool:
  team_name: "plan-team"
  name: "architect"
  model: opus
  prompt: >
    You are the architect. Design the architecture for: [task]

    Codebase: [path]. Stack: [detected]. Constraints: [any].

    1. Check TaskList, claim your task
    2. Analyze codebase structure and patterns (Glob, Grep, Read)
    3. Read all files in `docs/adrs/` (if the directory exists) to understand prior architecture decisions before designing
    4. If you need library docs, message the lead
    5. Design: components, interfaces, file changes, data flow, testing strategy
    6. Write new Architecture Decision Records (ADRs) to `docs/adrs/adr-NNNN-<slug>.md` for each significant decision:
       - Format: title, status (proposed/accepted/rejected/superseded), context, decision, consequences
       - Number sequentially from existing ADRs (start at 0001 if none exist)
       - When a new decision supersedes an old one, update the old ADR's status to `superseded` and link to the new ADR
       - Reference existing ADRs when relevant (e.g., "per ADR-0003, we use Redis for caching")
    7. Check if `docs/adrs/` is referenced in the target project's `AGENTS.md` or `CLAUDE.md` — if not, add a reference so future agents discover the ADR directory
    8. Message your design to the lead AND the product-manager (include links to new and referenced ADRs)
    9. Iterate on PM teammate feedback
    10. Mark task complete
```

**PM teammate**:
```
Teammate tool:
  team_name: "plan-team"
  name: "product-manager"
  model: sonnet
  prompt: >
    You are the PM. Requirements: [task description]

    1. Check TaskList — your task is blocked until the architect finishes
    2. When the architect teammate messages you their design, validate against requirements
    3. Message the architect teammate directly with concerns
    4. Produce validation report: APPROVED or NEEDS_REVISION with specifics
    5. Share report with the lead
    6. Mark task complete
```

**Researcher** subagent (no team_name):
```
Task tool:
  subagent_type: "researcher"
  prompt: >
    Research for: [task]. Look up: [libraries], [patterns], [APIs].
    Stack: [detected]. Return structured findings with code examples.
```

### 6. Coordinate

1. **When Researcher returns** — SendMessage findings to architect teammate
2. **When architect teammate needs docs** — spawn another Researcher subagent, relay results
3. **When architect teammate shares design** — verify it aligns with research findings
4. **When PM teammate validates** — if NEEDS_REVISION, forward feedback to architect teammate (max 2 cycles)
5. **If they disagree** — you decide based on requirements + research

### 7. Save Plan

Write `.claude/plans/plan-$TIMESTAMP.md`:

```markdown
# Plan: [Task Name]

**Generated**: [Date]  **Target**: [Original request]

## Overview
[Architecture, key decisions, research findings — 2-3 paragraphs]

## Architecture

### Component Design
[Per component: purpose, interface, dependencies]

### File Changes
| File | Action | Description |
|------|--------|-------------|

### Data Flow
[How data moves through the system]

## Architecture Decision Records
[Link to each ADR created or referenced during planning]
- [ADR-NNNN: Title](docs/adrs/adr-NNNN-slug.md) — status

## Research Findings
[Library versions, APIs, code examples, pitfalls]

## Tasks

### T1: [Name]
- **depends_on**: []
- **location**: [file paths]
- **description**: [specific and actionable]
- **validation**: [how to verify]
- **status**: Not Started
- **log**:
- **files_changed**:

### T2: [Name]
- **depends_on**: [T1]
...

## Execution Waves
| Wave | Tasks | Starts When |
|------|-------|-------------|

## Testing Strategy
[Framework, scenarios, acceptance criteria]
[Include QA test scenarios: integration/smoke tests for non-UI tasks; user flows, interactions, navigation, and Storybook stories for UI tasks.]

## Risks & Mitigations

## Validation
[PM verdict]
```

### 8. Cleanup

1. Send each teammate a shutdown request via SendMessage
2. Wait for all teammates to confirm shutdown (they may approve or reject — if rejected, resolve the issue first)
3. Once all teammates have stopped, run TeamDelete to clean up the team

### 9. Present

Tell the user the plan path: `.claude/plans/plan-$TIMESTAMP.md`

Summarize: task count, waves, key decisions, risks.

## Rules

- Architect teammate + PM teammate debate directly
- Researcher is a subagent — Lead relays results
- Write plan to disk — handoff artifact for `/cdt:dev-task`
- Every task declares `depends_on`
- Always cleanup the team before finishing
- Do NOT implement — only plan
