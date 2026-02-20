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
  - Bash
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
1. Fetch & Pre-process → 2. Build Dependency Graph → 3. Detect Cycles
→ 4. Rank Issues → 5. Present Recommendations → 6. Select & Assign
```

### Step 1: Fetch and Pre-process Issues

Run the `open-issues.sh` script located in the `scripts/` directory of this plugin (same plugin containing this SKILL.md):

```bash
# Auto-detect repository from current directory
sh scripts/open-issues.sh

# Or specify repository explicitly
sh scripts/open-issues.sh OWNER/REPO

# Include assigned issues in results
sh scripts/open-issues.sh --include-assigned
```

**Validate the response:**
- Check stderr for a JSON `error` object — if present, abort with the error message (auth failures, missing tools, repo detection failures are handled by the script)
- Extract and store the full JSON output as `$ISSUES_DATA`

**Edge case — no issues:** If `.total_open == 0`, report "No open issues found" (if `--include-assigned` was used) or "No unassigned issues found (try `--include-assigned` to include assigned items)" (default mode) and stop.

**Edge case — 100+ issues:** If `.total_open >= 100`, warn: "Results capped at 100 issues. Consider filtering by label or milestone for a broader view."

The JSON output contains pre-computed fields for each issue:
- `blocked_by`, `blocks` — parsed from issue body patterns (`Blocked by:`, `Blocks:`, `Depends on:`)
- `blockers_resolved` — `true` if all blockers are closed (not in the open issue set)
- `unblocked` — `true` if no open blockers remain
- `age_days` — days since issue creation
- `milestone_due_on` — milestone due date (ISO 8601) or `null`
- `dependency_graph.edges` — `[[blocker, blocked], ...]` pairs for graph analysis

### Step 2: Build Dependency Graph

The script pre-computes `blocked_by` and `blocks` arrays per issue, and provides `dependency_graph.edges` as `[[blocker, blocked], ...]` pairs.

Build two maps from the pre-computed data:
- `blockedBy[issue] → Set<issue>` — from each issue's `.blocked_by` array
- `blocks[issue] → Set<issue>` — from each issue's `.blocks` array

Blocker resolution is already handled by the script via `blockers_resolved`/`unblocked`; the `blocked_by`/`blocks` arrays still list all referenced issues (including closed ones). Use the `unblocked` flag to determine eligibility.

**Edge case — no dependency markers found:** If `dependency_graph.edges` is empty, skip Step 3 (no cycles possible) and omit the "blocks others" dependency weight factor from Step 4 ranking. Rank purely on priority, type, age, and milestone.

### Step 3: Detect Circular Dependencies

Using `dependency_graph.edges` from Step 1, run DFS traversal on the `blockedBy` graph to detect cycles.

**If cycles found:**
1. Report each cycle: e.g., "#12 → #15 → #12"
2. Warn the user that these issues are mutually blocked
3. Exclude all issues in cycles from recommendations
4. Suggest the user resolve the cycle by editing one of the issues

**If no cycles:** Proceed to ranking.

### Step 4: Rank Unblocked Issues

An issue is **eligible** if:
- `unblocked == true` (all blockers are resolved — pre-computed by the script)
- It is not assigned to anyone (`.assignees` is empty), unless `--include-assigned` was used
- It is not in a cycle (from Step 3)

**Scoring formula** — `Total = Σ (Weight × Score)` for each factor:

| Factor | Weight | Score | Notes |
|--------|--------|-------|-------|
| Blocks others | 3 | +3 per issue this unblocks | e.g., unblocks 2 → 3 × 6 = 18 |
| Priority label | 2 | P0=8, P1=6, P2=4, P3=2, none=3 | `none > P3`: unlabeled may be anything; explicitly-low is known-low |
| Type label | 1 | bug=5, security=5, enhancement=3, chore=2, research=1, none=2 | Default `none=2` — treat unlabeled same as chore |
| Age | 1 | +1 per 7 days (use `age_days` from Step 1, max +8) | Caps at 56 days to avoid age dominating |
| Milestone | 1 | +4 / +2 / 0 (see below) | Heuristic below for "current/next" detection |

**Milestone heuristic:** Compare milestone `due_on` dates. The milestone with the earliest future (or most recently past) due date is "current"; the next one is "next" — these score +4. All other milestones score +2. Milestones without `due_on` default to +2. No milestone = 0.

Sort by total score descending. Break ties by issue number (lower = older = first).

### Step 5: Present Recommendations

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

### Step 6: Interactive Selection

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
