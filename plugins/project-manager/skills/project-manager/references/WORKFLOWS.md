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

Ask these together (2-3 questions):

**Question 1: "How big is this feature?"**
- Small: A few hours of work, 1-3 files
- Medium: A day or two, touches multiple components
- Large: Multiple days, might need an epic instead
- Not sure: Let me help you estimate after we discuss it

**Question 2: "Is this for a specific user type?"**
- End user: Customer-facing functionality
- Developer: API, SDK, tooling improvement
- Admin/Ops: Dashboard, monitoring, configuration
- Internal: Team productivity, CI/CD, automation

**Question 3: "What's the priority?"**
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
Round 1: Vision + Scope → Round 2: Task Breakdown → Round 3: Dependencies → Draft sub-issues
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

### Round 2 — Task Breakdown (Conversation)

Guide the user through decomposition:
1. **List the major pieces** — what are the big chunks of work?
2. For each piece, ask: "Can this be done independently, or does it depend on another piece?"
3. **Estimate each piece** — aim for 1-2 day chunks
4. If any piece is > 3 days, suggest splitting it further

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

After gathering all context:
- Break down into individual issues using the Feature or Refactor templates
- Each sub-issue must be independently completable
- Each references the parent epic: `Part of #EPIC_NUMBER`
- Order sub-issues by dependency (what must come first)
- Include implementation order in the epic body

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
