# Follow-up issue, decision-aware replies, and PR summary

This reference covers the three post-reply steps that only fire when unresolved items remain after Steps 3 and 3.5. You arrive here from SKILL.md Step 5 when any of the following exist:

- **Discussion-Tracked** items (user chose "Create follow-up issue" in the Discussion workflow)
- **Discussion-Deferred** items (user chose "Defer to author")
- **Blocked** items (agent couldn't implement due to missing access or a failed `Edit`)
- **User-skipped Fixable** items (user chose "Skip this comment" during confidence gating)

If none of these exist, SKILL.md skips this reference entirely and jumps to the final commit/push/report step.

## Step 5a: Follow-up Issue Creation

> **Skip this sub-step entirely** if there are no issue-creation candidates — i.e. no **Discussion-Tracked**, **Blocked**, or **user-skipped Fixable** items remain. For example, when the only remaining items are Discussion-Deferred, proceed directly to Step 5b below (issue creation has no candidates to consider).
>
> **Note:** Discussion items resolved in Step 3.5 (implemented as Implementable Fix or answered as Clarification) are already handled in SKILL.md Step 4. Discussion items deferred to the author proceed directly to Step 5b below — they do not appear here.
>
> **Unattended-mode behavior** (applies when `UNATTENDED=true`):
> - Branches 2 and 3 skip `AskUserQuestion` and auto-create the follow-up issue for Blocked or Skipped items — no user prompt.
> - The resulting reply `Acknowledged — tracked in #ISSUE_NUMBER` is factual (the issue exists), so the hard rule that `Acknowledged — will be addressed by the author` fires only on explicit user selection is not violated — those are two different reply templates.
> - Discussion-Tracked items cannot arise (they require an explicit "Create follow-up issue" click in `discussion-workflow.md` Section 4), so Branch 1 is the only reachable tracked-items path in unattended runs.

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

Never heredoc the issue body — it embeds reviewer-controlled findings text. Write it with the `Write` tool, then post from the file. This is deliberately not ISSUE-TEMPLATE.md's Issue Creation Command pattern: the title here is `{n}`/`{number}` — provably numeric, never agent-composed free text — so it doesn't need a separate `TITLE_FILE`. `DLC_TMPDIR` is created with `mktemp -d` (mode 0700, guaranteed unique — no other run, PR-scoped or not, can ever be handed the same directory), so — like ISSUE-TEMPLATE.md's own lifecycle — its path can't be recomputed in the post step below; the prep step's printed path is threaded forward as a literal instead. The `$PR_NUMBER` prefix is kept only so a human scanning `/tmp` can tell which PR a leftover directory belongs to — it does no uniqueness work itself:

```bash
DLC_TMPDIR=$(mktemp -d "${TMPDIR:-/tmp}/dlc-pr-check-$PR_NUMBER.XXXXXXXX")
BODY_FILE="$DLC_TMPDIR/followup-issue.md"
echo "$BODY_FILE"    # print the resolved absolute path — the Write tool is not a shell and can't expand $BODY_FILE itself, and this mktemp suffix can't be regenerated in the next Bash call
```

The `Write` tool call is not a shell command and can't see `$BODY_FILE` — use the absolute path this block printed as the `file_path`, and write the formatted issue body there following ISSUE-TEMPLATE.md structure. **Posting is a separate Bash tool call — `REPO` is cheap and deterministic so it's recomputed; `BODY_FILE` is the literal path the prep step printed:**

```bash
REPO=$(gh repo view --json nameWithOwner -q .nameWithOwner)
BODY_FILE="{literal path printed by prep}"

if [ ! -s "$BODY_FILE" ]; then
  echo "ERROR: issue body missing or empty at $BODY_FILE — the Write step may have failed" >&2
  exit 1
fi

if grep -qE '@[[:alnum:]_-]' "$BODY_FILE"; then
  echo "ERROR: unneutralized @ mention found in $BODY_FILE — insert a space immediately after every @ in the Write step per the No GitHub mentions rule above, then re-run this block. Nothing has been posted yet; this is safe to retry." >&2
  exit 1
fi

# Capture the post result before cleanup, so a failing `rm -f` can never flip a
# successful post into a reported failure and invite a duplicate-creating retry.
if gh issue create \
  --repo "$REPO" \
  --title "[DLC] PR Review: {n} unresolved comments on PR #{number}" \
  --body-file "$BODY_FILE" \
  --label "dlc-pr-check"; then
  POST_OK=1
else
  POST_OK=0
fi

if [ "$POST_OK" = 1 ]; then
  rm -f "$BODY_FILE" 2>/dev/null || echo "Note: issue created successfully; scratch cleanup at $BODY_FILE failed (non-fatal, nothing to retry)." >&2
else
  echo "ERROR: gh issue create failed — body preserved at $BODY_FILE. Do NOT re-run this exact posting command directly with the preserved file — if the POST actually succeeded server-side despite this error, that would create a duplicate issue. Print $BODY_FILE and the gh issue create command above to the user so they can inspect and run it manually." >&2
  exit 1
fi
```

**If the user chooses "No, I'll handle manually":**
- **Branch 2** (only Blocked/skipped items, no Discussion-Tracked): skip issue creation entirely and proceed to Step 5b.
- **Branch 3** (both Discussion-Tracked and Blocked/skipped items): create the follow-up issue with only Discussion-Tracked items. The Blocked/skipped items proceed to Step 5b as "will be addressed by the author."

## Step 5b: Decision-Aware Replies

If there are no remaining Discussion-Deferred, Discussion-Tracked, Blocked, or user-skipped Fixable items, skip this step.

> **Pending-Human items do NOT reach this step.** They were classified upstream in `discussion-workflow.md` and intentionally have no reply. Pending-Human is not equivalent to Discussion-Deferred: the former emits silence, the latter (attended-only) emits `Acknowledged — will be addressed by the author` when the user explicitly clicks "Defer to author" in the Section 3 menu. Never post `Acknowledged — will be addressed by the author` outside that explicit click.

Post replies reflecting each item's outcome. The routing below covers inline threads, review bodies, and issue comments — not only inline threads. Items arrive here from different decision paths:

For each **Discussion-Deferred** item (user chose "Defer to author" in the Discussion workflow), always reply:

| Item Status | Reply Text |
|-------------|------------|
| Discussion-Deferred | `Acknowledged — will be addressed by the author` |

For each **Discussion-Tracked** item (included in the follow-up issue in Step 5a above), reply based on issue creation outcome:

| Item Status | Reply Text |
|-------------|------------|
| Discussion-Tracked (issue created) | `Acknowledged — tracked in #ISSUE_NUMBER` |
| Discussion-Tracked (issue creation failed) | `Acknowledged — tracked in follow-up issue (draft saved to {draft_path})` |

For each **Blocked** comment, map the user's Step 5a decision:

| User Decision (Step 5a) | Reply Text |
|------------------------|------------|
| Included in follow-up issue | `Acknowledged — tracked in #ISSUE_NUMBER` |
| Handle manually | `Acknowledged — will be addressed by the author` |

For each **Skipped (user decision)** item — Fixable comments where the user chose "Skip this comment" during confidence gating — always reply:

| Item Status | Reply Text |
|-------------|------------|
| Skipped (user decision) | `Acknowledged — deferred (out of scope for this PR)` |

Use the same reply routing as SKILL.md Step 4 — route based on the item's `reply_type`. **Do NOT call `resolveReviewThread`** for these replies — Acknowledged threads remain unresolved because the underlying work is pending (deferred, tracked, or skipped). Only Step 4 replies (Fixed, Dismissed, Answered) resolve threads.

- **Inline** (`reply_type == "inline"`): Do NOT resolve the thread (work is pending). Clear any stale file at this path, write `{decision-aware reply text}` to `REPLY_FILE` with the `Write` tool, then post from the file:

```bash
DLC_TMPDIR="${TMPDIR:-/tmp}/dlc-pr-check-$PR_NUMBER"
mkdir -p "$DLC_TMPDIR"
REPLY_FILE="$DLC_TMPDIR/reply-inline-{rest_id}.md"
rm -f "$REPLY_FILE"   # clear content preserved from an earlier failed attempt before the Write tool runs
echo "$REPLY_FILE"    # print the resolved absolute path — the Write tool is not a shell and can't expand $REPLY_FILE itself
```

The `Write` tool call is not a shell command and can't see `$REPLY_FILE` — use the absolute path this block printed as the `file_path`, then post it. **Posting is a separate Bash tool call — recompute the path first:**

```bash
DLC_TMPDIR="${TMPDIR:-/tmp}/dlc-pr-check-$PR_NUMBER"
REPLY_FILE="$DLC_TMPDIR/reply-inline-{rest_id}.md"

if [ ! -s "$REPLY_FILE" ]; then
  echo "ERROR: reply body missing or empty at $REPLY_FILE — the Write step may have failed" >&2
  exit 1
elif gh api repos/$PR_OWNER/$PR_REPO/pulls/$PR_NUMBER/comments \
  --method POST \
  -F body=@"$REPLY_FILE" \
  -F in_reply_to={rest_id}; then
  rm -f "$REPLY_FILE"
else
  echo "ERROR: Failed to post reply for thread {rest_id} — reply body preserved at $REPLY_FILE. Do NOT re-run this command with the preserved file. This is an Acknowledged-type reply, which Step 2's already-replied detection does NOT recognize (Acknowledged threads intentionally stay Unresolved) — a blind retry from Step 1 can post a duplicate acknowledgement if the POST actually succeeded server-side despite this error. Before retrying, check this thread's existing replies (e.g. via the GitHub UI or \`gh api\`) to confirm no Acknowledged reply is already present." >&2
  exit 1
fi
```

- **Review body** (`reply_type == "pr_comment"`): Clear any stale file at this path first:

```bash
DLC_TMPDIR="${TMPDIR:-/tmp}/dlc-pr-check-$PR_NUMBER"
mkdir -p "$DLC_TMPDIR"
REPLY_FILE="$DLC_TMPDIR/reply-review-{database_id}.md"
rm -f "$REPLY_FILE"   # clear content preserved from an earlier failed attempt before the Write tool runs
echo "$REPLY_FILE"    # print the resolved absolute path — the Write tool is not a shell and can't expand $REPLY_FILE itself
```

The `Write` tool call is not a shell command and can't see `$REPLY_FILE` — use the absolute path this block printed as the `file_path`. Write it with the `Write` tool — first neutralize every `@` character in the excerpt (insert a space immediately after it, don't delete it), then collapse every newline in it to a single space, then strip any `<!--` / `-->` sequence — as:

```text
> {first 100 chars of original body}...

{decision-aware reply text}
<!-- dlc-reply:{database_id} -->
```

Then post from the file. **This is a separate Bash tool call — recompute the path first:**

```bash
DLC_TMPDIR="${TMPDIR:-/tmp}/dlc-pr-check-$PR_NUMBER"
REPLY_FILE="$DLC_TMPDIR/reply-review-{database_id}.md"

if [ ! -s "$REPLY_FILE" ]; then
  echo "ERROR: reply body missing or empty at $REPLY_FILE — the Write step may have failed" >&2
  exit 1
elif gh pr comment $PR_NUMBER --body-file "$REPLY_FILE"; then
  rm -f "$REPLY_FILE"
else
  echo "ERROR: Failed to post reply for comment {database_id} — reply body preserved at $REPLY_FILE. Do NOT re-run this exact posting command directly with the preserved file — if the POST actually succeeded server-side despite this error, that would post a literal duplicate comment. Re-running pr-check from Step 1 IS safe here, unlike for inline threads: review-body 'already-replied' detection is sentinel-based (\`<!-- dlc-reply:{database_id} -->\` in ISSUE_COMMENTS), so it recognizes a successfully-posted reply regardless of its Fixed/Dismissed/Answered/Acknowledged prefix and Step 2 will correctly skip re-posting." >&2
  exit 1
fi
```

- **Issue comment** (`reply_type == "issue_comment"`): Same content shape, transforms, and freshness handling as the review-body block above. Clear any stale file at this path first:

```bash
DLC_TMPDIR="${TMPDIR:-/tmp}/dlc-pr-check-$PR_NUMBER"
mkdir -p "$DLC_TMPDIR"
REPLY_FILE="$DLC_TMPDIR/reply-issue-{database_id}.md"
rm -f "$REPLY_FILE"   # clear content preserved from an earlier failed attempt before the Write tool runs
echo "$REPLY_FILE"    # print the resolved absolute path — the Write tool is not a shell and can't expand $REPLY_FILE itself
```

The `Write` tool call is not a shell command and can't see `$REPLY_FILE` — use the absolute path this block printed as the `file_path`. Write it with the `Write` tool as:

```text
> {first 100 chars of original body}...

{decision-aware reply text}
<!-- dlc-reply:{database_id} -->
```

Then post from the file. **This is a separate Bash tool call — recompute the path first:**

```bash
DLC_TMPDIR="${TMPDIR:-/tmp}/dlc-pr-check-$PR_NUMBER"
REPLY_FILE="$DLC_TMPDIR/reply-issue-{database_id}.md"

if [ ! -s "$REPLY_FILE" ]; then
  echo "ERROR: reply body missing or empty at $REPLY_FILE — the Write step may have failed" >&2
  exit 1
elif gh pr comment $PR_NUMBER --body-file "$REPLY_FILE"; then
  rm -f "$REPLY_FILE"
else
  echo "ERROR: Failed to post reply for comment {database_id} — reply body preserved at $REPLY_FILE. Do NOT re-run this exact posting command directly with the preserved file — if the POST actually succeeded server-side despite this error, that would post a literal duplicate comment. Re-running pr-check from Step 1 IS safe here, unlike for inline threads: issue-comment 'already-replied' detection is sentinel-based (\`<!-- dlc-reply:{database_id} -->\` in ISSUE_COMMENTS), so it recognizes a successfully-posted reply regardless of its Fixed/Dismissed/Answered/Acknowledged prefix and Step 2 will correctly skip re-posting." >&2
  exit 1
fi
```

> All three reply bodies are composed with the `Write` tool and posted from a
> file, never shell-interpolated — the quoted excerpt is reviewer-controlled
> text that could contain anything. The scratch directory is per-PR and each
> filename carries a reply-type prefix (`reply-inline-`, `reply-review-`, or
> `reply-issue-`), so an inline thread's `rest_id`, a review body's
> `database_id`, and an issue comment's `database_id` can never collide with
> each other even though GitHub draws these IDs from a shared internal space
> where any two of them could otherwise coincide. See SKILL.md's Step 4
> reply-routing section for the full reasoning behind each excerpt transform
> (mention neutralization, newline collapsing, sentinel-forgery prevention) —
> identical here.

## Step 5c: PR Summary Comment

If there are no remaining Discussion-Deferred, Discussion-Tracked, Blocked, user-skipped Fixable, or Pending-Human items, skip this step.

> **Unattended-mode conditional suppression:** In unattended runs (`UNATTENDED=true`), if the ONLY remaining items are Pending-Human — no Fixed, Answered, Deferred, Tracked, Blocked, or Skipped items to report — do NOT post this summary comment. The halt signal comes from the `PushNotification` fired by babysit, not from a PR-level comment. When auto-handled items coexist with Pending-Human items (e.g., 3 fixed + 2 pending), post the summary as normal with the Pending-Human row included.

Post a PR-level summary comment containing the overall status and decisions.

> **No `@`-mentions in the Decisions section:** the fenced template below is
> the literal posted comment body — do not write instruction prose inside it.
> This note covers `{brief description}` too — the same two-case split from
> the no-mentions rule at the top of SKILL.md applies: if the original
> comment tagged a person or bot and you're carrying that reference over,
> drop the `@` entirely (bare name). If it contained an `@`-prefixed
> technical token instead — a scoped package, decorator, or email address —
> insert a space right after the `@` instead of deleting it, so the token
> stays recognizable rather than turning into a different, misleading one.

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
| Pending-Human | {n} | {n} | {n} | {n} |
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

The summary embeds decision descriptions carried over from reviewer comments — never heredoc it. Write it with the `Write` tool, then post from the file. `DLC_TMPDIR` is created with `mktemp -d` (mode 0700, guaranteed unique) for the same reason as the follow-up issue body above — its path is threaded forward as a literal, not recomputed:

```bash
DLC_TMPDIR=$(mktemp -d "${TMPDIR:-/tmp}/dlc-pr-check-$PR_NUMBER.XXXXXXXX")
SUMMARY_FILE="$DLC_TMPDIR/summary.md"
echo "$SUMMARY_FILE"    # print the resolved absolute path — the Write tool is not a shell and can't expand $SUMMARY_FILE itself, and this mktemp suffix can't be regenerated in the next Bash call
```

The `Write` tool call is not a shell command and can't see `$SUMMARY_FILE` — use the absolute path this block printed as the `file_path`, and write the summary content there. **Posting is a separate Bash tool call — `SUMMARY_FILE` is the literal path the prep step printed:**

```bash
SUMMARY_FILE="{literal path printed by prep}"

if [ ! -s "$SUMMARY_FILE" ]; then
  echo "ERROR: summary body missing or empty at $SUMMARY_FILE — the Write step may have failed" >&2
  exit 1
fi

if grep -qE '@[[:alnum:]_-]' "$SUMMARY_FILE"; then
  echo "ERROR: unneutralized @ mention found in $SUMMARY_FILE — insert a space immediately after every @ in the Write step per the No GitHub mentions rule above, then re-run this block. Nothing has been posted yet; this is safe to retry." >&2
  exit 1
fi

if gh pr comment $PR_NUMBER --body-file "$SUMMARY_FILE"; then
  POST_OK=1
else
  POST_OK=0
fi

if [ "$POST_OK" = 1 ]; then
  rm -f "$SUMMARY_FILE" 2>/dev/null || echo "Note: summary posted successfully; scratch cleanup at $SUMMARY_FILE failed (non-fatal, nothing to retry)." >&2
else
  echo "ERROR: Failed to post PR summary — body preserved at $SUMMARY_FILE. Do NOT re-run this exact posting command directly with the preserved file — if the POST actually succeeded server-side despite this error, that would post a duplicate summary comment." >&2
  exit 1
fi
```
