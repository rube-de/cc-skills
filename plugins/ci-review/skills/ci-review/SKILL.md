---
name: ci-review
description: >-
  CI-optimized code review: multi-agent parallel review with confidence scoring
  and atomic GitHub PR review posting. Runs 6 (lean) or 9 (full) specialized
  review agents including one unconstrained deep-reviewer, scores findings for confidence, filters false positives, and
  submits a single atomic GitHub PR review with inline comments via gh api.
  Supports --single for cost-effective single-agent reviews with confidence scoring,
  --agent profile for AI-authored PRs (surfaces more findings since
  fixes are cheap). Use --min-severity to control finding threshold.
  Use when reviewing PRs in CI pipelines, GitHub Actions workflows, or locally.
  Triggers: /ci-review, review PR, CI code review, automated PR review.
  Use --model to override the reviewer model (e.g., --model opus for deeper analysis).
  Use: /ci-review <PR#> [focus text] [--full|--lean|--single] [--agent] [--model sonnet|opus] [--min-severity <level>]
user-invocable: true
allowed-tools: [Bash, Read, Grep, Glob, Agent, AskUserQuestion]
argument-hint: "<PR#> [focus text] [--full|--lean|--single] [--agent] [--model sonnet|opus] [--min-severity low|medium|high|critical]"
---

# CI Review

Multi-agent code review for pull requests. Posts findings as an atomic GitHub PR review with inline comments.

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
| `medium` | medium + high + critical | — |
| `high` | high + critical | — |
| `critical` | critical only | — |

If not specified, `--min-severity` defaults to `low` (show all real findings). The severity filter is applied AFTER confidence scoring — it removes real but low-priority findings, not false positives.

## Review Posting Rules (Inlined for Reliability)

These rules are critical. They are also detailed in REVIEW-POSTING.md but inlined here as defense-in-depth:

- **Always use event `"COMMENT"`** — never `"APPROVE"` or `"REQUEST_CHANGES"`
- Build ONE `gh api` call that creates the review with all inline comments at once
- `line` is the line number on the new version of the file. Always use `side=RIGHT`
- Only post **actionable** inline comments — no confirmations, no "looks good"
- Do not repeat correctly addressed items
- If no inline comments, omit the comments array and just post the body

## Workflow

### Step 0: Prerequisites

Verify `gh` CLI is available and authenticated:
```bash
gh auth status
```

If `gh` is not found, abort with: "gh CLI is required. Install: https://cli.github.com/"
If not authenticated, abort with: "gh is not authenticated. Run: gh auth login"

### Step 1: Parse Arguments

Extract from the argument string:
- **PR identifier** (required): a number (e.g., `123`) or GitHub URL. If a URL, extract the PR number and store as `PR_NUMBER`. If the URL points to a different repository than the current one, abort with: "Cross-repo URLs are not supported. Run this skill from the target repo, or pass just the PR number."
- **Focus text** (optional): free text describing what to focus the review on (e.g., "auth flow", "error handling")
- **Profile flag** (optional): `--single`, `--lean`, `--full`, or `--agent`. Default: `--lean`. `--agent` implies `--full` agent set. `--single` uses one comprehensive agent instead of the specialist fan-out.
- **Model override** (optional): `--model sonnet|opus`. Default: use each agent's built-in model (Sonnet for reviewers, Haiku for scorers). When set, overrides the model for review agents only — confidence scorers always use Haiku.
- **Severity filter** (optional): `--min-severity low|medium|high|critical`. Default: `low`.

If no PR number is provided, abort with: "Usage: /ci-review <PR#> [focus text] [--full|--lean|--single] [--agent] [--model sonnet|opus] [--min-severity <level>]"

### Step 2: Eligibility Check

Run via Bash:
```bash
gh pr view <PR#> --json state,number,title,url
```

- If PR state is not `OPEN`, abort: "PR #N is {state}. Only open PRs can be reviewed."

Print: "Reviewing PR #N: {title} ({url}) — profile: {lean|full|agent}"

### Step 3: Gather Context (Parallel)

Launch these three operations in parallel via Bash:

**3a. Fetch PR diff:**
```bash
gh pr diff <PR#>
```

**3b. Fetch PR metadata:**
```bash
gh pr view <PR#> --json title,body,headRefName,baseRefName,files,additions,deletions,changedFiles
```

**3c. Discover CLAUDE.md files:**
Search for CLAUDE.md files in the repo root and in directories containing changed files. Use `Glob` to find `**/CLAUDE.md` and `Read` to load the root CLAUDE.md and any others relevant to the changed files.

Compile the context bundle:
- `PR_DIFF`: the full diff text
- `PR_META`: title, body, branch names, file list, stats
- `CLAUDE_MD`: concatenated CLAUDE.md contents (or "No CLAUDE.md found")
- `FOCUS`: the focus text (or empty)

**Large diffs:** If the diff exceeds 10,000 lines, warn: "Large diff ({N} lines) — review quality may degrade for files not near the top of the diff." Do not truncate — let agents handle context naturally. They can always `Read` individual files for deeper investigation.

### Step 3.5: Ensure PR Branch is Checked Out

Review agents use `Read`, `Grep`, and `git blame` to examine the actual code — not just the diff. Verify the correct branch is active:

```bash
# Check current branch or commit vs PR head
CURRENT=$(git branch --show-current 2>/dev/null || true)
PR_HEAD=$(gh pr view <PR#> --json headRefName --jq '.headRefName')
PR_HEAD_SHA=$(gh pr view <PR#> --json headRefOid --jq '.headRefOid')
HEAD_SHA=$(git rev-parse HEAD)
```

- If `CURRENT` matches `PR_HEAD`, or `HEAD_SHA` matches `PR_HEAD_SHA` (detached HEAD in CI) → already on the right code, do nothing.
- Otherwise → run `gh pr checkout <PR#>`.
- If checkout fails → warn but continue. Pass a note to agents: "File access unavailable — review from diff only." This lets agents skip `Read`/`git blame` rather than wasting turns on failing tool calls.

### Step 4: Launch Review Agents

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

### Step 5: Confidence Scoring

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

**Severity filter:** If `--min-severity` was specified, remove findings whose severity is below the threshold. Severity order: critical > high > medium > low.

**Deduplicate:** Multiple agents often flag the same underlying issue. Before building the review, scan all surviving findings and merge duplicates:

1. **Exact match**: same file and same line → keep the finding with the higher confidence score
2. **Near match**: same file and lines within 5 of each other, describing the same root cause → keep the higher-scored one, note the other agent in the `Found by:` tag (e.g., `Found by: bug-detector, security-reviewer`)
3. **Semantic overlap**: different files or lines but describing the same conceptual issue (e.g., "missing null check on user input" flagged independently by bug-detector and security-reviewer at two call sites) → these are NOT duplicates — keep both, they're separate instances of the same pattern

**If no findings survive filtering:** Build a no-findings review body using the template from REVIEW-POSTING.md section 3 ("No Findings"), then skip to Step 7 to post it.

### Step 6: Build Review Payload

**Read [references/REVIEW-POSTING.md](references/REVIEW-POSTING.md) now** for the detailed format specification.

For each surviving finding:

1. **Determine if it's inline-eligible**: Check if the finding's `file` appears in the PR diff and the `line` is in a changed hunk. If yes → inline comment. If no → body-only finding.

2. **Build inline comment object**:
   ```json
   {
     "path": "<file>",
     "line": <line_number>,
     "side": "RIGHT",
     "body": "**[<severity>] <type>**\n\n<description>\n\n**Recommendation:** <recommendation>\n\n`Found by: <agent-name>`"
   }
   ```

3. **Build review body**:
   - Summary with profile, finding counts by severity
   - If focus text was provided, mention it
   - List any body-only findings (not in diff) under "### Findings Not in Diff"

### Step 7: Post Review

Resolve the repository owner and repo:
```bash
OWNER_REPO=$(gh repo view --json nameWithOwner --jq '.nameWithOwner')
OWNER="${OWNER_REPO%%/*}"
REPO="${OWNER_REPO#*/}"
```

Build the JSON payload using `jq` and post via `gh api`:

```bash
PAYLOAD=$(jq -n \
  --arg event "COMMENT" \
  --arg body "$REVIEW_BODY" \
  --argjson comments "$COMMENTS_JSON" \
  '{event: $event, body: $body, comments: $comments}')

REVIEW_URL=$(echo "$PAYLOAD" | gh api \
  "repos/${OWNER}/${REPO}/pulls/${PR_NUMBER}/reviews" \
  --method POST \
  --input - \
  --jq '.html_url')
```

**If no inline comments**, omit the comments array:
```bash
PAYLOAD=$(jq -n \
  --arg event "COMMENT" \
  --arg body "$REVIEW_BODY" \
  '{event: $event, body: $body}')
```

**Error handling chain** (follow in order):
1. If `gh api` fails due to invalid inline comments → remove the invalid comment, rebuild payload, retry (up to 3 times)
2. If still failing → drop all inline comments, move all findings to review body, retry
3. If review API fails entirely (403/401) → fall back to `gh pr comment <PR#> --body "$BODY"`
4. If everything fails → print the review body to stdout so the user can post manually

Print the review URL on success.

### Step 8: Summary

Print a brief summary for the CI log:

```
CI Review complete for PR #N
Profile: single|lean|full|agent
Agents: N launched, N completed [, N failed]
Raw findings: N collected
After confidence scoring (≥65): N survived
After severity filter (≥{min-severity}): N survived
Posted: N inline comments + review body
Review: <URL>
```

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

Parse each finding to extract: severity, file, line, message (description + recommendation), source agent name.

If an agent outputs "No findings." — record zero findings from that agent.
