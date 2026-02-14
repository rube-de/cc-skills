---
name: pr-check
description: >-
  PR review compliance: fetch review comments from an open PR,
  categorize as resolved/unresolved/dismissed, critically evaluate
  fixable items, implement approved fixes, and reply inline.
allowed-tools: [Bash, Read, Grep, Glob, Write, Edit, AskUserQuestion]
---

# DLC: PR Review Compliance

Fetch PR review comments, implement fixes for unresolved items, and report compliance.

Before running, **read [../dlc/references/ISSUE-TEMPLATE.md](../dlc/references/ISSUE-TEMPLATE.md) now** for the issue format, and **read [../dlc/references/REPORT-FORMAT.md](../dlc/references/REPORT-FORMAT.md) now** for the findings data structure.

## Step 1: Resolve Target PR

Determine the PR to check:

```bash
# If PR number provided as argument
gh pr view <PR_NUMBER> --json number,title,url,headRefName,state

# If no argument — detect from current branch
gh pr view --json number,title,url,headRefName,state
```

If no open PR is found, abort with: "No open PR found for the current branch. Push your changes and open a PR first."

## Step 1b: Verify and Checkout PR Branch

Before making any changes, verify you are on the PR's source branch (`headRefName` from Step 1).

```bash
CURRENT=$(git branch --show-current)
PR_BRANCH="{headRefName from Step 1}"

if [ "$CURRENT" = "$PR_BRANCH" ]; then
  echo "Already on $PR_BRANCH — proceeding."
else
  # Check for uncommitted changes
  if ! git diff --quiet || ! git diff --cached --quiet; then
    echo "ERROR: Current branch ($CURRENT) does not match PR branch ($PR_BRANCH) and worktree is dirty."
    echo "Stash or commit your changes, then re-run."
    exit 1
  fi
  # Clean worktree — checkout the PR branch
  gh pr checkout {number}
fi
```

Post-checkout verification (defense-in-depth):

```bash
VERIFY=$(git branch --show-current)
if [ "$VERIFY" != "$PR_BRANCH" ]; then
  echo "ERROR: Checkout failed — expected $PR_BRANCH but on $VERIFY. Aborting."
  exit 1
fi
```

If verification fails, abort with the error above. Do **not** proceed to Step 2 on the wrong branch — commits and pushes would target the wrong remote branch.

## Step 2: Fetch Review Comments

Retrieve all review comments and categorize them:

```bash
# Get all review comments
gh api repos/{owner}/{repo}/pulls/{number}/comments --paginate

# Get review threads (to check resolved status)
gh pr view <PR_NUMBER> --json reviewDecision,reviews,comments
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

## Step 4: Critically Evaluate and Implement Fixable Items

For each **fixable unresolved** comment, follow a three-phase workflow:

### 4a. Read Context

1. Read the file at the referenced path
2. Read at least 20 lines of surrounding context (before and after the target line)
3. Read the full comment thread (including any replies)

### 4b. Critically Evaluate

Assess the suggestion against these criteria:

| Criterion | Question |
|-----------|----------|
| Technical correctness | Is the suggestion factually correct? |
| Project alignment | Does it match existing patterns in this codebase? |
| Regression risk | Could implementing it break other functionality? |
| Scope appropriateness | Is the change proportional to the problem? |

Assign a confidence level:
- **High**: All four criteria pass — the suggestion is clearly correct and safe
- **Medium**: One or two criteria are uncertain — the suggestion is plausible but not obvious
- **Low**: Multiple criteria fail or the suggestion appears technically incorrect

### 4c. Confidence-Gated Implementation

- **High confidence** → Implement directly using `Edit` or `Write`, then stage: `git add <file>`
- **Medium or Low confidence** → Use `AskUserQuestion` to present:
  - The quoted reviewer comment
  - Your assessment (which criteria passed/failed and why)
  - Options: "Implement as suggested" / "Skip this comment" / "Implement with modification"
  - If "Implement with modification" is chosen, ask for guidance before proceeding

**Guardrails:**
- Only modify files that are part of the PR's diff
- Do not make changes the reviewer didn't request
- If unsure about intent, classify as **Discussion** instead of guessing
- Never implement a suggestion assessed as technically incorrect without explicit user approval

## Step 5: Reply to Fixed Comments

For each **fixed** comment, post an inline reply:

```bash
# Reply to a review comment
gh api repos/{owner}/{repo}/pulls/{number}/comments \
  --method POST \
  -f body="Fixed: {brief description of what was changed}" \
  -f in_reply_to={comment_id}
```

> **Note:** Discussion and Blocked replies are deferred to Step 6b (after user decision).

## Step 6: User-Gated Issue Creation

If no Discussion, Blocked, or user-skipped Fixable items remain after Step 4, **skip this step entirely**.

If out-of-scope items remain (Discussion, Blocked, or items the user chose to skip), use `AskUserQuestion` to ask:

- Present the count and a brief summary of remaining items
- Options: "Yes, create follow-up issue" / "No, I'll handle manually" / "Show me details first"

If the user selects "Show me details first", display each remaining item with your assessment, then re-ask with the first two options.

**If the user approves issue creation**, proceed:

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

```bash
REPO=$(gh repo view --json nameWithOwner -q .nameWithOwner)
TIMESTAMP=$(date +%s)
BODY_FILE="/tmp/dlc-issue-${TIMESTAMP}.md"
# Write the formatted issue body to BODY_FILE following ISSUE-TEMPLATE.md structure

gh issue create \
  --repo "$REPO" \
  --title "[DLC] PR Review: {n} unresolved comments on PR #{number}" \
  --body-file "$BODY_FILE" \
  --label "dlc-pr-check"
```

If issue creation fails, save draft to `/tmp/dlc-draft-${TIMESTAMP}.md` and print the path.

**If the user chooses "No, I'll handle manually"**, skip issue creation and proceed to Step 6b.

## Step 6b: Decision-Aware Inline Replies

If there are no Discussion, Blocked, or user-skipped Fixable items, **skip this step**.

After the user's decision in Step 6, post inline replies reflecting the actual outcome. Separate the global decision (for Discussion/Blocked items) from the per-item decision (for skipped Fixable items).

For each **Discussion** or **Blocked** comment, map the user's Step 6 decision:

| User Decision (Step 6) | Inline Reply Text |
|------------------------|-------------------|
| Created follow-up issue | `Acknowledged — tracked in #ISSUE_NUMBER` |
| Handle manually | `Acknowledged — will be addressed by the author` |

For each **user-skipped Fixable** comment, always reply:

| Item Status | Inline Reply Text |
|-------------|-------------------|
| Skipped Fixable | `Acknowledged — deferred (out of scope for this PR)` |

```bash
# Reply to each Discussion/Blocked/skipped comment with the decision-aware message
gh api repos/{owner}/{repo}/pulls/{number}/comments \
  --method POST \
  -f body="{decision-aware reply text}" \
  -f in_reply_to={comment_id}
```

## Step 6c: PR Summary Comment

If there are no Discussion, Blocked, or user-skipped Fixable items, **skip this step**.

Post a PR-level summary comment containing the overall status and decisions.

Build the summary with these sections:

```markdown
## PR Comment Status

| Status | Count |
|--------|-------|
| Resolved | {n} |
| Fixed by DLC | {n} |
| Skipped (user decision) | {n} |
| Discussion (needs human) | {n} |
| Blocked | {n} |
| Dismissed | {n} |
| **Total** | **{n}** |

## Decisions

{For each Discussion/Blocked/skipped Fixable item, one line:}
- `{path}:{line}` — {decision}: {brief description}

## Follow-up

{Include all applicable lines below:}
{If any follow-up issue was created:}
Follow-up issue: #ISSUE_NUMBER

{If any items will be handled manually by the author:}
Author will address some remaining items manually.

{If any items were explicitly deferred/skipped:}
Some remaining items deferred — out of scope for this PR.
```

Write the summary and post it:

```bash
TIMESTAMP=$(date +%s)
SUMMARY_FILE="/tmp/dlc-pr-summary-${TIMESTAMP}.md"
# Write the summary content to SUMMARY_FILE

gh pr comment {number} --body-file "$SUMMARY_FILE"
```

## Step 7: Commit, Push, and Report

If fixes were made:

```bash
git commit -m "fix: address PR review comments"
```

Push the commit to the remote branch:

```bash
git push origin HEAD
```

If push fails, report the error clearly and print a manual recovery command:

```text
Push failed: {error message}
Your commit is preserved locally. The most common cause is new commits on the remote branch.
To resolve, pull and retry:
  git pull --rebase && git push origin HEAD
```

Do NOT use `--force` or `--force-with-lease`. Only standard push is allowed.

Print summary:

```text
PR review compliance check complete.
  - PR: #{number} ({title})
  - Total comments: {n}
  - Resolved: {n}, Fixed by DLC: {n}, Skipped (user decision): {n}, Discussion: {n}, Blocked: {n}, Dismissed: {n}
  - Push: {Pushed {sha} to origin/{branch}}  [if push succeeded]
  - Push: Push failed: {reason}  [if push failed]
  - Follow-up issue: #{number} ({url})  [only if user approved creation]
```

If all comments are resolved or dismissed, skip issue creation and report: "All PR review comments addressed."
