---
allowed-tools: [Read, Grep, Glob, Bash, Task, TaskCreate, TaskUpdate, TaskList, TaskGet, Write, Edit, AskUserQuestion, TeamCreate, SendMessage, TeamDelete]
description: "Spawn planning team: Orchestrator + Architect + Researcher + PM → outputs plan.md"
---

# /plan-task — Planning Phase

**Target:** $ARGUMENTS

You are the **Lead** for the planning phase. Create an agent team with an Architect and PM as teammates, plus a Researcher subagent for doc lookups.

## Team

| Role | How | Why |
|------|-----|-----|
| Architect | **Teammate** | Needs to debate tradeoffs with PM |
| Product Manager | **Teammate** | Needs to challenge Architect's design |
| Researcher | **Subagent** (`researcher`) | Focused lookup, no collaboration needed |

## Process

### 1. Explore

Read referenced files, explore codebase (Glob/Grep), identify stack and patterns. If requirements are ambiguous — ask the user via AskUserQuestion with recommendations.

### 2. Create Team

```
TeamCreate: team_name "plan-team"
```

### 3. Create Tasks

TaskCreate:
1. "Research libraries and patterns" — you handle via Researcher subagent
2. "Design architecture" — for Architect
3. "Validate requirements" — for PM (blocked by #2)

### 4. Launch (parallel)

Spawn all three simultaneously:

**Architect** teammate:
```
Task tool:
  team_name: "plan-team"
  name: "architect"
  model: opus
  prompt: >
    You are the architect. Design the architecture for: [task]

    Codebase: [path]. Stack: [detected]. Constraints: [any].

    1. Check TaskList, claim your task
    2. Analyze codebase structure and patterns (Glob, Grep, Read)
    3. If you need library docs, message the lead
    4. Design: components, interfaces, file changes, data flow, testing strategy
    5. Message your design to the lead AND the product-manager
    6. Iterate on PM feedback
    7. Mark task complete
```

**PM** teammate:
```
Task tool:
  team_name: "plan-team"
  name: "product-manager"
  model: sonnet
  prompt: >
    You are the PM. Requirements: [task description]

    1. Check TaskList — your task is blocked until the architect finishes
    2. When the architect messages you their design, validate against requirements
    3. Message the architect directly with concerns
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

### 5. Coordinate

1. **When Researcher returns** — SendMessage findings to "architect"
2. **When Architect needs docs** — spawn another Researcher subagent, relay results
3. **When Architect shares design** — verify it aligns with research findings
4. **When PM validates** — if NEEDS_REVISION, forward feedback to Architect (max 2 cycles)
5. **If they disagree** — you decide based on requirements + research

### 6. Save Plan

Write `.claude/plans/plan.md`:

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

## Risks & Mitigations

## Validation
[PM verdict]
```

### 7. Cleanup

Shutdown teammates (SendMessage `shutdown_request`), then TeamDelete.

### 8. Present

Summarize: task count, waves, key decisions, risks.

## Rules

- Architect + PM are teammates — they debate directly
- Researcher is a subagent — Lead relays results
- Write plan.md to disk — handoff artifact for `/dev-task`
- Every task declares `depends_on`
- Always cleanup the team before finishing
- Do NOT implement — only plan
