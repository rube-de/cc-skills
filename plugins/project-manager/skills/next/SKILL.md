---
name: next
description: >-
  Triage open GitHub issues and recommend what to work on next. Builds a
  dependency graph from issue bodies, detects circular dependencies, ranks
  unblocked issues by weighted scoring (blocks-others, priority, type, age,
  milestone), and presents top candidates for interactive selection. Triggers:
  what should I work on next, triage backlog, next issue, pick next task,
  recommend issue, prioritize issues.
user-invocable: true
allowed-tools:
  - Bash(gh:*)
  - Read
  - Grep
  - Glob
  - AskUserQuestion
metadata:
  author: claude-pm
  version: "2.0"
---

# Next: Issue Triage & Recommendation

Analyze open GitHub issues, build a dependency graph, and recommend the highest-impact issue to work on next.

## Workflow

```text
1. Auth Check → 2. Detect Repo → 3. Fetch Issues → 4. Build Dependency Graph
→ 5. Detect Cycles → 6. Rank Issues → 7. Present Recommendations → 8. Select & Assign
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

### Step 3: Fetch Open Issues

```bash
gh issue list --state open --limit 100 --json number,title,body,labels,assignees,milestone,createdAt,updatedAt
```

**Edge case — no open issues:** Report "No open issues found" and stop.

**Edge case — 100+ issues:** Warn the user that results are capped at 100. Suggest filtering by label or milestone if they need a broader view.

### Step 4: Build Dependency Graph

Parse each issue body for dependency markers:

| Pattern | Meaning |
|---------|---------|
| `Blocked by: #<number>` | This issue cannot start until the referenced issue is resolved |
| `Blocked by: #<number>, #<number>` | Blocked by multiple issues |
| `Blocks: #<number>` | The referenced issue is waiting on this one |
| `Depends on: #<number>` | Same as "Blocked by" |

Build two maps:
- `blockedBy[issue] → Set<issue>` — what blocks this issue
- `blocks[issue] → Set<issue>` — what this issue unblocks

Filter out references to closed issues — they no longer block anything. Since Step 3 only fetches open issues, treat any referenced issue number absent from the open set as resolved. For higher confidence, verify ambiguous references via `gh issue view N --json state -q .state`.

**Edge case — no dependency markers found:** Skip Steps 5-6 ranking adjustments for dependency weight. Rank purely on priority, type, age, and milestone.

### Step 5: Detect Circular Dependencies

Run DFS traversal on the `blockedBy` graph to detect cycles.

**If cycles found:**
1. Report each cycle: e.g., "#12 → #15 → #12"
2. Warn the user that these issues are mutually blocked
3. Exclude all issues in cycles from recommendations
4. Suggest the user resolve the cycle by editing one of the issues

**If no cycles:** Proceed to ranking.

### Step 6: Rank Unblocked Issues

An issue is **eligible** if:
- It has no open blockers (all `blockedBy` entries are closed or absent)
- It is not assigned to anyone (unless the user requests "include assigned")
- It is not in a cycle

**Scoring formula** — `Total = Σ (Weight × Score)` for each factor:

| Factor | Weight | Score | Notes |
|--------|--------|-------|-------|
| Blocks others | 3 | +3 per issue this unblocks | e.g., unblocks 2 → 3 × 6 = 18 |
| Priority label | 2 | P0=8, P1=6, P2=4, P3=2, none=3 | `none > P3`: unlabeled may be anything; explicitly-low is known-low |
| Type label | 1 | bug=5, security=5, enhancement=3, chore=2, research=1, none=2 | Default `none=2` — treat unlabeled same as chore |
| Age | 1 | +1 per 7 days since creation (max +8) | Caps at 56 days to avoid age dominating |
| Milestone | 1 | +4 / +2 / 0 (see below) | Heuristic below for "current/next" detection |

**Milestone heuristic:** Compare milestone `due_on` dates. The milestone with the earliest future (or most recently past) due date is "current"; the next one is "next" — these score +4. All other milestones score +2. Milestones without `due_on` default to +2. No milestone = 0.

Sort by total score descending. Break ties by issue number (lower = older = first).

### Step 7: Present Recommendations

Show the top 3-5 issues in a structured table:

```text
## Recommended Next Issues

| Rank | Issue | Title | Score | Key Factor |
|------|-------|-------|-------|------------|
| 1 | #42 | Fix auth token refresh | 24 | Unblocks #43, #44, #45 |
| 2 | #38 | Add rate limiting | 18 | P0-critical, 3 weeks old |
| 3 | #51 | Update CI pipeline | 14 | Blocks #52, in v2.0 milestone |
```

For each recommendation, show a brief rationale:
- What makes it high-priority
- What it unblocks (if anything)
- How old it is
- Any milestone context

**Edge case — all issues are assigned:** Report that all eligible issues have assignees. Show the top 3 anyway with their current assignees, and ask if the user wants to pick one up regardless.

**Edge case — all issues are blocked:** Report the blocking chain. Identify the root blockers (issues that block others but aren't blocked themselves) and recommend those first.

### Step 8: Interactive Selection

Use `AskUserQuestion` to let the user choose:

```text
Question: "Which issue do you want to work on?"
Options:
  - #42: Fix auth token refresh (Score: 24)
  - #38: Add rate limiting (Score: 18)
  - #51: Update CI pipeline (Score: 14)
  - Show more issues
```

After selection:

1. Show the full issue details (`gh issue view ISSUE_NUMBER`)
2. Ask: "Want me to assign this to you?"
3. If yes:
   ```bash
   gh issue edit ISSUE_NUMBER --add-assignee @me
   ```
4. Suggest: "Run `/pm:update` periodically to audit stale issues."
