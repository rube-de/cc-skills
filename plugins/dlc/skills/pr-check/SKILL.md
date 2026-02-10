---
name: pr-check
description: >-
  PR review compliance: fetch review comments from an open PR,
  categorize as resolved/unresolved/dismissed, implement fixes
  for unresolved items, reply inline, and create a summary issue.
disable-model-invocation: true
allowed-tools: [Bash, Read, Grep, Glob, Write, Edit]
---

# DLC: PR Review Compliance

Fetch PR review comments, implement fixes for unresolved items, and report compliance.

Before running, **read [../dlc/references/ISSUE-TEMPLATE.md](../dlc/references/ISSUE-TEMPLATE.md) now** for the issue format, and **read [../dlc/references/REPORT-FORMAT.md](../dlc/references/REPORT-FORMAT.md) now** for the findings data structure.

## Step 1: Resolve Target PR

Determine the PR to check:

```bash
# If PR number provided as argument
gh pr view <PR#> --json number,title,url,headRefName,state

# If no argument — detect from current branch
gh pr view --json number,title,url,headRefName,state
```

If no open PR is found, abort with: "No open PR found for the current branch. Push your changes and open a PR first."

## Step 2: Fetch Review Comments

Retrieve all review comments and categorize them:

```bash
# Get all review comments
gh api repos/{owner}/{repo}/pulls/{number}/comments --paginate

# Get review threads (to check resolved status)
gh pr view <PR#> --json reviewDecision,reviews,comments
```

Parse each comment into:

| Field | Source |
|-------|--------|
| `author` | `.user.login` |
| `body` | `.body` |
| `path` | `.path` (file the comment is on) |
| `line` | `.line` or `.original_line` |
| `created_at` | `.created_at` |
| `in_reply_to` | `.in_reply_to_id` (null if top-level) |

## Step 3: Categorize Comments

Classify each top-level review thread:

| Category | Criteria |
|----------|----------|
| **Resolved** | Thread explicitly marked as resolved in GitHub, or author replied confirming fix |
| **Dismissed** | Review was dismissed, or comment is a nit/optional suggestion (contains "nit:", "optional:", "consider:") |
| **Unresolved** | Active thread with no resolution — the reviewer expects a change |

For unresolved comments, further classify by actionability:

| Sub-Category | Criteria |
|-------------|----------|
| **Fixable** | Comment points to a specific code change (rename, refactor, add check, fix bug) |
| **Discussion** | Comment asks a question or raises a concern that needs human judgment |
| **Blocked** | Fix requires information or access the agent doesn't have |

## Step 4: Implement Fixes for Fixable Items

For each **fixable unresolved** comment:

1. Read the file at the referenced path and line
2. Understand the reviewer's request
3. Implement the fix using `Edit` or `Write`
4. Stage the change: `git add <file>`

**Guardrails:**
- Only modify files that are part of the PR's diff
- Do not make changes the reviewer didn't request
- If unsure about intent, classify as **Discussion** instead of guessing

## Step 5: Reply to Comments

For each addressed comment, post an inline reply:

```bash
# Reply to a review comment
gh api repos/{owner}/{repo}/pulls/{number}/comments \
  --method POST \
  -f body="Fixed: {brief description of what was changed}" \
  -f in_reply_to={comment_id}
```

For **Discussion** items, post:
```
This requires human input — flagged in the DLC summary issue.
```

For **Blocked** items, post:
```
Unable to fix automatically — flagged in the DLC summary issue with details.
```

## Step 6: Create Summary Issue (if unresolved items remain)

**Read [../dlc/references/ISSUE-TEMPLATE.md](../dlc/references/ISSUE-TEMPLATE.md) now** and format the issue body exactly as specified.

**Critical format rules** (reinforced here):
- Title: `[DLC] PR Review: {n} unresolved comments on PR #{number}`
- Label: `dlc-pr-check`
- Body must contain: Scan Metadata table, Findings Summary table (severity x count), Findings Detail grouped by severity, Recommended Actions

**Severity mapping** (reinforced here for defense-in-depth):

| Comment Category | Severity |
|-----------------|----------|
| Unresolved — Blocked | **High** |
| Unresolved — Discussion | **Medium** |
| Unresolved — Fixable (unfixed due to error) | **Medium** |
| Dismissed | **Info** |

**Additional section** — add after Findings Detail:

```markdown
## PR Comment Status

| Status | Count |
|--------|-------|
| Resolved | {n} |
| Fixed by DLC | {n} |
| Discussion (needs human) | {n} |
| Blocked | {n} |
| Dismissed | {n} |
| **Total** | **{n}** |
```

```bash
REPO=$(gh repo view --json nameWithOwner -q .nameWithOwner)
TIMESTAMP=$(date +%s)
BODY_FILE="/tmp/dlc-issue-${TIMESTAMP}.md"

gh issue create \
  --repo "$REPO" \
  --title "[DLC] PR Review: {n} unresolved on PR #{number}" \
  --body-file "$BODY_FILE" \
  --label "dlc-pr-check"
```

If issue creation fails, save draft to `/tmp/dlc-draft-${TIMESTAMP}.md` and print the path.

## Step 7: Commit and Report

If fixes were made:

```bash
git commit -m "fix: address PR review comments (DLC automated)"
```

Print summary:

```
PR review compliance check complete.
  - PR: #{number} ({title})
  - Total comments: {n}
  - Resolved: {n}, Fixed by DLC: {n}, Discussion: {n}, Blocked: {n}, Dismissed: {n}
  - Issue: #{number} ({url})  [only if unresolved items remain]
```

If all comments are resolved or dismissed, skip issue creation and report: "All PR review comments addressed."
