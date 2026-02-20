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

## Step 1: Fetch PR Data

Run the `pr-comments.sh` script located in the `scripts/` directory of this plugin (same plugin containing this SKILL.md):

```bash
# If PR number provided as argument
sh scripts/pr-comments.sh <PR_NUMBER>

# If no argument — auto-detect from current branch
sh scripts/pr-comments.sh
```

**Validate the response:**
- Check stderr for a JSON `error` object — if present, abort with the error message
- Extract from the JSON output and store as variables:
  - `PR_NUMBER` ← `.pr.number`
  - `PR_TITLE` ← `.pr.title`
  - `PR_BRANCH` ← `.pr.branch`
  - `PR_STATE` ← `.pr.state`
  - `PR_AUTHOR` ← `.pr.author`
  - `PR_URL` ← `.pr.url`
  - `PR_OWNER` ← `.pr.owner`
  - `PR_REPO` ← `.pr.repo`
  - `REVIEW_DECISION` ← `.pr.reviewDecision`

**State check:** If `PR_STATE` is not `OPEN`, abort with: "PR #{PR_NUMBER} is {PR_STATE} — only open PRs can be checked."

**Truncation warning:** If `.summary.truncated` is `true`, warn: "Review threads were truncated — some threads may be missing from the analysis."

**Print reviewer inventory** from the pre-built `.reviewers` array:

```text
Reviewer inventory ({summary.reviewer_count} reviewers, {summary.total_comments} total comments, {summary.total_threads} threads):
  - @{reviewer.login}: {reviewer.total_comments} comments ({reviewer.top_level_threads} top-level threads)
```

Store each reviewer's `top_level_threads` count as the coverage target for Step 4b.

## Step 1b: Verify and Checkout PR Branch

Before making any changes, verify you are on the PR's source branch (`PR_BRANCH` from Step 1).

```bash
CURRENT=$(git branch --show-current)

if [ "$CURRENT" = "$PR_BRANCH" ]; then
  echo "Already on PR branch $PR_BRANCH — proceeding."
else
  # Check for uncommitted changes (tracked and untracked)
  if [ -n "$(git status --porcelain)" ]; then
    echo "ERROR: Current branch ($CURRENT) does not match PR branch ($PR_BRANCH) and worktree is dirty."
    echo "Stash or commit your changes, then re-run."
    exit 1
  fi

  # Clean worktree — attempt to checkout the PR branch
  echo "Switching to PR branch $PR_BRANCH..."
  gh pr checkout $PR_NUMBER

  # Post-checkout verification (defense-in-depth)
  VERIFY=$(git branch --show-current)
  if [ "$VERIFY" != "$PR_BRANCH" ]; then
    echo "ERROR: Checkout failed — expected $PR_BRANCH but on $VERIFY. Aborting."
    exit 1
  fi
  echo "Successfully checked out $PR_BRANCH."
fi
```

If verification fails, abort with the error above. Do **not** proceed to Step 2 on the wrong branch — commits and pushes would target the wrong remote branch.

## Step 2: Categorize Comments

Using the `.threads` array from Step 1, classify each top-level review thread:

| Category | Criteria |
|----------|----------|
| **Resolved** | `is_resolved == true`, or PR author replied confirming fix (`has_author_reply == true` with affirmative language) |
| **Dismissed** | `is_outdated == true`, review was dismissed, or comment is a nit/optional suggestion (contains "nit:", "optional:", "consider:") |
| **Unresolved** | Active thread with `is_resolved == false` and `is_outdated == false` — the reviewer expects a change |

For unresolved comments, further classify by actionability:

| Sub-Category | Criteria |
|-------------|----------|
| **Fixable** | Comment points to a specific code change (rename, refactor, add check, fix bug) |
| **Discussion** | Comment asks a question or raises a concern that needs human judgment |
| **Blocked** | Fix requires information or access the agent doesn't have |

## Step 3: Critically Evaluate and Implement Fixable Items

For each **fixable unresolved** comment, follow a three-phase workflow:

### 3a. Read Context

1. Read the file at the referenced path
2. Read at least 20 lines of surrounding context (before and after the target line)
3. Read the full comment thread (including any replies)

### 3b. Critically Evaluate

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

### 3c. Confidence-Gated Implementation

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
- If an `Edit` or `Write` call fails (tool error, file not found, conflict), reclassify the item as **Blocked** with the reason "implementation failed: {error}" — do not leave it in the Fixable state

## Step 4: Reply to Fixed Comments

For each **fixed** comment, post an inline reply using the `rest_id` (database ID) from the thread data:

```bash
# Reply to a review comment — use rest_id from the thread's first comment
gh api repos/$PR_OWNER/$PR_REPO/pulls/$PR_NUMBER/comments \
  --method POST \
  -f body="Fixed: {brief description of what was changed}" \
  -F in_reply_to={rest_id}
```

> **Note:** Discussion and Blocked replies are deferred to Step 5b (after user decision).

## Step 4b: Coverage Verification

Verify that every top-level thread from Step 1 has been accounted for. For each reviewer, count the top-level threads that appear across **all** categories:

| Category | Counts toward coverage? |
|----------|------------------------|
| Resolved | Yes |
| Dismissed | Yes |
| Fixed by DLC | Yes |
| Skipped (user decision) | Yes |
| Discussion | Yes |
| Blocked | Yes |

For each reviewer from Step 1, assert:

```text
covered threads (sum across all categories) == top-level thread count from Step 1
```

**If all reviewers pass:** Print confirmation and continue to Step 5.

```text
Coverage verification passed: {n}/{n} threads verified across {r} reviewers.
```

**If any reviewer has a mismatch: HALT.**

Do **not** proceed to Step 5. Print the error:

```text
ERROR: Coverage verification failed.
  Reviewer @{name}: expected {expected} top-level threads, found {actual} categorized.
  Missing comment IDs: {id1}, {id2}, ...
  Recovery: re-processing missed comments through Steps 2-3.
```

**Recovery procedure:**

1. Re-process only the missed comments through Steps 2–3
2. Re-run this verification (Step 4b) a second time
3. If the second verification also fails, **stop permanently** and report:

```text
FATAL: Coverage verification failed after retry.
  Reviewer @{name}: still missing {n} threads.
  Missing comment IDs: {id1}, {id2}, ...
  Manual audit required — cannot proceed.
```

Do **not** retry more than once. A second failure indicates a structural issue that automated re-processing cannot fix.

> **Why this step exists:** Without explicit coverage verification, silently dropped comments are undetectable. This step closes the gap between "comments fetched" (Step 1) and "comments addressed" — ensuring that every reviewer's feedback is categorized before fixes are committed and replies are posted.

## Step 5: User-Gated Issue Creation

If no Discussion, Blocked, or user-skipped Fixable items remain after Step 3, **skip this step entirely**.

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

**If the user chooses "No, I'll handle manually"**, skip issue creation and proceed to Step 5b.

## Step 5b: Decision-Aware Inline Replies

If there are no Discussion, Blocked, or user-skipped Fixable items, **skip this step**.

After the user's decision in Step 5, post inline replies reflecting the actual outcome. Separate the global decision (for Discussion/Blocked items) from the per-item decision (for skipped Fixable items).

For each **Discussion** or **Blocked** comment, map the user's Step 5 decision:

| User Decision (Step 5) | Inline Reply Text |
|------------------------|-------------------|
| Created follow-up issue | `Acknowledged — tracked in #ISSUE_NUMBER` |
| Handle manually | `Acknowledged — will be addressed by the author` |

For each **user-skipped Fixable** comment, always reply:

| Item Status | Inline Reply Text |
|-------------|-------------------|
| Skipped Fixable | `Acknowledged — deferred (out of scope for this PR)` |

```bash
# Reply to each Discussion/Blocked/skipped comment using rest_id from thread data
gh api repos/$PR_OWNER/$PR_REPO/pulls/$PR_NUMBER/comments \
  --method POST \
  -f body="{decision-aware reply text}" \
  -F in_reply_to={rest_id}
```

## Step 5c: PR Summary Comment

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

gh pr comment $PR_NUMBER --body-file "$SUMMARY_FILE"
```

## Step 6: Commit, Push, and Report

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
  - Coverage: {verified_threads}/{total_threads} threads verified (Step 4b passed)
  - Per-reviewer breakdown:
      @{reviewer1}: Resolved={resolved_count}, Fixed={fixed_count}, Skipped={skipped_count}, Discussion={discussion_count}, Blocked={blocked_count}, Dismissed={dismissed_count} — 0 missed
      @{reviewer2}: Resolved={resolved_count}, Fixed={fixed_count}, Skipped={skipped_count}, Discussion={discussion_count}, Blocked={blocked_count}, Dismissed={dismissed_count} — 0 missed
  - Push: {Pushed {sha} to origin/{branch}}  [if push succeeded]
  - Push: Push failed: {reason}  [if push failed]
  - Follow-up issue: #{number} ({url})  [only if user approved creation]
```

If all comments are resolved or dismissed, skip issue creation and report: "All PR review comments addressed."
