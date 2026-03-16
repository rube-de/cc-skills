---
name: develop
description: "Use when implementing GitHub issues for skill or plugin development through TDD-governed phases with iterative planning, implementation, and review loops. Baseline testing and verify+benchmark phases are planned extensions (see #163). Use this whenever the issue involves SKILL.md files, agent prompts, hook scripts, or plugin workflows."
allowed-tools:
  - Task
  - Skill
  - Read
  - Write
  - Edit
  - "Bash(git:*)"
  - "Bash(gh:*)"
  - "Bash(bun:*)"
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
| 4.5. Baseline (RED) | TODO: #163 — capture baseline behavior | Baseline captured (or skipped pending #163) |
| 5-7. Implement (GREEN) | Write minimal skill addressing failures | All tasks done + criteria met + tests passing + validation passing |
| 7.5. Verify (REFACTOR) | TODO: #163 — compare against baseline | Benchmark passes (or skipped pending #163) or escalated |
| 8-9. Review | Council review (max 3) | `APPROVED` status |
| 10. Finalize | Commit + PR | PR created |
| 11. Cleanup | Clean temps, delete branch | Branch deleted after merge |

## Consultant Scaling

| Change Size | Criteria | Consultants |
|-------------|----------|-------------|
| Trivial | <10 lines, no logic changes | Skip review → Phase 10 |
| Small | 1-2 files, simple logic | council:gemini-consultant only |
| Medium | 3-5 files, moderate complexity | council:gemini-consultant + council:codex-consultant |
| Large | 6+ files, architectural impact | `/council` skill |

## Skill File Detection

During Phase 1, detect and note these skill-related files for domain-specific handling:
- `SKILL.md` — Skill activation definitions (YAML frontmatter + instructions)
- `references/*.md` — Workflow reference files (e.g., `references/WORKFLOW.md`)
- `agents/*.md` — Agent/subagent definitions
- `hooks/hooks.json` — Hook definitions; `hooks/` also contains shell/python scripts

## Triggers

Use this skill when the user says: "develop skill", "skill dev", "plugin develop", "develop issue", "skill workflow", "implement skill issue", "TDD skill development".

## Workflow Reference

**Read [references/WORKFLOW.md](references/WORKFLOW.md) now** — it contains the detailed step-by-step procedures for every phase, including TDD extension points, loop limits, and escalation rules. Follow it exactly.
