# Follow-up issue, decision-aware replies, and PR summary

This reference covers the three post-reply steps that only fire when unresolved items remain after Steps 3 and 3.5. You arrive here from SKILL.md Step 5 when any of the following exist:

- **Discussion-Tracked** items (user chose "Create follow-up issue" in the Discussion workflow)
- **Discussion-Deferred** items (user chose "Defer to author")
- **Blocked** items (agent couldn't implement due to missing access or a failed `Edit`)
- **User-skipped Fixable** items (user chose "Skip this comment" during confidence gating)

If none of these exist, SKILL.md skips this reference entirely and jumps to the final commit/push/report step.

## Step 5a: User-Gated Issue Creation

> **Note:** Discussion items resolved in Step 3.5 (implemented as Implementable Fix or answered as Clarification) are already handled in SKILL.md Step 4. Discussion items deferred to the author proceed directly to Step 5b below — they do not appear here.

**Per-item decisions from the Discussion workflow are final:**
- **Discussion-Tracked** items are automatically included in the follow-up issue — the user already approved per-item during `discussion-workflow.md` section 3. Do not re-ask.
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

**Read [`../../dlc/references/ISSUE-TEMPLATE.md`](../../dlc/references/ISSUE-TEMPLATE.md) now** and format the issue body exactly as specified.

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

If there are no remaining Discussion-Deferred, Discussion-Tracked, Blocked, or user-skipped Fixable items, skip this step.

Post inline replies reflecting each item's outcome. Items arrive here from different decision paths:

For each **Discussion-Deferred** item (user chose "Defer to author" in the Discussion workflow), always reply:

| Item Status | Inline Reply Text |
|-------------|-------------------|
| Discussion-Deferred | `Acknowledged — will be addressed by the author` |

For each **Discussion-Tracked** item (included in the follow-up issue in Step 5a above), reply based on issue creation outcome:

| Item Status | Inline Reply Text |
|-------------|-------------------|
| Discussion-Tracked (issue created) | `Acknowledged — tracked in #ISSUE_NUMBER` |
| Discussion-Tracked (issue creation failed) | `Acknowledged — tracked in follow-up issue (draft saved to {draft_path})` |

For each **Blocked** comment, map the user's Step 5a decision:

| User Decision (Step 5a) | Inline Reply Text |
|------------------------|-------------------|
| Included in follow-up issue | `Acknowledged — tracked in #ISSUE_NUMBER` |
| Handle manually | `Acknowledged — will be addressed by the author` |

For each **user-skipped Fixable** comment, always reply:

| Item Status | Inline Reply Text |
|-------------|-------------------|
| Skipped Fixable | `Acknowledged — deferred (out of scope for this PR)` |

Use the same reply routing as SKILL.md Step 4 — route based on the item's `reply_type`. **Do NOT call `resolveReviewThread`** for these replies — Acknowledged threads remain unresolved because the underlying work is pending (deferred, tracked, or skipped). Only Step 4 replies (Fixed, Dismissed, Answered) resolve threads.

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

If there are no remaining Discussion-Deferred, Discussion-Tracked, Blocked, or user-skipped Fixable items, skip this step.

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
