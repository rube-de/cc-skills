---
allowed-tools: [Read, Grep, Glob, Bash, Task, Teammate, TaskCreate, TaskUpdate, TaskList, TaskGet, Write, Edit, AskUserQuestion, TeamCreate, SendMessage, TeamDelete, Skill]
description: "TDD-driven bugfix workflow: tester writes failing test (RED) → developer fixes (GREEN) → developer refactors (REFACTOR) → reviewer validates. Accepts issue number, description, or both. Auto-creates PR unless --no-pr flag is passed."
---

> **ROLE: Coordinator only.**
> You MUST NOT use Edit, Write, or NotebookEdit tools on source code, test files, or project docs.
> All implementation, testing, review, and documentation MUST be delegated to teammates via SendMessage.
> If you find yourself about to edit a file, STOP and delegate to the appropriate teammate instead.
> You verify artifacts and manage git operations only.

# /bugfix — TDD Bugfix Workflow

**Target:** $ARGUMENTS

Single-phase workflow: assemble bug spec, then run a red-green-refactor cycle with a Developer/Tester/Reviewer triad. No planning phase — the bug issue IS the plan.

```text
bugfix-team
┌───────────────────────────────┐
│  Lead (You)                   │
│  ├── tester     [tm]  RED     │
│  ├── developer  [tm]  GREEN   │
│  ├── reviewer   [tm]  REVIEW  │
│  └── researcher [sa]  on-demand│
└───────────────────────────────┘

Flow: Tester → Developer → Tester → Developer → Tester → Reviewer
      (RED)    (GREEN)    (VERIFY)  (REFACTOR) (VERIFY)  (REVIEW)
```

`[tm]` = teammate (Agent Team)  `[sa]` = subagent

## Step 0: Workflow Declaration

Print to the user before proceeding:

```text
Workflow: bugfix
 Roles: tester [tm], developer [tm], reviewer [tm], researcher [sa]
 Pipeline: RED → GREEN → REFACTOR → REVIEW
 Coordinator role: orchestration only — no direct file edits
 PR: auto (pass --no-pr to commit only)
```

## Execution

Follow the bugfix workflow defined in @bugfix-workflow.md.

## Completion Audit

Before wrap-up, log which roles were actually used:

```text
Bugfix complete:
 - tester     [tm]: [used / NOT USED]
 - developer  [tm]: [used / NOT USED]
 - reviewer   [tm]: [used / NOT USED]
 - researcher [sa]: [used / NOT USED]
```

Determine "used" by whether you sent at least one `SendMessage` (teammates) or launched at least one `Task` subagent (researcher).

If any role was created but never used: **WARN** "Role {name} was created but never used"

## Rules

- One team: `bugfix-team`
- Bug spec is the single source of truth (no plan file)
- Researcher is always a subagent — Lead relays
- All other roles are teammates
- Quality gates mandatory (test + verify + review)
- Sequential pipeline — no parallel execution
- If stuck — abort gracefully and report what was accomplished
- If blocked — ask user, don't loop
