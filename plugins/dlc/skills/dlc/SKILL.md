---
name: dlc
description: >-
  Dev Life Cycle quality gates: run security scans, code quality checks,
  performance analysis, test coverage, and PR review compliance. Routes
  to domain-specific sub-skills or runs all checks in sequence.
user-invocable: true
disable-model-invocation: true
allowed-tools: [Read, Bash, Skill, AskUserQuestion]
argument-hint: "[--all | security | quality | perf | test | pr-check]"
---

# Dev Life Cycle (DLC)

Automated quality gates for the development life cycle. Each sub-skill detects your project type, runs appropriate tools, and creates a GitHub issue with structured findings.

## Sub-Skills

| Skill | Command | Description |
|-------|---------|-------------|
| Security | `/dlc:security` | Dependency audits, SAST scanning, secret detection |
| Quality | `/dlc:quality` | Linting, complexity analysis, duplication, dead code |
| Performance | `/dlc:perf` | Bundle analysis, profiling, algorithmic complexity review |
| Testing | `/dlc:test` | Test execution, coverage measurement, gap analysis |
| PR Review | `/dlc:pr-check` | Fetch PR comments, implement fixes, reply inline |

## Usage

```
/dlc                  → Show this overview
/dlc security         → Run security scan
/dlc:security         → Run security scan (alternate syntax)
/dlc --all            → Run all checks in sequence
```

## Routing

Parse the first argument:

| Argument | Route to |
|----------|----------|
| `--all` | Run all sub-skills in sequence (see below) |
| `security` | Invoke `dlc:security` via `Skill` |
| `quality` | Invoke `dlc:quality` via `Skill` |
| `perf` | Invoke `dlc:perf` via `Skill` |
| `test` | Invoke `dlc:test` via `Skill` |
| `pr-check` | Invoke `dlc:pr-check` via `Skill` |
| empty | Show overview and use `AskUserQuestion` to ask which check to run |

If routing to a single sub-skill, invoke it with `Skill` and pass any remaining arguments.

## `--all` Mode

When invoked with `--all`, invoke each sub-skill via `Skill` in order:

1. `dlc:security`
2. `dlc:quality`
3. `dlc:perf`
4. `dlc:test`
5. `dlc:pr-check` (only if on a branch with an open PR)

After all checks complete, print a summary table:

```
## DLC Summary

| Check | Findings | Issue |
|-------|----------|-------|
| Security | 2 critical, 5 high | #123 |
| Quality | 0 critical, 3 medium | #124 |
| Performance | 1 high | #125 |
| Testing | 85% coverage (target: 80%) | — |
| PR Review | 3 unresolved comments | #126 |
```

Skip any sub-skill that fails to detect its prerequisites (e.g., skip `dlc:perf` if no bundle config or benchmarks exist).

## No Arguments

When invoked with no arguments, display this overview and use `AskUserQuestion` to ask which check to run.
