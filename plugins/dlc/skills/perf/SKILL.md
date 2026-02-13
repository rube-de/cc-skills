---
name: perf
description: >-
  Performance analysis: bundle size checks, profiling, benchmarks,
  and algorithmic complexity review. Identifies performance-sensitive
  areas and creates a structured GitHub issue.
allowed-tools: [Bash, Read, Grep, Glob]
---

# DLC: Performance Analysis

Run performance checks against the current project and create a GitHub issue with findings.

Before running, **read [../dlc/references/ISSUE-TEMPLATE.md](../dlc/references/ISSUE-TEMPLATE.md) now** for the issue format, and **read [../dlc/references/REPORT-FORMAT.md](../dlc/references/REPORT-FORMAT.md) now** for the findings data structure.

## Step 1: Identify Performance-Sensitive Areas

Scan the project to determine which performance checks are applicable:

| Indicator | Check Type | Tools |
|-----------|-----------|-------|
| `webpack.config.*` / `vite.config.*` / `next.config.*` | Bundle analysis | `webpack-bundle-analyzer`, `vite-bundle-analyzer`, `@next/bundle-analyzer` |
| `lighthouse` in deps or CI config | Lighthouse | `lighthouse` CLI |
| `bench` / `benchmark` dirs or scripts | Benchmarks | Project-specific (e.g. `vitest bench`, `cargo bench`, `go test -bench`) |
| `docker-compose*` / `Dockerfile` | Container analysis | `dive`, `docker image inspect` |
| `tsconfig.json` / `package.json` (with build scripts) | Build time | Time the build command |

## Step 2: Run Performance Tools

### Bundle Analysis (Web Projects)

Select the tool based on detected build config — run only the first matching tool:

```bash
# Detect bundler and run the matching analysis
if [ -f webpack.config.js ] || [ -f webpack.config.ts ]; then
  npx webpack --json 2>/dev/null | jq '.assets[] | {name, size}'
elif [ -f vite.config.js ] || [ -f vite.config.ts ]; then
  npx vite build --report 2>/dev/null
elif [ -f next.config.js ] || [ -f next.config.mjs ]; then
  ANALYZE=true npx next build 2>/dev/null
fi
```

### Lighthouse (Web Projects)

```bash
# If lighthouse CLI available and there's a dev server or static build
lighthouse http://localhost:3000 --output=json --quiet 2>/dev/null
```

### Benchmarks

```bash
# Node.js
npx vitest bench --reporter=json 2>/dev/null

# Rust
cargo bench 2>/dev/null

# Go
go test -bench=. -benchmem ./... 2>/dev/null

# Python
python -m pytest --benchmark-only 2>/dev/null
```

### Build Time Analysis

```bash
# Time the build
time npm run build 2>&1
# or
time cargo build --release 2>&1
```

### Claude Algorithmic Analysis (Always Run)

Even with tools, perform manual analysis:
- Search for `O(n^2)` or worse patterns: nested loops over the same collection, repeated array searches
- Check for missing indexes in database queries (`*.sql`, ORM query files)
- Look for synchronous blocking in async contexts
- Identify N+1 query patterns in data-fetching code
- Check for unbounded data structures (lists that grow without limit)
- Review hot paths: request handlers, event loops, data pipelines

## Step 3: Classify Findings

Map results to the findings format from REPORT-FORMAT.md.

**Severity mapping** (reinforced here for defense-in-depth):

| Finding Type | Severity |
|-------------|----------|
| Bundle size regression > 50% | **Critical** |
| O(n^3) or worse in hot path | **Critical** |
| Lighthouse performance score < 50 | **High** |
| O(n^2) in frequently-called code | **High** |
| Bundle size > project target | **Medium** |
| Missing database indexes on queried columns | **Medium** |
| Synchronous blocking in async context | **Medium** |
| Minor optimization opportunities | **Low** |
| Benchmark results (informational) | **Info** |

## Step 4: Create GitHub Issue

**Read [../dlc/references/ISSUE-TEMPLATE.md](../dlc/references/ISSUE-TEMPLATE.md) now** and format the issue body exactly as specified.

**Critical format rules** (reinforced here):
- Title: `[DLC] Performance: {summary of top finding}`
- Label: `dlc-perf`
- Body must contain: Scan Metadata table, Findings Summary table (severity x count), Findings Detail grouped by severity, Recommended Actions, Raw Output in collapsed details

```bash
REPO=$(gh repo view --json nameWithOwner -q .nameWithOwner)
BRANCH=$(git branch --show-current)
TIMESTAMP=$(date +%s)
BODY_FILE="/tmp/dlc-issue-${TIMESTAMP}.md"

gh issue create \
  --repo "$REPO" \
  --title "[DLC] Performance: {summary}" \
  --body-file "$BODY_FILE" \
  --label "dlc-perf"
```

If issue creation fails, save draft to `/tmp/dlc-draft-${TIMESTAMP}.md` and print the path.

## Step 5: Report

```
Performance analysis complete.
  - Checks run: {list of applicable checks}
  - Tools used: {list}
  - Findings: {critical} critical, {high} high, {medium} medium
  - Issue: #{number} ({url})
```

If no findings, skip issue creation and report: "No performance issues found."
