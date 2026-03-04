---
name: pr-validity
description: >-
  PR validity analysis: fetch PR diff, extract new code additions,
  search existing codebase for duplicate or overlapping implementations,
  classify changes, and create a structured GitHub issue.
allowed-tools: [Bash, Read, Grep, Glob, Task, AskUserQuestion]
---

# DLC: PR Validity Analysis

Detect duplicate or redundant code introduced by a PR. Read-only analysis — no code modifications.

Before running, **read [../dlc/references/ISSUE-TEMPLATE.md](../dlc/references/ISSUE-TEMPLATE.md) now** for the issue format, and **read [../dlc/references/REPORT-FORMAT.md](../dlc/references/REPORT-FORMAT.md) now** for the findings data structure.

## Step 1: Resolve Target PR

Determine the PR to check and fetch **all** data needed for subsequent steps in a single call:

```bash
# If PR number provided as argument
PR_JSON=$(gh pr view <PR_NUMBER> --json number,title,url,headRefName,state,additions,changedFiles,files,body)

# If no argument — detect from current branch
PR_JSON=$(gh pr view --json number,title,url,headRefName,state,additions,changedFiles,files,body)

# Fetch repo identifier (used in Step 6 for issue creation)
REPO=$(gh repo view --json nameWithOwner -q .nameWithOwner)

# Display PR summary
echo "$PR_JSON" | jq '{number, title, url, headRefName, state, additions, changedFiles}'
```

If no open PR is found, abort with: "No open PR found for the current branch. Push your changes and open a PR first."

### PR Description Quality Check

Extract `.body` from `PR_JSON` and evaluate against a minimal structure rubric:

| # | Missing Element | Severity | Type | Message |
|---|-----------------|----------|------|---------|
| 1 | PR body is empty or < 50 chars | **High** | `pr-description` | "PR has no meaningful description — reviewers need context" |
| 2 | No summary section heading — any markdown heading level (`#`–`######`) containing `Summary`, `What`, `Changes`, `Description`, `Overview`, `Context`, or `Motivation` (case-insensitive) | **Medium** | `pr-description` | "PR lacks a summary section — add a heading like `## Summary` or `## Description`" |
| 3 | No mention of testing — `test plan`, `tested`, `how to test`, `verify`, `verified`, `verification`, `steps to verify`, `manual test` (case-insensitive) | **Low** | `pr-description` | "PR description has no test plan or verification instructions" |

**Evaluation order**: Check #1 first. If the body is empty or under 50 chars, emit only the High finding and skip checks #2 and #3 (they are logically entailed and not independently actionable on an empty body). When the body is ≥ 50 chars, evaluate checks #2 and #3 and emit **all** that match (unlike spec-quality's precedence rule — each missing element is independently actionable).

For the required `file` field, use `PR#<number>` (same convention as spec-quality PR-level findings).

**Large PR gate**: If the PR has 500+ additions, use `AskUserQuestion` before proceeding:

- Present the addition count and file count (use `changedFiles` for the accurate total — `.files | length` caps at 100)
- Options: "Analyze everything" / "Only new files" / "Abort"
- If "Abort", stop and report: "PR validity analysis aborted by user."
- If "Only new files", limit Steps 2-3 to files with status `added` or `renamed` (skip `modified`)

## Step 2: Fetch Diff & Extract Additions

> **Note**: If the user selected "Only new files" in Step 1, restrict all diff parsing and construct extraction in this step to files where `status == "added"` or `status == "renamed"` (skip `status == "modified"`).

Retrieve the full diff and extract new code constructs:

```bash
# Get the full diff (raw text — cannot be combined with the JSON call)
gh pr diff <PR_NUMBER>

# Get per-file status from the cached PR_JSON (no extra API call)
echo "$PR_JSON" | jq '.files[] | {path: .path, status: .status, additions: .additions}'
```

Parse the diff for `+` lines (excluding `+++ b/` headers) and extract declarations:

| Construct | Detection Pattern |
|-----------|------------------|
| Functions | `function name(`, `const name = (`, `def name(`, `fn name(`, `func name(` |
| Classes | `class Name`, `struct Name`, `type Name struct` |
| Components | `export default function`, `export const Name`, React/Vue component patterns |
| Methods | Indented function declarations inside class/struct bodies |
| Constants/Exports | `export const`, `module.exports`, top-level `const`/`let`/`var` with assignments |

For each extracted construct, record:
- `name`: identifier name
- `file`: file path where it appears in the PR
- `line`: line number in the new file
- `kind`: function, class, component, method, constant
- `signature`: parameter list and return type (if available)
- `body_snippet`: first 5 lines of the body (for similarity matching)

**Edge case**: If no code additions are found (e.g., the PR only modifies docs, configs, or deletes code), create a single Info finding: "No new code constructs detected in PR diff — only non-code or deletion changes." Then skip to Step 7 (Report).

## Step 3: Codebase Search

For each extracted construct, search the existing codebase for matches. Exclude files that are part of the PR diff.

Before targeted searches, launch an Explore agent with the following structured prompt:

> Explore the codebase structure to identify where the following constructs
> might have existing implementations. For each construct, report:
> 1. Directories most likely to contain similar code
> 2. Any files with matching or similar names
> 3. Related test files that might reveal expected behavior
>
> Constructs to locate:
> (list each construct name and kind extracted from Step 2)
>
> Exclude these PR files from results:
> (list each file path from the PR diff)

Use repomix-explorer (if available) for large codebases. Use the Explore agent output to prioritize directories for Steps 3a–3d. Then use Grep and Read for the targeted searches below.

### 3a. Name-Based Search

Use `Grep` to find constructs with the same name:

```text
Grep: pattern="(function|const|class|def|fn|func|type)\s+{name}\b"
```

Exclude: `node_modules`, `dist`, `build`, `.git`, vendor directories, and the PR's own files.

### 3b. Signature Comparison

For each name match found in 3a:
1. Read the matched file around the match location (20 lines of context)
2. Compare parameter lists, return types, and overall structure
3. Score similarity: exact match, compatible (same params different order), or different

### 3c. Pattern-Based Search

Search for structural matches beyond exact names:

- Export names: `Grep` for the same export identifier
- Component structures: similar prop types, render patterns
- API endpoints: same route path or handler pattern

### 3d. Body-Based Search (Code Movement Detection)

For constructs where the PR also deletes code (file has both `+` and `-` lines):
1. Extract the body of the deleted construct
2. `Grep` for distinctive lines from the deleted body in the new location
3. If the new construct's body closely matches a deleted construct, classify as **Code Movement** (not duplication)

**Self-match guard**: When the deleted and added constructs are in the same file with overlapping line ranges, classify as **Update** (not Movement). Only flag Movement when code migrates between different files.

## Step 4: Check Issue Reference & Spec Quality

Check whether the PR references any GitHub issues:

```bash
# Extract PR body from the cached PR_JSON (no extra API call)
echo "$PR_JSON" | jq -r '.body'
```

Scan the PR body for GitHub issue references in any of these forms:
- `#N` (e.g., `#123`)
- `owner/repo#N` (e.g., `myorg/myrepo#456`)
- Full issue URLs (e.g., `https://github.com/owner/repo/issues/789`)

If **no issue references are found**, produce a finding:

| Severity | Type | Message |
|----------|------|---------|
| **Low** | `spec-quality` | "PR has no linked issue — no acceptance criteria to verify" |

Deduplicate the extracted issue references before fetching (a PR body may reference the same issue multiple times). Preserve both the `owner/repo` and the issue number from each matched reference. For each unique referenced issue:

```bash
# For plain #N references, default to the current repo ($REPO from Step 1)
gh issue view <ISSUE_NUMBER> --repo <OWNER/REPO> --json number,title,state,labels,body
```

If the reference is plain `#N`, use `$REPO` as the default `<OWNER/REPO>`.

Record the issue state (open/closed) and labels. This is informational only — produces Info-level findings if issues are referenced.

### Body Inspection (Spec Quality)

For each fetched issue, inspect the issue body for specification quality:

| Condition | Severity | Type | Message |
|-----------|----------|------|---------|
| Issue body contains `- [ ]` or `- [x]` checkboxes | **Info** | `spec-quality` | "Issue #N has checkbox acceptance criteria" |
| Issue body is empty or ≤ 100 chars with no checkboxes | **Low** | `spec-quality` | "Issue #N has a minimal body with no acceptance criteria" |
| Issue body > 100 chars but no `- [ ]` or `- [x]` checkboxes | **Low** | `spec-quality` | "Issue #N lacks checkbox acceptance criteria" |
| Issue body contains `TBD` or `NEEDS CLARIFICATION` (case-insensitive, anywhere in the body), or any heading ends with `?` | **Medium** | `spec-quality` | "Issue #N has unresolved questions" |

When multiple conditions match for a single issue, emit at most one `spec-quality` finding for that issue, choosing the highest-severity match using this precedence order: **Medium** > **Low** > **Info**.

Spec-quality findings are metadata-only signals and **must not** be counted toward the redundancy-focused issue-creation threshold in Step 6; only findings with `type: redundancy` are eligible to trigger a "{n} redundancies" issue.

### File Field for Spec-Quality Findings

Spec-quality findings describe PR or issue metadata rather than repository files. For the required `file` field, use these conventions:

- PR-level findings (e.g., no linked issue): `PR#<number>` (e.g., `PR#128`)
- Issue-level findings (e.g., missing acceptance criteria): `issue#<number>` (e.g., `issue#99`)

## Step 5: Classify & Build Findings

For each construct extracted in Step 2, assign a classification based on the search results from Step 3:

| Classification | Criteria | Severity |
|---|---|---|
| New | No match found in codebase | No finding |
| Duplicate | Name match + similar signature and body | **Medium** |
| Duplicate (divergent) | Name match, but different behavior or logic | **High** |
| Override | Replaces existing implementation in same file | No finding |
| Update | Modifies existing function (file was modified, not added) | No finding |
| Trivial Overlap | Name match only, completely different signature | **Info** |
| Code Movement | Body matches a deleted construct elsewhere | **Info** |

Classification findings from this step use `type: redundancy`.

**Severity mapping** (reinforced here for defense-in-depth):

| Classification | Severity | Rationale |
|---|---|---|
| Duplicate (divergent) | **High** | Two implementations of the same name with different behavior — bug risk |
| Duplicate | **Medium** | Redundant code that should be consolidated |
| Trivial Overlap | **Info** | Name collision, no functional overlap — awareness only |
| Code Movement | **Info** | Intentional refactoring detected — informational |

## Step 6: User-Gated Issue Creation

**Threshold**: Create an issue only if there is any `high` `redundancy` finding OR 3+ `medium` `redundancy` findings. Findings with `type: spec-quality` or `type: pr-description` are excluded from this threshold.

If the threshold is not met, skip issue creation and proceed to Step 7.

If the threshold is met, use `AskUserQuestion`:

- Present the finding counts by severity
- Options: "Yes, create issue" / "No, skip" / "Show details first"
- If "Show details first", display each finding with file, line, classification, and matched location, then re-ask with the first two options
- If "No, skip", proceed to Step 7 without creating an issue

**If the user approves issue creation**, proceed:

**Read [../dlc/references/ISSUE-TEMPLATE.md](../dlc/references/ISSUE-TEMPLATE.md) now** and format the issue body exactly as specified.

**Critical format rules** (reinforced here):
- Title: `[DLC] PR Validity: {n} redundancies in PR #{number}`
- Label: `dlc-pr-validity`
- Body must contain: Scan Metadata table, Findings Summary table, Findings Detail grouped by severity, Recommended Actions
- In the Scan Metadata table, set **Project Type** to `PR analysis` (this skill is PR-focused and does not detect codebase project types)

**Additional section** — add after Findings Detail:

```markdown
## Change Classification Summary

| Classification | Count | Files |
|---------------|-------|-------|
| New | {n} | {comma-separated file list} |
| Duplicate | {n} | {comma-separated file list} |
| Duplicate (divergent) | {n} | {comma-separated file list} |
| Override | {n} | {comma-separated file list} |
| Update | {n} | {comma-separated file list} |
| Trivial Overlap | {n} | {comma-separated file list} |
| Code Movement | {n} | {comma-separated file list} |
| **Total Constructs** | **{n}** | |

## Referenced Issues

| Issue | Title | State |
|-------|-------|-------|
| #{n} | {title} | {open/closed} |

> Omit this section if no issues were referenced in the PR body.
```

**Raw Output**: This skill has no CLI tool output to capture. Omit the Raw Output section from the issue body.

```bash
# $REPO was fetched in Step 1
TIMESTAMP=$(date +%s)
BODY_FILE="/tmp/dlc-issue-${TIMESTAMP}.md"

gh issue create \
  --repo "$REPO" \
  --title "[DLC] PR Validity: {n} redundancies in PR #{number}" \
  --body-file "$BODY_FILE" \
  --label "dlc-pr-validity"
```

If issue creation fails, save draft to `/tmp/dlc-draft-${TIMESTAMP}.md` and print the path.

**If the user declines**, skip issue creation and proceed to Step 7.

## Step 7: Report

Print a summary:

```text
PR validity analysis complete.
  - PR: #{number} ({title})
  - Constructs analyzed: {n}
  - Classifications: {n} new, {n} duplicate, {n} divergent, {n} override, {n} update, {n} trivial overlap, {n} code movement
  - Findings: {n} high, {n} medium, {n} low, {n} info
  - PR description: {n} findings ({n} high, {n} medium, {n} low)  [only if pr-description findings exist]
  - Issue: #{number} ({url})  [only if created]
  - Referenced issues: #{n1} (open), #{n2} (closed)  [only if found in Step 4]
```
