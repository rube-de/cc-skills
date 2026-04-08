---
name: brainstorm
description: >-
  You MUST use this skill before /pm when work is ambiguous, scope is unclear,
  or multiple approaches exist. Explores problem space, proposes 2-3 approaches
  with trade-offs, and produces an approved spec document that feeds into both
  issue creation (/pm) and implementation planning (/cdt). Use this whenever the
  user says brainstorm, explore idea, think through, design approach, what should
  we build, explore options, weigh approaches, compare solutions, or needs help
  deciding between alternatives — even if they don't explicitly say "brainstorm."
user-invocable: true
argument-hint: "[topic or problem description]"
allowed-tools:
  - Read
  - Edit
  - Grep
  - Glob
  - Bash
  - AskUserQuestion
  - WebSearch
  - WebFetch
  - Write
  - Skill
metadata:
  author: claude-pm
  version: "1.0"
---

# Brainstorm: Pre-Creation Design Exploration

Explore the problem space, clarify requirements, and converge on a design direction **before** creating
issues. This skill produces a **spec document** — capturing intent, trade-offs, the chosen approach, and
enough detail for both issue creation (`/pm`) and implementation planning (`/cdt`).

## When to Use

Use this skill when:
- The work is ambiguous — user knows *what* they want but not *how*
- Multiple valid approaches exist and trade-offs need discussion
- Scope is unclear — could be one issue or an epic with sub-issues
- The problem domain is unfamiliar and needs exploration first
- A request is large enough that jumping straight to issue creation would produce a vague ticket

Do NOT use for:
- Clear, well-scoped bugs (go directly to `/pm`)
- Simple chores or dependency updates
- Work that already has a design document or spec

## Hard Gate

<HARD-GATE>
Do NOT invoke `/pm`, `/cdt`, create any GitHub issue, or take any implementation action until:
1. You have proposed approaches and the user has selected one
2. You have presented a spec document and the user has approved it

This applies to EVERY brainstorming session regardless of perceived simplicity. A spec can be
short (5-10 lines for a simple feature), but it must exist and be approved.
</HARD-GATE>

### "This Is Too Simple To Need a Spec"

No. Every brainstorming session produces a spec. The spec scales with complexity:
- Simple feature: 5-10 lines covering approach, scope, and key decisions
- Medium feature: half a page with trade-off analysis and component breakdown
- Complex initiative: full spec with architecture, decomposition, and risk assessment

The cost of a 30-second review of a short spec is negligible. The cost of a poorly scoped issue
that an agent executes in the wrong direction is significant.

## Arguments

If the user provides arguments (e.g., `/pm:brainstorm caching layer for API`), treat the entire
argument string as the **initial topic**. Use it to focus Step 1 context gathering and to skip
obvious clarifications in Step 2. If no arguments are provided, start with an open-ended discovery
in Step 2.

## Workflow

```text
1. Context → 2. Clarify → 3. Propose → 4. Converge → 5. Write Spec → 6. Self-Review → 7. User Review → 8. Transition
```

### Step 1: Explore Context

Before asking any questions, gather context silently:

1. **Project awareness**: Read the project's README, CLAUDE.md, or similar docs to understand what this project does
2. **Recent work**: Run `git log --oneline -20` to see recent direction
3. **Relevant code**: If the user mentioned a specific area, use `Glob` and `Grep` to survey it
4. **Existing issues**: Run `gh issue list --limit 10 --state open` to check for related work

**Cross-project topics.** If the user's topic is about a different project than the current working
directory (e.g., they ask about their Express API while you're in a skills marketplace repo),
acknowledge this in Step 2. You can still brainstorm effectively — use `WebSearch` to research
the domain, ask the user for relevant file paths or architecture details, and note in the spec's
"Files Affected" section that paths are assumed and should be verified. Do not fabricate file
paths you cannot confirm.

Do NOT dump this research back at the user. Use it to ask smarter questions in Step 2.

### Step 2: Clarify Intent

Ask clarifying questions to understand what the user actually wants. Follow these rules strictly:

**One question per message.** Never ask more than one question at a time. Wait for the answer before
asking the next question. This forces depth — users give better answers to focused questions than to
a wall of 5 questions at once.

**Prefer multiple choice over open-ended.** When possible, offer 2-4 concrete options rather than
asking "what do you want?" Open-ended questions get vague answers; structured choices get decisions.

**Use your context research.** Frame questions using what you learned in Step 1. Instead of "what part
of the codebase?" ask "I see the auth module uses JWT tokens in `src/auth/` — is this about the token
refresh flow or the login flow?"

**Stop when you have enough.** You need to understand:
- What problem is being solved (the "why")
- Who it's for (users, developers, ops)
- What success looks like (observable outcome)
- What's explicitly out of scope

Three to five questions is typical. Do not over-interrogate — if the user gives a rich initial
description, you may only need one or two clarifications.

### Step 3: Propose Approaches

Present 2-3 distinct approaches. For each approach, include:

1. **Name** — a short label (e.g., "Approach A: Event-driven pipeline")
2. **How it works** — 2-3 sentences describing the approach
3. **Trade-offs** — what you gain and what you give up
4. **Complexity** — rough effort level (small / medium / large)
5. **Risk** — what could go wrong or what's unknown

End with a **recommendation** — state which approach you'd pick and why. Do not be neutral. Take a
position. The user can override, but fence-sitting wastes everyone's time.

**Apply YAGNI ruthlessly.** If an approach adds flexibility "in case we need it later," flag that as
speculative complexity. Propose the simplest approach that solves the stated problem. If the user
wants extensibility, they'll ask.

**Visual comparison (optional).** If the approaches involve architectural differences (data flow,
component structure, system boundaries), use `Skill` to invoke `visual-explainer:generate-web-diagram`
to render a side-by-side comparison diagram. This is especially valuable for:
- Pipeline/workflow designs with different topologies
- Component architectures with different boundaries
- Data flow alternatives (push vs. pull, sync vs. async)

Do NOT generate visuals for trivial choices or when the text description is sufficient. Ask the user
first: "Would a visual comparison of these approaches help?"

Use `AskUserQuestion` to let the user pick:

```text
Question: "Which approach do you prefer?"
Options:
  - Approach A: [name] — [one-line summary]
  - Approach B: [name] — [one-line summary]
  - Approach C: [name] — [one-line summary]
  - None of these — let me describe what I want
```

### Step 4: Converge on Design

With the chosen approach, flesh out the design. Present it in sections scaled to complexity:

**For simple features (1 issue):**
- Approach summary (2-3 sentences)
- Key decisions (bullet list)
- Scope boundary (in/out)

**For medium features (2-3 issues):**
- Approach summary
- Key decisions with rationale
- Component breakdown (what pieces need to change)
- Scope boundary
- Open questions (if any remain)

**For complex initiatives (epic-level):**
- Approach summary
- Architecture overview (components, data flow, interfaces)
- Decomposition into work units (each becomes an issue)
- Dependencies between units
- Scope boundary
- Risks and mitigations
- Open questions

**Codebase exploration.** Before presenting the design, explore the codebase for the chosen approach:

1. Use `Glob` and `Grep` to find files that will need modification
2. Use `Read` to understand existing patterns, interfaces, and conventions in the affected areas
3. Check for related work: existing TODOs, tests, similar implementations
4. Record concrete file paths — these feed directly into the spec's "Files Affected" section

Do NOT present the design without grounding it in the actual codebase. An ungrounded design produces
an ungrounded spec, which produces vague issues, which agents execute poorly.

If the topic is about a different project (see Step 1 cross-project note), ask the user for
relevant file paths or architecture details instead of exploring. Mark all paths in the spec as
`[unverified — user-provided]` so downstream consumers know to check them.

**Visual architecture diagram.** For medium and complex work, generate an architecture diagram using
`Skill` to invoke `visual-explainer:generate-web-diagram`. Show component boundaries, data flow, and
the decomposition into work units. Present the diagram alongside the architecture overview section.

For medium and complex work, present each section and wait for the user to confirm before moving
to the next. For simple features, present the full design at once.

### Step 5: Write Spec Document

Save the approved design to a file:

```bash
# Ensure the directory exists
mkdir -p .dev/pm/specs
```

**File path:** `.dev/pm/specs/YYYY-MM-DD-<topic-slug>.md`

**Before writing, determine the complexity tier.** This controls which sections to include:

| Tier | Criteria | Sections to include |
|------|----------|-------------------|
| **Simple** (1 issue) | Single component, no structural changes | Problem, Chosen Approach (no Alternatives table), Key Decisions, Scope, Technical Design (2-3 sentences), Files Affected, Open Questions |
| **Medium** (2-3 issues) | Multiple components or interfaces | All sections, each concise |
| **Complex** (epic) | 3+ work units, cross-cutting concerns | All sections fully fleshed out, architecture diagram referenced |

Omit sections that don't apply to the tier. A simple spec with an Alternatives Considered table
and Work Breakdown is over-engineered — it signals the tier was misclassified or the template
was filled in mechanically without thinking about what the reader needs.

**Spec template** (include only the sections appropriate for the tier):

```markdown
# Spec: <Topic>

**Date:** YYYY-MM-DD
**Status:** Approved

## Problem

<What problem are we solving and why — include the user/stakeholder perspective>

## Chosen Approach

**<Approach name>**

<2-3 paragraph description of the approach, how it works, and why it was chosen over alternatives>

### Alternatives Considered
<!-- MEDIUM and COMPLEX only — omit for SIMPLE -->

| Approach | Pros | Cons | Why not |
|----------|------|------|---------|
| <Alt 1> | <pros> | <cons> | <reason rejected> |
| <Alt 2> | <pros> | <cons> | <reason rejected> |

### Key Decisions

- <Decision 1>: <chosen option> — <rationale>
- <Decision 2>: <chosen option> — <rationale>

### Trade-offs Accepted
<!-- MEDIUM and COMPLEX only — omit for SIMPLE -->

- <What we're giving up and why that's acceptable>

## Scope

**In scope:**
- <item>

**Out of scope:**
- <item>

## Technical Design

<SIMPLE: 2-3 sentences on the approach>
<MEDIUM: component breakdown with interfaces>
<COMPLEX: architecture overview, data flow, key interfaces>

### Files Affected

<List real file paths found during codebase exploration, or "New files" for greenfield>

- `src/path/to/file.ts` — <what changes>

## Work Breakdown
<!-- MEDIUM and COMPLEX only — omit for SIMPLE -->

1. <Unit 1> — <what it does, rough size> [no dependencies]
2. <Unit 2> — <what it does, rough size> [depends on: 1]

## Open Questions

<Any unresolved items — or "None" if fully resolved>
```

Do NOT commit yet — the self-review and user review may require changes.

### Step 6: Self-Review

Before presenting the spec to the user, review it yourself. Check for:

- **Placeholders**: Any "TBD", "TODO", or vague hand-waving? Replace with specifics or mark as
  `[NEEDS CLARIFICATION: question]`
- **Contradictions**: Does the scope say X is out but the work breakdown includes it?
- **Missing rationale**: Every key decision should have a "why" — if one doesn't, add it
- **Scope creep**: Does the work breakdown include items the user didn't ask for? Remove them
- **Feasibility gaps**: Does the approach assume something about the codebase that you haven't
  verified? Use `Grep`/`Read` to confirm
- **File path accuracy**: Do the files listed in "Files Affected" actually exist? Verify with `Glob`

Fix any issues found inline before proceeding.

### Step 7: User Review

Present the final spec to the user. Show:
- The topic and chosen approach (one-liner)
- Key decisions summary
- Scope summary
- Work breakdown (if applicable)

Ask explicitly: **"Spec looks good — approve to proceed, or want changes?"**

If the user requests changes, revise the spec (go back to Step 5) and re-present. Loop until
approved.

### Step 8: Transition

Once approved, present the next steps. The spec at `.dev/pm/specs/YYYY-MM-DD-<topic-slug>.md` is
designed to feed into two downstream workflows:

**Path A: Issue creation (`/pm`)**
> Create structured GitHub issues from the spec. The work breakdown maps directly to issues.

**Path B: Implementation planning (`/cdt:plan-task`)**
> Skip issue creation and go straight to an implementation plan. CDT's architect teammate will
> use the spec as input.

**Path C: Both**
> Create issues first (`/pm`), then plan implementation for the top-priority issue (`/cdt`).

Use `AskUserQuestion` to let the user choose:

```text
Question: "Spec approved. What's next?"
Options:
  - Create issues (/pm) — turn the spec into GitHub issues
  - Plan implementation (/cdt:plan-task) — go straight to implementation planning
  - Both — create issues first, then plan the first one
  - Done for now — I'll come back to this later
```

Do NOT automatically invoke any downstream skill. Let the user choose their path. The spec is
saved to `.dev/pm/specs/` — they can come back to it in a future session.

## Principles

- Ask one focused question rather than multiple shallow ones — depth produces better answers
  because users give more thought to a single question than to a wall of five
- Recommend a specific approach rather than listing neutral options — fence-sitting wastes the
  user's decision energy and signals you don't have an opinion
- Remove speculative features from every design. If the user says "might need X later,"
  acknowledge it and leave it out unless there is a concrete use case now
- Scale the spec to match the work — a simple feature gets a 10-line spec, not a 2-page design
  doc. Oversized specs for small work signal cargo-culting, not rigor
- Treat the approved spec as the contract for downstream workflows. Do not re-litigate decisions
  that were already made during brainstorming
- Generate diagrams only when they clarify something text cannot — a bullet list of 3 components
  does not need an architecture diagram
