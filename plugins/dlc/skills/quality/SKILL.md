---
name: quality
description: >-
  Code quality check: linting, complexity analysis, duplication detection,
  and dead code identification. Detects project linting config, runs
  appropriate tools, and creates a structured GitHub issue.
allowed-tools: [Bash, Read, Grep, Glob]
---

# DLC: Code Quality Check

Run code quality analysis against the current project and create a GitHub issue with findings.

Before running, **read [../dlc/references/ISSUE-TEMPLATE.md](../dlc/references/ISSUE-TEMPLATE.md) now** for the issue format, and **read [../dlc/references/REPORT-FORMAT.md](../dlc/references/REPORT-FORMAT.md) now** for the findings data structure.

## Step 1: Detect Linting Config

Scan for linting configuration and project type:

| Config File | Linter | Language |
|-------------|--------|----------|
| `.eslintrc*` / `eslint.config.*` / `biome.json` | ESLint / Biome | JS/TS |
| `ruff.toml` / `pyproject.toml` (with `[tool.ruff]`) | Ruff | Python |
| `.golangci.yml` / `.golangci.yaml` | golangci-lint | Go |
| `clippy.toml` / `Cargo.toml` | Clippy | Rust |
| `.rubocop.yml` | RuboCop | Ruby |

Also check for formatter configs: `.prettierrc*`, `.editorconfig`, `rustfmt.toml`.

## Step 2: Run Quality Tools

### Linting

Run the detected linter with JSON/machine-readable output:

Select the tool based on availability (`command -v`), not exit codes — linters exit non-zero when issues are found, which is a valid result to capture.

```bash
# JS/TS — select by availability
if command -v eslint >/dev/null 2>&1; then
  eslint . --format=json 2>/dev/null
elif command -v biome >/dev/null 2>&1; then
  biome check . --reporter=json 2>/dev/null
fi

# Python — prefer Ruff, fall back to flake8
if command -v ruff >/dev/null 2>&1; then
  ruff check . --output-format=json 2>/dev/null
elif command -v flake8 >/dev/null 2>&1; then
  flake8 . --format=json 2>/dev/null
fi

# Go
command -v golangci-lint >/dev/null 2>&1 && golangci-lint run --out-format=json 2>/dev/null

# Rust
command -v cargo-clippy >/dev/null 2>&1 && cargo clippy --message-format=json 2>/dev/null
```

### Complexity Analysis

```bash
# JS/TS — eslint complexity rule or cr tool
eslint . --rule '{"complexity": ["warn", 10]}' --format=json 2>/dev/null

# Python
radon cc . --json --min=C 2>/dev/null

# General — if no tool available, use Claude analysis
# Look for functions > 50 lines, cyclomatic complexity > 10, deep nesting > 4 levels
```

### Duplication Detection

```bash
# JS/TS
jscpd . --reporters=json 2>/dev/null

# General
# If no tool available, Claude analysis: search for repeated code blocks > 10 lines
```

### Dead Code Detection

```bash
# JS/TS — select by availability
if command -v knip >/dev/null 2>&1; then
  knip --reporter=json 2>/dev/null
elif command -v ts-prune >/dev/null 2>&1; then
  ts-prune 2>/dev/null
fi

# Python
command -v vulture >/dev/null 2>&1 && vulture . 2>/dev/null
```

If **no tools are available**, fall back to Claude analysis:
- Review for unused imports, exports, and functions
- Check for unreachable code paths
- Identify overly complex functions (nesting depth, parameter count)

## Step 3: Classify Findings

Map tool output to the findings format from REPORT-FORMAT.md.

**Severity mapping** (reinforced here for defense-in-depth):

| Finding Type | Severity |
|-------------|----------|
| Error-level lint violation | **High** |
| Cyclomatic complexity > 20 | **High** |
| Warning-level lint violation | **Medium** |
| Cyclomatic complexity 10-20 | **Medium** |
| Duplication > 50 lines | **Medium** |
| Dead code / unused exports | **Low** |
| Style/formatting issues | **Info** |

## Step 4: Create GitHub Issue

**Read [../dlc/references/ISSUE-TEMPLATE.md](../dlc/references/ISSUE-TEMPLATE.md) now** and format the issue body exactly as specified.

**Critical format rules** (reinforced here):
- Title: `[DLC] Quality: {summary of top finding}`
- Label: `dlc-quality`
- Body must contain: Scan Metadata table, Findings Summary table (severity x count), Findings Detail grouped by severity, Recommended Actions, Raw Output in collapsed details

```bash
REPO=$(gh repo view --json nameWithOwner -q .nameWithOwner)
BRANCH=$(git branch --show-current)
TIMESTAMP=$(date +%s)
BODY_FILE="/tmp/dlc-issue-${TIMESTAMP}.md"

gh issue create \
  --repo "$REPO" \
  --title "[DLC] Quality: {summary}" \
  --body-file "$BODY_FILE" \
  --label "dlc-quality"
```

If issue creation fails, save draft to `/tmp/dlc-draft-${TIMESTAMP}.md` and print the path.

## Step 5: Report

```
Quality check complete.
  - Linter: {detected linter}
  - Tools used: {list}
  - Findings: {high} high, {medium} medium, {low} low
  - Issue: #{number} ({url})
```

If no findings, skip issue creation and report: "No quality issues found."
