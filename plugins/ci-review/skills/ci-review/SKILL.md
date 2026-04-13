---
name: ci-review
description: >-
  CI-optimized code review: multi-agent parallel review with confidence scoring
  and atomic GitHub PR review posting. Runs 5 (lean) or 8 (full) specialized
  review agents, scores findings for confidence, filters false positives, and
  submits a single atomic GitHub PR review with inline comments via gh api.
  Use when reviewing PRs in CI pipelines, GitHub Actions workflows, or locally.
  Triggers: /ci-review, review PR, CI code review, automated PR review.
  Use: /ci-review <PR#> [focus text] [--full|--lean]
user-invocable: true
allowed-tools: [Bash, Read, Grep, Glob, Agent, AskUserQuestion]
argument-hint: "<PR#> [focus text] [--full|--lean]"
---

# CI Review

Multi-agent code review for pull requests. Posts findings as an atomic GitHub PR review with inline comments.

Before running, **read [references/REVIEW-POSTING.md](references/REVIEW-POSTING.md) now** for the review posting format and error handling chain.

## Profiles

| Profile | Agents | Use When |
|---------|--------|----------|
| **lean** (default) | code-reviewer, bug-detector, security-reviewer, silent-failure-hunter, code-simplifier | Every PR — fast, cost-effective |
| **full** | All lean agents + test-analyzer, comment-analyzer, type-analyzer | Critical PRs, large changes, pre-release |

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
- **PR identifier** (required): a number (e.g., `123`) or GitHub URL. If a URL, extract the PR number.
- **Focus text** (optional): free text describing what to focus the review on (e.g., "auth flow", "error handling")
- **Profile flag** (optional): `--full` or `--lean`. Default: `--lean`

If no PR number is provided, abort with: "Usage: /ci-review <PR#> [focus text] [--full|--lean]"

### Step 2: Eligibility Check

Run via Bash:
```bash
gh pr view <PR#> --json state,isDraft,number,title,url
```

- If PR state is not `OPEN`, abort: "PR #N is {state}. Only open PRs can be reviewed."
- If PR `isDraft` is true, abort: "PR #N is a draft. Publish it first or use --full to review anyway."
  - Exception: if `--full` is passed, allow draft review.

Print: "Reviewing PR #N: {title} ({url}) — profile: {lean|full}"

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
Search for CLAUDE.md files in the repo root and in directories containing changed files:
```bash
# Root CLAUDE.md
cat CLAUDE.md 2>/dev/null || true

# Directory-specific CLAUDE.md files — check parent dirs of changed files
```
Use `Glob` to find `**/CLAUDE.md` and `Read` to load ones relevant to the changed files.

Compile the context bundle:
- `PR_DIFF`: the full diff text
- `PR_META`: title, body, branch names, file list, stats
- `CLAUDE_MD`: concatenated CLAUDE.md contents (or "No CLAUDE.md found")
- `FOCUS`: the focus text (or empty)

**Large diffs:** If the diff exceeds 10,000 lines, warn: "Large diff ({N} lines) — review quality may degrade for files not near the top of the diff." Do not truncate — let agents handle context naturally. They can always `Read` individual files for deeper investigation.

### Step 3.5: Ensure PR Branch is Checked Out

Review agents use `Read`, `Grep`, and `git blame` to examine the actual code — not just the diff. Verify the correct branch is active:

```bash
# Check current branch vs PR head branch
CURRENT=$(git branch --show-current)
PR_HEAD=$(gh pr view <PR#> --json headRefName --jq '.headRefName')
```

- If already on the PR branch (or in CI where `actions/checkout` already checked it out) → do nothing.
- If on a different branch → run `gh pr checkout <PR#>`.
- If checkout fails → warn but continue. Agents can still review the diff, they just cannot read files for additional context.

### Step 4: Launch Review Agents (Parallel)

Select agents based on profile:

**Lean agents** (always launched):
1. `ci-review:code-reviewer`
2. `ci-review:bug-detector`
3. `ci-review:security-reviewer`
4. `ci-review:silent-failure-hunter`
5. `ci-review:code-simplifier`

**Full-only agents** (added when `--full`):
6. `ci-review:test-analyzer`
7. `ci-review:comment-analyzer`
8. `ci-review:type-analyzer`

Launch ALL selected agents **in parallel** using the Agent tool. Each agent receives the same prompt:

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

## PR Diff
{PR_DIFF}
```

Wait for all agents to complete. Collect their outputs.

### Step 5: Confidence Scoring

Collect all findings from all agents into a single list. For each finding, record:
- The finding text (severity, file, line, message, recommendation)
- Which agent produced it

Launch **one `ci-review:confidence-scorer` agent per finding**, all in parallel. Haiku is cheap and fast — independent scoring per finding ensures no cross-contamination and survives partial failures.

Each scorer receives:
```
Score this review finding from 0-100 for confidence.
Check the diff to verify the finding is on a changed line, then read the actual code to verify it's real.

## Finding
Source agent: {agent-name}
{the finding text: severity, file, line, message, recommendation}

## PR Diff
{PR_DIFF}
```

Wait for all scorers to complete. Collect their scores.

**Filter:** Remove all findings with confidence score below **80**.

**Deduplicate:** Multiple agents often flag the same underlying issue. Before building the review, scan all surviving findings and merge duplicates:

1. **Exact match**: same file and same line → keep the finding with the higher confidence score
2. **Near match**: same file and lines within 5 of each other, describing the same root cause → keep the higher-scored one, note the other agent in the `Found by:` tag (e.g., `Found by: bug-detector, security-reviewer`)
3. **Semantic overlap**: different files or lines but describing the same conceptual issue (e.g., "missing null check on user input" flagged independently by bug-detector and security-reviewer at two call sites) → these are NOT duplicates — keep both, they're separate instances of the same pattern

**If no findings survive filtering:** Skip to Step 7 and post a "no issues found" review.

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
1. If `gh api` fails due to invalid inline comments → remove invalid comments, rebuild payload, retry
2. If still failing → drop all inline comments, move all findings to review body, retry
3. If review API fails entirely (403/401) → fall back to `gh pr comment <PR#> --body "$BODY"`
4. If everything fails → print the review body to stdout so the user can post manually

Print the review URL on success.

### Step 8: Summary

Print a brief summary for the CI log:

```
CI Review complete for PR #N
Profile: lean|full
Agents: N launched, N completed
Raw findings: N collected
After scoring (≥80): N survived
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
