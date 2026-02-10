---
name: jules-review
description: >-
  Review Jules (Google AI agent) pull requests using AI council.
  Supports -quick flag for lightweight reviews via parallel triage.
argument-hint: "[-quick] [PR#]"
allowed-tools: [Bash, Read, Grep, Glob, Skill]
user-invocable: true
context: fork
agent: general-purpose
metadata:
  author: rube-de
  version: "1.0.0"
---

# Review Jules PRs

Review Jules (Google's AI coding agent) pull requests with council-powered multi-model review. Posts structured GitHub PR reviews with inline line comments tagging `@jules`.

Before posting any review (Step 6), read [references/WORKFLOW.md](references/WORKFLOW.md) for the exact review format, `@jules` tag placement, inline comment structure, and error handling. Do not guess at the format.

## Triggers

- `/jules-review` — review the current branch's PR
- `/jules-review -quick` — quick review via parallel triage
- `/jules-review 42` — review PR #42
- `/jules-review -quick 123` — quick review of PR #123

## Step 1: Parse Arguments

Extract from the user's input:

- **`-quick` flag** (boolean): If present, force quick mode (parallel triage)
- **PR number** (optional integer): If present, use as target PR

```
Input: "-quick 42"  → quick=true,  pr=42
Input: "42"         → quick=false, pr=42
Input: "-quick"     → quick=true,  pr=null
Input: ""           → quick=false, pr=null
```

## Step 2: Resolve PR

If a PR number was provided, fetch it directly. Otherwise, detect from the current branch.

```bash
# If PR number provided:
gh pr view <PR#> --json number,title,body,author,headRefName,additions,deletions,changedFiles,url

# If no PR number — detect from current branch:
gh pr view --json number,title,body,author,headRefName,additions,deletions,changedFiles,url
```

If no PR is found, abort with a clear error message.

### Jules Detection

Check if this is a Jules PR (informational — does not change behavior):

```bash
# Check author login
AUTHOR=$(gh pr view <PR#> --json author --jq '.author.login')
# Jules PRs typically come from "jules-google" or similar bot accounts
# Also check branch name for "jules/" prefix
BRANCH=$(gh pr view <PR#> --json headRefName --jq '.headRefName')
```

If the PR appears to be from Jules, note it in output:
> "Detected Jules PR (author: jules-google, branch: jules/fix-auth-bug)"

If not from Jules, proceed anyway — the review workflow is useful for any PR.

## Step 3: Gather Diff

```bash
# Get the full diff
gh pr diff <PR#>

# Count changed lines
ADDITIONS=$(gh pr view <PR#> --json additions --jq '.additions')
DELETIONS=$(gh pr view <PR#> --json deletions --jq '.deletions')
TOTAL_LINES=$((ADDITIONS + DELETIONS))
```

## Step 4: Select Review Mode

Decision logic:

| Condition | Mode | Action |
|-----------|------|--------|
| `-quick` flag set | Quick | Invoke `/council quick` |
| Total changed lines ≤ 100 | Auto-quick | Notify user: "Small PR (≤100 lines) — using quick review." Then invoke `/council quick` |
| Total changed lines > 100 | Full | Invoke `/council review` |

Inform the user which mode was selected and why before proceeding.

## Step 5: Invoke Council

Prepare the PR context for the council skill:

```
PR #<number>: <title>
Author: <author>
Branch: <branch>
Changed files: <count>
Lines changed: +<additions> / -<deletions>

PR Description:
<body>

Diff:
<diff output from gh pr diff>
```

### Quick Mode

Invoke the council skill with the quick workflow:

```
/council quick

Review this pull request for issues:

<PR context from above>
```

### Full Mode

Invoke the council skill with the review workflow:

```
/council review

Review this pull request:

<PR context from above>
```

Wait for the council to complete and collect its output (findings, verdict, summary).

## Step 6: Post GitHub PR Review

After the council returns its findings, post them as a proper GitHub PR review.

**Read [references/WORKFLOW.md](references/WORKFLOW.md) now** and follow its posting format exactly. Do not invent your own format.

WORKFLOW.md covers:

- Parsing council findings into structured data
- Mapping verdict severity to GitHub review events (APPROVE, COMMENT, REQUEST_CHANGES)
- Filtering findings into inline comments (within diff) vs review body (outside diff)
- Building the review body with `@jules` tag
- Posting via `gh api` with inline comments
- Fallback to `gh pr comment` on permission failure

**Critical format rules** (specified in WORKFLOW.md — repeated here for emphasis):

- Review body first line must be `` `@jules` `` (backtick-wrapped, standalone line)
- Inline comment format: ``**[<severity>] <type>** `@jules` ``
- Review header: `## Council Review — <VERDICT>`

## Step 7: Present Results

Return the council output verbatim to the user. After the council output, append a brief postscript with review metadata:

```
---
Review posted to PR #<number> (<review URL>) | Mode: <quick|full> | Verdict: <APPROVE|COMMENT|REQUEST_CHANGES>
```

If the review was posted via fallback (`gh pr comment`), note:
> "Posted as PR comment (review API unavailable). Inline comments not supported in fallback mode."
