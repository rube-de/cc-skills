---
name: babysit
description: >-
  PR babysitter: monitors CI status, auto-rebases when behind, auto-fixes CI
  where possible, runs pr-check for review comments, and re-requests review
  after fixes. Designed for /loop usage with Remote Control.
allowed-tools: [Bash, Read, Edit, Write, Grep, Glob, Skill, CronList, CronDelete]
---

# DLC: PR Babysitter

Monitor a PR on a loop: check CI, auto-rebase, auto-fix CI failures, run pr-check for review comments, and re-request review after pushing fixes. Use with Remote Control to monitor from your phone.

**Usage:** `/loop 10m /dlc:babysit` (auto-detect PR) or `/loop 10m /dlc:babysit 253`

## Notification Rules

Only print status messages for **errors that need human attention** and **completion** (PR ready to merge). Routine actions (rebase, lint fix, CI retry, re-request review) are silent.

When the skill says "Notify" — print the message to stdout. The user sees it via Remote Control or the terminal.

### Deduplication

Notifications are deduplicated via a state file at `.dev/dlc/babysit-<PR_NUMBER>.state`. Same state across cycles produces no output. Details are in the notification steps below.

## Step 0: Setup

### Initialize state tracking

Create `.dev/dlc/` if it does not exist. Read the state file `.dev/dlc/babysit-<PR_NUMBER>.state` if it exists — it contains the status key from the last notification. Before sending any notification, compare the current status key against this file. If identical, skip the notification. After sending, write the new key. Delete the state file when self-cancelling.

### Detect PR

If `$ARGUMENTS` contains a number, use it as PR_NUMBER and fetch that PR explicitly:

```bash
gh pr view $PR_NUMBER --json number,title,headRefName,baseRefName,state,url,reviewDecision,mergeable
```

If no number is provided, auto-detect from the current branch:

```bash
gh pr view --json number,title,headRefName,baseRefName,state,url,reviewDecision,mergeable
```

If no PR exists for the current branch, print "No PR found for current branch." and stop. Do NOT notify — the user may not have pushed yet.

Extract and store: PR_NUMBER, PR_TITLE, PR_BRANCH, BASE_BRANCH, PR_STATE, PR_URL, REVIEW_DECISION, MERGEABLE.

Also extract owner/repo for the GraphQL query in Step 3:

```bash
gh repo view --json nameWithOwner --jq '.nameWithOwner'
```

Split into OWNER and REPO.

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
- **Failed**: conclusion is FAILURE, ERROR, TIMED_OUT, or CANCELLED
- **Passed**: conclusion is SUCCESS, SKIPPED, or NEUTRAL

**If any checks are still running:**
Stop without printing anything. This is the normal waiting state.

**If any checks failed:** Continue to Step 1b (attempt auto-fix).

**If NO checks exist:** Stop without printing. Checks may be delayed or not configured. Wait for the next cycle.

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

## Step 3: Quick Readiness Check

Before running the heavyweight pr-check, check if the PR is already ready — or if there's nothing pr-check can do.

Count unresolved review threads:

```bash
gh api graphql -f query='
  query($owner:String!,$repo:String!,$pr:Int!) {
    repository(owner:$owner,name:$repo) {
      pullRequest(number:$pr) {
        reviewThreads(first:100) {
          totalCount
          nodes { isResolved isOutdated }
        }
      }
    }
  }' -f "owner=$OWNER" -f "repo=$REPO" -F "pr=$PR_NUMBER" \
  --jq '.data.repository.pullRequest.reviewThreads as $rt
        | ($rt.nodes | map(select(.isResolved==false)) | length) as $unresolved
        | if $rt.totalCount > 100 and $unresolved == 0
          then 1
          else $unresolved
          end'
```

Store as UNRESOLVED. Note: outdated threads are NOT filtered out — they may still contain valid feedback that `dlc:pr-check` needs to re-check. If totalCount > 100 and the fetched page shows 0 unresolved, treat as 1 (safety net for truncation).

Re-fetch current state:

```bash
gh pr view $PR_NUMBER --json reviewDecision,mergeable --jq '{reviewDecision,mergeable}'
```

### No reviews submitted yet

Check whether any reviews exist:

```bash
REVIEW_COUNT=$(gh pr view $PR_NUMBER --json reviews --jq '.reviews | length')
```

If reviewDecision is `REVIEW_REQUIRED` and REVIEW_COUNT is 0 (no reviews submitted at all):
- Notify: `👀 PR #<number> is waiting for review. No reviewers have submitted yet. <url>`
- Stop. Do NOT run pr-check — there are no comments to process. Next cycle will re-check.

### Ready to merge

ALL of these are true:
1. All CI passed (confirmed in Step 1)
2. UNRESOLVED is 0
3. reviewDecision is APPROVED or empty (no review policy)
4. mergeable is MERGEABLE

If ready:
- Notify: `✅ PR #<number> ready to merge! — <title> — <url>`
- Self-cancel and stop. The user merges when they choose to.

### Has unresolved threads

Continue to Step 4.

## Step 4: Run PR Review Check

Invoke the pr-check skill to handle review comments:

```text
Skill("dlc:pr-check", "<PR_NUMBER>")
```

Let pr-check run its full cycle: fetch comments, categorize, fix what it can, reply inline, commit, push.

## Step 5: Re-Request Review

After pr-check pushes fixes, re-request review from all prior reviewers. This signals that feedback has been addressed and prompts a fresh look.

Get the list of reviewers who submitted reviews:

```bash
REVIEWERS=$(gh pr view $PR_NUMBER --json reviews --jq '[.reviews[].author.login] | unique | join(",")')
```

Re-request review only if the list is non-empty:

```bash
if [ -n "$REVIEWERS" ]; then
  gh pr edit $PR_NUMBER --add-reviewer "$REVIEWERS"
fi
```

Do not notify about re-request — this is routine automation.

## Step 6: Final Assessment

After pr-check and re-review request, re-check the PR state.

First, re-check CI status — pr-check may have pushed new commits:

```bash
gh pr checks $PR_NUMBER --json name,state,conclusion
```

If any checks are not completed (state != COMPLETED), stop silently — CI needs to finish.

If any checks completed with a failing conclusion (FAILURE, ERROR, TIMED_OUT, CANCELLED), stop silently — the next cycle will pick these up in Step 1.

Only proceed if ALL checks are completed with passing conclusions (SUCCESS, SKIPPED, NEUTRAL). Re-run the unresolved threads query and reviewDecision check from Step 3.

**Ready to merge** (same criteria as Step 3):
- Notify: `✅ PR #<number> ready to merge! — <title> — <url>`
- Self-cancel and stop.

**Unresolved comments remain (UNRESOLVED > 0):**
- Notify: `💬 PR #<number> has <count> unresolved threads after auto-fix. Review needed. <url>`
- Stop. Next cycle will re-check.

**Changes requested, awaiting re-review (reviewDecision is CHANGES_REQUESTED):**
- Stop silently. Re-review was already requested in Step 5. Next cycle will re-check.

**Not mergeable (mergeable is CONFLICTING):**
- Notify: `⚠️ PR #<number> has merge conflicts. <url>`
- Stop. Next cycle will attempt rebase in Step 2.

## Cancellation Pattern

To self-cancel the babysit loop:

1. Call `CronList` to list all scheduled tasks.
2. Find the task whose prompt contains "babysit" or "dlc:babysit".
3. Call `CronDelete` with that task's ID.
4. Delete the state file: `.dev/dlc/babysit-<PR_NUMBER>.state`
5. If no matching task is found, this was a manual invocation — skip cancellation.
