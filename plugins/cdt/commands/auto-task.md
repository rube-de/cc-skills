---
allowed-tools: [Read, Grep, Glob, Bash, Task, Teammate, TaskCreate, TaskUpdate, TaskList, TaskGet, Write, Edit, AskUserQuestion, TeamCreate, SendMessage, TeamDelete]
description: "Create an agent team for autonomous workflow: plan (Architect teammate + PM teammate) → develop (Developer teammate + Code-tester teammate + QA-tester teammate + Reviewer teammate) → report (no approval gate)"
---

> **ROLE: Coordinator only.**
> You MUST NOT use Edit, Write, or NotebookEdit tools on source code, test files, or project docs.
> All implementation, testing, review, and documentation MUST be delegated to teammates via SendMessage.
> If you find yourself about to edit a file, STOP and delegate to the appropriate teammate instead.
> You verify plan/report artifacts written by teammates.

# /auto-task — Autonomous Workflow

**Target:** $ARGUMENTS

Two-phase orchestration like `/cdt:full-task`, but without a user approval gate. Plan team runs, cleans up, then dev team starts immediately.

```text
Phase 1: plan-team                    Phase 2: dev-team
┌───────────────────────────┐         ┌───────────────────────────┐
│  Lead (You)               │         │  Lead (You)               │
│  ├── architect       [tm] │ plan.md │  ├── developer   [tm]     │
│  ├── product-manager [tm] │──────→  │  ├── code-tester [tm]     │
│  └── researcher      [sa] │         │  ├── qa-tester   [tm]     │
└───────────────────────────┘         │  ├── reviewer    [tm]     │
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

## Step 0.5: Workflow Declaration

Print to the user before proceeding:

```
Workflow: auto-task
 Phase 1 — Planning: architect [tm], product-manager [tm], researcher [sa]
 Phase 2 — Development: developer [tm], code-tester [tm], qa-tester [tm], reviewer [tm], researcher [sa]
 Coordinator role: orchestration only — no direct file edits
```

## Phase 1: Planning

Follow the planning workflow defined in @plan-workflow.md (skip Step 0 — Git Check was already done above). plan-workflow.md generates its own `$TIMESTAMP` for the plan path.

## Phase 1: Completion Audit

Before proceeding, log which roles were actually used during Phase 1:

```
Phase 1 complete:
 - architect  [tm]: [used / NOT USED]
 - product-manager [tm]: [used / NOT USED]
 - researcher      [sa]: [used / NOT USED]
```

Determine "used" by whether you sent at least one `SendMessage` (teammates) or launched at least one `Task` subagent (researcher) during Phase 1.

If any role was created but never used: **WARN** "Role {name} was created but never used in Phase 1"

## Bridge

Log a brief summary of the plan to the user (task count, waves, key decisions), then proceed directly to development.

## Phase 2: Development

Follow the development workflow defined in @dev-workflow.md using the plan path from Phase 1 (skip Step 0 — Git Check was already done above). dev-workflow.md generates its own timestamp for the dev report.

## Phase 2: Completion Audit

Before proceeding to wrap-up, log which roles were actually used during Phase 2:

```
Phase 2 complete:
 - developer   [tm]: [used / NOT USED]
 - code-tester [tm]: [used / NOT USED]
 - qa-tester   [tm]: [used / NOT USED]
 - reviewer    [tm]: [used / NOT USED]
 - researcher  [sa]: [used / NOT USED]
```

Determine "used" by whether you sent at least one `SendMessage` (teammates) or launched at least one `Task` subagent (researcher) during Phase 2.

If any role was created but never used: **WARN** "Role {name} was created but never used in Phase 2"

## Wrap Up (Autonomous)

Automatically finalize without user interaction:
1. Stage all changed files
2. Commit with conventional commit message based on task
3. Push branch to remote
4. Create PR via `gh pr create` with plan summary as description. Derive `BRANCH=$(git branch --show-current | tr '/' '-')`; if `".claude/$BRANCH/.cdt-issue"` exists and is non-empty, read `ISSUE_NO="$(cat ".claude/$BRANCH/.cdt-issue")"`; validate ISSUE_NO is numeric (digits only), then include `Closes #$ISSUE_NO` in the PR body.
5. After PR creation, if `".claude/$BRANCH/.cdt-scripts-path"` exists, move the issue to "In Review":
   `"$(cat ".claude/$BRANCH/.cdt-scripts-path")/sync-github-issue.sh" review`
6. Clean up branch state: `[ -n "$BRANCH" ] && rm -rf ".claude/$BRANCH"`
7. Print PR URL to user

## Bridge

The plan file is the handoff (Lead carries the path between phases):
- Phase 1: architect teammate writes it (architecture, tasks, research)
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
