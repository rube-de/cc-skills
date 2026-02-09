---
allowed-tools: [Read, Grep, Glob, Bash, Task, Teammate, TaskCreate, TaskUpdate, TaskList, TaskGet, Write, Edit, AskUserQuestion, TeamCreate, SendMessage, TeamDelete]
description: "Create an agent team for full workflow: plan (Architect teammate + PM teammate) → approve → develop (Developer teammate + Code-tester teammate + QA-tester teammate + Reviewer teammate) → report"
---

# /full-task — Complete Workflow

**Target:** $ARGUMENTS

Two-phase orchestration: plan team → user approval → dev team. One team per session, so plan team must be fully cleaned up before dev team starts.

```
Phase 1: plan-team               Phase 2: dev-team
┌──────────────────────┐         ┌───────────────────────────┐
│  Lead (You)          │         │  Lead (You)               │
│  ├── architect  [tm] │ plan.md │  ├── developer   [tm]     │
│  ├── prod-mgr   [tm] │──────→ │  ├── code-tester [tm]     │
│  └── researcher [sa] │         │  ├── qa-tester   [tm]     │
└──────────────────────┘         │  ├── reviewer    [tm]     │
                ▲                │  └── researcher  [sa]     │
         User Approval           └───────────────────────────┘
```

`[tm]` = teammate (Agent Team)  `[sa]` = subagent

## Step 0: Git Check

1. Run `git branch --show-current`
2. If on `main` or `master`:
   - Suggest a branch name based on the task (e.g. `feat/rate-limiting`)
   - Run `git checkout -b <branch> origin/main` to create the feature branch automatically
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

## Gate: User Approval

Present the plan and ask:
```
AskUserQuestion:
  "Plan ready at .claude/plans/plan-$TIMESTAMP.md. [N] tasks, [M] waves. Key decisions: [summary]. Risks: [summary]."
  Options: Approve (Recommended) | Revise | Cancel
```

Do NOT proceed without approval. If revisions: update plan, re-present.

## Phase 2: Development

Execute `/cdt:dev-task` workflow using the plan path from Phase 1:
1. TeamCreate "dev-team"
2. Parse plan, create tasks with dependencies
3. Spawn developer teammate + code-tester teammate + qa-tester teammate + reviewer teammate
4. Execute waves, assign to developer teammate
5. After impl: activate code-tester teammate + qa-tester teammate. Both run in parallel.
6. After tests: activate reviewer teammate (Developer teammate↔Reviewer teammate iterate via messaging)
7. Final verification: build, tests, stub scan
8. Shutdown teammates, TeamDelete
9. Report to `.claude/files/dev-report-$TIMESTAMP.md` (use same or new timestamp)

## Wrap Up

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

## Bridge

`.claude/plans/plan-$TIMESTAMP.md` is the handoff:
- Phase 1 writes it (architecture, tasks, research)
- Phase 2 reads and updates it (status, logs, files)
- Lead's context spans both phases; teammate context does not
- Lead carries the plan path from Phase 1 → Phase 2

## Rules

- Never skip approval gate
- One team at a time — cleanup before next
- Plan is single source of truth
- Researcher is always a subagent
- All other roles are teammates
- Quality gates mandatory (test + review)
- If blocked — ask user
