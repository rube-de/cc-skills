# Plan Workflow

Detailed execution steps for the planning phase. The Lead reads this before running plan mode.

## 0. Git Check

1. Run `git fetch origin`
2. Ensure you are on `main` or `master` — if not, run `git checkout main` (or `master`, whichever exists)
3. Suggest a branch name based on the task (e.g. `feat/rate-limiting`)
4. Run `git checkout -b <branch> origin/<default-branch>` to create the feature branch from the latest remote default branch
5. Run `git pull` to ensure up-to-date

## 0a. Issue Detection

**Branch-scoped state**: CDT state lives in `.claude/<branch-slug>/` where `<branch-slug>` is the current branch with `/` replaced by `-`. Derive with: `BRANCH=$(git branch --show-current | tr '/' '-')`; if empty (detached HEAD), checkout a branch before proceeding.

If `$ARGUMENTS` contains a GitHub issue reference (`#N`, `#N description`, or `https://github.com/OWNER/REPO/issues/N`):

1. Extract the issue number (digits only) and store it in `$ISSUE_NUM`
2. Write: `mkdir -p ".claude/$BRANCH" && echo "$ISSUE_NUM" > ".claude/$BRANCH/.cdt-issue"`
3. Fetch issue context: `gh issue view "$ISSUE_NUM" --json title,body,labels,assignees`
4. Use the issue title and body as additional context for planning

The team creation hook will attempt to assign the issue and move it to "In Progress" in GitHub Projects (best-effort — may no-op if no project item exists or permissions are insufficient).

If no issue reference is found, skip this step.

## 1. Generate Timestamp

Generate a timestamp in `YYYYMMDD-HHMM` format (e.g. `20260207-1430`). Use this for the plan output path. Store as `$TIMESTAMP`.

## 2. Orient

Read project context files (`CLAUDE.md`, `AGENTS.md`) to understand conventions and stack.
If requirements are ambiguous — ask the user via AskUserQuestion with recommendations.

Do NOT explore the codebase with Glob/Grep — that is the architect's job in Step 5.

## 3. Create Team

```
TeamCreate: team_name "plan-team"
```

## 4. Create Tasks

TaskCreate:
1. "Research libraries and patterns" — you handle via Researcher subagent
2. "Design architecture" — for Architect
3. "Validate requirements" — for PM (blocked by #2)

## 5. Launch (parallel)

Spawn all three simultaneously:

**Architect teammate** (substitute `[plan-path]` → `.claude/plans/plan-$TIMESTAMP.md` from Step 1):
```
Teammate tool:
  team_name: "plan-team"
  name: "architect"
  model: opus
  prompt: >
    You are the architect. Design the architecture for: [task]

    Codebase: [path]. Constraints: [any].

    1. Check TaskList, claim your task
    2. **Discover**: Use the Explore agent to survey the codebase — identify stack, patterns, conventions, and all relevant files. Use repomix-explorer (if available) for large or unfamiliar codebases to get a structural overview.
    3. **Target**: Use Glob, Grep, and Read to drill into specific files and patterns identified during discovery
    4. Read all files in `docs/adrs/` (if the directory exists) to understand prior architecture decisions before designing
    5. If you need library docs, message the lead
    6. Design: components, interfaces, file changes, data flow, testing strategy
    7. Write new Architecture Decision Records (ADRs) to `docs/adrs/adr-NNNN-<slug>.md` for each significant decision:
       - Format: title, status (proposed/accepted/rejected/superseded), context, decision, consequences
       - Number sequentially from existing ADRs (start at 0001 if none exist)
       - When a new decision supersedes an old one, update the old ADR's status to `superseded` and link to the new ADR
       - Reference existing ADRs when relevant (e.g., "per ADR-0003, we use Redis for caching")
    8. Check if `docs/adrs/` is referenced in the target project's `AGENTS.md` or `CLAUDE.md` — if not, note a documentation-update task in the plan so the developer teammate can add the reference later
    9. Message your design to the lead AND the product-manager (include links to new and referenced ADRs)
    10. Iterate on PM teammate feedback
    11. Ensure the plan directory exists (`mkdir -p .claude/plans`), then write the plan to [plan-path] using this template:

        # Plan: [Task Name]

        **Generated**: [Date]  **Target**: [Original request]

        ## Overview
        [Architecture, key decisions, research findings — 2-3 paragraphs]

        ## Architecture

        ### Component Design
        [Per component: purpose, interface, dependencies]

        ### File Changes
        | File | Action | Description |
        |------|--------|-------------|

        ### Data Flow
        [How data moves through the system]

        ## Architecture Decision Records
        [Link to each ADR created or referenced during planning]
        - [ADR-NNNN: Title](docs/adrs/adr-NNNN-slug.md) — status

        ## Research Findings
        [Library versions, APIs, code examples, pitfalls]

        ## Tasks

        ### T1: [Name]
        - **depends_on**: []
        - **location**: [file paths]
        - **description**: [specific and actionable]
        - **validation**: [how to verify]
        - **status**: Not Started
        - **log**:
        - **files_changed**:

        ### T2: [Name]
        - **depends_on**: [T1]
        ...

        ## Execution Waves
        | Wave | Tasks | Starts When |
        |------|-------|-------------|

        ## Testing Strategy
        [Framework, scenarios, acceptance criteria]
        [Include QA test scenarios: integration/smoke tests for non-UI tasks; user flows, interactions, navigation, and Storybook stories for UI tasks.]

        ## Risks & Mitigations

        ## Validation
        [PM verdict]

    12. Message the lead and product-manager that the plan is ready at [plan-path]
    13. Mark task complete
```

**PM teammate**:
```
Teammate tool:
  team_name: "plan-team"
  name: "product-manager"
  model: sonnet
  prompt: >
    You are the PM. Requirements: [task description]

    1. Check TaskList — your task is blocked until the architect finishes
    2. When the architect teammate messages you their design, validate against requirements
    3. Message the architect teammate directly with concerns
    4. Produce validation report: APPROVED or NEEDS_REVISION with specifics
    5. Share report with the lead
    6. Mark task complete
```

**Researcher** subagent (no team_name):
```
Task tool:
  subagent_type: "researcher"
  prompt: >
    Research for: [task]. Look up: [libraries], [patterns], [APIs].
    Stack: [detected]. Return structured findings with code examples.
```

## 6. Coordinate

1. **When Researcher returns** — SendMessage findings to architect teammate
2. **When architect teammate needs docs** — spawn another Researcher subagent, relay results
3. **When architect teammate shares design** — verify it aligns with research findings, confirm the plan file path was communicated
4. **When PM teammate validates** — if NEEDS_REVISION, architect revises their design directly (max 2 cycles)
5. **If they disagree** — you decide based on requirements + research

## 7. Verify Plan

The architect teammate writes the plan file. Your role is to verify it exists and is complete.

1. Confirm the plan file exists at `.claude/plans/plan-$TIMESTAMP.md`
2. Read the plan file — verify it follows the template below
3. Verify the PM verdict is included in the Validation section
4. If incomplete, message the architect teammate to fix it

### Plan Template (architect references this)

```markdown
# Plan: [Task Name]

**Generated**: [Date]  **Target**: [Original request]

## Overview
[Architecture, key decisions, research findings — 2-3 paragraphs]

## Architecture

### Component Design
[Per component: purpose, interface, dependencies]

### File Changes
| File | Action | Description |
|------|--------|-------------|

### Data Flow
[How data moves through the system]

## Architecture Decision Records
[Link to each ADR created or referenced during planning]
- [ADR-NNNN: Title](docs/adrs/adr-NNNN-slug.md) — status

## Research Findings
[Library versions, APIs, code examples, pitfalls]

## Tasks

### T1: [Name]
- **depends_on**: []
- **location**: [file paths]
- **description**: [specific and actionable]
- **validation**: [how to verify]
- **status**: Not Started
- **log**:
- **files_changed**:

### T2: [Name]
- **depends_on**: [T1]
...

## Execution Waves
| Wave | Tasks | Starts When |
|------|-------|-------------|

## Testing Strategy
[Framework, scenarios, acceptance criteria]
[Include QA test scenarios: integration/smoke tests for non-UI tasks; user flows, interactions, navigation, and Storybook stories for UI tasks.]

## Risks & Mitigations

## Validation
[PM verdict]
```

## 8. Cleanup

1. Send each teammate a shutdown request via SendMessage
2. Wait for all teammates to confirm shutdown (they may approve or reject — if rejected, resolve the issue first)
3. Once all teammates have stopped, run TeamDelete to clean up the team

> **State lifecycle**: TeamDelete removes `.cdt-team-active` only. The `.cdt-issue` and `.cdt-scripts-path` files persist in `.claude/$BRANCH/` for the dev phase and Wrap Up. The full branch directory is cleaned up during the command-level Wrap Up (`/full-task`, `/auto-task`).

## 9. Present

Tell the user the plan path: `.claude/plans/plan-$TIMESTAMP.md`

Summarize: task count, waves, key decisions, risks.

## Anti-Patterns (Lead MUST avoid)

- Designing architecture yourself instead of delegating to architect teammate
- Writing ADRs yourself instead of having the architect teammate write them
- Validating requirements yourself instead of delegating to PM teammate
- Resolving architect↔PM disagreements by implementing your own design
- Exploring the codebase yourself (Explore agent, repomix-explorer, Glob/Grep/Read on source files) instead of delegating to architect teammate
- Writing the plan file yourself instead of having the architect teammate write it

## Rules

- Architect teammate + PM teammate debate directly
- Researcher is a subagent — Lead relays results
- Architect writes plan to disk — Lead verifies, handoff artifact for `/cdt:dev-task`
- Every task declares `depends_on`
- Always cleanup the team before finishing
- Do NOT implement — only plan
