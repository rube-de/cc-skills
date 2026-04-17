---
name: babysit
description: >-
  PR babysitter: monitors CI status, auto-rebases when behind, auto-fixes CI
  where possible, delegates review comment handling to dlc:pr-check, and
  re-requests review after fixes. Designed for /loop usage with Remote Control.
allowed-tools: [Bash, Read, Edit, Write, Grep, Glob, Skill, CronList, CronDelete, PushNotification]
---

# DLC: PR Babysitter

Monitor a PR on a loop: check CI, auto-rebase, auto-fix CI failures, and delegate review comment handling to `dlc:pr-check`. Use with Remote Control to monitor from your phone.

**Usage:** `/loop 10m /dlc:babysit` (auto-detect PR) or `/loop 10m /dlc:babysit 253`

## Why This Matters

Bot reviewers (Copilot, CodeRabbit, Gemini) post new comments on every push — this is by design, not a bug in your workflow. A typical PR goes through 3-8 review-fix cycles before converging to zero unresolved items. Each cycle you run is measurable progress: fewer comments, better code, closer to merge-ready.

The human set up this loop because they trust you to shepherd the PR to completion autonomously. When the comment count drops from 12 to 5 to 2 to 0 across cycles, that's excellent work — not busywork.

## Notification Rules

Only fire `PushNotification` for **errors that need human attention** and **completion** (PR ready to merge). Routine actions (rebase, lint fix, CI retry, re-request review) are silent. `PushNotification` is always the sanctioned channel — never substitute with a `Notify:` print line or `echo`, because print output does not ping the user's device.

### Deduplication

Notifications are deduplicated via a state file at `.dev/dlc/babysit-<PR_NUMBER>.state`. The file contains a single-line **status key**:

- `ci_failing:<sorted_check_names>` (e.g., `ci_failing:build,lint`)
- `rebase_conflict:<sorted_file_list>`
- `merge_conflict`
- `pending_human:<count>` (count-only dedup, e.g., `pending_human:2`)
- `unresolved:<count>`
- `unresolved:<count>,ci_failing:<sorted_check_names>`
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
- Write state key `closed:<state>`.
- Fire `PushNotification` with message `PR #<number> is <state>. Babysit cancelled.`
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

Query the named checks **and** the raw workflow runs on the HEAD commit — the two views can disagree. An Action workflow can be `in_progress` or `queued` before (or without ever) registering a named check status, so relying on `gh pr checks` alone will prematurely classify CI as "settled" while bot reviewers are still writing comments. Treat either source reporting activity as a pending state.

```bash
gh pr checks $PR_NUMBER --json name,state,bucket
IN_PROGRESS_RUNS=$(gh run list --commit $(git rev-parse HEAD) --json status --jq '[.[] | select(.status == "in_progress" or .status == "queued")] | length')
```

Categorize each named check by its `bucket` field:
- **Running**: `bucket` is `pending`
- **Failed**: `bucket` is `fail` or `cancel` — cancelled checks are not passing per GitHub required-check semantics
- **Passed**: `bucket` is `pass`
- **Neutral**: `bucket` is `skipping` — treat as non-blocking (not a failure)

**If any checks are still running OR `IN_PROGRESS_RUNS > 0`:**
Stop without printing anything. This is the normal waiting state — no point acting on incomplete results. `IN_PROGRESS_RUNS > 0` catches bot-review workflows (Copilot, CodeRabbit, Codex) that execute via GitHub Actions but may not surface a named check.

**If ALL checks passed or neutral (no pending/fail/cancel) AND `IN_PROGRESS_RUNS == 0`, or NO checks and no runs exist:** Set `CI_STATUS=passing`. Continue to Step 2.

**If any checks failed:** Set `CI_STATUS=failing` and record the failing check names. Continue to Step 1b (attempt auto-fix).

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

**If no failing runs are found** (e.g., the check is from an external review tool like Codacy, CodeRabbit, or Qodo that reports status via the Checks API but has no GitHub Actions run logs):
Skip classification — there is nothing to auto-fix. Continue to Step 2 with `CI_STATUS=failing`.

### Classify and fix

Analyze the log output and classify the failure:

**Lint / format errors** (eslint, prettier, ruff, clippy, etc.):
1. Run the project's lint-fix command (look for it in `package.json` scripts, `Makefile`, `justfile`, or CI config)
2. Stage, commit with message: `fix: auto-fix lint errors`, and push
3. Stop — CI will re-run on the new HEAD. Next cycle checks the result.

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
Cannot auto-fix, but do NOT stop here. Continue to Step 2 with `CI_STATUS=failing`. The failing checks may be resolved by pr-check (e.g., review-tool checks that clear once their comments are addressed).

Do not notify after a successful fix attempt — this is routine automation. Stop silently and let the next cycle check the result.

**Stop vs. continue rule for Step 1b:** Only stop if you **pushed commits** (after applying a fix) **or re-ran jobs** with `gh run rerun` — either action makes the current CI state stale, and the next cycle should evaluate the fresh result. If neither commits were pushed nor jobs were re-run (unknown failure, no logs found), continue to Step 2.

## Step 2: Auto-Rebase

Rebase is about branch freshness, not CI health. Always attempt it regardless of `CI_STATUS`.

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

Stop silently — CI needs to re-run on the new HEAD. Next cycle will check the results.

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

Fire `PushNotification` with message `⚠️ Rebase conflict on PR #<number> — could not auto-resolve. File(s): <conflicting_files>. <url>`.
Write state key `rebase_conflict:<sorted_file_list>`.
Stop.

## Step 3: Run PR Review Check

**Always run `dlc:pr-check` — never skip this step.** Every push triggers new bot reviews (Copilot, CodeRabbit, Gemini), so prior-cycle state is unreliable. Even if all threads were resolved in a previous cycle, new unresolved comments may have appeared since.

Delegate all review comment handling to `dlc:pr-check`. It handles: fetching comments, categorizing, fixing what it can, replying inline, committing, and pushing.

**Trust the process:** Even after multiple cycles, `dlc:pr-check` evaluates each comment on its own merits. If comments are genuinely resolved, `dlc:pr-check` will find 0 unresolved items and confirm it — you never need to short-circuit this by handling comments yourself. Every cycle that reduces the unresolved count is real progress toward merge-ready.

**Context — why unattended mode exists:** The babysitter runs in a loop with no human at the terminal. The invocation below therefore passes `--unattended` so pr-check activates its **Autonomy Ladder** (ten low-risk patterns — rename, typo, null check, logging, etc. — always auto-implemented) and its **Pending-Human** classification for items that genuinely need human judgment (architectural trade-offs, product scope, ambiguous fixes). Pending-Human items surface back here through the `Pending-Human: <n> — ...` line in pr-check's Step 6 summary and produce a single `PushNotification` in Step 4. Under `--unattended`, pr-check posts **no** `Acknowledged — will be addressed by the author` replies — the halt is the communication.

```text
Skill("dlc:pr-check", "<PR_NUMBER> --unattended")
```

After pr-check completes, parse its output summary to extract these values:
- Total unresolved items remaining: items marked Fixed, Answered, Resolved, or Dismissed are **done**. Remaining = Total - (Fixed + Answered + Resolved + Dismissed).
- **Pending-Human count and items**: parse the `Pending-Human: <n> — <item1_short>; <item2_short>; ...` line from the Step 6 summary. The `<n>` is the count; split the tail on `;` (trimming whitespace) to get the per-item short descriptions. If the line is absent, the count is 0. This line is emitted only under `--unattended`. Worked example: `Pending-Human: 2 — rename foo to bar; clarify async semantics of handler()` → `count=2`, `items=["rename foo to bar", "clarify async semantics of handler()"]`.
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

After pr-check completes, re-fetch the PR state (pr-check may have pushed commits that changed things). Query both the named checks and the raw workflow runs, same as Step 1 — especially critical here because `pr-check` may have just pushed a commit that triggered new bot-review workflows that take minutes to finish:

```bash
gh pr checks $PR_NUMBER --json name,state,bucket
IN_PROGRESS_RUNS=$(gh run list --commit $(git rev-parse HEAD) --json status --jq '[.[] | select(.status == "in_progress" or .status == "queued")] | length')
gh pr view $PR_NUMBER --json reviewDecision,mergeable
```

Categorize the fresh check results by `bucket` field (same logic as Step 1 — `fail`/`cancel` = failed, `pass` = passed, `skipping` = neutral, `pending` = running):
- **If any checks are still running** (`bucket` is `pending`) **OR `IN_PROGRESS_RUNS > 0`**: Stop silently — CI is incomplete on the new HEAD. Do NOT take any terminal action (notification + self-cancel) in this state. Next cycle will re-evaluate.
- **If ALL checks passed or neutral (no pending/fail/cancel) AND `IN_PROGRESS_RUNS == 0`, or NO checks and no runs exist:** Set `CI_STATUS=passing`.
- **If any checks failed** (`bucket` is `fail` or `cancel`): Set `CI_STATUS=failing` and record the fresh failing check names (replacing any stale values from Step 1).

Evaluate the following conditions **in order**. The first matching condition wins:

**If pr-check reported Pending-Human items (count > 0):**
These items require human judgment — architectural trade-offs, product scope decisions, or ambiguous fixes with no clear winner. The babysitter cannot resolve them; halt the loop loudly.
- Build the message body: concatenate the per-item shorts with `;` separators, leading with the PR number and count. Target under 200 characters total; if longer, truncate trailing items and append `…` so the most important signal fits in a single mobile notification.
- Fire `PushNotification` with message `PR #<number>: <count> items need your call — <item1_short>; <item2_short>`.
- Write state key `pending_human:<count>` (count-only dedup per spec).
- Self-cancel (see Cancellation Pattern below) and stop. The user will triage via `/dlc:pr-check <PR>` in attended mode, then relaunch `/loop 10m /dlc:babysit <PR>` when ready to resume.

**If pr-check reported remaining unresolved items AND CI_STATUS is `failing`:**
Both need attention — surface both in a single notification so CI failure isn't hidden behind unresolved items.
- Fire `PushNotification` with message `💬 PR #<number> has <count> unresolved items after auto-fix + CI failing: <check_names>. <url>`.
- Write state key `unresolved:<count>,ci_failing:<sorted_check_names>`.
- Stop. Next cycle will re-check.

**If pr-check reported remaining unresolved items AND CI_STATUS is `passing`:**
- Fire `PushNotification` with message `💬 PR #<number> has <count> unresolved items after auto-fix. Review needed. <url>`.
- Write state key `unresolved:<count>`.
- Stop. Next cycle will re-check.

**If CI_STATUS is `failing`:**
- Fire `PushNotification` with message `🔴 CI failing on PR #<number>: <title> — Failed: <check_names>. <url>/checks`.
- Write state key `ci_failing:<sorted_check_names>`.
- Stop. Next cycle will re-check in Step 1.

**If reviewDecision is CHANGES_REQUESTED:**
Stop silently. Re-review was already requested in Step 3. Next cycle will re-check.

**If mergeable is CONFLICTING:**
- Fire `PushNotification` with message `⚠️ PR #<number> has merge conflicts. <url>`.
- Write state key `merge_conflict`.
- Stop. Next cycle will attempt rebase in Step 2.

**If pr-check reported 0 remaining unresolved items AND 0 Pending-Human AND CI_STATUS is `passing` AND reviewDecision is APPROVED (or empty) AND mergeable is MERGEABLE:**
- Write state key `ready`.
- Fire `PushNotification` with message `✅ PR #<number> ready to merge! — <title> — <url>`.
- Self-cancel and stop.

## Cancellation Pattern

To self-cancel the babysit loop:

1. Call `CronList` to list all scheduled tasks.
2. Find the task whose prompt contains "babysit". If multiple babysit tasks exist, prefer the one containing the current PR_NUMBER. If none contain a PR number (auto-detect mode), cancel the one matching `dlc:babysit` without a number argument.
3. Call `CronDelete` with that task's ID.
4. Delete the state file: `.dev/dlc/babysit-<PR_NUMBER>.state`
5. If no matching task is found, this was a manual invocation — skip cancellation.

**Terminal states that follow this pattern:** `ready`, `closed:<state>`, `pending_human:<count>`. Each emits exactly one `PushNotification`, writes its state key, then runs the cancellation above. Non-terminal branches (`ci_failing:*`, `rebase_conflict:*`, `merge_conflict`, `unresolved:*`) notify and stop without cancelling — the next `/loop` cycle re-evaluates.
