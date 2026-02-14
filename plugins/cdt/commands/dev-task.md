---
allowed-tools: [Read, Grep, Glob, Bash, Task, Teammate, TaskCreate, TaskUpdate, TaskList, TaskGet, Write, Edit, AskUserQuestion, TeamCreate, SendMessage, TeamDelete]
description: "Create an agent team to develop: Developer teammate + Code-tester teammate + QA-tester teammate + Reviewer teammate + Researcher subagent → implements .claude/plans/plan-$TIMESTAMP.md in waves"
---

> **ROLE: Coordinator only.** You do NOT edit source code, test files, or project docs. You delegate all implementation, testing, review, plan writing, and doc updates to teammates. You verify plan/report artifacts written by teammates.

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

Follow the development workflow defined in @dev-workflow.md.
