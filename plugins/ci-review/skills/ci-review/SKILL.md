---
name: ci-review
description: >-
  CI-optimized code review: multi-agent parallel review with confidence scoring
  and atomic GitHub PR review posting. Runs specialized review agents, scores
  findings, and submits a GitHub PR review via `post-review.sh`.
  Always executes `post-review.sh` to submit a review on every run (including zero-findings runs).
  Triggers: /ci-review, review PR, CI code review, automated PR review.
  Use: /ci-review <PR#> [focus text] [--full|--lean|--single] [--agent] [--model sonnet|opus] [--min-severity <level>]
user-invocable: true
allowed-tools: [Bash, Read, Grep, Glob, Agent, AskUserQuestion]
argument-hint: "<PR#> [focus text] [--full|--lean|--single] [--agent] [--model sonnet|opus] [--min-severity low|medium|high|critical]"
---

# CI Review

**CRITICAL REQUIREMENT**: This skill is an automated review submitter. Its primary deliverable is an atomic GitHub PR review submitted by calling the `Bash` tool to execute `post-review.sh`.

**You MUST call the `Bash` tool to run `sh "${CLAUDE_SKILL_DIR}/../../scripts/post-review.sh" <PR#> "${TMPDIR:-/tmp}/ci-review-payload-<PR#>.json"` on EVERY run before writing any final summary text.** Ending a session without calling the `Bash` tool to post the review violates the contract and fails CI.

## Mandatory Review Contract (Inviolable)

Every execution of `/ci-review` MUST complete all workflow steps through Step 8:
1. **Step 6 is mandatory on ALL runs**: Construct the payload file `${TMPDIR:-/tmp}/ci-review-payload-<PR#>.json` (using the "No Findings" template with `"comments": []` when clean).
2. **Step 7 is mandatory on ALL runs**: Call the `Bash` tool to run `sh "${CLAUDE_SKILL_DIR}/../../scripts/post-review.sh" <PR#> "${TMPDIR:-/tmp}/ci-review-payload-<PR#>.json"`.
3. **Step 8 is mandatory**: Output the summary including the review URL returned by `post-review.sh`.

Before running, **read [references/REVIEW-POSTING.md](references/REVIEW-POSTING.md) now** for the review posting format and error handling chain.

## Profiles

| Profile | Agents | Use When |
|---------|--------|----------|
| **single** | single-reviewer (one comprehensive agent) | Routine PRs, CI budgets, small diffs — ~6x cheaper than lean |
| **lean** (default) | deep-reviewer, guidelines-checker, bug-detector, security-reviewer, silent-failure-hunter, code-simplifier | Every PR — balanced cost and coverage |
| **full** | All lean agents + test-analyzer, comment-analyzer, type-analyzer | Critical PRs, large changes, pre-release |
| **agent** | Same agents as full | PR authored by an AI agent — surfaces more findings since fixes are cheap |

### Agent Profile

The `--agent` flag activates the agent profile, designed for reviewing AI-authored code. It uses the full agent set but with different thresholds and additional prompt context:

- Uses the **full** agent set (all 9 review agents)
- Lowers the default `--min-severity` to `low` (surface everything actionable)
- Injects context into each agent prompt: *"This PR was authored by an AI agent. Surface all valid findings including minor ones — the cost of fixing is negligible. Pay attention to AI-specific patterns: over-engineering, hallucinated API usage, unnecessary abstractions, verbose boilerplate, and cargo-culted patterns."*

### Severity Filter

Use `--min-severity <level>` to control which findings appear in the review:

| Level | Includes | Default For |
|-------|----------|-------------|
| `low` | All findings (low, medium, high, critical) | `--agent` profile |
| `medium` | medium + high + critical | Default for `--single`, `--lean`, `--full` |
| `high` | high + critical | — |
| `critical` | critical only | — |

If not specified, `--min-severity` defaults to `medium` for normal runs and to `low` when `--agent` is used. The severity filter is applied AFTER confidence scoring — it removes real but low-priority findings, not false positives.

## Review Posting Rules (Inlined for Reliability)

These rules are critical. They are also detailed in REVIEW-POSTING.md but inlined here as defense-in-depth:

- **Always use event `"COMMENT"`** — never `"APPROVE"` or `"REQUEST_CHANGES"`
- `line` is the line number on the new version of the file. Always use `side=RIGHT`
- Only post **actionable** inline comments — no confirmations, no "looks good"
- Do not repeat correctly addressed items
- If no inline comments, write `"comments": []` in the Step 6 payload file
- **Always post — even with zero findings.** A clean review still requires a body-only review using the exact "No Findings" template from [REVIEW-POSTING.md](references/REVIEW-POSTING.md) §3 (`## CI Review` header, "No actionable issues found. Reviewed N files across M changed lines.", profile).
- **Posting is deterministic via `post-review.sh`**: Step 6 writes `${TMPDIR:-/tmp}/ci-review-payload-<PR#>.json`, and Step 7 executes `post-review.sh` to handle payload submission, retry logic, and fallback posting automatically. Never skip Step 7.
## Timing Logs

This section is reference guidance. **Do not execute anything from it directly** — timing markers are only emitted from within each numbered Step's own Bash invocations below. This section describes the two variants and when to apply each.

Every Step in the `## Workflow` section emits a phase-start marker at its beginning and a phase-end marker at its end so the GitHub Actions log shows where time is spent. GitHub Actions renders `::group::` / `::endgroup::` as collapsible sections in the run UI; local runs see them as plain text. Track each Step's elapsed seconds and report them in the Step 8 summary as `Phase timings (s): s0=... s1=... ... total=...`.

**Single-call variant** — use when the entire Step fits in one Bash invocation (Steps 0, 1, 2, 7). Capture the start epoch into a shell variable and compute elapsed inline, so no state needs to cross tool calls. **Preserve the step's exit status** by capturing `$?` immediately after `<step commands>` and re-emitting it at the end — otherwise the trailing `echo` commands would always return 0 and mask prerequisite or eligibility failures (e.g., `gh auth status` failing in Step 0). **All echoes go to stdout** — per GitHub's workflow-command spec, `::group::` / `::endgroup::` must appear on stdout to render as collapsible sections in the Actions log. For steps whose `<step commands>` also produces parseable output (e.g., Step 2's `gh pr view --json`), the output should remain parseable.

**Multi-call variant** — use when the Step spans multiple Bash invocations or waits on subagent tool calls (Steps 3, 3.5, 4, 5, 6). All marker echoes go to stdout (GitHub's workflow-command spec). Any value the model needs to remember for later calls (epochs, SHAs, owner/repo) must be printed to stdout as a labeled line so it survives across tool calls. In the first Bash call of the Step, print `echo "::group::[ci-review] Step N: <name>"` and `date +%s` — remember the printed epoch in your working state. In the last Bash call of the Step, substitute the remembered epoch into `echo "[ci-review] Step N done elapsed=$(( $(date +%s) - <REMEMBERED_EPOCH> ))s"; echo "::endgroup::"`. For Steps with agent fan-out (Steps 4, 5), place the phase-end marker *after* all agents return.

## Workflow

### Step 0: Prerequisites

Verify `gh` CLI is available and authenticated. Single Bash invocation using the Timing Logs single-call variant:

```bash
echo "::group::[ci-review] Step 0: Prerequisites"
START=$(date +%s)
gh auth status
STATUS=$?
echo "[ci-review] Step 0 done elapsed=$(( $(date +%s) - START ))s"
echo "::endgroup::"
exit $STATUS
```

If `gh` is not found (exit 127), abort with: "gh CLI is required. Install: https://cli.github.com/"
If not authenticated (non-zero exit from `gh auth status`), abort with: "gh is not authenticated. Run: gh auth login"

### Step 1: Parse Arguments

Emit timing markers via a minimal Bash invocation even though argument parsing itself has no other shell work — `s1=<parse>` in the Step 8 summary must be a measured elapsed value, never a placeholder:

```bash
echo "::group::[ci-review] Step 1: Parse Arguments"
START=$(date +%s)
# Argument parsing is performed by the model from the conversation — no shell work required here.
echo "[ci-review] Step 1 done elapsed=$(( $(date +%s) - START ))s"
echo "::endgroup::"
```

Extract from the argument string:
- **PR identifier** (required): a number (e.g., `123`) or GitHub URL. If a URL, extract the PR number and store as `PR_NUMBER`. If the URL points to a different repository than the current one, abort with: "Cross-repo URLs are not supported. Run this skill from the target repo, or pass just the PR number."
- **Focus text** (optional): free text describing what to focus the review on (e.g., "auth flow", "error handling")
- **Profile flag** (optional): `--single`, `--lean`, `--full`, or `--agent`. Default: `--lean`. `--agent` implies `--full` agent set. `--single` uses one comprehensive agent instead of the specialist fan-out.
- **Model override** (optional): `--model sonnet|opus`. Default: use each agent's built-in model (Sonnet for reviewers, Haiku for scorers). When set, overrides the model for review agents only — confidence scorers always use Haiku.
- **Severity filter** (optional): `--min-severity low|medium|high|critical`. Default: `medium` (or `low` when `--agent`).

If no PR number is provided, abort with: "Usage: /ci-review <PR#> [focus text] [--full|--lean|--single] [--agent] [--model sonnet|opus] [--min-severity <level>]"

### Step 2: Eligibility Check

Single Bash invocation using the Timing Logs single-call variant. Preserves the `gh pr view` exit status so non-zero (PR not found, permissions) propagates for the abort check:

```bash
echo "::group::[ci-review] Step 2: Eligibility Check"
START=$(date +%s)
gh pr view <PR#> --json state,number,title,url
STATUS=$?
echo "[ci-review] Step 2 done elapsed=$(( $(date +%s) - START ))s"
echo "::endgroup::"
exit $STATUS
```

- If `gh pr view` fails (non-zero exit), abort: "PR #N not found or insufficient permissions."
- If PR state is not `OPEN`, abort: "PR #N is {state}. Only open PRs can be reviewed."

Print: "Reviewing PR #N: {title} ({url}) — profile: {single|lean|full|agent}"

### Step 3: Gather Context (Parallel)

Multi-call timing variant. Emit the phase-start marker in a dedicated Bash call **before** launching the parallel operations below:

```bash
echo "::group::[ci-review] Step 3: Gather Context"
date +%s   # print and remember — pass this value into the Step 3 phase-end Bash call at the end
```

Then launch these four operations in parallel:

**3a. Fetch PR diff:**
```bash
gh pr diff <PR#>
```

**3b. Fetch PR metadata:**
```bash
gh pr view <PR#> --json title,body,headRefName,baseRefName,files,additions,deletions,changedFiles
```

**3c. Discover CLAUDE.md files:**
Search for CLAUDE.md files in the repo root and in directories containing changed files. Use `Glob` to find `**/CLAUDE.md` and `Read` to load the root CLAUDE.md and any others relevant to the changed files. **Preserve scope:** prefix each file's contents with its path (e.g., `### /CLAUDE.md`, `### /packages/api/CLAUDE.md`) so agents know which rules apply to which directories.

**3d. Fetch existing PR comments:**
Run the `fetch-pr-comments.sh` script to retrieve all existing comments on this PR (inline review comments, PR-level comments, and review bodies from all authors):
```bash
sh "${CLAUDE_SKILL_DIR}/../../scripts/fetch-pr-comments.sh" <PR#>
```
Store the JSON output as `EXISTING_COMMENTS`. Comment bodies are truncated to 2000 characters by the script to limit context size on comment-heavy PRs — this is sufficient for content-signal matching since actionable content appears early in comments.

If the script fails (non-zero exit, or stderr contains `{"error":...}`), log a warning and continue — cross-run dedup is best-effort. On failure, set `EXISTING_COMMENTS` to:
```json
{"inline_comments":[],"pr_comments":[],"review_bodies":[],"summary":{"total_inline":0,"total_pr_comments":0,"total_review_bodies":0}}
```

Print: "Fetched {total_inline} inline comments, {total_pr_comments} PR comments, {total_review_bodies} review bodies for cross-run dedup."

Compile the context bundle:
- `PR_DIFF`: the full diff text
- `PR_META`: title, body, branch names, file list, stats
- `CLAUDE_MD`: path-prefixed CLAUDE.md contents (or "No CLAUDE.md found")
- `FOCUS`: the focus text (or empty)
- `EXISTING_COMMENTS`: structured JSON of all existing PR comments (for cross-run dedup in Step 5)

**Large diffs:** If the diff exceeds 10,000 lines, warn: "Large diff ({N} lines) — review quality may degrade for files not near the top of the diff." Do not truncate — let agents handle context naturally. They can always `Read` individual files for deeper investigation.

Emit the Step-3 phase-end marker in a final Bash call after the context bundle is compiled (substitute the epoch you remembered from the phase-start call):

```bash
echo "[ci-review] Step 3 done elapsed=$(( $(date +%s) - <STEP3_START_EPOCH> ))s"
echo "::endgroup::"
```

### Step 3.5: Ensure PR Branch is Checked Out

Multi-call timing variant. Emit the phase-start marker in a first Bash call that prints everything subsequent calls need — Bash tool state does not persist across calls, so any value you need later must be echoed to stdout here:

```bash
echo "::group::[ci-review] Step 3.5: Ensure PR Branch is Checked Out"
date +%s   # remember this epoch for the phase-end call
gh pr view <PR#> --json headRefOid --jq '"PR_HEAD_SHA=" + .headRefOid'
echo "HEAD_SHA=$(git rev-parse HEAD)"
```

Review agents use `Read`, `Grep`, and `git blame` to examine the actual code — not just the diff. Decide the checkout action based on the SHAs:

- If `HEAD_SHA` matches `PR_HEAD_SHA` → already on the right commit, do nothing.
- Otherwise → run `gh pr checkout <PR#>`.
- If checkout fails → warn but continue. Pass a note to agents: "File access unavailable — review from diff only." This lets agents skip `Read`/`git blame` rather than wasting turns on failing tool calls.

Close Step 3.5 with a phase-end Bash call (required on every branch — already-on-commit, checkout-succeeded, and checkout-failed-but-continuing):

```bash
echo "[ci-review] Step 3.5 done elapsed=$(( $(date +%s) - <STEP3_5_START_EPOCH> ))s"
echo "::endgroup::"
```

### Step 4: Launch Review Agents

Multi-call timing variant. This is typically the longest phase — the elapsed value tells the user exactly how much time agent reasoning consumed. Emit the phase-start marker in a dedicated Bash call **before** launching agents:

```bash
echo "::group::[ci-review] Step 4: Launch Review Agents"
date +%s   # remember this epoch for the phase-end call
```

Select agents based on profile:

**Single agent** (when `--single`):
1. `ci-review:single-reviewer` — one comprehensive agent covering all domains

**Lean agents** (default, when `--lean` or no flag):
1. `ci-review:deep-reviewer`
2. `ci-review:guidelines-checker`
3. `ci-review:bug-detector`
4. `ci-review:security-reviewer`
5. `ci-review:silent-failure-hunter`
6. `ci-review:code-simplifier`

**Full and agent profile agents** (added when `--full` or `--agent`):
7. `ci-review:test-analyzer`
8. `ci-review:comment-analyzer`
9. `ci-review:type-analyzer`

Launch ALL selected agents **in parallel** using the Agent tool. If `--model` was specified, pass it as the `model` parameter on each Agent tool call to override the agent definition's default. Each agent receives the same prompt:

```
Review this pull request. Report findings in your defined output format:
## Findings
1. **[severity]** `file:line` — description + **Recommendation:**
If no issues found, output "No findings."

## PR Metadata
Title: {title}
Branch: {head} → {base}
Changed files: {count} ({additions}+ / {deletions}-)

## CLAUDE.md Rules
{CLAUDE_MD contents}

## Focus
{FOCUS text, or "No specific focus — review broadly."}

## Agent Context
{If --agent: "This PR was authored by an AI agent. Surface all valid findings including minor ones — the cost of fixing is negligible. Pay attention to AI-specific patterns: over-engineering, hallucinated API usage, unnecessary abstractions, verbose boilerplate, and cargo-culted patterns."}
{If not --agent: omit this section entirely}

## PR Diff
{PR_DIFF}
```

**Agent failure handling:** If an agent fails, times out, or returns unparseable output, log the failure and continue with findings from the remaining agents. Do not abort the review because one agent failed. Record the failure in the Step 8 summary (e.g., "Agents: 8 launched, 7 completed, 1 failed").

After all agents have returned (or been recorded as failed), emit the Step-4 phase-end marker (substitute the remembered epoch):

```bash
echo "[ci-review] Step 4 done elapsed=$(( $(date +%s) - <STEP4_START_EPOCH> ))s"
echo "::endgroup::"
```

Then proceed to Step 5 (Confidence Scoring).
### Step 5: Confidence Scoring

Multi-call timing variant. Emit the phase-start marker in a dedicated Bash call **before** launching scorers:

```bash
echo "::group::[ci-review] Step 5: Confidence Scoring"
date +%s   # remember this epoch for the phase-end call
```

Collect all findings from all agents into a single list. For each finding, record:
- The finding text (severity, file, line, message, recommendation)
- Which agent produced it

Launch **one `ci-review:confidence-scorer` agent per finding**, all in parallel. Haiku is cheap and fast — independent scoring per finding ensures no cross-contamination and survives partial failures.

Each scorer receives:
```
Score this review finding from 0-100 for confidence (how certain are you that this finding is factually correct?).
Check the diff to verify the finding is on a changed line, then read the actual code to verify it's real.
Confidence is about accuracy, not importance — a minor but real style issue should score high.

## Finding
Source agent: {agent-name}
{the finding text: severity, file, line, message, recommendation}

## PR Diff
{PR_DIFF}
```

Wait for all scorers to complete. Collect their scores.

**Scorer failure handling:** If a scorer fails or times out, default to confidence score 50 (uncertain). This drops the finding from the confidence filter, erring on the side of excluding unverifiable findings rather than including them.

**Confidence filter:** Remove all findings with confidence score below **65**. A score of 65 means "more likely real than not" — a reasonable bar that avoids discarding real findings that happen to be minor.

**Severity filter:** Remove findings whose severity is below the resolved `--min-severity` threshold (default: `medium`, or `low` when `--agent`). Severity order: critical > high > medium > low.

**Deduplicate:** Multiple agents often flag the same underlying issue. Before building the review, scan all surviving findings and merge duplicates:

1. **Exact match**: same file and same line → keep the finding with the higher confidence score
2. **Near match**: same file and lines within 5 of each other, describing the same root cause → keep the higher-scored one, note the other agent in the `Found by:` tag (e.g., `Found by: bug-detector, security-reviewer`)
3. **Semantic overlap**: different files or lines but describing the same conceptual issue (e.g., "missing null check on user input" flagged independently by bug-detector and security-reviewer at two call sites) → these are NOT duplicates — keep both, they're separate instances of the same pattern

**Existing comment dedup:** After within-run dedup, check each surviving finding against `EXISTING_COMMENTS` to skip findings already covered by prior comments on this PR. This prevents duplicate postings across multiple ci-review runs, and avoids piling on when humans or other bots already flagged the same issue.

For each surviving finding that has a `file` and `line`:
1. Search `EXISTING_COMMENTS.inline_comments` for any comment where (skip comments with `line: null`):
   - `path` matches the finding's file, AND
   - `line` is numeric and within ±5 of the finding's line, AND
   - At least one **content signal** matches (see below)
   - If all three conditions match → mark the finding as already-commented and exclude it
2. If no inline match found, search `EXISTING_COMMENTS.pr_comments` and `EXISTING_COMMENTS.review_bodies`:
   - The comment body contains the finding's file path, AND
   - At least one content signal matches

For findings without a `file` (body-only findings):
1. Search `EXISTING_COMMENTS.pr_comments` and `EXISTING_COMMENTS.review_bodies` for comments where:
   - The comment body mentions a **file path** related to the finding's context (or the finding's description references the same area), AND
   - A **key phrase** match exists (see below)
   - Both conditions are required — body-only matching without a location anchor is too loose and would suppress unrelated architectural findings

**Content signal matching** — to avoid false negatives from overly broad matches, require a **key phrase match** or **two or more** of the following signals (case-insensitive):
- **Severity tag**: the comment body contains the finding's severity in a tag-like context (e.g., `[high]`, `**[high]**`)
- **Type keyword**: the comment body contains the finding's type keyword (`bug`, `security`, `error-handling`, `quality`, `review`, `guidelines`, `test-coverage`, `comment-accuracy`, `type-design`)
- **Key phrases** (strongest signal): extract 2–3 significant noun phrases from the finding description (the core issue — e.g., "SQL injection", "null check", "race condition", "missing validation") and check if any appear in the comment body. A key phrase match alone is sufficient — it is specific enough to confirm the same issue.

A single generic signal (severity tag alone or type keyword alone) is NOT sufficient — common words like `high`, `bug`, or `review` appear in many unrelated comments and would suppress distinct findings near the same location.

**Matching policy:**
- Match generously — better to skip a potential duplicate than to re-post noise
- All existing comments are checked regardless of author (human reviewers, bots, previous ci-review runs)
- Resolution status is irrelevant — whether resolved or unresolved, the issue was already flagged
- String matching is case-insensitive

Track the count of findings excluded by this pass as `EXISTING_DEDUP_COUNT`.
After all scorers have returned and filtering/deduplication is complete, emit the Step-5 phase-end marker:

```bash
echo "[ci-review] Step 5 done elapsed=$(( $(date +%s) - <STEP5_START_EPOCH> ))s"
echo "::endgroup::"
```

Then proceed to Step 6 to construct the review payload.

### Step 6: Build Review Payload

Multi-call timing variant. Emit the phase-start marker in a dedicated Bash call before reading `references/REVIEW-POSTING.md` and deriving types:

```bash
echo "::group::[ci-review] Step 6: Build Review Payload"
date +%s   # remember this epoch for the phase-end call
```

**Read [references/REVIEW-POSTING.md](references/REVIEW-POSTING.md) now** for the detailed format specification.

**Derive `<type>` from the source agent.** The inline comment format uses `**[<severity>] <type>**`. Map the agent name to its type:

| Agent | Type |
|-------|------|
| guidelines-checker | guidelines |
| bug-detector | bug |
| security-reviewer | security |
| silent-failure-hunter | error-handling |
| code-simplifier | quality |
| deep-reviewer | review |
| single-reviewer | review |
| test-analyzer | test-coverage |
| comment-analyzer | comment-accuracy |
| type-analyzer | type-design |

You MUST execute the `Bash` tool to construct the payload file `${TMPDIR:-/tmp}/ci-review-payload-<PR#>.json`:

- **For clean runs with zero findings (findings == 0)**, substitute the actual values into `<PR#>`, `<N>` (files), `<M>` (lines), and `<profile>`, and execute this Bash command:
  ```bash
  cat << 'EOF' > "${TMPDIR:-/tmp}/ci-review-body-<PR#>.md"
  ## CI Review

  No actionable issues found. Reviewed <N> files across <M> changed lines.

  **Profile**: <profile>
  EOF

  cat << 'EOF' > "${TMPDIR:-/tmp}/ci-review-comments-<PR#>.json"
  []
  EOF

  jq -n \
    --rawfile body "${TMPDIR:-/tmp}/ci-review-body-<PR#>.md" \
    --slurpfile comments "${TMPDIR:-/tmp}/ci-review-comments-<PR#>.json" \
    '{body: $body, comments: ($comments[0] // [])}' \
    > "${TMPDIR:-/tmp}/ci-review-payload-<PR#>.json"

  echo "[ci-review] Step 6 done elapsed=$(( $(date +%s) - <STEP6_START_EPOCH> ))s"
  echo "::endgroup::"
  ```

- **For runs with surviving findings (findings > 0)**:
  1. **Determine inline eligibility**: Check if the finding's `file` appears in the PR diff and the `line` is in a changed hunk. If yes → inline comment. If no → body-only finding.
  2. **Build inline comment objects** in `${TMPDIR:-/tmp}/ci-review-comments-<PR#>.json` and review body in `${TMPDIR:-/tmp}/ci-review-body-<PR#>.md`, then encode with `jq`:
     ```bash
     cat << 'EOF' > "${TMPDIR:-/tmp}/ci-review-body-<PR#>.md"
     <REVIEW_BODY>
     EOF

     cat << 'EOF' > "${TMPDIR:-/tmp}/ci-review-comments-<PR#>.json"
     [ ...inline comments... ]
     EOF

     jq -n \
       --rawfile body "${TMPDIR:-/tmp}/ci-review-body-<PR#>.md" \
       --slurpfile comments "${TMPDIR:-/tmp}/ci-review-comments-<PR#>.json" \
       '{body: $body, comments: ($comments[0] // [])}' \
       > "${TMPDIR:-/tmp}/ci-review-payload-<PR#>.json"

     echo "[ci-review] Step 6 done elapsed=$(( $(date +%s) - <STEP6_START_EPOCH> ))s"
     echo "::endgroup::"
     ```

### Step 7: Post Review

Single-call timing variant. You MUST execute this Bash command on every run (including zero-findings runs) to submit the review to GitHub:

```bash
echo "::group::[ci-review] Step 7: Post Review"
START=$(date +%s)
sh "${CLAUDE_SKILL_DIR}/../../scripts/post-review.sh" <PR#> "${TMPDIR:-/tmp}/ci-review-payload-<PR#>.json"
STATUS=$?
echo "[ci-review] Step 7 done elapsed=$(( $(date +%s) - START ))s"
echo "::endgroup::"
exit $STATUS
```

The script outputs `Review posted: <URL>` on success (exit 0) or `POSTING FAILED: <reason>` to stderr (exit 1). Capture the review URL from the output for the Step 8 summary.

**Zero findings is NOT an exit, and posting must NEVER be skipped** — you must execute Step 7's Bash tool call before proceeding to Step 8.
### Step 8: Self-Check & Summary

No `::group::` wrapper for this step — the summary should be visible at the top level of the log. Still include the total elapsed time.

Before writing the final summary, verify that the review was posted by checking the URL returned from Step 7:
- The `Review:` line in the summary below MUST contain the real GitHub review URL returned by `post-review.sh` in Step 7 (`Review posted: https://github.com/...`).
- If you have not executed Step 7 yet, execute it now via Bash:
  ```bash
  sh "${CLAUDE_SKILL_DIR}/../../scripts/post-review.sh" <PR#> "${TMPDIR:-/tmp}/ci-review-payload-<PR#>.json"
  ```
- Never use a placeholder like `<URL>` or `None` — the review URL must be a live GitHub URL from a successful post.

Print the summary for the CI log:

```
CI Review complete for PR #N
Profile: single|lean|full|agent
Agents: N launched, N completed [, N failed]
Raw findings: N collected
After confidence scoring (≥65): N survived
After severity filter (≥{min-severity}): N survived
Already commented (skipped): N
Posted: N inline comments + review body
Review: <URL_FROM_POST_REVIEW_SH>
Phase timings (s): s0=<prereq> s1=<parse> s2=<eligibility> s3=<context> s3_5=<checkout> s4=<agents> s5=<scoring> s6=<payload> s7=<post> total=<sum>
```
The `Phase timings` line is the most load-bearing output for post-run analysis — list every step's elapsed seconds (using the values you tracked across the Timing Logs markers) plus a `total=` that is the sum of all phases. **Every Step must still be measured and reported when it runs** — even when no branching action occurs (e.g., Step 3.5 when HEAD_SHA already matches PR_HEAD_SHA and no checkout runs, the Step still executed `gh pr view` + `git rev-parse`, so its elapsed time should be recorded and reported). Because `date +%s` has 1-second granularity, legitimately fast steps (especially Step 1's no-op argument parse) may report `s<N>=0` — that is a valid measured value, not a "skipped" marker. A Step's elapsed should be omitted only when the Step was truly not entered (which for Steps 0–7 would indicate a prompt bug — they run on every invocation).

## Agent Output Format

All review agents output findings in this format (enforced by their agent definitions):

```
## Findings

1. **[severity]** `file/path.ts:line`
   Description of the issue.
   **Recommendation:** How to fix it.

2. **[severity]** `file/path.ts:line`
   ...
```

Parse each finding to extract: severity, file, line, message (description + recommendation + any extra fields like `**Rule:**` or `**Evidence:**`), source agent name.

If an agent outputs "No findings." — record zero findings from that agent.
