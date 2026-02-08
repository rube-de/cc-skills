---
allowed-tools: [Read, Grep, Glob, Bash, Task, Teammate, TaskCreate, TaskUpdate, TaskList, TaskGet, Write, Edit, AskUserQuestion, TeamCreate, SendMessage, TeamDelete]
description: "Create an agent team for autonomous workflow: plan (Architect teammate + PM teammate) → develop (Developer teammate + Code-tester teammate + optional UX-tester teammate + Reviewer teammate) → report (no approval gate)"
---

# /auto-task — Autonomous Workflow

**Target:** $ARGUMENTS

Two-phase orchestration like `/cdt:full-task`, but without a user approval gate. Plan team runs, cleans up, then dev team starts immediately.

```
Phase 1: plan-team               Phase 2: dev-team
┌──────────────────────┐         ┌───────────────────────────┐
│  Lead (You)          │         │  Lead (You)               │
│  ├── architect  [tm] │ plan.md │  ├── developer   [tm]     │
│  ├── prod-mgr   [tm] │──────→ │  ├── code-tester [tm]     │
│  └── researcher [sa] │         │  ├── ux-tester   [tm?]    │
└──────────────────────┘         │  ├── reviewer    [tm]     │
                                 │  └── researcher  [sa]     │
                                 └───────────────────────────┘
```

`[tm]` = teammate (Agent Team)  `[sa]` = subagent

## Step 0: Git Check

1. Run `git branch --show-current`
2. If on `main` or `master`:
   - AskUserQuestion: "You're on the main branch. Create a feature branch before starting?"
     Options: Create branch (Recommended) | Continue on main
   - If create: suggest a branch name based on the task (e.g. `feat/rate-limiting`), then `git checkout -b <branch> origin/main`
3. Run `git fetch origin && git pull` to ensure up-to-date

## Phase 1: Planning

Generate a timestamp `$TIMESTAMP` in `YYYYMMDD-HHMM` format at the start.

Execute `/cdt:plan-task` workflow:
1. Explore codebase
2. TeamCreate "plan-team"
3. Spawn architect teammate + PM teammate, researcher as subagent
4. Coordinate: relay research, facilitate architect teammate↔PM teammate debate
5. Synthesize into plan
6. Save `.claude/plans/plan-$TIMESTAMP.md`
7. Shutdown teammates, TeamDelete

## Bridge

Log a brief summary of the plan to the user (task count, waves, key decisions), then proceed directly to development.

## Phase 2: Development

Execute `/cdt:dev-task` workflow using the plan path from Phase 1:
1. TeamCreate "dev-team"
2. Parse plan, create tasks with dependencies
3. Spawn developer teammate + code-tester teammate + reviewer teammate (+ ux-tester teammate if plan involves UI)
4. Execute waves, assign to developer teammate
5. After impl: activate code-tester teammate (+ ux-tester if spawned). Both run in parallel.
6. After tests: activate reviewer teammate (Developer teammate↔Reviewer teammate iterate via messaging)
7. Final verification: build, tests, stub scan
8. Shutdown teammates, TeamDelete
9. Report to `.claude/files/dev-report-$TIMESTAMP.md` (use same or new timestamp)

## Wrap Up (Autonomous)

Automatically finalize without user interaction:
1. Stage all changed files
2. Commit with conventional commit message based on task
3. Push branch to remote
4. Create PR via `gh pr create` with plan summary as description
5. Print PR URL to user

## Bridge

`.claude/plans/plan-$TIMESTAMP.md` is the handoff:
- Phase 1 writes it (architecture, tasks, research)
- Phase 2 reads and updates it (status, logs, files)
- Lead's context spans both phases; teammate context does not
- Lead carries the plan path from Phase 1 → Phase 2

## Rules

- One team at a time — cleanup before next
- Plan is single source of truth
- Researcher is always a subagent
- All other roles are teammates
- Quality gates mandatory (test + review)
- If blocked — ask user
