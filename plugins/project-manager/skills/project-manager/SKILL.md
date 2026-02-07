---
name: project-manager
description: >-
  Interactive issue creation optimized for LLM agent teams. Guides users through
  type-specific question flows (bug, feature, epic, refactor, new project, chore,
  research spike) and produces structured, machine-parseable GitHub issues that
  AI coding agents can execute autonomously. Triggers: create issue, plan work,
  new task, project manager, write ticket, draft issue, plan feature, plan project,
  start project, create ticket, pm.
allowed-tools:
  - Task
  - Read
  - Write
  - Edit
  - Bash(gh:*)
  - Grep
  - Glob
  - AskUserQuestion
  - WebSearch
  - WebFetch
metadata:
  author: claude-pm
  version: "1.0"
---

# Project Manager Skill

Create structured GitHub issues optimized for **LLM agent execution first, human readability second**.

Every issue produced by this skill follows the Agent-Optimized Issue Format — structured sections
with consistent headers, machine-parseable acceptance criteria, explicit file paths, verification
methods, and clear scope boundaries.

## Activation

This skill activates when users want to create work items for an agent team. Recognize these signals:

| Signal | Examples |
|--------|----------|
| Direct | "create an issue", "write a ticket", "plan this work" |
| Implicit | "we need to fix...", "let's add...", "can we refactor..." |
| Shorthand | "/pm", "project manager", "create task" |

## Core Workflow

```
1. Classify → 2. Discover → 3. Explore Codebase → 4. Draft → 5. Review → 6. Create
```

### Step 1: Classify Issue Type

Use `AskUserQuestion` to determine the issue type:

```
Question: "What type of work is this?"
Options:
  - Bug: Something is broken or behaving incorrectly
  - Feature: New functionality or enhancement to existing behavior
  - Epic: Large initiative requiring 3+ coordinated tasks
  - Refactor: Improve code structure without changing behavior
  - New Project: Build something from scratch (includes tech stack decisions)
  - Chore/Research: Maintenance, dependency updates, spikes, investigations
```

If the user's initial message already makes the type obvious (e.g., "there's a crash when..."),
skip this step and classify automatically. State your classification and proceed.

### Step 2: Type-Specific Discovery

Run the question flow for the classified type. See [references/WORKFLOWS.md](references/WORKFLOWS.md).

**Key principles:**
- Use `AskUserQuestion` for structured choices (max 4 questions per call, 2-4 options each)
- Use follow-up conversation for open-ended details
- Batch related questions together to minimize round-trips
- If user says "you decide" or similar, make a reasonable choice and note it as `[AGENT-DECIDED: rationale]`
- Mark gaps as `[NEEDS CLARIFICATION: question]` — don't guess on ambiguous requirements

### Step 3: Codebase Exploration

Before drafting, explore the codebase to enrich the issue with concrete details:

- **Find relevant files**: Use `Glob` and `Grep` to identify files that will need modification
- **Understand current patterns**: Read existing code to align implementation hints with actual architecture
- **Check for related work**: Search for TODOs, existing tests, related components
- **Verify assumptions**: Confirm that proposed changes don't conflict with existing code

This step is critical — agents executing the issue will perform better with accurate file paths
and pattern-aware implementation hints.

### Step 4: Draft the Issue

Use the appropriate template from [references/TEMPLATES.md](references/TEMPLATES.md).

**Agent-first formatting rules:**

1. **Sections are contracts** — every section header means something. Agents parse them.
2. **Acceptance criteria are tests** — write them as verifiable assertions: `VERIFY: [condition]`
3. **File paths are absolute from repo root** — `src/auth/login.ts`, not "the login file"
4. **Approach is sequential** — numbered steps an agent follows linearly
5. **Scope is explicit** — "In Scope" and "Out of Scope" prevent agents from over-engineering
6. **Dependencies are linked** — `Blocked by: #N` and `Blocks: #N`
7. **Constraints are non-negotiable** — performance targets, backwards compatibility, etc.

Write the draft to a temp file: `/tmp/issue-body.md`

### Step 5: Review

Present the draft to the user with a summary:
- Title
- Type and labels
- Key acceptance criteria
- File scope

Ask: "Ready to create this issue, or want to adjust anything?"

For epics: also present the sub-issue breakdown before creating.

### Step 6: Create

```bash
gh issue create --repo OWNER/REPO \
  --title "<type-prefix>: <description>" \
  --body-file /tmp/issue-body.md \
  --label "<type-label>"
```

**Title prefixes by type:**
| Type | Prefix | Label |
|------|--------|-------|
| Bug | `fix:` | `bug` |
| Feature | `feat:` | `enhancement` |
| Epic | `epic:` | `epic` |
| Refactor | `refactor:` | `refactor` |
| New Project | `project:` | `project` |
| Chore | `chore:` | `chore` |
| Research | `spike:` | `research` |

**On failure:** Save draft to `/tmp/issue-draft-{timestamp}.md`, report error.

For epics: create the parent issue first, then sub-issues with `Part of #EPIC_NUMBER` references.

Report all created issue URLs to the user.

## Quality Checklist

Before creating any issue, verify:

- [ ] Title is concise and action-oriented (imperative mood)
- [ ] Acceptance criteria are testable — not vague ("improve performance" → "response time < 200ms")
- [ ] Implementation hints reference real files found via codebase exploration
- [ ] Scope boundaries are explicit (In/Out of Scope sections)
- [ ] Dependencies are identified and linked
- [ ] No external context required — issue is self-contained
- [ ] Uncertainty is marked with `[NEEDS CLARIFICATION: ...]`
- [ ] Agent-decided items are marked with `[AGENT-DECIDED: rationale]`

## Duplicate Check

Before creating, always search for existing issues:

```bash
gh issue list --search "keywords" --state all --limit 10
```

If similar issue exists → inform user, suggest linking instead of duplicating.

## Repo Detection

Detect the current repo automatically:

```bash
gh repo view --json nameWithOwner -q .nameWithOwner
```

If not in a git repo or no remote → ask user for the target repo.

## Templates & Workflows

- [references/WORKFLOWS.md](references/WORKFLOWS.md) — Type-specific question flows
- [references/TEMPLATES.md](references/TEMPLATES.md) — Agent-optimized issue templates
