---
allowed-tools: [Read, Grep, Glob, Bash, Task, Teammate, TaskCreate, TaskUpdate, TaskList, TaskGet, Write, Edit, AskUserQuestion, TeamCreate, SendMessage, TeamDelete]
description: "Create an agent team to develop: Developer teammate + Code-tester teammate + QA-tester teammate + Reviewer teammate + Researcher subagent → implements plan.md in waves"
---

# /dev-task — Development Phase

**Target:** $ARGUMENTS (pass the plan file path, e.g. `.claude/plans/plan-20260207-1430.md`)

You are the **Lead** for the development phase. Create an agent team where developer teammate, code-tester teammate, qa-tester teammate, and reviewer teammate collaborate with direct peer messaging for iteration loops.

## Team

| Role | How | When | Why |
|------|-----|------|-----|
| Developer teammate | **Teammate** | Always | Iterates with code-tester teammate on failures, reviewer teammate on issues |
| Code-tester teammate | **Teammate** | Always | Messages developer teammate directly with unit/integration test failure details |
| QA-tester teammate | **Teammate** | Always | UX testing (Storybook + agent-browser) for UI tasks; integration/smoke testing for non-UI tasks |
| Reviewer teammate | **Teammate** | Always | Messages developer teammate directly with fix requests |
| Researcher subagent | **Subagent** (`researcher`) | Always | On-demand doc lookups, Lead relays |

## Process

### 0. Git Check

1. Run `git branch --show-current`
2. If on `main` or `master`:
   - Suggest a branch name based on the task (e.g. `feat/rate-limiting`)
   - Run `git checkout -b <branch> origin/main` to create the feature branch automatically
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
- "Test all implementations (code)" — blocked by all impl tasks
- "Test all implementations (QA)" — blocked by all impl tasks
- "Review all implementations" — blocked by all test tasks

### 5. Spawn Teammates

**Developer teammate**:
```
Teammate tool:
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
    5. Message the code-tester teammate: what changed, what to test
    6. If code-tester reports failures — fix, message them to re-run
    7. If qa-tester teammate reports issues — fix, message them to re-test
    8. If reviewer requests changes — fix, message them to re-review
    9. Mark task complete, check TaskList for next
    10. When done, message the lead

    Stay within files specified in each task. Need docs? Message the lead.
```

**Code-tester teammate** (always spawned):
```
Teammate tool:
  team_name: "dev-team"
  name: "code-tester"
  model: sonnet
  prompt: >
    You are the code tester. Plan: [plan-path] — read Testing Strategy.
    Focus on unit tests, integration tests, and API contracts.

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

**QA-tester teammate** (always spawned):
```
Teammate tool:
  team_name: "dev-team"
  name: "qa-tester"
  model: sonnet
  prompt: >
    You are the QA tester. Plan: [plan-path] — read Testing Strategy.
    You adapt your testing approach based on the task type.

    **For UI/frontend tasks:**
    You test user-facing behavior using agent-browser via Bash. Ask lead if unsure about app URL.

    agent-browser commands (all via `npx agent-browser`):
    - open <url>, snapshot -i, click @ref, fill @ref "text", screenshot, scroll down/up

    1. Read plan for UI expectations
    2. Write Storybook stories for new/changed components (match existing story patterns)
    3. Run Storybook and verify stories render correctly
    4. Open app URL via agent-browser, snapshot to verify page loads
    5. Test user flows: navigation, forms, buttons, error states
    6. Screenshots as evidence for each scenario

    **For non-UI tasks:**
    1. Run integration and smoke tests to verify the change works end-to-end
    2. Verify the change doesn't break existing functionality (regression testing)
    3. Test API contracts and cross-service behavior where applicable
    4. Validate edge cases and error handling

    **Common workflow (all tasks):**
    1. Check TaskList — your task is blocked until implementation completes
    2. Wait for developer to message what changed
    3. Read plan for expectations and acceptance criteria
    4. Execute the appropriate testing mode above
    5. Issues found → message developer with: what failed, expected vs actual, evidence
       Wait for fix, re-test (max 3 cycles, then escalate to lead)
    6. When all checks pass, message lead with results
    7. Mark task complete

    Focus on behavior and correctness — not internal implementation details.
```

**Reviewer teammate**:
```
Teammate tool:
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
6. Message code-tester teammate: "Implementation complete. Files: [list]. Begin testing."
7. Message qa-tester teammate: "Implementation complete. Files changed: [list]. Begin QA testing."
8. Code-tester and qa-tester run in parallel — they test different aspects.
9. Developer teammate↔Code-tester teammate and Developer teammate↔QA-tester teammate iterate directly. Intervene only on escalation.

After all test tasks complete:
10. Message reviewer teammate: "Tests passing. Files: [list]. Begin review."
11. Developer teammate↔Reviewer teammate iterate directly. Intervene only on escalation.

### 7. Final Verification

After APPROVED:
1. Run full test suite
2. Verify build
3. `rg "TODO|FIXME|HACK|XXX|stub" --type-not md`
4. Update plan file to final state

### 8. Cleanup

1. Send each teammate a shutdown request via SendMessage
2. Wait for all teammates to confirm shutdown (they may approve or reject — if rejected, resolve the issue first)
3. Once all teammates have stopped, run TeamDelete to clean up the team

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

## Developer↔Code-Tester Iterations
[Cycle count, key fixes]

## Developer↔QA-Tester Iterations
[Cycle count, issues found, tests written, screenshots taken (if UI)]

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

- Teammates iterate directly — Developer teammate↔Code-tester teammate, Developer teammate↔QA-tester teammate, Developer teammate↔Reviewer teammate
- Researcher is a subagent — Lead relays
- Parallel within waves, sequential between
- Verify between waves
- Don't skip testing or review
- Avoid file conflicts between tasks
- Always cleanup team
- If stuck — ask user, don't loop
