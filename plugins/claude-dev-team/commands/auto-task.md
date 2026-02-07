---
allowed-tools: [Read, Grep, Glob, Bash, Task, TaskCreate, TaskUpdate, TaskList, TaskGet, Write, Edit, AskUserQuestion, TeamCreate, SendMessage, TeamDelete]
description: "Autonomous workflow: plan → develop → test → review → report (no approval gate)"
---

# /auto-task — Autonomous Workflow

**Target:** $ARGUMENTS

Two-phase orchestration like `/full-task`, but without a user approval gate. Plan team runs, cleans up, then dev team starts immediately.

```
Phase 1: plan-team               Phase 2: dev-team
┌──────────────────────┐         ┌──────────────────────┐
│  Lead (You)          │         │  Lead (You)          │
│  ├── architect  [tm] │ plan.md │  ├── developer  [tm] │
│  ├── prod-mgr   [tm] │──────→ │  ├── tester     [tm] │
│  └── researcher [sa] │         │  ├── reviewer   [tm] │
└──────────────────────┘         │  └── researcher [sa] │
                                 └──────────────────────┘
```

`[tm]` = teammate (Agent Team)  `[sa]` = subagent

## Phase 1: Planning

Execute `/plan-task` workflow:
1. Explore codebase
2. TeamCreate "plan-team"
3. Spawn architect + PM as teammates, researcher as subagent
4. Coordinate: relay research, facilitate Architect↔PM debate
5. Synthesize into plan
6. Save `.claude/plans/plan.md`
7. Shutdown teammates, TeamDelete

## Bridge

Log a brief summary of the plan to the user (task count, waves, key decisions), then proceed directly to development.

## Phase 2: Development

Execute `/dev-task` workflow:
1. TeamCreate "dev-team"
2. Parse plan, create tasks with dependencies
3. Spawn developer + tester + reviewer as teammates
4. Execute waves, assign to developer
5. After impl: activate tester (Dev↔Tester iterate via messaging)
6. After tests: activate reviewer (Dev↔Reviewer iterate via messaging)
7. Final verification: build, tests, stub scan
8. Shutdown teammates, TeamDelete
9. Report to `.claude/files/dev-report.md`

## Bridge

`.claude/plans/plan.md` is the handoff:
- Phase 1 writes it (architecture, tasks, research)
- Phase 2 reads and updates it (status, logs, files)
- Lead's context spans both phases; teammate context does not

## Rules

- One team at a time — cleanup before next
- Plan is single source of truth
- Researcher is always a subagent
- All other roles are teammates
- Quality gates mandatory (test + review)
- If blocked — ask user
