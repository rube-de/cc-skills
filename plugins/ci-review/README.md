# ci-review

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Agents](https://img.shields.io/badge/Agents-11-green.svg)]()
[![Claude Code](https://img.shields.io/badge/Claude%20Code-Plugin-purple.svg)]()

CI-optimized multi-agent code review with confidence scoring and atomic GitHub PR review posting. Runs specialized review agents in parallel, scores each finding independently, filters false positives, and submits a single GitHub PR review with inline comments.

## GitHub Actions Setup

Use [`claude-code-action`](https://github.com/anthropics/claude-code-action) with the plugin marketplace.

### Multi-stage review (recommended)

Run a thorough multi-agent review on PR open, then a fast single-agent review on subsequent pushes:

```yaml
name: CI Code Review

on:
  pull_request:
    types: [opened, synchronize, ready_for_review, reopened]

jobs:
  ci-review:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      pull-requests: write
      issues: read
      id-token: write

    steps:
      - name: Checkout repository
        uses: actions/checkout@v4
        with:
          fetch-depth: 0  # Full history — required for git blame

      - name: Run CI Review
        uses: anthropics/claude-code-action@v1
        with:
          claude_code_oauth_token: ${{ secrets.CLAUDE_CODE_OAUTH_TOKEN }}
          plugin_marketplaces: 'https://github.com/rube-de/cc-skills.git'
          plugins: |
            ci-review@rube-cc-skills
          prompt: |
            /ci-review ${{ github.event.pull_request.number }} ${{ github.event.action == 'opened' && '--lean' || '--single' }}
          claude_args: |
            --allowedTools "Read,Grep,Glob,Agent,Bash(gh auth status:*),Bash(gh pr:*),Bash(gh repo view:*),Bash(gh api repos/${{ github.repository }}/pulls/${{ github.event.pull_request.number }}/reviews:*),Bash(git branch:*),Bash(git rev-parse:*),Bash(git blame:*),Bash(jq:*),Bash(echo:*),Bash(cat:*)"
```

This gives you the best cost/coverage tradeoff: full multi-agent review once on open (~6 agents), then cheap single-agent reviews on each push (~1 agent + confidence scoring).

### Single profile (simplest)

For a single review profile on all events:

```yaml
          prompt: |
            /ci-review ${{ github.event.pull_request.number }}
```

### Other profiles

```yaml
          # Full review (9 agents — adds test, comment, and type analysis)
          prompt: |
            /ci-review ${{ github.event.pull_request.number }} --full

          # Use Opus for deeper analysis (works with any profile)
          prompt: |
            /ci-review ${{ github.event.pull_request.number }} --model opus

          # AI-authored PRs (full agents + surfaces more findings)
          prompt: |
            /ci-review ${{ github.event.pull_request.number }} --agent
```

### Action Configuration

| Field | Purpose |
|-------|---------|
| `plugin_marketplaces` | Git URL of the cc-skills marketplace |
| `plugins` | Plugin name `@` marketplace name (from `marketplace.json`) |
| `claude_args` | Allowlist `Read`, `Grep`, `Glob`, `Agent`, and scoped `Bash` (`gh pr`, `gh api`, `git blame`, `jq`, etc.) |
| `permissions.pull-requests: write` | Required for posting PR reviews |
| `permissions.id-token: write` | Required for Claude Code OAuth |

> [!TIP]
> The PR branch is already checked out by `actions/checkout` — the skill detects this automatically.

## Installation (Local)

```bash
# Add the marketplace (once)
claude plugin marketplace add rube-de/cc-skills

# Install the plugin
claude plugin install ci-review@rube-cc-skills
```

## Local Usage

```bash
# Review an open PR (lean profile — 6 agents, default)
/ci-review 123

# Single-agent review (cost-effective, with confidence scoring)
/ci-review 123 --single

# Full review (9 agents — adds test, comment, and type analysis)
/ci-review 123 --full

# Review AI-authored PR (full agents + surfaces all findings)
/ci-review 123 --agent

# Focus the review on a specific area
/ci-review 123 auth flow --lean

# Filter by minimum severity
/ci-review 123 --min-severity medium

# Pass a GitHub URL instead of PR number
/ci-review https://github.com/owner/repo/pull/123
```

## Profiles

| Profile | Agents | Cost | Use When |
|---------|--------|------|----------|
| **single** | 1 reviewer + scorer | Lowest | PR updates, CI budgets, small diffs |
| **lean** (default) | 6 reviewers + scorer | Moderate | Every PR on open, balanced cost/coverage |
| **full** | 9 reviewers + scorer | Higher | Critical PRs, pre-release, large changes |
| **agent** | 9 reviewers + scorer | Higher | AI-authored PRs — surfaces more findings since fixes are cheap |

## Review Agents

### Single Profile (`--single`)

| Agent | Model | Focus |
|-------|-------|-------|
| **single-reviewer** | Sonnet | Comprehensive single-pass: bugs, security, error handling, conventions, SDK parity |

### Lean Profile (default)

| Agent | Model | Focus |
|-------|-------|-------|
| **deep-reviewer** | Sonnet | Unconstrained deep review — traces control flow across boundaries, catches cross-cutting bugs |
| **guidelines-checker** | Sonnet | Project guidelines (CLAUDE.md), style, patterns, naming |
| **bug-detector** | Sonnet | Logic errors, null handling, race conditions, git blame context |
| **security-reviewer** | Sonnet | OWASP top 10, injection, auth flaws, exposed secrets |
| **silent-failure-hunter** | Sonnet | Empty catches, swallowed errors, missing user feedback |
| **code-simplifier** | Sonnet | Duplication, complexity, readability, dead code |

### Full Profile (added with `--full`)

| Agent | Model | Focus |
|-------|-------|-------|
| **test-analyzer** | Sonnet | Missing test coverage, untested edge cases, test quality |
| **comment-analyzer** | Sonnet | Stale/misleading comments, inaccurate documentation |
| **type-analyzer** | Sonnet | Type invariants, encapsulation, illegal states |

### Scoring

| Agent | Model | Role |
|-------|-------|------|
| **confidence-scorer** | Haiku | One per finding. Reads actual code at file:line, scores 0-100 for factual accuracy, filters below 65 |

## How It Works

```
┌─────────────────────────────────────────────────────────┐
│                 /ci-review <PR#>                         │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  0. Prerequisites — verify gh CLI + auth                │
│                                                         │
│  1. Parse Arguments — PR#, focus, profile, min-severity  │
│                                                         │
│  2. Eligibility — PR is open                            │
│                                                         │
│  3. Gather Context (parallel)                           │
│     ├── gh pr diff (full diff, warns if >10K lines)     │
│     ├── gh pr view --json (metadata)                    │
│     └── Discover CLAUDE.md files                        │
│                                                         │
│  3.5. Checkout PR branch — agents need file access      │
│                                                         │
│  4. Launch Review Agents (parallel)                     │
│     ├── single: 1 comprehensive agent                   │
│     ├── lean: 6 specialist agents                       │
│     ├── full/agent: 9 specialist agents                 │
│     └── agent: + AI-specific prompt context             │
│                                                         │
│  5. Confidence Scoring (parallel, one Haiku per finding)│
│     ├── Read actual code to verify each finding         │
│     ├── Score 0-100 (is this factually correct?)        │
│     ├── Confidence filter: drop findings < 65           │
│     ├── Severity filter: drop below --min-severity      │
│     └── Deduplicate: exact match + near match (±5 lines)│
│                                                         │
│  6. Build Review Payload                                │
│     ├── Inline comments (file:line in diff)             │
│     └── Review body (summary + non-diff findings)       │
│                                                         │
│  7. Post via gh api (event: "COMMENT")                  │
│     ├── Retry: drop invalid inline comments             │
│     ├── Retry: body-only review                         │
│     └── Fallback: gh pr comment                         │
│                                                         │
│  8. Summary — stats for CI log                          │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

## License

MIT
