---
name: develop
description: "Use when implementing GitHub issues for skill or plugin development that require TDD-governed phases with baseline testing, iterative implementation, and verify+benchmark loops. Use this whenever the issue involves SKILL.md files, agent prompts, hook scripts, or plugin workflows. Triggers: develop skill, skill dev, plugin develop, develop issue, skill workflow."
allowed-tools:
  - Task
  - Skill
  - Read
  - Write
  - Edit
  - Bash(git:*, gh:*, bun:*)
  - Grep
  - Glob
  - TodoWrite
  - WebFetch
  - AskUserQuestion
user-invocable: true
---

# Skill Developer Workflow

Implement skill development issues through iterative planning, TDD-governed implementation, and review cycles.

## When to Use

- Implementing a GitHub issue that creates or modifies skills, plugins, agents, or hooks
- Issue requires TDD-governed phases (baseline → implement → verify)
- Work involves SKILL.md frontmatter, workflow references, agent prompts, or hook scripts

## When NOT to Use

- General code changes unrelated to skill/plugin authoring
- Quick validation or auditing — use `/plugin-dev` instead
- Scaffolding a new plugin from scratch — use `/plugin-dev:create` instead

## Quick Reference

| Phase | Action | Exit Condition |
|-------|--------|----------------|
| 0. Setup | **MUST** create feature branch | On feature branch (NOT main/master) |
| 1. Context | Read issue + detect skill files | Requirements clear, skill files noted |
| 2. Plan | Draft implementation plan | Plan complete |
| 3-4. Validate | Gemini review loop (max 5) | `APPROVED` status |
| 4.5. Baseline (RED) | TODO: #163 — capture baseline behavior | Baseline saved |
| 5-7. Implement (GREEN) | Write minimal skill addressing failures | All tasks done + criteria met + validation passing |
| 7.5. Verify (REFACTOR) | TODO: #163 — compare against baseline | Benchmark passes or escalated |
| 8-9. Review | Council review (max 3) | `APPROVED` status |
| 10. Finalize | Commit + PR | PR created |
| 11. Cleanup | Clean temps, delete branch | Branch deleted after merge |

## Consultant Scaling

| Change Size | Criteria | Consultants |
|-------------|----------|-------------|
| Trivial | <10 lines, no logic changes | Skip review → Phase 10 |
| Small | 1-2 files, simple logic | gemini-consultant only |
| Medium | 3-5 files, moderate complexity | gemini + codex |
| Large | 6+ files, architectural impact | Full council |

## Skill File Detection

During Phase 1, detect and note these skill-related files for domain-specific handling:
- `SKILL.md` — Skill activation definitions (YAML frontmatter + instructions)
- `references/*.md` — Workflow reference files (e.g., `references/WORKFLOW.md`)
- `agents/*.md` — Agent/subagent definitions
- `hooks/` — Hook definitions and scripts (hooks.json + shell/python scripts)

## Workflow Reference

**Read [references/WORKFLOW.md](references/WORKFLOW.md) now** — it contains the detailed step-by-step procedures for every phase, including TDD extension points, loop limits, and escalation rules. Follow it exactly.
