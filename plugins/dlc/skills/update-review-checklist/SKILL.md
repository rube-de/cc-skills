---
name: update-review-checklist
description: >-
  Audit review checklist for a repo: cluster recurring review-comment themes
  across merged PRs in a window, diff against docs/code-review-checklist.md,
  and open a PR proposing new entries with PR traceability. Designed for
  /schedule monthly cadence. Pass --dry-run to print clusters without
  opening a PR. Trigger phrases: audit review checklist, update review
  checklist, cluster PR findings.
allowed-tools: [Bash, Read, Write, Edit, AskUserQuestion, PushNotification]
---

# DLC: Update Review Checklist

Cluster recurring reviewer themes across recent merged PRs and open a PR that proposes new entries for the target repo's `docs/code-review-checklist.md`. The skill never auto-merges — every proposal is human-reviewed.

**Standalone:** `/dlc:update-review-checklist [<owner>/<repo>] [--lookback 30d] [--threshold 2] [--dry-run] [--unattended]`

**Scheduled (recommended monthly cadence):**
```text
/schedule '0 0 1 * *' /dlc:update-review-checklist <owner>/<repo>
```

## Why This Matters

A `docs/code-review-checklist.md` doc decays without a forcing function. Manual curation lapses after the first few months and the checklist drifts away from what reviewers are actually catching in PRs. Reviewer attention is the most expensive resource on the team — when the same class of finding shows up in two or more PRs, the checklist deserves an entry so the next author catches it before review.

The recurring nature is the entire signal. A one-off finding is noise; a finding that recurs across multiple PRs is a pattern. Monthly cadence gives enough signal to cluster without flooding the checklist with low-recurrence entries. A run that finds zero promotable clusters is a healthy result — it means recent reviews have surfaced novel issues, not the same ones again.

## Notification Rules

Fire `PushNotification` only for **terminal states that benefit the user knowing about**:

- `pr_opened` — a checklist update PR was opened (include the PR URL)
- `pending_human` — under `--unattended`, clusters that need a human call were skipped
- Errors that block the run (missing prerequisites, GitHub API failures)

Routine outcomes (no clusters found, missing checklist file, dry-run with nothing to propose) are silent — printed to stdout but not pushed. This keeps the monthly scheduled cadence quiet by default and noisy only when there is something to act on.

## Step 0: Parse Arguments

Capture the original calling directory once, before any later step changes cwd into a clone:

```bash
ORIG_CWD="$(pwd)"
```

Read `$ARGUMENTS` and extract:

- `REPO` — optional positional `owner/name`. If absent, default to `gh repo view --json owner,name` for the current working directory.
- `LOOKBACK` — `--lookback <Nd>` (default `30d`). Format is a positive integer followed by `d`.
- `THRESHOLD` — `--threshold <N>` (default `2`). Minimum number of **distinct PRs** a cluster must span to be promoted.
- `DRY_RUN` — `--dry-run` flag. When present, set `DRY_RUN=true`.
- `UNATTENDED` — `--unattended` flag. When present, suppress `AskUserQuestion` calls; ambiguous clusters and ambiguous dedup matches become Pending-Human items reported in the final summary instead of prompting the user.

Reject unknown flags with a one-line error and exit non-zero.

Initialise two counters that other steps mutate:

- `PENDING_HUMAN` — list of `{theme, source_prs, reason}` records (clusters held back from the PR because they needed a human call). Used in Step 9 to emit the `Pending-Human:` line.
- `ENTRIES_ADDED` — count of clusters actually written to the checklist file (distinct from "clusters that survived clustering" — Pending-Human clusters are *not* counted here).

## Step 1: Precondition Check

Verify the target repo has `docs/code-review-checklist.md`:

```bash
gh api "repos/$REPO/contents/docs/code-review-checklist.md" --silent >/dev/null 2>&1
```

**If the file does not exist (404):** Print one line to stdout and exit 0. Do **not** fire `PushNotification` — this is not an error, just an unmet prerequisite:

```text
$REPO has no docs/code-review-checklist.md — create one first, then re-run /dlc:update-review-checklist. See issue cc-skills#216 for the shape.
```

**If the API call fails for any other reason** (auth, rate limit, network): emit one line, fire `PushNotification` with the error, exit non-zero.

## Step 1.5: Guard Against an Existing Open Update PR

The `--skip-prefix` filter in the helper script only excludes *merged* prior runs. An open prior PR is still in flight; opening a second one stacks duplicates and pollutes the review queue.

```bash
OPEN_PRIOR=$(gh pr list --repo "$REPO" --state open \
  --search "head:chore/update-review-checklist-" \
  --json number,url,headRefName \
  --jq '.[]')
```

**If `OPEN_PRIOR` is non-empty:**

Print one line to stdout naming the existing PR's URL and exit 0. Do **not** fire `PushNotification` — a single waiting PR is a normal between-cycles state, not an error:

```text
$REPO has an open checklist-update PR (<URL>). Merge or close it before re-running.
```

This rule applies in both attended and unattended modes. Dry-run is the one exception: continue through to Step 6 so the human can preview what *would* be proposed once the prior PR is resolved.

## Step 2: Fetch Comments

Run the helper script that lists merged PRs in window, fetches review-thread + review-body + issue-comment data per PR, applies the resolved-by-commit heuristic, and detects severity labels:

```bash
sh ../../scripts/fetch-merged-pr-comments.sh "$REPO" --lookback "$LOOKBACK"
```

Capture the JSON output into `PR_DATA`. Validate the response shape — abort with the error message if `.error` is present, or if `.prs` is missing.

**If `.summary.truncated == true`:** Warn on stdout that the helper hit a per-PR pagination cap and some comments may be missing. Continue with the partial data.

**If `.summary.list_limit_hit == true`:** Warn that the merged-PR list cap (200) was reached and recent PRs may be missing from analysis. Continue with what was returned.

**Existing checklist read.** Also fetch the current checklist content for the dedup step in Step 5. Use `mktemp` so concurrent scheduled runs against different repos cannot overwrite each other's dedup input:

```bash
CURRENT_CHECKLIST="$(mktemp "${TMPDIR:-/tmp}/update-review-checklist-existing.XXXXXX")"
gh api "repos/$REPO/contents/docs/code-review-checklist.md" --jq '.content' | base64 -d > "$CURRENT_CHECKLIST"
```

## Step 3: Filter Comments

Apply these filters in order; keep counters so the final summary can report what was dropped and why.

1. **Drop unresolved-by-commit** (`.resolved_by_commit == false`). A reviewer comment that did not provoke a code change from the PR author is either (a) a wishlist item ignored or deferred, or (b) something the reviewer themselves resolved as not-needed. Either way, it is not a pattern worth promoting to the checklist.
2. **Drop hard-skip patterns** — read [`references/clustering-rubric.md`](references/clustering-rubric.md) now and apply its explicit blocklist (typos, formatting nits, "consider" wishlists with no specific action, automated review-summary comments with zero findings).

The `.is_bot` field on each comment is retained as metadata for the PR body's "Derived from" table, but is **not** a filter input. Substantive reviewers in many repos are bot accounts (Copilot, CodeRabbit, Codex, Gemini, Qodo); filtering on author type would discard the primary signal. Noise from automated reviewers is content-defined and handled by the hard-skip patterns instead.

Record the per-step drop counts. They surface in the Step 9 summary.

## Step 4: Cluster Semantically

Read [`references/clustering-rubric.md`](references/clustering-rubric.md) now and apply its semantic rules to group the surviving comments into clusters.

A cluster's **PR-count** is the number of **distinct PR numbers** its member comments come from — not the total comment count. Two comments from the same PR count once.

A cluster's **weight** is the sum of member severity weights from the rubric (`high=3`, `medium=2`, `low|null=1`).

Drop any cluster with `pr_count < $THRESHOLD`. Sort the survivors by weight descending, then by PR-count descending.

### Ambiguous-cluster gate

After applying the rubric, mark a cluster as **ambiguous** when any of the following hold:

- Members straddle the "same ask, different domain" line in the rubric (e.g. "add a test" for both an algorithm and a UI component) — could legitimately split into two clusters
- The cluster's proposed title can be read as either too coarse ("Improve error handling") or genuinely useful, and you cannot decide from the member comments alone
- Two existing clusters could merge into one broader cluster, or one cluster could split into two narrower ones, and the rubric's granularity guide doesn't break the tie

For each ambiguous cluster:

- **If `UNATTENDED == true`:** append `{theme, source_prs, reason: "ambiguous_clustering"}` to `PENDING_HUMAN` and **drop the cluster from the active set**. Pending-Human items are surfaced in Step 9, not in the PR.
- **If `UNATTENDED == false`:** invoke `AskUserQuestion` once per ambiguous cluster with options shaped like:

  ```
  Cluster "<theme>" spans PRs #N, #M, #P. Members suggest <split/merge/keep>. Which?
    (a) Keep as-is and propose
    (b) Split into <theme-a> and <theme-b>
    (c) Drop (too ambiguous to be useful)
  ```

  Apply the user's answer to the active set before continuing.

Non-ambiguous clusters pass through unchanged. The active set after this gate is what Step 5 sees.

## Step 5: Dedup Against Existing Checklist

Read [`references/checklist-schema.md`](references/checklist-schema.md) now. For each surviving cluster, apply its semantic-dedup rubric against `/tmp/current-checklist.md`. The rubric's three diagnostic questions classify each cluster as **duplicate** (drop), **distinct** (keep), or **ambiguous** (needs a call).

### Ambiguous-dedup gate

A cluster is ambiguous against an existing entry when Q1/Q2/Q3 produce a mix of "maybe" answers — typically because the existing entry is generic and the cluster is specific (Q2 subsumption is unclear), or because the surface partially overlaps (Q3 partial-domain match).

For each ambiguous dedup match:

- **If `UNATTENDED == true`:** append `{theme, source_prs, reason: "ambiguous_dedup_vs_existing:<existing-entry-title>"}` to `PENDING_HUMAN` and drop the cluster from the active set.
- **If `UNATTENDED == false`:** invoke `AskUserQuestion`:

  ```
  Cluster "<theme>" (PRs #N, #M) may overlap with existing entry "<E>". Propose anyway?
    (a) Yes — distinct enough, add to PR
    (b) No — covered by "<E>"
    (c) Replace "<E>" with the new wording  [INFORMATIONAL — out of scope for v1; treat as (b) but record]
  ```

  Option (c) is out of scope per issue cc-skills#216 (no rewording of existing entries in v1) — record the suggestion in the PR body for the human reviewer's consideration, but treat behaviour as (b) and drop the cluster.

> **Tie-breaker for genuine doubt that isn't ambiguous (attended mode without an AskUserQuestion prompt):** prefer keeping the candidate. Duplicate proposals get caught in human review; missed proposals do not. The ambiguous-dedup gate above only fires for the *specifically* ambiguous cases — most clusters will pass cleanly as either duplicate or distinct.

## Step 6: Dry-Run Exit Point

If `DRY_RUN=true`:

Print each surviving cluster to stdout in this format:

```text
Cluster: <theme>
  PRs:      #N, #M, #P  (n distinct, weight=W)
  Members:  <reviewer1> on #N: "<comment excerpt 80c>"
            <reviewer2> on #M: "<comment excerpt 80c>"
  Proposed entry:
    > <entry text per checklist-schema.md format>
    > Source PRs: #N, #M, #P
```

Then print a summary block: total clusters proposed, filter drop counts from Step 3, dedup drop count from Step 5.

Do **not** create a branch, edit any file, or open a PR. Exit 0.

## Step 7: Author the PR

If `DRY_RUN=false` and at least one cluster survives the dedup gate (i.e. the active set is non-empty after Step 5):

### Always operate in a fresh clone

Use a temporary work directory unconditionally — even when the target repo *is* the current working directory. This avoids two-path branching, prevents accidental edits in the user's working tree, and keeps the calling repo's git state clean for state-file writes in Step 8:

```bash
WORKDIR="$(mktemp -d "${TMPDIR:-/tmp}/update-review-checklist.XXXXXX")"
trap 'rm -rf "$WORKDIR"' EXIT

BRANCH="chore/update-review-checklist-$(date -u +%Y-%m-%d-%H%M)"

gh repo clone "$REPO" "$WORKDIR" -- --depth 50 >/dev/null
cd "$WORKDIR"
git checkout -b "$BRANCH"
```

The `trap ... EXIT` ensures the work dir is cleaned up whether the step succeeds, fails, or is interrupted.

### Re-read the checklist from the clone

The `$CURRENT_CHECKLIST` cache from Step 2 may be stale relative to the freshly cloned HEAD. Re-read in-place so Step 5's dedup is sound against the *actual* file you're about to edit:

```bash
CHECKLIST_PATH="$WORKDIR/docs/code-review-checklist.md"
```

If a meaningful diff exists between `/tmp/current-checklist.md` and `$CHECKLIST_PATH` (e.g. someone merged checklist changes between Step 2 and now), re-run the Step 5 dedup gate against the fresh content before continuing. For monthly-cadence runs this is almost never the case.

### Edit the checklist

Apply the active-set entries per [`references/checklist-schema.md`](references/checklist-schema.md) — match each cluster to its target section (or append to a "Recurring patterns" section if no existing match), and include the `> Source PRs: #N, #M` trailer on every entry. Use `Edit` operations rather than rewriting the file. Each successful edit increments `ENTRIES_ADDED`.

### Commit, push, open PR

GPG-signing must be bypassed — scheduled / unattended runs have no interactive pinentry available:

```bash
git add docs/code-review-checklist.md
git -c commit.gpgsign=false commit -m "chore(dlc): update review checklist (lookback $LOOKBACK)"
git push -u origin "$BRANCH"
```

Build the PR body per the template in [`references/checklist-schema.md`](references/checklist-schema.md). Include:

- A one-line summary of `ENTRIES_ADDED`
- A **"Derived from"** table listing each new entry and the PRs it was clustered from (acceptance criterion #4)
- The lookback window and threshold used
- If `PENDING_HUMAN` is non-empty, a separate **"Pending human review"** section listing the held-back themes with their `source_prs` and `reason` — informational, so reviewers know these clusters were observed but not promoted
- A "How this was generated" footer pointing at this skill

```bash
gh pr create \
  --repo "$REPO" \
  --title "chore(dlc): update review checklist (lookback $LOOKBACK)" \
  --body-file "$WORKDIR/.pr-body.md"
```

Capture the PR URL into `PR_URL`. Return to the original cwd before Step 8 so state-file writes target the calling repo, not the clone:

```bash
cd "$ORIG_CWD"
```

## Step 8: Persist State

Write a small JSON state file in the **calling repo** (the place this skill was invoked from), not the cloned target. This file is informational; it does not gate future runs.

```bash
SLUG=$(printf '%s' "$REPO" | tr '/' '-')
mkdir -p "$ORIG_CWD/.dev/dlc"
cat > "$ORIG_CWD/.dev/dlc/update-review-checklist-$SLUG.state" <<EOF
{
  "last_run_at": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "last_pr_url": "$PR_URL",
  "lookback": "$LOOKBACK",
  "threshold": $THRESHOLD,
  "entries_added": $ENTRIES_ADDED,
  "pending_human": $(printf '%s' "$PENDING_HUMAN" | jq 'length // 0'),
  "status": "pr_opened"
}
EOF
```

The state file lives alongside babysit's (`.dev/dlc/*.state`). Writing it to `$ORIG_CWD` matters because Step 7's clone is in a temp dir that gets `rm -rf`'d on exit — anything written there is lost.

> **Why no self-cancel.** Unlike `dlc:babysit`, this skill is recurring by design — every month may yield new clusters. Do not call `CronDelete` to remove the schedule entry. Under `/loop` usage (ad-hoc, not the recommended cadence), the user manages stop via `/loop stop` themselves.

## Step 9: Terminal Notification + Summary

Emit a single summary block to stdout. The two key counters are deliberately separated so the user can see at a glance "how many entries actually landed in the PR" vs "how many clusters were observed but held back":

```text
update-review-checklist complete.
  Repo:                 $REPO
  Lookback:             $LOOKBACK (cutoff $CUTOFF_DATE)
  Merged PRs inspected: $N  (skipped own PRs: $K)
  Comments fetched:     $M
  Filter drops:
    - bots:                       $A
    - unresolved-by-commit:       $B
    - hard-skip patterns:         $C
  Clusters above threshold:       $D
  Dedup drops (already covered):  $E
  Entries added to PR:            $ENTRIES_ADDED
  Pending-Human (held back):      $PENDING_HUMAN_COUNT  [only printed when > 0]
  PR opened:                      $PR_URL                [only printed when a PR was opened]
```

`ENTRIES_ADDED` counts clusters that landed in the PR. `PENDING_HUMAN_COUNT` counts ambiguous clusters held back via the Step 4 or Step 5 gates under `--unattended`. The two sets are disjoint by construction — Pending-Human items are dropped from the active set before Step 7 edits the file.

### Notifications

- **If a PR was opened** (`ENTRIES_ADDED > 0` and not dry-run): fire `PushNotification` with message `Review-checklist PR opened for $REPO: $ENTRIES_ADDED new entries (lookback $LOOKBACK). $PR_URL`
- **If `--unattended` and `PENDING_HUMAN_COUNT > 0`**: fire `PushNotification` with message `Review checklist: $PENDING_HUMAN_COUNT clusters need a human call for $REPO. Re-run attended to triage.`
- **If `ENTRIES_ADDED == 0` and not dry-run**: silent. No PR, no push. The summary above is enough — zero clusters worth promoting is a healthy result for a well-reviewed repo.
- **Dry-run**: silent regardless of counts. The user invoked dry-run because they want stdout, not a push.

## Step 10: Verify Against Acceptance Criteria

Cross-reference the run against the VERIFY criteria in issue cc-skills#216:

| AC | Verified by |
|---|---|
| #1 trigger phrases documented | This SKILL.md's `description` field contains all three triggers |
| #2 runs standalone + under `/schedule` | "Standalone" + "Scheduled" usage shown at top of SKILL.md |
| #3 missing-checklist exits cleanly | Step 1 prints guidance + exits 0 |
| #4 PR cites source PRs per entry | Step 7 builds "Derived from" table; each entry has `> Source PRs:` trailer |
| #5 threshold configurable | `--threshold` flag in Step 0; Step 4 enforces |
| #6 semantic dedup | Step 5 invokes `references/checklist-schema.md` rubric |
| #7 dry-run mode | Step 6 exits before any mutation |
| #8 skips own prior PRs | helper script's `--skip-prefix chore/update-review-checklist-` |
