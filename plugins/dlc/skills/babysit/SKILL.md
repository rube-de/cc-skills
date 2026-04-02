---
name: babysit
description: >-
  PR babysitter: monitors CI status, auto-rebases when behind, auto-fixes CI
  where possible, delegates review comment handling to dlc:pr-check, and
  re-requests review after fixes. Designed for /loop usage with Remote Control.
allowed-tools: [Bash, Read, Edit, Write, Grep, Glob, Skill, CronList, CronDelete]
---

# DLC: PR Babysitter

Monitor a PR on a loop: check CI, auto-rebase, auto-fix CI failures, and delegate review comment handling to `dlc:pr-check`. Use with Remote Control to monitor from your phone.

**Usage:** `/loop 10m /dlc:babysit` (auto-detect PR) or `/loop 10m /dlc:babysit 253`

## Notification Rules

Only print status messages for **errors that need human attention** and **completion** (PR ready to merge). Routine actions (rebase, lint fix, CI retry, re-request review) are silent.

### Deduplication

Notifications are deduplicated via a state file at `.dev/dlc/babysit-<PR_NUMBER>.state`. The file contains a single-line **status key**:

- `ci_failing:<sorted_check_names>` (e.g., `ci_failing:build,lint`)
- `ci_unfixable:<sorted_check_names>`
- `rebase_conflict:<sorted_file_list>`
- `needs_review`
- `needs_decision:<count>` (e.g., `needs_decision:2`)
- `unresolved:<count>`
- `ready`
- `closed:<state>`

Same key across cycles = no output. Write the new key after notifying. Delete the state file when self-cancelling.

## Step 0: Setup

### Initialize state tracking

Create `.dev/dlc/` if it does not exist. Read the state file if it exists.

### Detect PR

If `$ARGUMENTS` contains a number, use it as PR_NUMBER and fetch that PR explicitly:

```bash
gh pr view $PR_NUMBER --json number,title,headRefName,baseRefName,state,url,reviewDecision,mergeable
```

If no number is provided, auto-detect from the current branch:

```bash
gh pr view --json number,title,headRefName,baseRefName,state,url,reviewDecision,mergeable
```

If no PR exists for the current branch, stop silently.

Extract and store: PR_NUMBER, PR_TITLE, PR_BRANCH, BASE_BRANCH, PR_STATE, PR_URL, REVIEW_DECISION, MERGEABLE.

**State gate:** If PR_STATE is not `OPEN`:
- Notify: `PR #<number> is <state>. Babysit cancelled.`
- Self-cancel (see Cancellation Pattern below) and stop.

### Verify and checkout PR branch

Before any git operations, verify you are on PR_BRANCH:

```bash
CURRENT=$(git branch --show-current)
if [ "$CURRENT" != "$PR_BRANCH" ]; then
  if [ -n "$(git status --porcelain)" ]; then
    echo "ERROR: Not on PR branch ($PR_BRANCH) and worktree is dirty. Stash or commit first."
    exit 1
  fi
  gh pr checkout $PR_NUMBER
fi
```

If checkout fails, stop. Do not proceed with git operations on the wrong branch.

## Step 1: Check CI Status

```bash
gh pr checks $PR_NUMBER --json name,state,conclusion
```

Categorize each check:
- **Running**: state is IN_PROGRESS, QUEUED, or PENDING, or conclusion is empty/null
- **Failed**: conclusion is FAILURE, ERROR, TIMED_OUT, CANCELLED, ACTION_REQUIRED, STALE, or any other non-success value
- **Passed**: conclusion is SUCCESS, SKIPPED, or NEUTRAL

**If any checks are still running:**
Stop without printing anything. This is the normal waiting state.

**If any checks failed:** Continue to Step 1b (attempt auto-fix).

**If NO checks exist:** Continue to Step 2. The repo may not have CI configured.

**If ALL checks passed:** Continue to Step 2.

## Step 1b: Attempt CI Auto-Fix

Do not just notify and stop when CI fails. Attempt to diagnose and fix the failure first.

### Read CI logs

Get the HEAD SHA, then fetch ALL non-success runs scoped to that specific commit:

```bash
HEAD_SHA=$(git rev-parse HEAD)
gh run list --commit $HEAD_SHA --json databaseId,conclusion --jq '[.[] | select(.conclusion != "success" and .conclusion != "skipped" and .conclusion != "neutral" and .conclusion != "")] | .[].databaseId'
```

For each failing run, read its logs:

```bash
gh run view <RUN_ID> --log-failed 2>&1 | tail -200
```

Collect and combine log output from all failing runs before classifying.

### Classify and fix

Analyze the log output and classify the failure:

**Lint / format errors** (eslint, prettier, ruff, clippy, etc.):
1. Run the project's lint-fix command (look for it in `package.json` scripts, `Makefile`, `justfile`, or CI config)
2. Stage, commit with message: `fix: auto-fix lint errors`, and push
3. Stop — CI will re-run. Next cycle checks the result.

**Type errors** (tsc, mypy, pyright, etc.):
1. Read the erroring files and fix the type issues
2. Stage, commit with message: `fix: resolve type errors`, and push
3. Stop — CI will re-run.

**Test failures**:
1. Read the failing test output to identify which tests and why
2. Read the test files and the source files they exercise
3. Determine if the fix belongs in the source code (bug) or the test (outdated assertion)
4. Apply the fix, stage, commit with message: `fix: resolve test failures`, and push
5. Stop — CI will re-run.

**Infrastructure / flaky failures** (timeout, network, OOM, rate limit):
1. Attempt to re-run the failed jobs:
   ```bash
   gh run rerun <RUN_ID> --failed
   ```
2. Stop — next cycle checks the result.

**Unknown / cannot diagnose:**
Notify: `🔴 CI failing on PR #<number>: <title> — Failed: <check_names> — could not auto-fix. <url>/checks`
Stop.

Do not notify after a successful fix attempt — this is routine automation. Stop silently and let the next cycle check the result.

## Step 2: Auto-Rebase

Check if the branch is behind the base branch:

```bash
git fetch origin $BASE_BRANCH > /dev/null
BEHIND=$(git rev-list --count HEAD..origin/$BASE_BRANCH)
```

**If BEHIND is 0:** Branch is up to date. Continue to Step 3.

**If BEHIND > 0:**

Attempt rebase:

```bash
git rebase origin/$BASE_BRANCH
```

**If rebase succeeds cleanly:**

```bash
git push --force-with-lease
```

Stop silently — CI needs to re-run. Next cycle will check the results.

**If rebase hits conflicts — resolve them:**

Do NOT abort immediately. For each conflicting commit in the rebase sequence:

1. List conflicting files:
   ```bash
   git diff --name-only --diff-filter=U
   ```

2. For each conflicting file, read the full file content and examine the conflict markers (`<<<<<<<`, `=======`, `>>>>>>>`). Understand both sides:
   - **HEAD** (above `=======`): the base branch you are rebasing onto
   - **Incoming** (below `=======`): the PR commit being replayed

3. Resolve the conflict by editing the file to integrate both sides correctly. Preserve the intent of both changes. Remove all conflict markers.

4. Stage the resolved file:
   ```bash
   git add <file>
   ```

5. After all files in the current commit are resolved:
   ```bash
   git rebase --continue
   ```

6. Repeat for any subsequent conflicting commits in the rebase.

**After all conflicts resolved and rebase completes:**

```bash
git push --force-with-lease
```

Stop silently — CI needs to re-run.

**If a conflict is genuinely ambiguous** (architectural clash, both sides rewrote the same logic differently, or semantic conflict where the correct resolution is unclear):

```bash
git rebase --abort
```

Notify: `⚠️ Rebase conflict on PR #<number> — could not auto-resolve. File(s): <conflicting_files>. <url>`
Stop.

## Step 3: Run PR Review Check

Delegate all review comment handling to `dlc:pr-check`. It handles: fetching comments, categorizing, fixing what it can, replying inline, committing, and pushing.

**Unattended mode:** The babysitter runs in a loop with no human at the terminal. When executing pr-check, do NOT use `AskUserQuestion` for Discussion items — auto-defer all items that would normally require human input (Design Decisions, medium/low-confidence Implementable Fixes, etc.). The babysitter will surface these to the human as a notification instead of silently posting "Acknowledged" replies.

```text
Skill("dlc:pr-check", "<PR_NUMBER>")
```

After pr-check completes, parse its output summary to extract these values:
- Total unresolved items remaining: items marked Fixed, Answered, Resolved, or Dismissed are **done**. Remaining = Total - (Fixed + Answered + Resolved + Dismissed).
- **Discussion-Deferred count**: items where pr-check deferred to the author (these need human judgment). Extract from the `Discussion: {n} ({deferred} deferred, {tracked} tracked)` line in the summary.
- Whether pr-check pushed any commits (look for "Pushed" in the summary or a non-empty git diff from before)

If pr-check pushed commits, re-request review from all prior reviewers. Filter out bot accounts (logins ending in `[bot]`):

```bash
REVIEWERS=$(gh pr view $PR_NUMBER --json reviews --jq '[.reviews[].author.login | select(endswith("[bot]") | not)] | unique | join(",")')
if [ -n "$REVIEWERS" ]; then
  gh pr edit $PR_NUMBER --add-reviewer "$REVIEWERS"
fi
```

If pr-check did NOT push commits, skip the re-request — there's nothing new to review.

## Step 4: Assess and Notify

After pr-check completes, re-check the PR state:

```bash
gh pr checks $PR_NUMBER --json name,state,conclusion
gh pr view $PR_NUMBER --json reviewDecision,mergeable
```

**If CI is not fully passing** (any check running or failed):
Stop silently — next cycle will handle it in Step 1.

**If pr-check reported Discussion-Deferred items (count > 0):**
These are design decisions, architectural trade-offs, or ambiguous suggestions that need human judgment. The babysitter cannot resolve them — surface them so the human knows their input is needed.
- Notify: `🧑‍⚖️ PR #<number> has <count> design decisions needing your input. <url>`
- Write state key `needs_decision:<count>`.
- Do NOT self-cancel — the PR may still need further cycles after the human decides.
- Stop. Next cycle will re-check (if the human resolved them, pr-check will see the replies).

**If pr-check reported 0 remaining unresolved items AND 0 Discussion-Deferred AND reviewDecision is APPROVED (or empty) AND mergeable is MERGEABLE:**
- Notify: `✅ PR #<number> ready to merge! — <title> — <url>`
- Self-cancel and stop.

**If pr-check reported remaining unresolved items:**
- Notify: `💬 PR #<number> has <count> unresolved items after auto-fix. Review needed. <url>`
- Stop. Next cycle will re-check.

**If reviewDecision is CHANGES_REQUESTED:**
Stop silently. Re-review was already requested in Step 3. Next cycle will re-check.

**If mergeable is CONFLICTING:**
- Notify: `⚠️ PR #<number> has merge conflicts. <url>`
- Stop. Next cycle will attempt rebase in Step 2.

## Cancellation Pattern

To self-cancel the babysit loop:

1. Call `CronList` to list all scheduled tasks.
2. Find the task whose prompt contains "babysit". If multiple babysit tasks exist, prefer the one containing the current PR_NUMBER. If none contain a PR number (auto-detect mode), cancel the one matching `dlc:babysit` without a number argument.
3. Call `CronDelete` with that task's ID.
4. Delete the state file: `.dev/dlc/babysit-<PR_NUMBER>.state`
5. If no matching task is found, this was a manual invocation — skip cancellation.
