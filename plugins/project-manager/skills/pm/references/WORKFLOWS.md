# Question Flows

Type-specific discovery workflows. Each flow uses `AskUserQuestion` for structured choices
and conversation for open-ended details.

**Principle:** Gather the minimum information needed to write an unambiguous, self-contained issue.
An agent reading the output should be able to start coding without asking any questions.

---

## Bug Report Flow

```
Round 1: Severity + Reproducibility → Round 2: Details → Round 3: Codebase hints
```

### Round 1 — Triage (AskUserQuestion)

Ask these together (2 questions):

**Question 1: "How severe is this bug?"**
- P0/Critical: System down, data loss, security vulnerability
- P1/High: Core feature broken, no workaround
- P2/Medium: Feature broken but workaround exists
- P3/Low: Minor issue, cosmetic, edge case

**Question 2: "Can you reproduce it consistently?"**
- Always: Happens every time with specific steps
- Sometimes: Intermittent, but have a rough pattern
- Rarely: Happened once or twice, hard to trigger
- Unknown: Haven't tried to reproduce yet

### Round 2 — Details (Conversation)

Ask the user to describe (in free text):
1. **What's broken?** — 1-2 sentences of the problem
2. **Steps to reproduce** — numbered list
3. **Expected vs actual behavior**
4. **Error output** — paste error messages, stack traces, logs

If the user doesn't know the steps, ask them to describe what they were doing when it happened.

### Round 3 — Context (AskUserQuestion, optional)

**Question 1: "When did this start happening?"**
- Always been broken: Likely a latent bug
- After a recent change: Likely a regression — ask which change
- After an upgrade: Version-related — ask which dependency
- Not sure

**Question 2: "Do you suspect a root cause?"**
- Yes, I have a theory: Ask them to share it
- I know the exact file/line: Capture the file path
- No idea: That's fine — codebase exploration will help
- Related to a specific component: Ask which one

### Codebase Exploration

After gathering user input:
- Search for error messages in codebase (`Grep`)
- Find files related to the described component (`Glob`)
- Read relevant code to understand current behavior
- Check recent git changes if regression suspected

---

## Feature Request Flow

```
Round 1: Scope + Priority → Round 2: User Story → Round 3: Constraints → Codebase exploration
```

### Round 1 — Scope (AskUserQuestion)

Ask these together (2 questions):

**Question 1: "Is this for a specific user type?"**
- End user: Customer-facing functionality
- Developer: API, SDK, tooling improvement
- Admin/Ops: Dashboard, monitoring, configuration
- Internal: Team productivity, CI/CD, automation

**Question 2: "What's the priority?"**
- Must-have: Required for next release / blocking other work
- Should-have: Important but not blocking
- Nice-to-have: Improves experience but can wait
- Exploratory: Not sure if we should build this yet

### Round 2 — User Story (Conversation)

Guide the user through the user story format:
1. **As a** [user type from Round 1], **I want to** [what action?]
2. **So that** [what benefit/outcome?]
3. **How should it work?** — describe the happy path
4. **What should NOT happen?** — important constraints / error cases
5. **Any UI/UX preferences?** — if applicable

### Breadth Analysis (internal PM step — not a user question)

After gathering the user story, check for epic-scope signals before proceeding to Round 3 — Boundaries:

**Signal 1 — Multiple independent stories**
Does the request contain 3+ stories that could each ship independently?
(e.g., "add webhooks + redesign the dashboard + migrate to new auth provider")
→ Each story a user could get value from without the others = separate issue

**Signal 2 — Cross-subsystem span**
Does the request touch 3+ distinct subsystems?
(examples: auth, payments, storage, notifications, UI, API, background jobs, data model)
→ Changes spanning 3+ systems = coordination overhead that signals epic scope

**Signal 3 — Mixed structural + behavioral change**
Does implementing this require restructuring existing code AND adding new behavior?
(e.g., "refactor the plugin loader so we can add hot-reload support")
→ Structure change + feature = two separate issues (see preparatory refactor issue)

**Signal 4 — Rewrite/overhaul language**
Does the request use language like: rewrite, redesign, overhaul, migrate, replace, rebuild?
→ Count this as one breadth signal (always)

**Routing rules:**

- **2+ signals present** → Route to Epic Flow automatically. Announce:
  > "This request shows signs of epic scope (detected signals: [list all applicable signals, e.g., 'multiple independent stories', 'rewrite/overhaul language']).
  > That's epic scope — a single issue would be too broad to execute atomically.
  > Routing to Epic Flow to decompose into independent sub-issues."
  Do NOT proceed to Round 3 or draft a Feature issue.

- **1 signal present** → Continue Feature Flow. Note the signal in the issue body under a **Scope note:** field.

- **0 signals** → Continue Feature Flow normally, no scope note added.

### Round 3 — Boundaries (AskUserQuestion)

**Question 1: "Does this require changes to existing behavior?"**
- No, purely additive: New functionality only
- Yes, modifies existing: Describe what changes
- Yes, replaces existing: Describe what's being replaced
- Not sure: We'll figure it out during codebase exploration

**Question 2: "Are there dependencies?"**
- Blocked by another issue/feature: Which one?
- Requires a new dependency/library: Which one?
- No dependencies: Standalone work
- Not sure

### Codebase Exploration

After gathering user input:
- Find similar features to understand existing patterns
- Identify files that will need modification
- Check for existing tests in the area
- Look for related TODOs or planned work

---

## Epic Flow

```
Round 1: Vision + Scope → Round 2: PM Decomposition Proposal → Round 3: Dependencies & Risks → Draft sub-issues
```

### Round 1 — Vision (AskUserQuestion + Conversation)

**Question 1: "What's the scope of this epic?"**
- Single component: Focused on one area, 3-5 tasks
- Cross-cutting: Spans multiple components, 5-10 tasks
- System-wide: Architecture change, 10+ tasks
- Not sure: Let me help break it down

**Question 2: "What's driving this work?"**
- New capability: Building something that doesn't exist
- Technical debt: Paying down accumulated issues
- Scaling: Current approach won't handle growth
- Compliance/Security: Required by external factors

Then ask (conversation):
1. **Describe the end state** — what does "done" look like?
2. **Who are the stakeholders?**
3. **Is there a deadline or target?**

### Round 2 — PM Decomposition Proposal (AskUserQuestion + Conversation)

After Round 1 (Vision), the PM generates a concrete sub-issue breakdown — do NOT ask the user
to list pieces. The PM has the requirements and proposes the decomposition itself.

1. Identify the independent stories or capability chunks from the requirements gathered in Round 1
2. Sequence them by dependency (what must exist before what)
3. Verify each chunk is independently completable — one story, focused subsystem scope, no bundled structural changes
4. Present a decomposition table:

> "Based on what you described, here's my proposed breakdown:
>
> | # | Sub-issue | Subsystems | Acceptance criteria | Depends on |
> |---|-----------|------------|---------------------|------------|
> | 1 | [story A] | [system X] | [key VERIFY condition] | — |
> | 2 | [story B] | [system Y] | [key VERIFY condition] | #1 |
> | 3 | [story C] | [system Z] | [key VERIFY condition] | #1 |
>
> Each sub-issue is independently completable. Approve this breakdown, adjust, or add/remove items?"

5. Incorporate user feedback — repeat the table with adjustments until the user approves
6. Proceed to Round 3 (Dependencies & Risks) only after the user approves the breakdown

**Table columns:**
- **Sub-issue**: imperative title (one story per row)
- **Subsystems**: which systems/components are touched
- **Acceptance criteria**: the single most important VERIFY condition
- **Depends on**: The '#' of a preceding sub-issue, or "—" if none

### Round 3 — Dependencies & Risks (AskUserQuestion)

**Question 1: "Are there external dependencies?"**
- Third-party API/service: Which one?
- Another team's work: Which team/issue?
- Infrastructure changes: What changes?
- No external dependencies

**Question 2: "What's the biggest risk?"**
- Technical uncertainty: Unknown feasibility
- Scope creep: Requirements might change
- Integration complexity: Many moving parts
- Timeline pressure: Tight deadline

### Sub-Issue Generation

After the user approves the decomposition table from Round 2 and Round 3 is complete:
- Draft each approved row as an individual issue using the Feature or Refactor templates
- Each sub-issue must match its row: title, subsystems, and dependency
- Expand the table's single acceptance criterion into comprehensive acceptance criteria (tests, edge cases, error handling) using the template's Acceptance Criteria section
- Each references the parent epic: `Part of #EPIC_NUMBER`
- Order sub-issues by the dependency column (earlier rows first)
- Include the approved decomposition table in the epic body

---

## Refactor Flow

```
Round 1: What + Why → Round 2: Scope + Risk → Round 3: Verification → Codebase deep-dive
```

### Round 1 — Motivation (AskUserQuestion)

**Question 1: "Why refactor?"**
- Tech debt: Code is hard to maintain or understand
- Performance: Current implementation is too slow
- Extensibility: Need to add features and current structure blocks it
- Patterns: Want to align with established patterns or new best practices

**Question 2: "What's the target area?"**
- Single file/function: Focused refactor
- Single module/component: Medium scope
- Cross-module: Affects multiple areas
- Architecture-level: Fundamental structural change

### Round 2 — Scope & Risk (AskUserQuestion)

**Question 1: "Does this change public APIs or interfaces?"**
- No: Internal only — lower risk
- Yes, backwards compatible: Additive changes only
- Yes, breaking: Will require migration — ask about migration plan
- Not sure: We'll determine during codebase exploration

**Question 2: "What's the testing situation?"**
- Well tested: Existing tests cover the area
- Partially tested: Some coverage, gaps exist
- Untested: No tests — need to add tests first
- Not sure

### Round 3 — Desired State (Conversation)

Ask the user:
1. **Describe the current state** — what's wrong with it now?
2. **Describe the desired state** — what should it look like after?
3. **Are there reference implementations?** — any existing code in the repo that shows the target pattern?
4. **Constraints** — what must NOT change? (backwards compat, performance thresholds, etc.)

### Codebase Deep-Dive

This is especially important for refactors:
- Read the code being refactored
- Map dependencies (what imports/calls this code)
- Identify test coverage
- Find the "target pattern" if user mentioned one
- Assess blast radius

---

## New Project Flow

```
Round 1: What → Round 2: Tech Stack → Round 3: Architecture → Round 4: MVP Scope → Generate bootstrap issue
```

### Round 1 — Vision (AskUserQuestion + Conversation)

**Question 1: "What type of project?"**
- Web Application: Frontend, fullstack, or SPA
- API/Backend: REST, GraphQL, or RPC service
- CLI Tool: Command-line application
- Library/SDK: Reusable package for other developers

**Question 2: "What's the target platform?"**
- Browser: Web-based application
- Server: Backend service or API
- Desktop: Native or Electron app
- Multi-platform: Multiple targets

Then ask (conversation):
1. **One-sentence description** — what does this project do?
2. **Who is the primary user?**
3. **What problem does it solve?**

### Round 2 — Tech Stack (AskUserQuestion)

Tailor these questions based on project type from Round 1:

**For Web Application:**

**Question 1: "Language preference?"**
- TypeScript: Type-safe, large ecosystem
- JavaScript: Simpler, no build step needed
- Python: If backend-heavy or data-focused
- Recommend: Let me suggest based on your requirements

**Question 2: "Framework preference?"**
- React/Next.js: Full-featured, SSR support
- Vue/Nuxt: Progressive, gentle learning curve
- Svelte/SvelteKit: Compiled, minimal runtime
- Recommend: Based on project needs

**Question 3: "Styling approach?"**
- Tailwind CSS: Utility-first
- CSS Modules: Scoped, traditional
- Styled Components: CSS-in-JS
- No preference

**For API/Backend:**

**Question 1: "Language preference?"**
- TypeScript/Node.js: JavaScript ecosystem
- Python: FastAPI, Django, Flask
- Go: Performance-focused
- Rust: Systems-level performance

**Question 2: "API style?"**
- REST: Standard HTTP endpoints
- GraphQL: Flexible querying
- gRPC: High-performance RPC
- tRPC: End-to-end type safety

**For CLI Tool:**

**Question 1: "Language preference?"**
- TypeScript/Node.js: Cross-platform, npm distribution
- Go: Single binary, fast
- Rust: Single binary, very fast
- Python: Quick to develop, pip distribution

### Round 3 — Architecture (AskUserQuestion)

**Question 1: "Database needs?"**
- SQL (PostgreSQL/SQLite): Relational data
- NoSQL (MongoDB/Redis): Flexible schema
- None: No persistence needed
- Not sure: Let me recommend based on use case

**Question 2: "Authentication?"**
- OAuth/Social login: Google, GitHub, etc.
- Email/Password: Traditional auth
- API keys: For service-to-service
- None: No auth needed

**Question 3: "Deployment target?"**
- Vercel/Netlify: Serverless, auto-deploy
- Docker/Container: Self-managed
- Cloud VM: AWS/GCP/Azure
- Not sure yet

### Round 4 — MVP Scope (Conversation)

Ask the user:
1. **List the core features** — what's the absolute minimum for v1?
2. **What can wait for v2?** — explicitly defer non-essential features
3. **Any existing code or repos to build on?**
4. **Preferred project structure?** — monorepo, standard layout, etc.

### Output

For new projects, generate an **epic** with sub-issues:
1. Project setup (scaffold, tooling, CI)
2. Core data model / schema
3. Each MVP feature as a separate issue
4. Testing setup
5. Documentation (README, API docs)

---

## Chore / Research Spike Flow

```
Round 1: Classify → Round 2: Details → Draft
```

### Round 1 — Classify (AskUserQuestion)

**Question 1: "What kind of work is this?"**
- Dependency update: Upgrade packages, fix vulnerabilities
- CI/CD: Pipeline changes, build improvements
- Documentation: README, API docs, ADRs
- Research spike: Investigate feasibility, compare options

**Question 2 (if Research Spike): "What's the deliverable?"**
- Decision document: Compare options, recommend one
- Proof of concept: Working prototype
- Technical assessment: Feasibility report
- Knowledge share: Document findings for team

### Round 2 — Details (Conversation)

**For Chores:**
1. What specifically needs to be done?
2. Is there urgency? (security vuln, breaking CI, etc.)
3. Any known risks or complications?

**For Research Spikes:**
1. What question are you trying to answer?
2. What are the candidate options (if any)?
3. What criteria matter for the decision? (performance, cost, DX, etc.)
4. Timebox: how much time should be spent? (default: 1 day)

---

## Requirements Challenge Checklist

Runs after every type-specific discovery flow (after Step 2 (Discovery) as Step 3 (Challenge) in SKILL.md). Systematically probe for
underspecified requirements before proceeding to codebase exploration.

### Completeness Check

Before proceeding, verify:

- [ ] Every noun is specific (not "the page" but "the user profile settings page")
- [ ] Every action has defined outcomes (success, failure, edge cases)
- [ ] UI elements have all relevant states defined
- [ ] Scope boundaries are explicit (what's included AND excluded)
- [ ] No implicit assumptions — everything is stated

### Dimensions to Probe

Challenge requirements across these dimensions. Not all apply to every issue type — use the
relevance guide below.

#### UI / Interaction (features, bugs, epics, new projects)
- **Placement / layout position** — where exactly in the UI?
- **Visual states** — default, hover, active, focused, disabled, loading, error
- **Conditional visibility** — when shown? when hidden? who sees it?
- **Responsive behavior** — mobile, tablet, desktop differences
- **Accessibility** — keyboard navigation, screen reader, ARIA labels
- **Animation / transitions** — any motion or state transitions?

#### Behavior (features, bugs, refactors)
- **Happy path** — what happens on success?
- **Error path** — what happens on failure? what does the user see?
- **Edge cases** — empty state, max values, concurrent actions, race conditions
- **Loading / async states** — spinners, skeletons, optimistic updates?
- **Undo / reversibility** — can the action be undone?

#### Structural Change Detection (features, epics)
- **Does this feature require restructuring existing code before the new behavior can be added?**
  Look for signals: "refactor X to support Y", "extract Z so we can add W", "change the interface to allow N"

  If yes, suggest splitting:
  > "This feature requires changing [describe: existing code structure] before the new behavior can be added.
  > Consider two issues:
  > **Issue A (Refactor):** Restructure [describe: component/module] to be prepared for the change — no new behavior, purely structural.
  > **Issue B (Feature):** Build [describe: new behavior] on the restructured foundation from Issue A.
  > Issue B is blocked by Issue A.
  > This follows the 'make the change easy first' pattern — each issue is independently reviewable."

  Ask the user: "Should I split this into a preparatory refactor + feature pair?"
  - Yes → draft two issues (refactor first, feature second with `Blocked by: #N`)
  - No → continue as single issue, note the structural dependency in the issue body under a **Structural Dependency** heading

#### Data (features, epics, new projects)
- **Input validation rules** — what constraints on user input?
- **Data format and constraints** — types, ranges, lengths
- **Default values** — what's pre-filled or assumed?
- **Required vs optional fields** — which inputs are mandatory?

#### Integration (bugs, features, epics, refactors, chores)
- **Impact on existing functionality** — does this change break anything?
- **Backwards compatibility** — must old behavior still work?
- **Migration requirements** — do existing users/data need migration?

### Relevance Guide

| Dimension | Bug | Feature | Epic | Refactor | New Project | Chore | Research |
|-----------|-----|---------|------|----------|-------------|-------|----------|
| UI/Interaction | ✓ | ✓ | ✓ | — | ✓ | — | — |
| Behavior | ✓ | ✓ | ✓ | ✓ | ✓ | — | — |
| Structural Change Detection | — | ✓ | ✓ | — | — | — | — |
| Data | — | ✓ | ✓ | — | ✓ | — | — |
| Integration | ✓ | ✓ | ✓ | ✓ | — | ✓ | — |

### Mode-Specific Behavior

**Default (critical) mode:**
1. For each relevant dimension, check if the gathered requirements are specific enough
2. Generate targeted follow-up questions for every gap
3. Use `AskUserQuestion` for structured choices (batch related questions, max 4 per call)
4. Use conversation for open-ended gaps
5. Refuse to proceed until all critical gaps are resolved

**Quick (`-quick`) mode:**
1. For each relevant dimension, check if the gathered requirements are specific enough
2. For each gap, propose a smart default with brief rationale
3. Present all proposed defaults in a single confirmation round:
   > "Here's what I'll assume for the unspecified details — confirm or correct:"
   > - [Gap]: [Proposed default] *(rationale)*
   > - [Gap]: [Proposed default] *(rationale)*
4. Accept confirmation and proceed — only block if user raises concerns
5. In the final issue body, tag each assumed detail: `[AGENT-DECIDED: rationale]`

---

## Flow Selection Decision Tree

```
User request
    │
    ├─► Bug signals (broken, crash, error, fails, "doesn't work", regression)
    │       └─► Bug Report Flow
    │
    ├─► Feature signals (add, implement, enhance, "I want", new capability)
    │       └─► Feature Request Flow
    │
    ├─► Epic signals (large, multiple parts, project, initiative, 3+ tasks)
    │       └─► Epic Flow
    │
    ├─► Refactor signals (refactor, clean up, restructure, tech debt, migrate)
    │       └─► Refactor Flow
    │
    ├─► New Project signals (new project, start from scratch, bootstrap, scaffold)
    │       └─► New Project Flow
    │
    ├─► Chore signals (update deps, CI, docs, maintenance)
    │       └─► Chore Flow
    │
    └─► Research signals (investigate, compare, spike, feasibility, "should we")
            └─► Research Spike Flow

If ambiguous → ask user via AskUserQuestion
```
