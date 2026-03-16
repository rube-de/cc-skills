---
allowed-tools: [Task, Skill, Read, Write, Edit, Bash, Grep, Glob, TodoWrite, WebFetch, AskUserQuestion]
description: "Implement skill development issues with TDD-governed workflow"
---

# /plugin-dev:develop — Skill Developer Workflow

Implement a GitHub issue for skill development using the skill-developer workflow.

## Usage

```text
/plugin-dev:develop #160
/plugin-dev:develop owner/repo#160
```

## Behavior

This command activates the `develop` skill which runs the full skill-developer workflow:

```text
setup → context → plan → validate → [baseline] → implement → [verify] → review → finalize
```

### Core Phases
- **Phase 0:** Setup — create feature branch
- **Phase 1:** Context — read issue, detect skill files
- **Phase 2:** Plan — draft implementation plan
- **Phase 3-4:** Validate — Gemini review loop
- **Phase 5-7:** Implement — write code, verify criteria
- **Phase 8-9:** Review — council review
- **Phase 10:** Finalize — commit, push, create PR
- **Phase 11:** Cleanup — clean temps

### TDD Extension Points (planned — see #163)
- **Phase 4.5 (RED):** Baseline capture — run test prompts without skill changes (currently skipped)
- **Phase 5-7 (GREEN):** Implementation constrained by baseline failures (active when baseline exists)
- **Phase 7.5 (REFACTOR):** Verify + benchmark — compare against baseline, iterate on loopholes (currently skipped)

## First Action

1. Parse `$ARGUMENTS` as the GitHub issue reference
2. Read `skills/develop/SKILL.md` to load the skill activation context
3. Read `skills/develop/references/WORKFLOW.md` and follow it phase-by-phase, using the parsed issue reference as `${ISSUE_NUM}`

## Arguments

- `$ARGUMENTS` — GitHub issue reference in any format: `#123`, `owner/repo#123`, or issue URL

## Skill File Detection

The workflow automatically detects skill-related files for domain-specific handling:
- `SKILL.md` — Skill activation definitions
- `references/*.md` — Workflow reference files (e.g., `references/WORKFLOW.md`)
- `agents/*.md` — Agent/subagent definitions
- `hooks/` — Hook definitions and scripts
