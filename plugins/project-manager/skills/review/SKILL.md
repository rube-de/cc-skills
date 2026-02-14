---
name: review
description: >-
  Deep-validate a single GitHub issue against the codebase: cross-reference
  file paths, detect already-implemented features, check for related PRs,
  verify dependencies, and deliver a structured verdict with recommended
  action. Triggers: review issue, validate issue, check issue status, is
  this issue still needed, issue review.
user-invocable: true
allowed-tools:
  - Bash(gh:*)
  - Read
  - Grep
  - Glob
  - Task
  - AskUserQuestion
metadata:
  author: claude-pm
  version: "2.0"
---

# Review: Single-Issue Deep Validation

Deep-validate a single GitHub issue against the current codebase. Cross-reference file paths, detect already-implemented features, check for related PRs, verify dependencies, and deliver a structured verdict with recommended action.

## Workflow

```text
1. Auth Check → 2. Detect Repo → 3. Fetch Issue → 4. Parse Body
→ 5. Codebase Cross-Reference → 6. PR Check → 7. Dependency Check
→ 8. Verdict → 9. Present Report → 10. Interactive Action
```

### Step 1: Verify GitHub Auth

```bash
gh auth status
```

**On failure:** Stop and tell the user to run `gh auth login`.

### Step 2: Detect Repository

```bash
gh repo view --json nameWithOwner -q .nameWithOwner
```

**On failure:** Ask the user for the target repository (`owner/repo`).

### Step 3: Fetch Issue

Require an issue number from the user's arguments. If none provided, use `AskUserQuestion` to ask for one.

```bash
gh issue view ISSUE_NUMBER --json number,title,body,state,labels,assignees,milestone,createdAt,updatedAt,author,comments
```

**Edge cases:**
- Issue doesn't exist → abort with a clear error
- Issue already closed → warn but continue (informational analysis is still useful)

### Step 4: Parse Issue Body

Classify the issue into one of two tiers based on body structure:

#### Tier 1: Structured (created by `/pm`)

Detect `/pm` sections by their headers: `## Context`, `## Acceptance Criteria`, `## Implementation Guide`, `## Scope`.

Extract:
- **File paths** from `## Implementation Guide` and `## Scope` sections
- **Acceptance criteria** — lines starting with `VERIFY:` or `- [ ]` checkboxes
- **Function/component names** — backtick-wrapped identifiers in implementation sections
- **Dependencies** — `Blocked by: #N` and `Blocks: #N` patterns
- **Epic reference** — `Part of #N` pattern
- **Scope** — `### In Scope` and `### Out of Scope` subsections

#### Tier 2: Unstructured (fallback)

When `/pm` section headers are absent, extract what you can:
- File paths by regex (paths containing `/` with common extensions)
- Backtick-wrapped identifiers as potential function/component names
- `#N` references as issue/PR cross-references
- Title keywords for broad codebase search

Note lower confidence in the verdict when using Tier 2 parsing.

### Step 5: Codebase Cross-Reference

Start with the Explore agent to get a broad understanding of the codebase structure before targeted searches. For large or unfamiliar codebases, use repomix-explorer (if available) to get a structural overview. Then use Glob, Grep, and Read for detailed analysis.

For each piece of extracted data, cross-check against the codebase:

#### 5a. File Path Validation

For each extracted file path:

1. Determine **intent** from surrounding context:
   - Paths under headings like "Files to Create" or prefixed with "create", "add", "new" → expected to not exist yet (intent = **create**)
   - All other paths → expected to exist (intent = **modify**)
2. Check existence with `Glob`
3. If a "modify" path is missing, search for the filename only (detect renames/moves)
4. Record signal: `exists`, `missing`, `renamed/moved`, `correctly-absent` (create intent, not yet created), `already-created` (create intent, file exists)

#### 5b. Implementation Detection

For each function/component name and each acceptance criterion:

1. `Grep` for the name/pattern in the codebase
2. For each match, `Read` ~20 lines of surrounding context
3. Classify each acceptance criterion:
   - **Implemented** — criterion clearly satisfied by existing code
   - **Partial** — some evidence but not fully satisfied
   - **Not found** — no evidence in codebase

#### 5c. Synthesis

Combine file and implementation signals:

| Condition | Signal |
|-----------|--------|
| All "Files to Create" exist + all criteria Implemented | **Already Implemented** |
| Some files exist or some criteria met | **Partially Implemented** |
| No implementation evidence found | **Still Needed** |

### Step 6: PR Check

Search for related pull requests:

```bash
gh pr list --state all --search "ISSUE_NUMBER" --limit 10 --json number,title,state,mergedAt,headRefName
```

Also search for PRs that reference the issue in their body:

```bash
gh api search/issues -f q="repo:OWNER/REPO type:pr ISSUE_NUMBER in:body" --jq '.items[] | {number,title,state,pull_request}'
```

Classify PR signals:

| PR State | Signal |
|----------|--------|
| Merged | Strong close signal — work was completed |
| Open | In Progress — active development |
| Closed (not merged) | Abandoned attempt — note but weigh lightly |

### Step 7: Dependency Check

#### Blockers

For each `Blocked by: #N` or `Depends on: #N` reference:

```bash
gh issue view BLOCKER_NUMBER --json number,title,state,labels
```

| Blocker State | Signal |
|---------------|--------|
| Open | Still blocked — issue cannot proceed |
| Closed | Unblocked — stale blocker reference |

#### Epic Context

For each `Part of #N` reference:

1. Fetch the epic issue
2. Count total vs closed sub-issues (search for issues referencing the epic)
3. Report sub-issue completion percentage

### Step 8: Determine Verdict

Based on signals from Steps 5-7, assign a verdict:

| Verdict | Criteria |
|---------|----------|
| **Already Implemented** | All acceptance criteria met + merged PR exists |
| **Partially Implemented** | Some criteria met OR some expected files exist but not all |
| **In Progress** | Open PR exists referencing this issue |
| **Still Needed** | No implementation evidence, no related PRs, blockers resolved (or none) |
| **Outdated** | References files/APIs that no longer exist, 90+ days inactive, problem space changed |
| **Needs Update** | File paths drifted, resolved blockers still listed, scope no longer matches codebase |

Assign a **confidence level** based on parsing quality and signal strength:

| Confidence | Criteria |
|------------|----------|
| **High** | Structured issue (Tier 1) + strong, unambiguous signals |
| **Medium** | Unstructured issue (Tier 2) OR mixed/conflicting signals |
| **Low** | Keyword-only matching, minimal codebase evidence |

### Step 9: Present Report

Present a structured markdown report:

```markdown
## Issue Review: #NUMBER — TITLE

**Verdict:** VERDICT (Confidence: LEVEL)

### Evidence

#### File Status
| Path | Intent | Status |
|------|--------|--------|
| src/auth/login.ts | Modify | Exists |
| src/auth/mfa.ts | Create | Not yet created |

#### Acceptance Criteria
| Criterion | Status | Evidence |
|-----------|--------|----------|
| VERIFY: login redirects to dashboard | Implemented | Found in src/auth/login.ts:45 |
| VERIFY: MFA prompt on new device | Not found | No matching code |

#### Related PRs
| PR | Title | State | Merged |
|----|-------|-------|--------|
| #<number> | Add login redirect | Merged | 2024-01-15 |

#### Dependencies
| Blocker | Title | State | Impact |
|---------|-------|-------|--------|
| #<number> | Auth refactor | Closed | Unblocked (stale reference) |

#### Epic Context
Part of #<number> — 4/6 sub-issues closed (67%)
```

Adapt the report to include only sections with findings — omit empty sections.

### Step 10: Interactive Action

Based on the verdict, offer appropriate actions via `AskUserQuestion`:

**Already Implemented:**
```text
Question: "This issue appears already implemented. What would you like to do?"
Options:
  - Close with comment summarizing evidence
  - Add comment with findings (keep open)
  - Skip — no action
```

**Needs Update:**
```text
Question: "This issue has stale references. What would you like to do?"
Options:
  - Add comment listing what needs updating
  - Skip — no action
```

**Partially Implemented / In Progress:**
```text
Question: "This issue is partially done. What would you like to do?"
Options:
  - Add status comment with progress summary
  - Skip — no action
```

**Outdated:**
```text
Question: "This issue appears outdated. What would you like to do?"
Options:
  - Close as outdated with explanation
  - Add comment noting staleness
  - Skip — no action
```

**Still Needed:**

No action prompt — the issue is valid as-is. Report the verdict and move on.

#### Executing Actions

Close issues:
```bash
gh issue close ISSUE_NUMBER --comment "Closing: REASON. Identified by /pm:review."
```

Add comments:
```bash
gh issue comment ISSUE_NUMBER --body "COMMENT_BODY"
```

**Never modify an issue without explicit user approval.**
