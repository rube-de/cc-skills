---
allowed-tools: [Read, Grep, Glob, Bash, Task, Teammate, TaskCreate, TaskUpdate, TaskList, TaskGet, Write, Edit, AskUserQuestion, TeamCreate, SendMessage, TeamDelete]
description: "Create an agent team for autonomous workflow: plan (Architect teammate + PM teammate) → develop (Developer teammate + Code-tester teammate + QA-tester teammate + Reviewer teammate) → report (no approval gate)"
---

> **ROLE: Coordinator only.** You do NOT edit source code or test files. You delegate all implementation, testing, and review to teammates. You may only edit plan files, reports, ADRs, and config files.

# /auto-task — Autonomous Workflow

**Target:** $ARGUMENTS

Two-phase orchestration like `/cdt:full-task`, but without a user approval gate. Plan team runs, cleans up, then dev team starts immediately.

```
Phase 1: plan-team               Phase 2: dev-team
┌──────────────────────┐         ┌───────────────────────────┐
│  Lead (You)          │         │  Lead (You)               │
│  ├── architect  [tm] │ plan.md │  ├── developer   [tm]     │
│  ├── prod-mgr   [tm] │──────→ │  ├── code-tester [tm]     │
│  └── researcher [sa] │         │  ├── qa-tester   [tm]     │
└──────────────────────┘         │  ├── reviewer    [tm]     │
                                 │  └── researcher  [sa]     │
                                 └───────────────────────────┘
```

`[tm]` = teammate (Agent Team)  `[sa]` = subagent

## Step 0: Git Check

1. Run `git fetch origin`
2. Ensure you are on `main` or `master` — if not, run `git checkout main` (or `master`, whichever exists)
3. Suggest a branch name based on the task (e.g. `feat/rate-limiting`)
4. Run `git checkout -b <branch> origin/<default-branch>` to create the feature branch from the latest remote default branch
5. Run `git pull` to ensure up-to-date

## Phase 1: Planning

Follow the planning workflow defined in @plan-workflow.md (skip Step 0 — Git Check was already done above). plan-workflow.md generates its own `$TIMESTAMP` for the plan path.

## Bridge

Log a brief summary of the plan to the user (task count, waves, key decisions), then proceed directly to development.

## Phase 2: Development

Follow the development workflow defined in @dev-workflow.md using the plan path from Phase 1 (skip Step 0 — Git Check was already done above). dev-workflow.md generates its own timestamp for the dev report.

## Wrap Up (Autonomous)

Automatically finalize without user interaction:
1. Stage all changed files
2. Commit with conventional commit message based on task
3. Push branch to remote
4. Create PR via `gh pr create` with plan summary as description. Derive `BRANCH=$(git branch --show-current | tr '/' '-')`; if `".claude/$BRANCH/.cdt-issue"` exists and is non-empty, read `ISSUE_NO="$(cat ".claude/$BRANCH/.cdt-issue")"` and include `Closes #$ISSUE_NO` in the PR body.
5. After PR creation, if `".claude/$BRANCH/.cdt-scripts-path"` exists, move the issue to "In Review":
   `"$(cat ".claude/$BRANCH/.cdt-scripts-path")/sync-github-issue.sh" review`
6. Clean up branch state: `[ -n "$BRANCH" ] && rm -rf ".claude/$BRANCH"`
7. Print PR URL to user

## Bridge

The plan file is the handoff (Lead carries the path between phases):
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
