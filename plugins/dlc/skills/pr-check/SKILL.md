---
name: pr-check
description: >-
  PR review compliance: fetch review comments from an open PR,
  categorize as resolved/unresolved/dismissed, critically evaluate
  fixable items, implement approved fixes, and reply inline.
  Pass --unattended to halt on human-judgment items (emitted as
  Pending-Human) instead of prompting via AskUserQuestion.
allowed-tools: [Bash, Read, Grep, Glob, Write, Edit, AskUserQuestion]
---

# DLC: PR Review Compliance

Fetch PR review comments, implement fixes for unresolved items, and report compliance.

Before running, **read [../dlc/references/ISSUE-TEMPLATE.md](../dlc/references/ISSUE-TEMPLATE.md) now** for the issue format, and **read [../dlc/references/REPORT-FORMAT.md](../dlc/references/REPORT-FORMAT.md) now** for the findings data structure.

This skill uses progressive disclosure. The orchestration skeleton (fetch, categorize, reply, coverage-verify, commit) lives in SKILL.md. Conditional branches — fixable implementation, discussion handling, and follow-up issue creation — live in `references/` and are read only when their triggering condition fires:

- [`references/fixable-workflow.md`](references/fixable-workflow.md) — context read, confidence-gated evaluation, implementation guardrails (Step 3)
- [`references/discussion-workflow.md`](references/discussion-workflow.md) — classification, auto-action criteria, `AskUserQuestion` routing (Step 3.5)
- [`references/followup-and-summary.md`](references/followup-and-summary.md) — follow-up issue creation, decision-aware replies, PR summary (Step 5)

Do **not** preload these references — each Step pointer below names its file and its skip condition.

## Step 1: Fetch PR Data

### Parse arguments

The skill accepts two arguments, in any order:

- `<PR_NUMBER>` — numeric PR reference. Optional; when omitted, auto-detect from the current branch.
- `--unattended` — optional flag. When present, set `UNATTENDED=true` and carry it through downstream steps. Gates the autonomy ladder in Step 3.5, suppresses `AskUserQuestion` in Steps 3, 3.5, and 5a, activates Pending-Human classification, and emits the Step 6 `Pending-Human:` summary line. When absent (default), behavior is identical to attended mode.

Parse `--unattended` out of the argument string before invoking the script; only the PR number (if any) goes to `pr-comments.sh`.

### Run pr-comments.sh

Run the `pr-comments.sh` script from the plugin's `scripts/` directory (two levels up from this skill):

```bash
# If PR number provided as argument
sh ../../scripts/pr-comments.sh <PR_NUMBER>

# If no argument — auto-detect from current branch
sh ../../scripts/pr-comments.sh
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
  - `REVIEW_BODIES` ← `.review_bodies`
  - `ISSUE_COMMENTS` ← `.issue_comments` (unfiltered — includes PR author + DLC sentinel replies, used for "already replied" detection)
  - `REVIEWER_ISSUE_COMMENTS` ← `.reviewer_issue_comments` (filtered — excludes PR author + DLC sentinels, used for categorization and coverage)

**State check:** If `PR_STATE` is not `OPEN`, abort with: "PR #{PR_NUMBER} is {PR_STATE} — only open PRs can be checked."

**Truncation warning:** If `.summary.truncated` is `true`, warn: "Review data was truncated — some threads or review bodies may be missing from the analysis."

**Print reviewer inventory** from the pre-built `.reviewers` array:

```text
Reviewer inventory ({summary.reviewer_count} reviewers, {summary.total_comments} total comments, {summary.total_threads} threads, {summary.total_review_bodies} review bodies, {summary.total_issue_comments} issue comments):
  - @{reviewer.login}: {reviewer.total_comments} comments ({reviewer.top_level_threads} threads, {reviewer.review_bodies} review bodies, {reviewer.issue_comments} issue comments)
```

Store each reviewer's `top_level_threads`, `review_bodies`, and `issue_comments` counts as the coverage targets for Step 4b.

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

### Thread categorization

Using the `.threads` array from Step 1, classify each top-level review thread:

| Category | Criteria |
|----------|----------|
| **Resolved** | `is_resolved == true`, OR PR author replied with affirmative language, OR thread already has a DLC reply (prefixed with "Fixed:", "Dismissed:", or "Answered:"). Note: "Acknowledged:" replies do NOT count — those threads intentionally remain unresolved because the underlying work is pending (see Step 5b). |
| **Dismissed** | Not applicable for inline threads — threads use GitHub's resolve mechanism, not dismiss. This category will typically be 0 for threads. |
| **Unresolved** | Everything else. This includes `is_outdated` threads (the agent must re-check the current code state), and threads containing nit/optional/consider comments (these are still legitimate feedback) |

> **Important:** Do NOT auto-dismiss threads based on `is_outdated == true` or keyword matching (`nit:`, `optional:`, `consider:`). Outdated threads may still contain unresolved feedback — a file change does not invalidate a design concern.

### Review body categorization

Using the `REVIEW_BODIES` array from Step 1, classify each review body.

> **Precedence:** When multiple rows match, apply them in this order: **Dismissed** first, then **Resolved**, then **Unresolved**. A review with `state == "DISMISSED"` is always Dismissed, even if the body is non-actionable or a summary — this preserves the `Dismissed:` acknowledgement and correct status accounting.

| Category | Criteria |
|----------|----------|
| **Resolved** | Any of the three cases listed below the table. |
| **Dismissed** | `state == "DISMISSED"` |
| **Unresolved** | `state` is `COMMENTED`, `CHANGES_REQUESTED`, or `APPROVED` with an actionable body (specific change requests, questions, or concerns) that is **not Summary-only** (see Resolved criteria below for the Summary-only definition). |

A review body is **Resolved** when any of these apply:

1. **Already replied** — a DLC reply was posted for this review body (sentinel `<!-- dlc-reply:{database_id} -->` is present in `ISSUE_COMMENTS`).
2. **Non-actionable, regardless of `state`** — generic approval ("LGTM"), bot/CI summaries ("No actionable issues found", "Reviewed N files — no concerns", "Lint passed"), or any informational content with no specific change request, question, or concern.
3. **Summary-only** — the body **explicitly signals** that it is a summary of inline comments (e.g. "see inline comments", "Actionable comments posted: N", a files-changed table that enumerates findings posted as inline threads, a structured walkthrough referencing other comments) **and** adds no independent content beyond that enumeration. **When in doubt, do NOT apply this rule** — classify the body as Unresolved instead. Silencing an independent actionable review body is worse than posting an extra reply.

> **Linkage caveat for Summary-only:** `pr-comments.sh` returns `threads` and `review_bodies` as flat arrays with no review-id link, so Summary-only classification relies on the body's textual self-signal rather than structural linkage to *its own* inline threads. In a PR with multiple review submissions from the same reviewer, a body that *looks* like a summary may actually be an independent review — err toward Unresolved when the body does not explicitly self-label as a summary.

> **Note:** Every review body requires body inspection, not just `APPROVED` ones. A `COMMENTED` review whose body is "No actionable issues found" is Resolved — the `COMMENTED` state alone does not imply actionable content. DLC replies to review bodies are posted as issue comments (via `gh pr comment`), so "already replied" detection must scan `ISSUE_COMMENTS` for the sentinel — not the review body's own data.
>
> **Silent Resolved:** Review bodies classified Resolved via the non-actionable or summary-only criteria produce **no outgoing reply** in Step 4. They are counted toward coverage (Step 4b) as Resolved without any GitHub comment being posted. Do not manufacture an "Answered:" reply for a body that already said nothing needed doing.

### Issue comment categorization

Using the `REVIEWER_ISSUE_COMMENTS` array from Step 1 (the filtered set that matches summary/reviewer counts), classify each issue comment. Use the unfiltered `ISSUE_COMMENTS` array only for sentinel-based "already replied" detection in review body categorization above.

| Category | Criteria |
|----------|----------|
| **Resolved** | Either (a) a subsequent issue comment contains the sentinel `<!-- dlc-reply:{database_id} -->` where `{database_id}` matches this comment's `database_id`, **or** (b) the issue comment body is purely informational / non-actionable and does not require a DLC reply (e.g., status updates, CI results with no action items). |
| **Dismissed** | Not applicable for issue comments — there is no GitHub dismiss mechanism. Note: a "Dismissed:" prefix in the Resolved criteria above is a DLC reply label (marking the comment as resolved via dismissal), not this category. This category will typically be 0 for issue comments. |
| **Unresolved** | All other issue comments with actionable items, questions, or concerns that have not been resolved via a DLC reply. Issue comments have no `state` field — treat all non-resolved actionable comments as unresolved. |

> **Note:** Issue comments have no `path`/`line` like threads, no `state` like review bodies, and no parent-child links (they are a flat array). To reliably detect prior DLC replies, check for the `<!-- dlc-reply:{database_id} -->` sentinel in subsequent issue comments. Parse the body for actionable items (specific change requests, code findings, questions). If the body is purely informational (status updates, CI results with no action items) and does not require any follow-up, classify it as **Resolved**, even if no DLC reply was posted.
>
> **Examples of non-actionable issue comments that are Resolved without a DLC reply:**
> - Bot CI summaries: "No actionable issues found", "Lint passed", "All checks green", "Reviewed N files across M changed lines"
> - Status updates from reviewers (PR-author comments are already excluded from `REVIEWER_ISSUE_COMMENTS` in Step 1): "rebased", "resolved conflicts", "pushed fix"
> - Informational links or context with no ask (e.g., "For reference, see the spec at …")
>
> **Silent Resolved:** Issue comments classified Resolved via the non-actionable path produce **no outgoing reply** in Step 4. Do not generate an "Answered: no action needed" message — the original comment already said so.

### Unresolved sub-categories

For unresolved comments (threads, review bodies, and issue comments), further classify by actionability:

| Sub-Category | Criteria |
|-------------|----------|
| **Fixable** | Comment points to a specific code change (rename, refactor, add check, fix bug) |
| **Discussion** | Comment asks a question or raises a concern that needs human judgment |
| **Blocked** | Fix requires information or access the agent doesn't have |

## Step 3: Handle Fixable Items

If no **Fixable** items exist from Step 2, skip this step.

Otherwise, read [`references/fixable-workflow.md`](references/fixable-workflow.md) now and follow its three-phase workflow: context read → critical evaluation → confidence-gated implementation.

The reference covers the four evaluation criteria (technical correctness, project alignment, regression risk, scope), anti-sycophancy rules, implementation guardrails, the attended/unattended split for Medium/Low-confidence items (unattended classifies as **Pending-Human** rather than calling `AskUserQuestion`), the attended empty-answer safeguard, and the Blocked-on-error reclassification rule. Items that implement successfully reclassify as **Fixed** and enter the Step 4 reply queue; Medium/Low-confidence items in unattended mode reclassify as **Pending-Human** and enter the Step 6 summary line; items whose implementation fails reclassify as **Blocked** and are handled by Step 5.

## Step 3.5: Handle Discussion Items

If no **Discussion** items exist from Step 2, skip this step.

Otherwise, read [`references/discussion-workflow.md`](references/discussion-workflow.md) now and follow its four-phase workflow: context read → classification → user routing or auto-action → execution.

The reference covers the four classifications (Implementable Fix / Clarification Answer / Design Decision / Out-of-PR-Scope), the auto-implement and auto-reply criteria that let the agent skip `AskUserQuestion` on unambiguous items, the `AskUserQuestion` format for genuinely ambiguous items, and the reclassification map into **Fixed** / **Discussion-Answered** / **Discussion-Deferred** / **Discussion-Tracked** for downstream handling in Steps 4 and 5.

## Step 4: Reply to Fixed, Dismissed, and Answered Comments

For each **Fixed**, **Dismissed**, and **Discussion-Answered** comment, post a reply using the appropriate routing based on `reply_type`.

> **Silent-Resolved gate:** Before routing any reply, confirm the item is not Resolved. Items classified Resolved in Step 2 — including non-actionable bot/CI summaries, generic approvals, summary-only review bodies, and informational issue comments — produce **no outgoing reply**. They are already counted toward coverage (Step 4b) as Resolved. Do not manufacture an "Answered:" message for an item whose original content already said nothing needed doing.

### Reply routing

Use the `reply_type` field from the comment data to determine the reply mechanism. Note: threads have two ID fields — `rest_id` (integer, used for REST API `in_reply_to`) and `id` (GraphQL node ID like `PRRT_kwDORKvRbs510iY6`, used for `resolveReviewThread`). Use the correct one for each call.

- **Inline** (`reply_type == "inline"`): Reply to an inline review thread using `in_reply_to`, then resolve the thread on GitHub:

```bash
# Post the reply (uses rest_id for the REST API)
if gh api repos/$PR_OWNER/$PR_REPO/pulls/$PR_NUMBER/comments \
  --method POST \
  -f body="{reply text}" \
  -F in_reply_to={rest_id}; then
  # Resolve the thread on GitHub (uses GraphQL node id, only after successful reply)
  if ! gh api graphql -f query='mutation($threadId: ID!) {
    resolveReviewThread(input: {threadId: $threadId}) {
      thread { isResolved }
    }
  }' -f threadId="{id}" >/dev/null; then
    echo "Warning: Failed to resolve thread {id} — reply was posted successfully" >&2
  fi
fi
```

> **Thread resolution**: Only inline threads (`reply_type == "inline"`) are resolved — review bodies and issue comments have no GitHub resolve mechanism. If `resolveReviewThread` fails (permissions, rate limit), log a warning and continue — the reply is the primary deliverable, resolution is a UX enhancement. The mutation is idempotent, so calling it on an already-resolved thread is a harmless no-op.

- **Review body** (`reply_type == "pr_comment"`): Reply to a top-level review body using `gh pr comment` with quoted original and DLC sentinel:

```bash
gh pr comment $PR_NUMBER --body "> {first 100 chars of original body}...

{reply text}
<!-- dlc-reply:{database_id} -->"
```

- **Issue comment** (`reply_type == "issue_comment"`): Reply to a general PR-level issue comment using `gh pr comment` with quoted original and DLC sentinel:

```bash
gh pr comment $PR_NUMBER --body "> {first 100 chars of original body}...

{reply text}
<!-- dlc-reply:{database_id} -->"
```

> **Why the sentinel?** Issue comments are a flat array with no parent-child links. The `<!-- dlc-reply:{database_id} -->` HTML comment embeds the original comment's identifier so that (1) "already replied" detection is reliable and (2) the script can filter DLC's own replies from the reviewer inventory on re-runs.

### Reply text by category

| Category | Reply prefix | Example |
|----------|-------------|---------|
| **Resolved (silent)** | — (no reply posted) | Non-actionable bot summary, summary-only review body, or informational issue comment. Skip entirely. |
| **Fixed** | `Fixed: {brief description}` | `Fixed: renamed variable to camelCase` |
| **Dismissed** | `Dismissed: {reason}` | `Dismissed: review formally dismissed via GitHub` |
| **Discussion-Answered** | `Answered: {explanation}` | `Answered: The function is async because it awaits the database query on line 45. The null check exists in the caller at api.ts:23.` |

**Dismissed reasons:**
- "review formally dismissed via GitHub" — for review bodies with `state == "DISMISSED"`

> **Note:** Remaining Discussion items (deferred to author or tracked for follow-up) and Blocked replies are deferred to Step 5b (after user decision).

## Step 4b: Coverage Verification

Verify that every top-level thread, every review body, **and** every issue comment from Step 1 has been accounted for. For each reviewer, count the items that appear across **all** categories:

| Category | Counts toward thread coverage? | Counts toward review body coverage? | Counts toward issue comment coverage? |
|----------|-------------------------------|-------------------------------------|---------------------------------------|
| Resolved | Yes | Yes | Yes |
| Dismissed | Yes | Yes | Yes |
| Fixed by DLC | Yes | Yes | Yes |
| Skipped (user decision) | Yes | Yes | Yes |
| Discussion-Deferred | Yes | Yes | Yes |
| Discussion-Answered | Yes | Yes | Yes |
| Discussion-Tracked | Yes | Yes | Yes |
| Pending-Human | Yes | Yes | Yes |
| Blocked | Yes | Yes | Yes |

For each reviewer from Step 1, assert **all three**:

```text
covered threads (sum across all categories) == top_level_threads from Step 1
covered review bodies (sum across all categories) == review_bodies count from Step 1
covered issue comments (sum across all categories) == issue_comments count from Step 1
```

**If all reviewers pass:** Print confirmation and continue to Step 5.

```text
Coverage verification passed: {thread_count}/{thread_count} threads + {body_count}/{body_count} review bodies + {issue_comment_count}/{issue_comment_count} issue comments verified across {r} reviewers.
```

**If any reviewer has a mismatch: HALT.**

Do **not** proceed to Step 5. Print the error:

```text
ERROR: Coverage verification failed.
  Reviewer @{name}: expected {expected_threads} threads, found {actual_threads} categorized. Expected {expected_bodies} review bodies, found {actual_bodies} categorized. Expected {expected_issue_comments} issue comments, found {actual_issue_comments} categorized.
  Missing IDs: {id1}, {id2}, ...
  Recovery: re-processing missed items through Steps 2-3.
```

**Recovery procedure:**

1. Re-process only the missed items through Steps 2–3
2. Re-run this verification (Step 4b) a second time
3. If the second verification also fails, **stop permanently** and report:

```text
FATAL: Coverage verification failed after retry.
  Reviewer @{name}: still missing {n} items.
  Missing IDs: {id1}, {id2}, ...
  Manual audit required — cannot proceed.
```

Do **not** retry more than once. A second failure indicates a structural issue that automated re-processing cannot fix.

> **Why this step exists:** Without explicit coverage verification, silently dropped comments are undetectable. This step closes the gap between "comments fetched" (Step 1) and "comments addressed" — ensuring that every reviewer's feedback (inline threads, review bodies, and issue comments) is categorized before fixes are committed and replies are posted.

## Step 5: Follow-Up Issue, Decision-Aware Replies, and PR Summary

If no Discussion-Deferred, Discussion-Tracked, Blocked, user-skipped Fixable, or Pending-Human items exist after Steps 3 and 3.5, skip this step and continue to Step 6.

Otherwise, read [`references/followup-and-summary.md`](references/followup-and-summary.md) now and follow its three sub-steps:

- **Step 5a** — user-gated follow-up issue creation (auto-create when only Discussion-Tracked items exist; `AskUserQuestion`-gated when Blocked or skipped Fixable items exist).
- **Step 5b** — decision-aware replies (inline threads, review bodies, and issue comments) for Discussion-Deferred, Discussion-Tracked, Blocked, and skipped Fixable items. These replies do **not** resolve inline threads — the underlying work is pending.
- **Step 5c** — PR-level summary comment with status table, per-item decisions, and follow-up pointers.

The reference covers the three branching cases for issue creation, the per-item reply text table, and the summary template.

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
  - Total comments: {n} ({thread_count} threads + {review_body_count} review bodies + {issue_comment_count} issue comments)
  - Resolved: {n}, Fixed by DLC: {n}, Answered by DLC: {n}, Skipped (user decision): {n}, Discussion: {n} ({deferred} deferred, {tracked} tracked, {pending_human} pending-human), Blocked: {n}, Dismissed: {n}
  - Coverage: {verified_items}/{total_items} items verified ({thread_count} threads + {body_count} review bodies + {issue_comment_count} issue comments) (Step 4b passed)
  - Per-reviewer breakdown:
      @{reviewer1}: {top_level_threads} threads + {review_bodies} review bodies + {issue_comments} issue comments — Resolved={resolved_count}, Fixed={fixed_count}, Answered={answered_count}, Skipped={skipped_count}, Discussion={discussion_count} ({deferred_count} deferred, {tracked_count} tracked, {pending_human_count} pending-human), Blocked={blocked_count}, Dismissed={dismissed_count} — 0 missed
      @{reviewer2}: {top_level_threads} threads + {review_bodies} review bodies + {issue_comments} issue comments — Resolved={resolved_count}, Fixed={fixed_count}, Answered={answered_count}, Skipped={skipped_count}, Discussion={discussion_count} ({deferred_count} deferred, {tracked_count} tracked, {pending_human_count} pending-human), Blocked={blocked_count}, Dismissed={dismissed_count} — 0 missed
  - Pending-Human: {n} — {item1_short}; {item2_short}; ...  [only when n > 0; each short is the first 80 chars of the reviewer comment; babysit parses this exact line shape]
  - Push: {Pushed {sha} to origin/{branch}}  [if push succeeded]
  - Push: Push failed: {reason}  [if push failed]
  - Follow-up issue: #{number} ({url})  [only if user approved creation]
```

If all comments are resolved or dismissed, skip issue creation and report: "All PR review comments addressed."
