---
allowed-tools: [Read, Grep, Glob, Bash, Task, TaskCreate, TaskUpdate, TaskList, TaskGet, Write, Edit, AskUserQuestion, TeamCreate, SendMessage, TeamDelete]
description: "Create an agent team to develop: Developer teammate + Tester teammate + Reviewer teammate + Researcher subagent → implements plan.md in waves"
---

# /dev-task — Development Phase

**Target:** $ARGUMENTS (pass the plan file path, e.g. `.claude/plans/plan-20260207-1430.md`)

You are the **Lead** for the development phase. Create an agent team where developer teammate, tester teammate, and reviewer teammate collaborate with direct peer messaging for iteration loops.

## Team

| Role | How | Why |
|------|-----|-----|
| Developer teammate | **Teammate** | Iterates with tester teammate on failures, reviewer teammate on issues |
| Tester teammate | **Teammate** | Messages developer teammate directly with failure details |
| Reviewer teammate | **Teammate** | Messages developer teammate directly with fix requests |
| Researcher subagent | **Subagent** (`researcher`) | On-demand doc lookups, Lead relays |

## Process

### 0. Git Check

1. Run `git branch --show-current`
2. If on `main` or `master`:
   - AskUserQuestion: "You're on the main branch. Create a feature branch before starting?"
     Options: Create branch (Recommended) | Continue on main
   - If create: suggest a branch name based on the task (e.g. `feat/rate-limiting`), then `git checkout -b <branch> origin/main`
3. Run `git fetch origin && git pull` to ensure up-to-date

### 1. Parse Plan

Read the plan file from `$ARGUMENTS`. Extract tasks, dependencies, waves. Check files-per-task for conflict avoidance.

### 2. Generate Timestamp

Generate a timestamp in `YYYYMMDD-HHMM` format for the dev report output path. Store as `$TIMESTAMP`.

### 3. Create Team

```
TeamCreate: team_name "dev-team"
```

### 4. Create Tasks

TaskCreate for each plan task (preserve `depends_on` via `addBlockedBy`). Also create:
- "Test all implementations" — blocked by all impl tasks
- "Review all implementations" — blocked by test task

### 5. Spawn Teammates

**Developer teammate**:
```
Task tool:
  team_name: "dev-team"
  name: "developer"
  model: opus
  prompt: >
    You are the developer. Plan: [plan-path] — read it first.
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

**Tester teammate**:
```
Task tool:
  team_name: "dev-team"
  name: "tester"
  model: sonnet
  prompt: >
    You are the tester. Plan: [plan-path] — read Testing Strategy.

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

**Reviewer teammate**:
```
Task tool:
  team_name: "dev-team"
  name: "reviewer"
  model: opus
  prompt: >
    You are the code reviewer. Plan: [plan-path] — read Architecture.

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

### 6. Execute Waves

For each wave:
1. Assign tasks to developer teammate (TaskUpdate `owner`)
2. Message developer teammate: "Wave N ready. Tasks: [list]. Context from prior waves: [results]"
3. Monitor TaskList
4. If developer teammate needs docs — spawn Researcher subagent, relay results
5. Verify wave: check build, update plan file (status, log, files_changed)

After all impl waves:
6. Message tester teammate: "Implementation complete. Files: [list]. Begin testing."
7. Developer teammate↔Tester teammate iterate directly. Intervene only on escalation.

After tests pass:
8. Message reviewer teammate: "Tests passing. Files: [list]. Begin review."
9. Developer teammate↔Reviewer teammate iterate directly. Intervene only on escalation.

### 7. Final Verification

After APPROVED:
1. Run full test suite
2. Verify build
3. `rg "TODO|FIXME|HACK|XXX|stub" --type-not md`
4. Update plan file to final state

### 8. Cleanup

Shutdown all teammates, TeamDelete.

### 9. Report

Write `.claude/files/dev-report-$TIMESTAMP.md`:

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

## Developer↔Tester Iterations
[Cycle count, key fixes]

## Known Limitations
```

### 10. Wrap Up

Ask user:
```
AskUserQuestion:
  "Development complete. Report written to .claude/files/dev-report-$TIMESTAMP.md. Ready to commit, push, and create a PR?"
  Options: Create PR (Recommended) | Commit & push only | Skip
```

If creating PR:
1. Stage changed files
2. Commit with conventional commit message based on task
3. Push branch
4. Create PR with plan summary as description

If commit & push only:
1. Stage changed files
2. Commit with conventional commit message based on task
3. Push branch

## Rules

- Teammates iterate directly — Developer teammate↔Tester teammate, Developer teammate↔Reviewer teammate
- Researcher is a subagent — Lead relays
- Parallel within waves, sequential between
- Verify between waves
- Don't skip testing or review
- Avoid file conflicts between tasks
- Always cleanup team
- If stuck — ask user, don't loop
