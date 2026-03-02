---
name: pm
description: >-
  Project manager for GitHub issues: create structured issues optimized for LLM
  agent teams, triage and recommend what to work on next, audit and clean up
  stale issues, or deep-validate a single issue against the codebase. Triggers:
  create issue, plan work, new task, project manager, write ticket, draft issue,
  plan feature, plan project, start project, create ticket, review issue, pm.
user-invocable: true
argument-hint: "[next | update | review ISSUE_NUMBER | -quick <description>]"
allowed-tools:
  - Task
  - Skill
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
  version: "2.0"
---

# Project Manager

GitHub issue lifecycle: **create**, **triage**, **audit**, and **review**.

## Sub-Skills

| Skill | Command | Description |
|-------|---------|-------------|
| Create | `/pm` or `/pm -quick <desc>` | Create structured issues optimized for agent execution |
| Next | `/pm:next` | Triage open issues — recommend what to work on next |
| Update | `/pm:update` | Audit open issues — find stale, orphaned, and drift |
| Review | `/pm:review ISSUE_NUMBER` | Deep-validate a single issue against the codebase |

## Usage

```text
/pm                       → Create a new issue (interactive flow)
/pm -quick fix the login  → Create issue with smart defaults
/pm next                  → Triage: recommend next issue to work on
/pm:next                  → Same (alternate syntax)
/pm update                → Audit: find stale/orphaned issues
/pm:update                → Same (alternate syntax)
/pm review 42             → Review: validate issue #42 against codebase
/pm:review 42             → Same (alternate syntax)
```

## Routing

Parse the first argument:

| Argument | Route to |
|----------|----------|
| `next` | `/pm:next` sub-skill |
| `update` | `/pm:update` sub-skill |
| `review` | `/pm:review` sub-skill |
| `-quick [desc]` | Create Issue Workflow (quick mode) below |
| anything else / empty | Create Issue Workflow below |

If routed to a sub-skill, invoke it with `Skill` and pass remaining arguments. Otherwise, continue with the Create Issue Workflow below.

---

## Create Issue Workflow

Create structured GitHub issues optimized for **LLM agent execution first, human readability second**.

Every issue produced by this skill follows the Agent-Optimized Issue Format — structured sections
with consistent headers, machine-parseable acceptance criteria, explicit file paths, verification
methods, and clear scope boundaries.

### Activation

This skill activates when users want to create work items for an agent team. Recognize these signals:

| Signal | Examples |
|--------|----------|
| Direct | "create an issue", "write a ticket", "plan this work" |
| Implicit | "we need to fix...", "let's add...", "can we refactor..." |
| Shorthand | "/pm", "project manager", "create task" |

### Arguments

| Flag | Description |
|------|-------------|
| `-quick` | Quick mode — propose smart defaults instead of blocking on ambiguity |

**Usage:** `/pm -quick add a delete button to user profiles`

Parse the first argument for `-quick`. If present, activate quick mode. Everything after the flag is the task description.

### Core Workflow

```text
1. Classify → 2. Discover → 3. Challenge → 4. Explore Codebase → 5. Draft → 6. Review → 7. Create
```

#### Step 1: Classify Issue Type

Use `AskUserQuestion` to determine the issue type:

```text
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

#### Step 2: Type-Specific Discovery

Run the question flow for the classified type. See [references/WORKFLOWS.md](references/WORKFLOWS.md).

**Key principles:**
- Use `AskUserQuestion` for structured choices (max 4 questions per call, 2-4 options each)
- Use follow-up conversation for open-ended details
- Batch related questions together to minimize round-trips
- If user says "you decide" or similar, make a reasonable choice and note it as `[AGENT-DECIDED: rationale]`
- Mark gaps as `[NEEDS CLARIFICATION: question]` — don't guess on ambiguous requirements
- **Never accept vague requirements.** Before moving to the next step, critically examine every
  requirement for specificity. If a user says "add a button", ask: Where? What states? What action?
  If a user says "fix the bug", ask: What exact behavior? What's expected vs actual? What triggers it?
  Treat every underspecified detail as a blocker.

#### Step 3: Requirements Challenge

After discovery, systematically check for underspecified requirements. See the
**Requirements Challenge Checklist** in [references/WORKFLOWS.md](references/WORKFLOWS.md)
for the full dimension list.

**Default mode (critical):**
1. Analyze gathered requirements against the challenge checklist dimensions
2. Identify every gap — placement, states, behavior, edge cases, error handling, accessibility
3. Use `AskUserQuestion` to probe each gap (batch related questions, max 4 per call)
4. Do NOT proceed to codebase exploration until all critical ambiguities are resolved
5. An agent executing the resulting issue should never need to guess intent

**Quick mode (`-quick`):**
1. Analyze gathered requirements against the same checklist dimensions
2. For each gap, propose a smart default with rationale
3. Present all assumptions in a single summary: "Here's what I'll assume: [list]. Confirm or correct?"
4. Proceed after one confirmation round — only block on truly ambiguous requirements where no
   reasonable default exists
5. Tag every assumed detail in the final issue body with `[AGENT-DECIDED: rationale]`

**Example — "add a delete button to user profiles":**

*Critical mode:*
> I need to clarify several details before drafting:
> - Where on the profile page should the button go? (header actions, settings section, footer)
> - Who can see it? (all users, admins only, own profile only)
> - What happens on click? (immediate delete, confirmation dialog, soft delete)
> - What are the visual states? (default, hover, disabled, loading)
> - What about error handling? (network failure, permission denied)

*Quick mode (`-quick`):*
> Here's what I'll assume — confirm or correct:
> - Placement: profile header action bar, right-aligned
> - Visibility: own profile only, admins on any profile
> - On click: confirmation dialog → soft delete → redirect to home
> - States: default (red outline), hover (red fill), loading (spinner), disabled (greyed, no permission)
> - Errors: toast notification with retry option

#### Step 4: Codebase Exploration

Before drafting, explore the codebase to enrich the issue with concrete details:

1. **Discover**: Use the Explore agent to survey the codebase for structure, conventions, and relevant areas. For large or unfamiliar codebases, use repomix-explorer (if available) to get a structural overview.
2. **Target**: Use `Glob`, `Grep`, and `Read` to drill into specific files identified during discovery — find files that need modification, understand current patterns, check for related work (TODOs, existing tests, related components), and verify that proposed changes don't conflict with existing code.

This step is critical — agents executing the issue will perform better with accurate file paths
and pattern-aware implementation hints.

#### Step 5: Draft the Issue

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

#### Step 6: Review

Present the draft to the user with a summary:
- Title
- Type and labels
- Key acceptance criteria
- File scope

Ask: "Ready to create this issue, or want to adjust anything?"

For epics: also present the sub-issue breakdown before creating.

#### Step 7: Create

**Size label selection** (before creating the issue):

Applies to: Feature, Epic sub-issue, Refactor.
Skips: Epic parent, Bug, Chore, Research.

Determine the size label deterministically from breadth analysis signals already gathered in Step 2:

| Breadth analysis result | Size label |
|-------------------------|------------|
| 0 signals, single subsystem, no structural changes | `size/S` |
| 1 signal OR multiple subsystems (single story) | `size/M` |
| Structural change + feature continuing as single issue | `size/L` |
| Multi-story routed to Epic | No size label on parent; each sub-issue labeled independently |

```bash
gh issue create --repo OWNER/REPO \
  --title "<type-prefix>: <description>" \
  --body-file /tmp/issue-body.md \
  --label "<type-label>,<size-label>"
```

> `<size-label>` is omitted for types that skip sizing (Bug, Epic parent, Chore, Research).

**Title prefixes by type:**
| Type | Prefix | Label | Size? |
|------|--------|-------|-------|
| Bug | `fix:` | `bug` | No |
| Feature | `feat:` | `enhancement` | Yes |
| Epic | `epic:` | `epic` | No (sub-issues: Yes) |
| Refactor | `refactor:` | `refactor` | Yes |
| New Project | `project:` | `project` | No |
| Chore | `chore:` | `chore` | No |
| Research | `spike:` | `research` | No |

**On failure:** Save draft to `/tmp/issue-draft-{timestamp}.md`, report error.
**On success:** Remove the temp file: `rm -f /tmp/issue-body.md`

For epics: create the parent issue first, then sub-issues with `Part of #EPIC_NUMBER` references. Clean up `/tmp/issue-body.md` only after **all** sub-issues are created successfully.

Report all created issue URLs to the user.

### Quality Checklist

Before creating any issue, verify:

- [ ] Title is concise and action-oriented (imperative mood)
- [ ] Acceptance criteria are testable — not vague ("improve performance" → "response time < 200ms")
- [ ] Implementation hints reference real files found via codebase exploration
- [ ] Scope boundaries are explicit (In/Out of Scope sections present and populated)
- [ ] Single story: issue contains exactly one independent user journey (not 2+ bundled stories)
- [ ] Subsystems: Complexity Hint lists the distinct systems touched (Feature/Sub-Issue only)
- [ ] Structural changes: Complexity Hint declares whether structural changes are needed (Feature/Sub-Issue only)
- [ ] Dependencies are identified and linked
- [ ] No external context required — issue is self-contained
- [ ] Uncertainty is marked with `[NEEDS CLARIFICATION: ...]`
- [ ] Agent-decided items are marked with `[AGENT-DECIDED: rationale]`

### Duplicate Check

Before creating, always search for existing issues:

```bash
gh issue list --search "keywords" --state all --limit 10
```

If similar issue exists → inform user, suggest linking instead of duplicating.

### Repo Detection

Detect the current repo automatically:

```bash
gh repo view --json nameWithOwner -q .nameWithOwner
```

If not in a git repo or no remote → ask user for the target repo.

### Templates & Workflows

- [references/WORKFLOWS.md](references/WORKFLOWS.md) — Type-specific question flows
- [references/TEMPLATES.md](references/TEMPLATES.md) — Agent-optimized issue templates
