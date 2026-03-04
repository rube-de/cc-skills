---
name: test
description: >-
  Test coverage analysis: detect test framework, run test suite,
  capture failures and coverage metrics, identify coverage gaps
  in recent changes, and create a structured GitHub issue.
allowed-tools: [Bash, Read, Grep, Glob]
---

# DLC: Test Coverage Analysis

Run the test suite, measure coverage, and create a GitHub issue for failures and coverage gaps.

Before running, **read [../dlc/references/ISSUE-TEMPLATE.md](../dlc/references/ISSUE-TEMPLATE.md) now** for the issue format, and **read [../dlc/references/REPORT-FORMAT.md](../dlc/references/REPORT-FORMAT.md) now** for the findings data structure.

## Step 1: Detect Test Framework

Scan for test configuration:

| Config / Pattern | Framework | Coverage Tool |
|-----------------|-----------|---------------|
| `vitest.config.*` / `vite.config.*` (with test) | Vitest | `@vitest/coverage-v8` |
| `jest.config.*` / `package.json` (with jest) | Jest | Built-in (`--coverage`) |
| `pytest.ini` / `pyproject.toml` (with pytest) / `conftest.py` | pytest | `pytest-cov` |
| `Cargo.toml` + `tests/` dir | cargo test | `cargo-tarpaulin` or `cargo-llvm-cov` |
| `go.mod` + `*_test.go` files | go test | Built-in (`-cover`) |
| `.rspec` / `Gemfile` (with rspec) | RSpec | `simplecov` |

Also detect test runner scripts in `package.json` or the project's task runner.

## Step 2: Run Test Suite with Coverage

Execute tests with coverage enabled:

Select the tool based on availability (`command -v`) and detected framework, not exit codes — test runners exit non-zero when tests fail, which is a valid result to capture.

```bash
# Node.js (Vitest) — if vitest config detected
npx vitest run --coverage --reporter=json 2>/dev/null

# Node.js (Jest) — if jest config detected
npx jest --coverage --json 2>/dev/null

# Python
command -v pytest >/dev/null 2>&1 && pytest --cov=. --cov-report=json --tb=short 2>/dev/null

# Rust — select coverage tool by availability
if command -v cargo-tarpaulin >/dev/null 2>&1; then
  cargo tarpaulin --out json 2>/dev/null
elif command -v cargo-llvm-cov >/dev/null 2>&1; then
  cargo llvm-cov --json 2>/dev/null
fi

# Go
go test -cover -coverprofile=coverage.out -json ./... 2>/dev/null

# Custom test script — select runner by availability
if command -v bun >/dev/null 2>&1; then
  bun test 2>/dev/null
elif command -v npm >/dev/null 2>&1; then
  npm test 2>/dev/null
fi
```

Capture both:
- **Test results**: pass/fail status per test, failure messages
- **Coverage metrics**: line coverage %, branch coverage %, per-file breakdown

## Step 3: Identify Coverage Gaps in Recent Changes

Focus on files changed recently (not just overall coverage):

```bash
# Files changed in last 5 commits
git diff --name-only HEAD~5..HEAD -- '*.ts' '*.js' '*.py' '*.go' '*.rs'

# Files changed vs main branch
git diff --name-only origin/main...HEAD
```

For each changed file:
1. Check if a corresponding test file exists
2. Check coverage percentage for that specific file
3. Flag files with < 80% coverage (or project-configured threshold)
4. Flag changed files with **zero** test coverage

### TDD Commit Order Check

For each (source file, test file) pair identified above, check whether the test was written *before* the source — a signal of TDD discipline:

```bash
# Get the commit hash and timestamp where the file was first added on this branch
git log origin/main..HEAD --format="%H %ct" --diff-filter=A -- <source-file> | tail -1
git log origin/main..HEAD --format="%H %ct" --diff-filter=A -- <test-file>   | tail -1
```

**Scope**: Only check files **added on the current branch** (the `origin/main..HEAD` range above). Files that already exist in `main` are excluded — the TDD order signal is only meaningful for new files introduced in this branch. Reuse the same file list from `git diff --name-only origin/main...HEAD`.

For each pair, first compare **commit hashes**, then timestamps:

| Condition | Action |
|-----------|--------|
| Either file has no `--diff-filter=A` output (shallow clone, renamed/moved file, or file not added on this branch) | Skip pair — log a note to stdout (not a finding): "Skipping TDD order check for `{file}`: insufficient git history" |
| Both files share the same add-commit hash | Skip pair — no finding (added atomically) |
| Source add-commit timestamp < test add-commit timestamp | **Low** `tdd-order` finding — test written after source (confirmation bias risk) |
| Test add-commit timestamp < source add-commit timestamp | No finding — TDD discipline confirmed for this pair |

If **all** new source files in the branch diff have pre-dating or same-commit tests, emit a single **Info** `tdd-order` finding: "TDD discipline confirmed for this branch."

**Finding messages**:

| Severity | Type | Message |
|----------|------|---------|
| **Low** | `tdd-order` | "Test for `{source}` written after source — risk of confirmation bias in test assertions" |
| **Info** | `tdd-order` | "TDD discipline confirmed for this branch" |

## Step 4: Classify Findings

Map results to the findings format from REPORT-FORMAT.md.

**Severity mapping** (reinforced here for defense-in-depth):

| Finding Type | Severity |
|-------------|----------|
| Test suite fails to run (config error, missing deps) | **Critical** |
| Failing tests (regressions) | **High** |
| Changed files with 0% coverage | **High** |
| Overall coverage below project threshold | **Medium** |
| Changed files with < 80% coverage | **Medium** |
| Missing test file for new module | **Medium** |
| Flaky tests (pass on retry) | **Low** |
| Source file committed before its test file | **Low** |
| Coverage informational metrics | **Info** |
| TDD discipline confirmed (all tests pre-date source) | **Info** |

## Step 5: Create GitHub Issue

**Read [../dlc/references/ISSUE-TEMPLATE.md](../dlc/references/ISSUE-TEMPLATE.md) now** and format the issue body exactly as specified.

**Critical format rules** (reinforced here):
- Title: `[DLC] Testing: {summary — e.g. "3 failures, 72% coverage"}`
- Label: `dlc-test`
- Body must contain: Scan Metadata table, Findings Summary table (severity x count), Findings Detail grouped by severity, Recommended Actions, Raw Output in collapsed details
- Include a **Coverage Summary** subsection in the metadata:

```markdown
### Coverage Summary

| Metric | Value | Target |
|--------|-------|--------|
| Line Coverage | {n}% | 80% |
| Branch Coverage | {n}% | 70% |
| Files with 0% | {n} | 0 |
```

```bash
REPO=$(gh repo view --json nameWithOwner -q .nameWithOwner)
BRANCH=$(git branch --show-current)
TIMESTAMP=$(date +%s)
BODY_FILE="/tmp/dlc-issue-${TIMESTAMP}.md"

gh issue create \
  --repo "$REPO" \
  --title "[DLC] Testing: {summary}" \
  --body-file "$BODY_FILE" \
  --label "dlc-test"
```

If issue creation fails, save draft to `/tmp/dlc-draft-${TIMESTAMP}.md` and print the path.

## Step 6: Report

```text
Test analysis complete.
  - Framework: {detected framework}
  - Tests: {passed} passed, {failed} failed, {skipped} skipped
  - Coverage: {line}% line, {branch}% branch
  - Changed files coverage: {n}/{total} above threshold
  - Issue: #{number} ({url})
```

If all tests pass and coverage is above threshold, skip issue creation and report: "All tests passing. Coverage meets threshold ({n}%)."
