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

Using the `REVIEW_BODIES` array from Step 1, classify each review body:

| Category | Criteria |
|----------|----------|
| **Resolved** | A DLC reply was already posted for this review body (detected by scanning `ISSUE_COMMENTS` for a sentinel `<!-- dlc-reply:{database_id} -->` where `{database_id}` matches this review body's `database_id`), OR `state == "APPROVED"` with a non-actionable body (e.g., "LGTM", general approval without specific action items) |
| **Dismissed** | `state == "DISMISSED"` |
| **Unresolved** | `state` is `COMMENTED`, `CHANGES_REQUESTED`, or `APPROVED` with an actionable body (specific change requests, questions, or concerns) |

> **Note:** `APPROVED` reviews require body inspection — if the body is empty or generic praise (e.g., "LGTM"), classify as Resolved. If it contains specific action items despite the approval, classify as Unresolved. DLC replies to review bodies are posted as issue comments (via `gh pr comment`), so "already replied" detection must scan `ISSUE_COMMENTS` for the sentinel — not the review body's own data.

### Issue comment categorization

Using the `REVIEWER_ISSUE_COMMENTS` array from Step 1 (the filtered set that matches summary/reviewer counts), classify each issue comment. Use the unfiltered `ISSUE_COMMENTS` array only for sentinel-based "already replied" detection in review body categorization above.

| Category | Criteria |
|----------|----------|
| **Resolved** | Either (a) a subsequent issue comment contains the sentinel `<!-- dlc-reply:{database_id} -->` where `{database_id}` matches this comment's `database_id`, **or** (b) the issue comment body is purely informational / non-actionable and does not require a DLC reply (e.g., status updates, CI results with no action items). |
| **Dismissed** | Not applicable for issue comments — there is no GitHub dismiss mechanism. Note: a "Dismissed:" prefix in the Resolved criteria above is a DLC reply label (marking the comment as resolved via dismissal), not this category. This category will typically be 0 for issue comments. |
| **Unresolved** | All other issue comments with actionable items, questions, or concerns that have not been resolved via a DLC reply. Issue comments have no `state` field — treat all non-resolved actionable comments as unresolved. |

> **Note:** Issue comments have no `path`/`line` like threads, no `state` like review bodies, and no parent-child links (they are a flat array). To reliably detect prior DLC replies, check for the `<!-- dlc-reply:{database_id} -->` sentinel in subsequent issue comments. Parse the body for actionable items (specific change requests, code findings, questions). If the body is purely informational (status updates, CI results with no action items) and does not require any follow-up, classify it as **Resolved**, even if no DLC reply was posted.

### Unresolved sub-categories

For unresolved comments (threads, review bodies, and issue comments), further classify by actionability:

| Sub-Category | Criteria |
|-------------|----------|
| **Fixable** | Comment points to a specific code change (rename, refactor, add check, fix bug) |
| **Discussion** | Comment asks a question or raises a concern that needs human judgment |
| **Blocked** | Fix requires information or access the agent doesn't have |

## Step 3: Critically Evaluate and Implement Fixable Items

For each **fixable unresolved** comment, follow a three-phase workflow:

### 3a. Read Context

**For inline threads** (`reply_type == "inline"`):
1. Read the file at the referenced `path`
2. Read at least 20 lines of surrounding context (before and after the target `line`)
3. Read the full comment thread (including any replies)

**For review bodies** (`reply_type == "pr_comment"`):
1. Review bodies have no `path`/`line` — parse the body for file paths, function names, or code snippets
2. If the body references specific files, read those files for context
3. If no specific files are mentioned, use the PR diff to understand the scope of the review

**For issue comments** (`reply_type == "issue_comment"`):
1. Issue comments have no `path`/`line` — parse the body for file paths, function names, or code snippets
2. If the body references specific files, read those files for context
3. If no specific files are mentioned, use the PR diff to understand the scope of the comment

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

> **Anti-sycophancy rule**: Your confidence score is your honest technical assessment, not a politeness signal. If a suggestion is factually incorrect — wrong about the language, inconsistent with the codebase pattern, or introduces a regression — rate it **Low** and say so with specifics. Do NOT implement Low-confidence items without explicit user approval even if the reviewer is insistent. Prioritize technical correctness over politeness — being wrong politely is worse than being correct bluntly.

### 3c. Confidence-Gated Implementation

- **High confidence** → Implement directly using `Edit` or `Write`, then stage: `git add <file>`
- **Medium or Low confidence** → Use `AskUserQuestion` to present:
  - The quoted reviewer comment
  - Your assessment (which criteria passed/failed and why)
  - Options: "Implement as suggested" / "Skip this comment" / "Implement with modification"
  - If "Implement with modification" is chosen, ask for guidance before proceeding

> **Bias toward implementation**: Default to **High confidence** and implement fixes directly when a change is technically correct and straightforward (rename, add a check, fix a typo, adjust formatting, add missing validation) — code is cheap; generating a fix costs less than deliberating about whether to. Do not inflate uncertainty to avoid work or defer small fixes as "out of scope." The confidence gate exists for genuinely ambiguous suggestions where reasonable engineers would disagree — not as an escape hatch for effort avoidance.

**Guardrails:**
- Only modify files that are part of the PR's diff
- Do not make changes the reviewer didn't request
- If unsure about intent, classify as **Discussion** instead of guessing
- Never implement a suggestion assessed as technically incorrect without explicit user approval
- If an `Edit` or `Write` call fails (tool error, file not found, conflict), reclassify the item as **Blocked** with the reason "implementation failed: {error}" — do not leave it in the Fixable state

## Step 3.5: Evaluate Discussion Items

If no **Discussion** items exist, **skip this step**.

For each **Discussion** unresolved comment, follow a four-phase workflow:

### 3.5a. Read Context

Use the same context-reading approach as Step 3a:

**For inline threads** (`reply_type == "inline"`):
1. Read the file at the referenced `path`
2. Read at least 20 lines of surrounding context (before and after the target `line`)
3. Read the full comment thread (including any replies)

**For review bodies** (`reply_type == "pr_comment"`):
1. Parse the body for file paths, function names, or code snippets
2. If the body references specific files, read those files for context
3. If no specific files are mentioned, use the PR diff to understand the scope

**For issue comments** (`reply_type == "issue_comment"`):
1. Parse the body for file paths, function names, or code snippets
2. If the body references specific files, read those files for context
3. If no specific files are mentioned, use the PR diff to understand the scope

### 3.5b. Classify Discussion Item

Assess the effort and nature of each discussion item:

| Classification | Criteria | Default Recommendation |
|---------------|----------|------------------------|
| **Implementable Fix** | Technically straightforward code change directly related to the PR feedback — rename, add/edit comment, tweak condition, fix typo, add validation, refactor a block. Size doesn't matter; complexity does. | **Implement now** (code is free) |
| **Clarification Answer** | Reviewer asked a question the agent can answer from codebase context (e.g., "why is this async?", "does this handle nulls?") | **Reply with explanation** |
| **Design Decision** | Requires architectural judgment, product scope decision, or trade-off the PR author must make | **Defer to author** |
| **Out-of-PR-Scope** | Valid concern but belongs in a separate PR/issue (large refactor, cross-cutting change) | **Create follow-up issue** |

> **Bias toward action**: Default to **Implementable Fix** or **Clarification Answer** when the change is technically straightforward. Do not inflate complexity to avoid work — if the change doesn't require architectural judgment and is directly related to the reviewer's feedback, recommend implementing it regardless of size. The classification gate exists for genuinely complex items where the PR author must decide, not as an escape hatch for effort avoidance.

### 3.5c. Present to User, Auto-Implement, or Auto-Reply

**High-confidence Implementable Fix** items (all four criteria from Step 3b (Critically Evaluate) pass, single clear implementation approach) follow the same auto-implementation path as Step 3c — implement directly, no `AskUserQuestion` needed. Print a brief note: `Auto-implementing Discussion item {n}/{total}: {brief description}`. Reclassify the item as **Fixed** — it enters the Step 4 reply queue with the `Fixed:` prefix, identical to user-chosen "Implement now" items.

Skip `AskUserQuestion` and auto-reply **high-confidence Clarification Answer** items when the agent can draft a factual answer entirely from codebase evidence. A Clarification Answer is high-confidence when all four of these criteria pass:

| Criterion | Question |
|-----------|----------|
| **Evidence-backed** | Does the answer cite specific code (`file:line`), commits, or documented decisions — not speculation? |
| **Factually verifiable** | Can the claims be confirmed by reading the referenced code? |
| **Non-controversial** | Does the answer explain what IS (factual state), not argue what SHOULD BE (design opinion/trade-off)? |
| **Complete** | Does the answer fully address the reviewer's concern with no open threads? |

> **Defect-revealing answers**: If the truthful answer reveals a gap, missing check, or unhandled edge case (e.g., "does this handle nulls?" → "no"), reclassify the item as **Implementable Fix** — the reviewer's question implies a code change, not just an explanation. An answer that exposes an action item is NOT complete even if it literally answers the question.
>
> **Boundary cases**: If the answer reveals partial handling or upstream mitigation, apply this test: does the reviewer's concern require a code change in *this* PR? Examples:
> - "Does this handle nulls?" → "No, nulls are not checked" → **Reclassify as Implementable Fix** (clear gap)
> - "Does this handle empty strings?" → "No, but empty strings are filtered upstream at `caller.ts:23`" → **Auto-reply** (upstream responsibility is clear, no local change needed)
> - "Does this handle edge case X?" → "Partially — X1 is handled on line 45, but X2 is not" → **Reclassify as Implementable Fix** (incomplete handling requires a code change)

When all four pass → auto-draft the reply without asking. Print: `Auto-replying to Discussion item {n}/{total}: {brief description}`. Reclassify the item as **Discussion-Answered** — it enters the Step 4 reply queue with the `Answered:` prefix.

> **Bias toward action for Clarification Answers**: When in doubt between high and medium confidence, default to high for factual explanations backed by code evidence. If the agent can point to a specific `file:line` that resolves the reviewer's question, that's high-confidence — don't manufacture uncertainty to justify an interruption. The anti-sycophancy rule still applies; do NOT auto-reply if the answer would:
> - Be speculative (violating **Evidence-backed**)
> - Argue a design opinion (violating **Non-controversial**)
> - Be incomplete (violating **Complete**)
> - Reveal a bug or missing functionality (reclassify as **Implementable Fix**)
>
> In these cases, fall through to `AskUserQuestion` instead (or reclassify per the defect-revealing rule above).

**All other items** — Medium/Low-confidence Implementable Fix, Medium/Low-confidence Clarification Answer, Design Decision, Out-of-PR-Scope, or Implementable Fix with multiple approaches — use `AskUserQuestion`:

```text
Discussion item {n}/{total}: @{reviewer} at {location}
> "{first 100 chars of comment}..."

Classification: {Implementable Fix | Clarification Answer | Design Decision | Out-of-PR-Scope}
Assessment: {your analysis of what the reviewer is asking/concerned about and why you classified it this way}

Options:
  1. Implement now
  2. Defer to author
  3. Create follow-up issue
  4. Reply with explanation
```

Where `{location}` is `{path}:{line}` for inline items, or `{reply_type}:{database_id}` for review bodies and issue comments.

Mark the option matching the classification as "(Recommended)":
- **Implementable Fix** → option 1 (Recommended)
- **Clarification Answer** → option 4 (Recommended)
- **Design Decision** → option 2 (Recommended)
- **Out-of-PR-Scope** → option 3 (Recommended)

**Multiple implementation approaches:** When an Implementable Fix has more than one reasonable way to address the reviewer's feedback, split option 1 into sub-options with your recommendation marked:

```text
Options:
  1a. Implement: add null check in the caller (Recommended)
  1b. Implement: use Optional<T> return type instead
  2. Defer to author
  3. Create follow-up issue
  4. Reply with explanation
```

Include a brief rationale for why you recommend one approach over the others. The user picks a sub-option; execution proceeds as normal for "Implement now."

The user can always override the recommendation by choosing any option.

### 3.5d. Execute Chosen Action

**For "Implement now"**: Apply the same confidence-gated implementation as Step 3c:

- **High confidence** (all four criteria from Step 3b (Critically Evaluate) pass) → Implement directly using `Edit` or `Write`, then stage: `git add <file>`
- **Medium or Low confidence** → Present your assessment (which criteria passed/failed) alongside the implementation. The user already chose "Implement now" so proceed unless they intervene — but surface any technical concerns so they can course-correct.

| User Choice | Action | Item Reclassification |
|-------------|--------|----------------------|
| **Implement now** | Confidence-gated implementation (see above) | Reclassify as **Fixed** — enters Step 4 reply queue with `Fixed:` prefix |
| **Reply with explanation** | Draft the explanation reply text | Reclassify as **Discussion-Answered** — enters Step 4 reply queue |
| **Defer to author** | No immediate action | Reclassify as **Discussion-Deferred** — enters Step 5b for decision-aware reply |
| **Create follow-up issue** | No immediate action | Reclassify as **Discussion-Tracked** — auto-included in Step 5 follow-up issue |

> **Items reclassified as Fixed** follow the same `Fixed: {brief description}` reply format and routing used for Fixable items in Step 4.
> **If an implementation fails** (tool error, file not found, conflict), reclassify as **Blocked** with the reason "implementation failed: {error}" — same guardrail as Step 3c.

## Step 4: Reply to Fixed, Dismissed, and Answered Comments

For each **Fixed**, **Dismissed**, and **Discussion-Answered** comment, post a reply using the appropriate routing based on `reply_type`.

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

## Step 5: User-Gated Issue Creation

If no Discussion-Tracked, Blocked, or user-skipped Fixable items exist after Steps 3 and 3.5, **skip this step entirely**.

> **Note:** Discussion items resolved in Step 3.5 (implemented as Implementable Fix or answered as Clarification) are already handled. Discussion items deferred to the author proceed directly to Step 5b — they do not appear here.

**Per-item decisions from Step 3.5 are final:**
- **Discussion-Tracked** items are automatically included in the follow-up issue — the user already approved per-item in Step 3.5. Do not re-ask.
- **Discussion-Deferred** items go directly to Step 5b ("will be addressed by the author"). They are not candidates for issue creation.

**Branch 1:** If only Discussion-Tracked items exist (no Blocked or skipped Fixable), create the follow-up issue directly — no `AskUserQuestion` needed.

**Branch 2:** If only Blocked or user-skipped Fixable items exist (no Discussion-Tracked), use `AskUserQuestion` to ask whether to create a follow-up issue for these items:

- Present the count and brief summary of the undecided items (Blocked + skipped Fixable)
- Options: "Yes, create follow-up issue" / "No, I'll handle those manually" / "Show me details first"

**Branch 3:** If both Discussion-Tracked and Blocked or user-skipped Fixable items exist, use `AskUserQuestion` to ask whether to include the undecided items in the same follow-up issue:

- Present the count and brief summary of the undecided items (Blocked + skipped Fixable), noting that {n} Discussion-Tracked items will be included in the issue
- Options: "Yes, include in follow-up issue" / "No, I'll handle those manually" / "Show me details first"

If the user selects "Show me details first", display each undecided item with your assessment, then re-ask with the first two options.

**Outcome based on user choice (Branch 3 only):**
- "Yes" → create issue including Discussion-Tracked + Blocked/skipped items
- "No" → create issue with only Discussion-Tracked items (Blocked/skipped items are handled manually by the author)

**If issue creation proceeds** (either auto or approved):

**Read [../dlc/references/ISSUE-TEMPLATE.md](../dlc/references/ISSUE-TEMPLATE.md) now** and format the issue body exactly as specified.

**Critical format rules** (reinforced here):
- Title: `[DLC] PR Review: {n} unresolved comments on PR #{number}`
- Label: `dlc-pr-check`
- Body must contain: Scan Metadata table, Findings Summary table (severity x count), Findings Detail grouped by severity, Recommended Actions

**Severity mapping** (reinforced here for defense-in-depth):

| Comment Category | Severity |
|-----------------|----------|
| Unresolved — Blocked | **High** |
| Unresolved — Discussion-Tracked | **Medium** |
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

**If the user chooses "No, I'll handle manually":**
- **Branch 2** (only Blocked/skipped items, no Discussion-Tracked): skip issue creation entirely and proceed to Step 5b.
- **Branch 3** (both Discussion-Tracked and Blocked/skipped items): create the follow-up issue with only Discussion-Tracked items. The Blocked/skipped items proceed to Step 5b as "will be addressed by the author."

## Step 5b: Decision-Aware Inline Replies

If there are no remaining Discussion-Deferred, Discussion-Tracked, Blocked, or user-skipped Fixable items, **skip this step**.

Post inline replies reflecting each item's outcome. Items arrive here from different decision paths:

For each **Discussion-Deferred** item (user chose "Defer to author" in Step 3.5), always reply:

| Item Status | Inline Reply Text |
|-------------|-------------------|
| Discussion-Deferred | `Acknowledged — will be addressed by the author` |

For each **Discussion-Tracked** item (included in follow-up issue in Step 5), reply based on issue creation outcome:

| Item Status | Inline Reply Text |
|-------------|-------------------|
| Discussion-Tracked (issue created) | `Acknowledged — tracked in #ISSUE_NUMBER` |
| Discussion-Tracked (issue creation failed) | `Acknowledged — tracked in follow-up issue (draft saved to {draft_path})` |

For each **Blocked** comment, map the user's Step 5 decision:

| User Decision (Step 5) | Inline Reply Text |
|------------------------|-------------------|
| Included in follow-up issue | `Acknowledged — tracked in #ISSUE_NUMBER` |
| Handle manually | `Acknowledged — will be addressed by the author` |

For each **user-skipped Fixable** comment, always reply:

| Item Status | Inline Reply Text |
|-------------|-------------------|
| Skipped Fixable | `Acknowledged — deferred (out of scope for this PR)` |

Use the same reply routing as Step 4 — route based on the item's `reply_type`. **Do NOT call `resolveReviewThread`** for these replies — Acknowledged threads remain unresolved because the underlying work is pending (deferred, tracked, or skipped). Only Step 4 replies (Fixed, Dismissed, Answered) resolve threads.

- **Inline** (`reply_type == "inline"`):
```bash
# Post the reply only — do NOT resolve the thread (work is pending)
gh api repos/$PR_OWNER/$PR_REPO/pulls/$PR_NUMBER/comments \
  --method POST \
  -f body="{decision-aware reply text}" \
  -F in_reply_to={rest_id}
```

- **Review body** (`reply_type == "pr_comment"`):
```bash
gh pr comment $PR_NUMBER --body "> {first 100 chars of original body}...

{decision-aware reply text}
<!-- dlc-reply:{database_id} -->"
```

- **Issue comment** (`reply_type == "issue_comment"`):
```bash
gh pr comment $PR_NUMBER --body "> {first 100 chars of original body}...

{decision-aware reply text}
<!-- dlc-reply:{database_id} -->"
```

## Step 5c: PR Summary Comment

If there are no remaining Discussion-Deferred, Discussion-Tracked, Blocked, or user-skipped Fixable items, **skip this step**.

Post a PR-level summary comment containing the overall status and decisions.

Build the summary with these sections:

```markdown
## PR Comment Status

| Status | Threads | Review Bodies | Issue Comments | Total |
|--------|---------|---------------|----------------|-------|
| Resolved | {n} | {n} | {n} | {n} |
| Fixed by DLC | {n} | {n} | {n} | {n} |
| Answered by DLC | {n} | {n} | {n} | {n} |
| Skipped (user decision) | {n} | {n} | {n} | {n} |
| Discussion-Deferred | {n} | {n} | {n} | {n} |
| Discussion-Tracked | {n} | {n} | {n} | {n} |
| Blocked | {n} | {n} | {n} | {n} |
| Dismissed | {n} | {n} | {n} | {n} |
| **Total** | **{n}** | **{n}** | **{n}** | **{n}** |

## Decisions

{For each Discussion-Deferred, Discussion-Tracked, Blocked, or skipped Fixable item, one line:}
- Inline thread: `{path}:{line}` — {decision}: {brief description}
- Review body / issue comment: `{reply_type}:{database_id}` — {decision}: {brief description}

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
  - Total comments: {n} ({thread_count} threads + {review_body_count} review bodies + {issue_comment_count} issue comments)
  - Resolved: {n}, Fixed by DLC: {n}, Answered by DLC: {n}, Skipped (user decision): {n}, Discussion: {n} ({deferred} deferred, {tracked} tracked), Blocked: {n}, Dismissed: {n}
  - Coverage: {verified_items}/{total_items} items verified ({thread_count} threads + {body_count} review bodies + {issue_comment_count} issue comments) (Step 4b passed)
  - Per-reviewer breakdown:
      @{reviewer1}: {top_level_threads} threads + {review_bodies} review bodies + {issue_comments} issue comments — Resolved={resolved_count}, Fixed={fixed_count}, Answered={answered_count}, Skipped={skipped_count}, Discussion={discussion_count} ({deferred_count} deferred, {tracked_count} tracked), Blocked={blocked_count}, Dismissed={dismissed_count} — 0 missed
      @{reviewer2}: {top_level_threads} threads + {review_bodies} review bodies + {issue_comments} issue comments — Resolved={resolved_count}, Fixed={fixed_count}, Answered={answered_count}, Skipped={skipped_count}, Discussion={discussion_count} ({deferred_count} deferred, {tracked_count} tracked), Blocked={blocked_count}, Dismissed={dismissed_count} — 0 missed
  - Push: {Pushed {sha} to origin/{branch}}  [if push succeeded]
  - Push: Push failed: {reason}  [if push failed]
  - Follow-up issue: #{number} ({url})  [only if user approved creation]
```

If all comments are resolved or dismissed, skip issue creation and report: "All PR review comments addressed."
