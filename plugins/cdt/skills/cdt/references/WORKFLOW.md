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

## Git Check (all modes)

Before any mode begins, check the current branch:

1. Run `git branch --show-current`
2. If on `main` or `master`:
   - AskUserQuestion: "You're on the main branch. Create a feature branch before starting?"
     Options: Create branch (Recommended) | Continue on main
   - If create: suggest a branch name based on the task (e.g. `feat/rate-limiting`), then `git checkout -b <branch> origin/main`
3. Run `git fetch origin && git pull` to ensure up-to-date

---

## Mode: plan

Produces `.claude/plans/plan-YYYYMMDD-HHMM.md`. Does NOT implement.

### Steps

0. **Git Check** — see above
1. **Generate Timestamp** — `YYYYMMDD-HHMM` format, store as `$TIMESTAMP`
2. **Explore** — Read files, Glob/Grep codebase, identify stack. If ambiguous, ask user.
3. **TeamCreate** "plan-team"
4. **TaskCreate** — "Research libraries" (you via subagent), "Design architecture" (architect), "Validate requirements" (PM, blocked by design)
5. **Spawn all three in parallel:**

**Architect teammate**:
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
    6. Iterate on PM teammate feedback
    7. Mark task complete
```

**PM teammate**:
```
Task tool:
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

6. **Coordinate:**
   - Researcher returns → relay findings to architect teammate
   - Architect teammate needs more docs → spawn another Researcher subagent, relay results
   - Architect teammate shares design → verify against research
   - PM teammate validates → if NEEDS_REVISION, forward to architect teammate (max 2 cycles)
   - Disagreement → you decide based on requirements + research
7. **Write plan** to `.claude/plans/plan-$TIMESTAMP.md` (see Plan Template below)
8. **Cleanup** — send each teammate a shutdown request via SendMessage, wait for all to confirm shutdown (if rejected, resolve the issue first), then once all have stopped, run TeamDelete to clean up the team
9. **Present** — tell the user the plan path, summarize task count, waves, key decisions, risks

---

## Mode: dev

Implements an existing plan file (passed as argument, e.g. `.claude/plans/plan-20260207-1430.md`).

### Steps

0. **Git Check** — see above
1. **Parse plan** — extract tasks, dependencies, waves. Check files-per-task for conflict avoidance.
2. **Generate Timestamp** — `YYYYMMDD-HHMM` format for dev report, store as `$TIMESTAMP`
3. **TeamCreate** "dev-team"
4. **TaskCreate** — one per plan task (preserve `depends_on` via `addBlockedBy`), plus "Test all (code)", "Test all (UX)" (if ux-tester spawned), and "Review all"
5. **Spawn teammates:**

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
    5. Message the code-tester teammate: what changed, what to test
    6. If code-tester reports failures — fix, message them to re-run
    7. If ux-tester teammate exists and reports UX issues — fix, message them to re-test
    8. If reviewer requests changes — fix, message them to re-review
    9. Mark task complete, check TaskList for next
    10. When done, message the lead

    Stay within files specified in each task. Need docs? Message the lead.
```

**Code-tester teammate** (always spawned):
```
Task tool:
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

**UX-tester teammate** (conditional — only spawn when plan involves UI/frontend/user-facing changes):
```
Task tool:
  team_name: "dev-team"
  name: "ux-tester"
  model: sonnet
  prompt: >
    You are the UX tester. Plan: [plan-path] — read Testing Strategy and UI-related tasks.
    You test user-facing behavior using agent-browser via Bash. Ask lead if unsure about app URL.

    agent-browser commands (all via `npx agent-browser`):
    - open <url>, snapshot -i, click @ref, fill @ref "text", screenshot, scroll down/up

    Workflow:
    1. Check TaskList — your task is blocked until implementation completes
    2. Wait for developer to message what changed
    3. Read plan for UI expectations
    4. Write Storybook stories for new/changed components (match existing story patterns)
    5. Run Storybook and verify stories render correctly
    6. Open app URL via agent-browser, snapshot to verify page loads
    7. Test user flows: navigation, forms, buttons, error states
    8. Screenshots as evidence for each scenario
    9. UX issues or broken stories → message developer with: what failed, expected vs actual, screenshot ref
       Wait for fix, re-test (max 3 cycles, then escalate to lead)
    10. When all stories render and UX checks pass, message lead with results + screenshots
    11. Mark task complete

    Focus on what the user sees and does — not internal implementation. Storybook stories are your test artifacts.
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

6. **Execute waves:**
   - Assign tasks to developer teammate (TaskUpdate `owner`)
   - Message developer teammate: "Wave N ready. Tasks: [list]. Context from prior waves: [results]"
   - Monitor TaskList
   - If developer teammate needs docs — spawn Researcher subagent, relay results
   - Verify wave: check build, update plan file (status, log, files_changed)
7. **Code Testing** — message code-tester teammate: "Implementation complete. Files: [list]. Begin testing."
7b. **UX Testing** (conditional) — if ux-tester was spawned, message ux-tester teammate: "Implementation complete. App URL: [url]. Files changed: [list]. Begin UX testing." Code-tester and ux-tester run in parallel.
   Developer teammate↔Code-tester teammate and Developer teammate↔UX-tester teammate iterate directly. Intervene only on escalation.
8. **Review** — after all test tasks complete, message reviewer teammate: "Tests passing. Files: [list]. Begin review." Developer teammate↔Reviewer teammate iterate directly. Intervene only on escalation.
9. **Final verification** — full test suite, build, stub scan (`rg "TODO|FIXME|HACK|XXX|stub" --type-not md`), update plan to final state
10. **Cleanup** — send each teammate a shutdown request via SendMessage, wait for all to confirm shutdown (if rejected, resolve the issue first), then once all have stopped, run TeamDelete to clean up the team
11. **Report** to `.claude/files/dev-report-$TIMESTAMP.md` (see Report Template below)

### Wrap Up

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

---

## Mode: full

Plan → approval gate → dev. One team at a time.

0. **Git Check** — see above
1. Generate timestamp `$TIMESTAMP` in `YYYYMMDD-HHMM` format
2. Execute **plan** mode (steps 1-9)
3. **Ask user:** "Plan ready at .claude/plans/plan-$TIMESTAMP.md. [N] tasks, [M] waves. Key decisions: [summary]. Risks: [summary]." Options: Approve (Recommended) | Revise | Cancel
4. Do NOT proceed without approval. If revisions: update plan, re-present.
5. Execute **dev** mode (steps 1-11), passing plan path from step 2

### Wrap Up

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

---

## Mode: auto

Plan → dev, no approval gate.

0. **Git Check** — see above
1. Generate timestamp `$TIMESTAMP` in `YYYYMMDD-HHMM` format
2. Execute **plan** mode (steps 1-9)
3. Log brief summary to user (task count, waves, key decisions)
4. Execute **dev** mode (steps 1-11), passing plan path from step 2

### Wrap Up (Autonomous)

Automatically finalize without user interaction:
1. Stage all changed files
2. Commit with conventional commit message based on task
3. Push branch to remote
4. Create PR via `gh pr create` with plan summary as description
5. Print PR URL to user

---

## Plan Template

Write to `.claude/plans/plan-$TIMESTAMP.md`:

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
[If UI/frontend work: include UX test scenarios — user flows, interactions, navigation. This signals the Lead to spawn the UX-tester.]

## Risks & Mitigations

## Validation
[PM verdict]
```

## Report Template

Write to `.claude/files/dev-report-$TIMESTAMP.md`:

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

## Developer↔UX-Tester Iterations (if applicable)
[Cycle count, UX issues found, Storybook stories written, screenshots taken]

## Known Limitations
```
