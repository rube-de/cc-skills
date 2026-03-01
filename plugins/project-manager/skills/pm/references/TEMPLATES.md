# Agent-Optimized Issue Templates

These templates are designed for **LLM agent execution**. Every section is a contract — agents
parse headers to understand structure. Humans benefit from the clarity as a side effect.

## Formatting Rules

1. **`VERIFY:` prefix** — Acceptance criteria that agents must validate after implementation
2. **`AGENT-DECIDED:` tag** — Decisions made by the PM skill when user said "you decide"
3. **`NEEDS CLARIFICATION:` tag** — Gaps that must be resolved before an agent starts work
4. **File paths** — Always relative to repo root: `src/auth/login.ts`
5. **Step ordering** — Implementation steps are numbered and sequential
6. **Scope sections** — Always include both "In Scope" and "Out of Scope"

---

## Bug Report

```markdown
## Context

[1-3 sentences: what's broken, who's affected, and business impact]

**Severity:** P0/P1/P2/P3
**Reproducibility:** Always / Sometimes / Rarely / Unknown
**Regression:** Yes (since [commit/version]) / No / Unknown

## Reproduction Steps

1. [Prerequisite state or setup]
2. [Action that triggers the bug]
3. [Observe: specific error or unexpected behavior]

**Expected:** [What should happen]
**Actual:** [What happens instead]

## Error Output

```
[Paste exact error message, stack trace, or log output]
```

## Root Cause Analysis

**Suspected cause:** [If known, describe the likely root cause]
**Affected component:** [Module/service/layer where the bug likely lives]

## Acceptance Criteria

- [ ] VERIFY: Bug no longer reproducible using the reproduction steps above
- [ ] VERIFY: Regression test added that fails before fix and passes after
- [ ] VERIFY: No existing tests broken by the fix
- [ ] VERIFY: [Any additional type-specific verification]

## Implementation Guide

### Files to Modify
- `path/to/buggy/file.ts` — [what needs to change]
- `path/to/test/file.test.ts` — [regression test to add]

### Approach
1. [Step 1: Identify the exact line/condition causing the issue]
2. [Step 2: Apply the fix]
3. [Step 3: Add regression test]
4. [Step 4: Verify no side effects]

### Constraints
- [Must maintain backwards compatibility with X]
- [Must not degrade performance of Y]

## Scope

### In Scope
- Fix the described bug
- Add regression test

### Out of Scope
- Refactoring surrounding code
- Performance improvements
- Related but separate issues

## Related
- Discovered in: #N (if applicable)
- Related issues: #N
- Blocked by: #N (if applicable)
```

---

## Feature Request

```markdown
## Context

**User Story:** As a [user type], I want to [action] so that [benefit].

[1-2 paragraphs expanding on the problem being solved and why it matters]

## Complexity Hint

> This section is filled by the PM based on requirements analysis. It is a signal for the CDT
> architect during wave planning — not an implementation plan.

**Subsystems touched:** [list the distinct systems/components the requirements mention, e.g. "auth, user profile API, email notifications"]
**Independent stories:** [Count of separable user journeys. Per the quality checklist, this should be 1. If > 1, consider splitting the issue.]
**Structural changes needed:** Yes / No / Unknown — [brief note if yes, e.g. "plugin loader interface must change to support dynamic loading"]
**Scope note:** [any breadth signal detected during PM analysis, or "none detected"]

## Proposed Solution

[High-level description of how this should work — NOT implementation details.
Describe the user-facing behavior, API surface, or interaction model.]

## Acceptance Criteria

- [ ] VERIFY: Given [precondition], when [action], then [expected outcome]
- [ ] VERIFY: Given [precondition], when [action], then [expected outcome]
- [ ] VERIFY: Given [error condition], when [action], then [graceful handling]
- [ ] VERIFY: Tests cover happy path and edge cases listed below
- [ ] VERIFY: [Performance target if applicable: e.g., "response time < 200ms"]

## Edge Cases

- [Edge case 1: description and expected behavior]
- [Edge case 2: description and expected behavior]
- [Edge case 3: description and expected behavior]

## Implementation Guide

### Files to Modify
- `src/path/to/main/file.ts` — [what to add/change]
- `src/path/to/related/file.ts` — [integration point]
- `tests/path/to/test.test.ts` — [tests to add]

### Files to Create
- `src/path/to/new/file.ts` — [purpose]

### Approach
1. [Step 1]
2. [Step 2]
3. [Step 3]

### Patterns to Follow
[Reference existing code patterns in the repo that this feature should be consistent with.
Example: "Follow the pattern in `src/handlers/existing-handler.ts` for request validation."]

### Constraints
- [Backwards compatibility requirements]
- [Performance thresholds]
- [Security requirements]

## Scope

### In Scope
- [Feature component 1]
- [Feature component 2]

### Out of Scope
- [Explicitly excluded item 1]
- [Explicitly excluded item 2]

## Dependencies

- Blocked by: #N (if applicable)
- Blocks: #N (if applicable)
- Requires: [external dependency, e.g., "API endpoint X must exist"]

## Testing Requirements

- [ ] Unit tests for [component/function]
- [ ] Integration tests for [flow/interaction]
- [ ] Edge case tests for: [list from Edge Cases section]
```

---

## Epic

```markdown
# Epic: [Feature Name]

## Vision

[1-2 paragraphs: what this initiative accomplishes and why it matters NOW.
This is the "north star" for all sub-issues — agents reference this to understand the bigger picture.]

## Success Criteria

[How do we know the epic is complete? Measurable outcomes.]

- [ ] VERIFY: [Measurable outcome 1]
- [ ] VERIFY: [Measurable outcome 2]
- [ ] VERIFY: All sub-issues closed and verified

## Task Breakdown

Issues should be completed in this order. Dependencies are explicit.

| # | Sub-issue | Subsystems | Acceptance criteria | Depends on |
|---|-----------|------------|---------------------|------------|
| 1 | [Story title] | [system/component] | [key VERIFY condition] | — |
| 2 | [Story title] | [system/component] | [key VERIFY condition] | #1 |
| 3 | [Story title] | [system/component] | [key VERIFY condition] | #1 |
| 4 | [Story title] | [system/component] | [key VERIFY condition] | #2, #3 |

### Sub-Issues

- [ ] #N: [Task 1 title]
- [ ] #N: [Task 2 title]
- [ ] #N: [Task 3 title]

(Sub-issue numbers filled in after creation)

## Architecture Notes

[High-level technical approach. Diagrams welcome. Keep it brief — details go in sub-issues.]

## Risks

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| [Risk 1] | Low/Med/High | Low/Med/High | [How to mitigate] |

## Dependencies

- External: [Third-party APIs, other teams, infrastructure]
- Internal: Blocked by #N, Blocks #N

## Timeline

- Target: [date, sprint, or milestone]
- Deadline: [hard deadline if any, otherwise "flexible"]

## Stakeholders

- Owner: @username
- Reviewers: @username, @username
```

---

## Sub-Issue (Child of Epic)

```markdown
Part of #EPIC_NUMBER

## Context

[Brief description of this task and how it fits into the parent epic's vision.]

## Complexity Hint

> This section is filled by the PM based on requirements analysis. It is a signal for the CDT
> architect during wave planning — not an implementation plan.

**Subsystems touched:** [list the distinct systems/components the requirements mention, e.g. "auth, user profile API, email notifications"]
**Independent stories:** [Count of separable user journeys. Per the quality checklist, this should be 1. If > 1, consider splitting the issue.]
**Structural changes needed:** Yes / No / Unknown — [brief note if yes, e.g. "plugin loader interface must change to support dynamic loading"]
**Scope note:** [any breadth signal detected during PM analysis, or "none detected"]

## Task

[Clear, specific description of what needs to be done. An agent should be able to start
coding after reading just this section.]

## Acceptance Criteria

- [ ] VERIFY: [Specific testable criterion]
- [ ] VERIFY: [Specific testable criterion]
- [ ] VERIFY: Tests added and passing

## Implementation Guide

### Files to Modify
- `path/to/file.ts` — [what to change]

### Files to Create
- `path/to/new-file.ts` — [purpose]

### Approach
1. [Step 1]
2. [Step 2]
3. [Step 3]

### Patterns to Follow
[Reference existing patterns in the codebase]

## Scope

### In Scope
- [This specific task only]

### Out of Scope
- [Other tasks in the epic]

## Dependencies

- Blocked by: #N (if applicable)
- Blocks: #N (if applicable)

## Definition of Done

- [ ] Implementation complete
- [ ] Tests passing (unit + integration)
- [ ] PR approved and merged
- [ ] Epic checklist updated
```

---

## Refactor

```markdown
## Context

**Why refactor:** [tech debt / performance / extensibility / pattern alignment]

[1-2 paragraphs: what's wrong with the current state and why it matters now.
Include specific pain points — "this file is 800 lines" or "adding a new handler
requires changes in 5 places".]

## Current State

[Describe the current code structure, patterns, or architecture being refactored.
Be specific — reference files, functions, patterns.]

```
Current structure:
src/handlers/
├── user-handler.ts      (400 lines, mixed concerns)
├── auth-handler.ts      (300 lines, duplicated validation)
└── utils.ts             (catch-all, 600 lines)
```

## Desired State

[Describe the target structure, patterns, or architecture.]

```
Target structure:
src/handlers/
├── user/
│   ├── handler.ts       (route handling only)
│   ├── validation.ts    (input validation)
│   └── service.ts       (business logic)
├── auth/
│   ├── handler.ts
│   ├── validation.ts
│   └── service.ts
└── shared/
    ├── validation.ts    (shared validators)
    └── errors.ts        (error types)
```

## Acceptance Criteria

- [ ] VERIFY: All existing tests pass without modification (behavior preserved)
- [ ] VERIFY: [Specific structural goal, e.g., "no file exceeds 200 lines"]
- [ ] VERIFY: [Pattern goal, e.g., "all handlers follow handler/validation/service pattern"]
- [ ] VERIFY: No public API changes (unless explicitly noted)
- [ ] VERIFY: [Performance target if applicable]

## Implementation Guide

### Files to Modify
- `src/path/to/file.ts` — [what changes]

### Files to Create
- `src/path/to/new-file.ts` — [extracted from where, purpose]

### Files to Delete
- `src/path/to/old-file.ts` — [replaced by what]

### Approach
1. [Step 1: Add tests for current behavior if missing]
2. [Step 2: Create new structure]
3. [Step 3: Move logic incrementally]
4. [Step 4: Update imports]
5. [Step 5: Verify all tests pass]
6. [Step 6: Remove old files]

### Constraints
- **Must preserve:** [list of behaviors/APIs that must not change]
- **Performance:** [must not regress beyond X]
- **Incremental:** [can this be done in stages? if so, what stages]

## Scope

### In Scope
- [Specific files/modules being refactored]

### Out of Scope
- [Functional changes — this is structure only]
- [Performance optimization — separate issue]
- [Files not in the target area]

## Risk Assessment

- **Blast radius:** [what could break — list downstream consumers]
- **Rollback plan:** [how to revert if something goes wrong]
- **Testing gaps:** [areas with insufficient test coverage]

## Dependencies

- Blocked by: #N (if applicable)
- Blocks: #N (features waiting on this refactor)
```

---

## New Project

```markdown
# Project: [Project Name]

## Overview

[2-3 sentences: what this project does, who it's for, and why we're building it.]

## Tech Stack

| Layer | Technology | Rationale |
|-------|-----------|-----------|
| Language | [e.g., TypeScript] | [why] |
| Framework | [e.g., Next.js 14] | [why] |
| Database | [e.g., PostgreSQL] | [why] |
| ORM | [e.g., Prisma] | [why] |
| Auth | [e.g., NextAuth.js] | [why] |
| Styling | [e.g., Tailwind CSS] | [why] |
| Testing | [e.g., Vitest + Playwright] | [why] |
| Deployment | [e.g., Vercel] | [why] |

## Architecture

[High-level architecture description. Include a simple diagram if helpful.]

```
[ASCII architecture diagram]
```

## MVP Features

| # | Feature | Priority | Description |
|---|---------|----------|-------------|
| 1 | [Feature] | Must-have | [Brief description] |
| 2 | [Feature] | Must-have | [Brief description] |
| 3 | [Feature] | Should-have | [Brief description] |

## Project Structure

```
project-name/
├── src/
│   ├── app/           [routes/pages]
│   ├── components/    [UI components]
│   ├── lib/           [utilities, helpers]
│   ├── services/      [business logic]
│   └── types/         [TypeScript types]
├── tests/
├── public/
├── package.json
└── README.md
```

## Bootstrap Tasks

(These become sub-issues of the epic)

### 1. Project Setup
- Scaffold project with [framework CLI]
- Configure TypeScript, ESLint, Prettier
- Set up testing framework
- Initialize git repo, create README
- Configure CI/CD pipeline

### 2. Data Model
- Define database schema
- Set up ORM and migrations
- Seed data for development

### 3-N. [Each MVP feature as a separate task]

### Final. Documentation
- API documentation
- README with setup instructions
- Contributing guidelines

## Deferred (v2+)

- [Feature deferred to v2]
- [Feature deferred to v2]

## Constraints

- [Performance targets]
- [Browser/platform support requirements]
- [Accessibility requirements]
- [Security requirements]
```

---

## Chore

```markdown
## Context

[What maintenance task needs to be done and why.]

**Type:** Dependency Update / CI-CD / Documentation / Infrastructure
**Urgency:** [High: security vuln, broken CI] / [Medium: upcoming deprecation] / [Low: housekeeping]

## Task

[Specific description of what needs to be done.]

## Acceptance Criteria

- [ ] VERIFY: [Specific outcome, e.g., "all dependencies updated to latest compatible versions"]
- [ ] VERIFY: [e.g., "CI pipeline passes on main branch"]
- [ ] VERIFY: No regressions introduced

## Implementation Guide

### Approach
1. [Step 1]
2. [Step 2]
3. [Step 3]

### Files to Modify
- `path/to/file` — [what changes]

## Scope

### In Scope
- [Specific chore task]

### Out of Scope
- [Feature work triggered by this chore]
- [Refactoring beyond what's necessary]
```

---

## Research Spike

```markdown
## Question

[The specific question this spike aims to answer. Frame as a clear, answerable question.]

## Context

[Why we need to answer this question now. What decision depends on it.]

## Candidate Options

| Option | Pros | Cons | Effort |
|--------|------|------|--------|
| [Option A] | [benefits] | [drawbacks] | [S/M/L] |
| [Option B] | [benefits] | [drawbacks] | [S/M/L] |
| [Option C] | [benefits] | [drawbacks] | [S/M/L] |

## Evaluation Criteria

- [Criterion 1: e.g., "Performance under 1000 concurrent requests"]
- [Criterion 2: e.g., "Developer experience and learning curve"]
- [Criterion 3: e.g., "Long-term maintenance burden"]
- [Criterion 4: e.g., "Cost at projected scale"]

## Timebox

**Maximum:** [time, e.g., "1 day"]
**Deliverable:** [Decision document / Proof of concept / Technical assessment]

## Acceptance Criteria

- [ ] VERIFY: All candidate options evaluated against criteria
- [ ] VERIFY: Recommendation provided with clear rationale
- [ ] VERIFY: Deliverable produced within timebox
- [ ] VERIFY: Open questions identified for follow-up

## Scope

### In Scope
- Evaluating listed options against criteria
- Producing the specified deliverable

### Out of Scope
- Full implementation of chosen option (separate issue)
- Evaluating options not listed (unless quick win)
```

---

## Labels Reference

| Category | Labels |
|----------|--------|
| **Type** | `bug`, `enhancement`, `epic`, `refactor`, `project`, `chore`, `research` |
| **Priority** | `P0-critical`, `P1-high`, `P2-medium`, `P3-low` |
| **Size** | `size/S`, `size/M`, `size/L`, `size/XL` |
| **Status** | `triage`, `ready`, `in-progress`, `blocked`, `needs-clarification` |

## Agent Execution Tags

Tags that agents look for when processing issues:

| Tag | Meaning |
|-----|---------|
| `VERIFY:` | Testable assertion — agent must validate after implementation |
| `AGENT-DECIDED:` | PM skill made this choice — human may want to review |
| `NEEDS CLARIFICATION:` | Cannot proceed without resolving this question |
| `Part of #N` | This is a sub-issue of epic #N |
| `Blocked by: #N` | Cannot start until #N is resolved |
| `Blocks: #N` | Issue #N is waiting on this |
