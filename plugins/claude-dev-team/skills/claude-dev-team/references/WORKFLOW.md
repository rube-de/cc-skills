# Workflow Reference

Detailed execution steps for each mode. The Lead reads this before running any mode.

## Spawning the Researcher

```
Task tool:
  subagent_type: "researcher"
  prompt: >
    Research for: [task]. Look up: [libraries], [patterns], [APIs].
    Stack: [detected]. Return structured findings with code examples.
```

---

## Mode: plan

Produces `.claude/plans/plan.md`. Does NOT implement.

### Steps

1. **Explore** — Read files, Glob/Grep codebase, identify stack. If ambiguous, ask user.
2. **TeamCreate** "plan-team"
3. **TaskCreate** — "Research libraries" (you via subagent), "Design architecture" (architect), "Validate requirements" (PM, blocked by design)
4. **Spawn all three in parallel:**

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

5. **Coordinate:**
   - Researcher returns → relay findings to architect
   - Architect needs more docs → spawn another Researcher subagent, relay results
   - Architect shares design → verify against research
   - PM validates → if NEEDS_REVISION, forward to architect (max 2 cycles)
   - Disagreement → you decide based on requirements + research
6. **Write plan** to `.claude/plans/plan.md` (see Plan Template below)
7. **Cleanup** — shutdown teammates, TeamDelete
8. **Present** — summarize task count, waves, key decisions, risks

---

## Mode: dev

Implements an existing plan file (default: `.claude/plans/plan.md`).

### Steps

1. **Parse plan** — extract tasks, dependencies, waves. Check files-per-task for conflict avoidance.
2. **TeamCreate** "dev-team"
3. **TaskCreate** — one per plan task (preserve `depends_on` via `addBlockedBy`), plus "Test all" and "Review all"
4. **Spawn teammates:**

**Developer**:
```
Task tool:
  team_name: "dev-team"
  name: "developer"
  model: opus
  prompt: >
    You are the developer. Plan: .claude/plans/plan.md — read it first.
    Working directory: [path]

    1. Check TaskList, claim unblocked tasks (lowest ID first)
    2. Read plan section for your task — architecture, interfaces, dependencies
    3. Implement completely — no stubs, no TODOs, match existing patterns
    4. Run build/lint if available
    5. Message the tester: what changed, what to test
    6. If tester reports failures — fix, message them to re-run
    7. If reviewer requests changes — fix, message them to re-review
    8. Mark task complete, check TaskList for next
    9. When done, message the lead

    Stay within files specified in each task. Need docs? Message the lead.
```

**Tester**:
```
Task tool:
  team_name: "dev-team"
  name: "tester"
  model: sonnet
  prompt: >
    You are the tester. Plan: .claude/plans/plan.md — read Testing Strategy.

    1. Check TaskList — your task is blocked until implementation completes
    2. Wait for developer to message what they changed
    3. Read plan + implementation, write tests matching existing patterns
    4. Run tests. If failures are implementation bugs:
       - Message developer with specific failure + root cause
       - Wait for fix, re-run (max 3 cycles, then escalate to lead)
    5. When all pass, message the lead with results
    6. Mark task complete

    Test behavior, not implementation details.
```

**Reviewer**:
```
Task tool:
  team_name: "dev-team"
  name: "reviewer"
  model: opus
  prompt: >
    You are the code reviewer. Plan: .claude/plans/plan.md — read Architecture.

    1. Check TaskList — your task is blocked until tests pass
    2. Wait for lead to activate you
    3. Review all changed files: completeness, correctness, security, quality, plan adherence
    4. Use /council to validate your review (quick quality for routine, review security or review architecture for critical concerns)
    5. Scan for stubs: rg "TODO|FIXME|HACK|XXX|stub"
    6. Blocking issues → message developer with file:line + fix suggestion
       Wait for fix, re-review (max 3 cycles, then escalate to lead)
    7. When approved, message lead with verdict
    8. Mark task complete

    Be specific: file paths, line numbers, concrete fixes.
```

5. **Execute waves:**
   - Assign tasks to developer (TaskUpdate `owner`)
   - Message developer: "Wave N ready. Tasks: [list]. Context from prior waves: [results]"
   - Monitor TaskList
   - If developer needs docs — spawn Researcher subagent, relay results
   - Verify wave: check build, update plan file (status, log, files_changed)
6. **Testing** — message tester: "Implementation complete. Files: [list]. Begin testing." Dev↔Tester iterate directly. Intervene only on escalation.
7. **Review** — message reviewer: "Tests passing. Files: [list]. Begin review." Dev↔Reviewer iterate directly. Intervene only on escalation.
8. **Final verification** — full test suite, build, stub scan (`rg "TODO|FIXME|HACK|XXX|stub" --type-not md`), update plan to final state
9. **Cleanup** — shutdown teammates, TeamDelete
10. **Report** to `.claude/files/dev-report.md` (see Report Template below)

---

## Mode: full

Plan → approval gate → dev. One team at a time.

1. Execute **plan** mode (steps 1-8)
2. **Ask user:** "Plan ready. [N] tasks, [M] waves. Key decisions: [summary]. Risks: [summary]." Options: Approve (Recommended) | Revise | Cancel
3. Do NOT proceed without approval. If revisions: update plan, re-present.
4. Execute **dev** mode (steps 1-10)

---

## Mode: auto

Plan → dev, no approval gate.

1. Execute **plan** mode (steps 1-8)
2. Log brief summary to user (task count, waves, key decisions)
3. Execute **dev** mode (steps 1-10)

---

## Plan Template

Write to `.claude/plans/plan.md`:

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

## Report Template

Write to `.claude/files/dev-report.md`:

```markdown
# Development Report: [Task Name]

**Plan**: [path]  **Date**: [date]

## Summary
[What was built]

## Execution
| Wave | Tasks | Status |
|------|-------|--------|

## Changes
| File | Action | Description |
|------|--------|-------------|

## Test Results
[Pass/fail counts]

## Review
[Verdict, cycles, issues fixed]

## Dev↔Test Iterations
[Cycle count, key fixes]

## Known Limitations
```
