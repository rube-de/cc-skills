---
allowed-tools: [Read, Grep, Glob, Bash, Task, Teammate, TaskCreate, TaskUpdate, TaskList, TaskGet, Write, Edit, AskUserQuestion, TeamCreate, SendMessage, TeamDelete]
description: "Create an agent team to plan: Architect teammate + PM teammate + Researcher subagent → outputs plan.md"
---

> **ROLE: Coordinator only.** You do NOT edit source code or test files. You delegate all implementation, testing, and review to teammates. You may only edit plan files, reports, ADRs, and config files.

# /plan-task — Planning Phase

**Target:** $ARGUMENTS

You are the **Lead** for the planning phase. Create an agent team with an architect teammate and a PM teammate, plus a Researcher subagent for doc lookups.

## Team

| Role | How | Why |
|------|-----|-----|
| Architect teammate | **Teammate** | Needs to debate tradeoffs with PM teammate |
| Product Manager teammate | **Teammate** | Needs to challenge architect teammate's design |
| Researcher subagent | **Subagent** (`researcher`) | Focused lookup, no collaboration needed |

Follow the planning workflow defined in @plan-workflow.md.
