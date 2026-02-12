---
name: update
description: >-
  Audit open GitHub issues for staleness, orphaned blockers, missing labels,
  codebase drift, and already-implemented features. Categorizes issues into
  close-candidates, update-needed, needs-triage, stale, and healthy. Supports
  bulk and individual remediation via interactive approval. Triggers: audit
  issues, clean up issues, update stale issues, issue hygiene, backlog cleanup,
  prune issues.
user-invocable: true
allowed-tools:
  - Bash(gh:*)
  - Read
  - Grep
  - Glob
  - AskUserQuestion
  - WebSearch
  - WebFetch
metadata:
  author: claude-pm
  version: "2.0"
---

# Update: Issue Audit & Cleanup

Audit open GitHub issues for staleness, drift, and hygiene problems. Categorize findings and execute approved remediations.

## Workflow

```text
1. Auth Check → 2. Detect Repo → 3. Fetch Issues → 4. Pass 1: Metadata Audit
→ 5. Pass 2: Codebase-Aware Audit → 6. Categorize → 7. Present Report
→ 8. Interactive Remediation → 9. Execute Actions → 10. Summary
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
gh issue list --state open --limit 100 --json number,title,body,labels,assignees,milestone,createdAt,updatedAt,author
```

**Edge case — no open issues:** Report "No open issues to audit" and stop.

**Edge case — 100+ issues:** Warn the user that results are capped at 100. Suggest filtering by label or milestone for larger backlogs.

### Step 4: Pass 1 — Metadata Audit

Check each issue for these problems:

| Check | Condition | Severity |
|-------|-----------|----------|
| **Stale** | No updates in 30+ days | Medium |
| **Ancient** | No updates in 90+ days | High |
| **Orphaned blocker** | References `Blocked by: #<number>` where the referenced issue is closed (see batch verification note below) | Medium |
| **Completed sub-tasks** | All `- [x]` checkboxes checked but issue still open | High |
| **Missing labels** | No type label (bug, enhancement, etc.) | Low |
| **Missing priority** | No priority label (P0-P3) | Low |
| **Abandoned assignment** | Assigned but no updates in 14+ days | Medium |

For each issue, collect all matching problems into a findings list.

**Batch verification for orphaned blockers:** Step 3 already fetches all open issues. Any blocker reference (`Blocked by: #<number>`) where the number is absent from the open set is treated as resolved — no extra API call needed. Only use `gh issue view` for edge cases where you need to distinguish "closed" from "never existed".

### Step 5: Pass 2 — Codebase-Aware Audit

For issues that reference specific files or features, cross-check against the codebase:

#### File Drift

For issues whose body contains file paths (e.g., `src/auth/login.ts`):

1. Extract file paths from issue body
2. Determine intent from surrounding context — paths under headings like "Files to Create" or prefixed with "create", "add", "new" are **expected to not yet exist**; skip these
3. Use `Glob` to check if remaining paths still exist
4. If files are missing/moved, flag as **file-drift**

#### Already Implemented

For feature requests and bug fixes:

1. Extract key implementation details from the issue body (function names, component names, patterns)
2. Use `Grep` to search for those patterns in the codebase
3. If the feature appears to already exist, flag as **possibly-implemented**

#### Related Branches and PRs

```bash
gh pr list --state all --search "ISSUE_NUMBER" --limit 5 --json number,title,state,mergedAt
```

Check if:
- A merged PR references this issue → flag as **has-merged-pr** (strong close candidate)
- An open PR references this issue → flag as **has-open-pr** (in progress, not stale)

### Step 6: Categorize Issues

Sort issues into five categories based on findings:

| Category | Criteria | Suggested Action |
|----------|----------|------------------|
| **Close Candidates** | Has merged PR, all checkboxes done, or flagged as possibly-implemented | Close with comment |
| **Update Needed** | Orphaned blockers, file drift, stale assignment | Edit issue metadata |
| **Needs Triage** | Missing labels, missing priority, no clear scope | Add labels, clarify scope |
| **Stale** | 30-90 days inactive, no PR activity | Ping assignee or add `stale` label |
| **Healthy** | Recently active, properly labeled, has assignee or clear owner | No action needed |

### Step 7: Present Report

Show a structured report by category:

```markdown
## Issue Audit Report

### Close Candidates (3 issues)
| Issue | Title | Reason |
|-------|-------|--------|
| #12 | Add user avatars | Merged PR #45, all acceptance criteria met |
| #18 | Fix login redirect | Feature already implemented (found in src/auth/redirect.ts) |
| #23 | Update deps | Ancient (142 days), no activity |

### Update Needed (2 issues)
| Issue | Title | Problem | Fix |
|-------|-------|---------|-----|
| #31 | Refactor API layer | Blocked by #12 (closed) | Remove stale blocker reference |
| #35 | Add caching | References src/old/cache.ts (deleted) | Update file paths |

### Needs Triage (4 issues)
| Issue | Title | Missing |
|-------|-------|---------|
| #40 | Something about auth | No type label, no priority |
| #41 | Performance issue | No priority label |
| ... | ... | ... |

### Stale (2 issues)
| Issue | Title | Last Activity | Assignee |
|-------|-------|---------------|----------|
| #28 | Add dark mode | 45 days ago | @alice |
| #33 | Improve tests | 38 days ago | unassigned |

### Healthy (8 issues)
✓ 8 issues are properly maintained — no action needed.

### Summary
- 3 close candidates
- 2 issues need metadata updates
- 4 issues need triage
- 2 stale issues
- 8 healthy issues
```

### Step 8: Interactive Remediation

For each non-healthy category, use `AskUserQuestion` to get approval:

**Close Candidates:**
```text
Question: "How should I handle close candidates?"
Options:
  - Close all 3 with a comment
  - Let me review each one individually
  - Skip — don't close any
```

**Update Needed:**
```text
Question: "Should I fix the metadata issues?"
Options:
  - Fix all automatically
  - Let me review each fix
  - Skip — I'll handle these manually
```

**Needs Triage:**
```text
Question: "Should I add missing labels?"
Options:
  - Add suggested labels to all
  - Let me review each suggestion
  - Skip
```

**Stale Issues:**
```text
Question: "How should I handle stale issues?"
Options:
  - Add 'stale' label to all
  - Comment pinging assignees
  - Skip
```

For "review each" options, iterate through issues one at a time with per-issue `AskUserQuestion`.

### Step 9: Execute Approved Actions

Run approved actions using `gh` CLI:

**Closing issues:**
```bash
gh issue close ISSUE_NUMBER --comment "Closing: [reason]. Identified by /pm:update audit."
```

**Editing issue metadata:**
```bash
gh issue edit ISSUE_NUMBER --add-label "label-name"
gh issue edit ISSUE_NUMBER --remove-assignee "username"
```

**Removing stale blocker references:**
```bash
gh issue comment ISSUE_NUMBER --body "Removed stale blocker reference to CLOSED_ISSUE_NUMBER (now closed). Issue is unblocked."
```

**Pinging stale assignees:**
```bash
gh issue comment ISSUE_NUMBER --body "@username — This issue hasn't been updated in [X] days. Are you still working on it? If not, I can unassign so someone else can pick it up."
```

### Step 10: Print Summary

After all actions complete, print a final summary:

```
## Audit Complete

| Action | Count | Issues |
|--------|-------|--------|
| Closed | 3 | #12, #18, #23 |
| Labels added | 4 | #40, #41, #42, #43 |
| Blockers cleaned | 1 | #31 |
| Stale pings sent | 2 | #28, #33 |
| Skipped | 0 | — |

Total: 10 actions taken across 10 issues.
```

Suggest: "Run `/pm:next` to see what to work on now that the backlog is cleaned up."
