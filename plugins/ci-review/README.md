# ci-review

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Agents](https://img.shields.io/badge/Agents-9-green.svg)]()
[![Claude Code](https://img.shields.io/badge/Claude%20Code-Plugin-purple.svg)]()

CI-optimized multi-agent code review with confidence scoring and atomic GitHub PR review posting. Runs specialized review agents in parallel, scores each finding independently, filters false positives, and submits a single GitHub PR review with inline comments.

## GitHub Actions Setup

Use [`claude-code-action`](https://github.com/anthropics/claude-code-action) with the plugin marketplace:

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
        uses: actions/checkout@v6
        with:
          fetch-depth: 1

      - name: Run CI Review
        uses: anthropics/claude-code-action@v1
        with:
          claude_code_oauth_token: ${{ secrets.CLAUDE_CODE_OAUTH_TOKEN }}
          plugin_marketplaces: 'https://github.com/rube-de/cc-skills.git'
          plugins: |
            ci-review@rube-cc-skills
          prompt: |
            /ci-review ${{ github.event.pull_request.number }}
          claude_args: |
            --allowedTools "Bash(gh api repos/${{ github.repository }}/pulls/${{ github.event.pull_request.number }}/reviews:*),Bash(gh pr diff:*),Bash(gh pr view:*),Bash(gh pr comment:*),Bash(gh pr checkout:*),Bash(gh repo view:*),Bash(gh auth status:*),Bash(git blame:*)"
```

For full reviews (8 agents instead of 5):

```yaml
          prompt: |
            /ci-review ${{ github.event.pull_request.number }} --full
```

### Action Configuration

| Field | Purpose |
|-------|---------|
| `plugin_marketplaces` | Git URL of the cc-skills marketplace |
| `plugins` | Plugin name `@` marketplace name (from `marketplace.json`) |
| `claude_args` | Allowlist `gh api`, `gh pr`, `gh repo`, `gh auth`, and `git blame` |
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
# Review an open PR (lean profile — 5 agents)
/ci-review 123

# Full review (8 agents — adds test, comment, and type analysis)
/ci-review 123 --full

# Focus the review on a specific area
/ci-review 123 auth flow --lean

# Review with focus and full profile
/ci-review 123 error handling in the payment module --full

# Pass a GitHub URL instead of PR number
/ci-review https://github.com/owner/repo/pull/123
```

## Profiles

| Profile | Agents | Cost | Use When |
|---------|--------|------|----------|
| **lean** (default) | 5 reviewers + scorer | Lower | Every PR, CI pipelines |
| **full** | 8 reviewers + scorer | Higher | Critical PRs, pre-release, large changes |

## Review Agents

### Lean Profile (always active)

| Agent | Model | Focus |
|-------|-------|-------|
| **code-reviewer** | Sonnet | Project guidelines (CLAUDE.md), style, patterns, naming |
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
| **confidence-scorer** | Haiku | One per finding. Reads actual code at file:line, scores 0-100, filters below 80 |

## How It Works

```
┌─────────────────────────────────────────────────────────┐
│                 /ci-review <PR#>                         │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  0. Prerequisites — verify gh CLI + auth                │
│                                                         │
│  1. Parse Arguments — PR#, focus text, --lean/--full    │
│                                                         │
│  2. Eligibility — PR is open, not draft                 │
│                                                         │
│  3. Gather Context (parallel)                           │
│     ├── gh pr diff (full diff, warns if >10K lines)     │
│     ├── gh pr view --json (metadata)                    │
│     └── Discover CLAUDE.md files                        │
│                                                         │
│  3.5. Checkout PR branch — agents need file access      │
│                                                         │
│  4. Launch Review Agents (parallel)                     │
│     ├── lean: 5 agents                                  │
│     └── full: 8 agents                                  │
│                                                         │
│  5. Confidence Scoring (parallel, one Haiku per finding)│
│     ├── Read actual code to verify each finding         │
│     ├── Score 0-100                                     │
│     ├── Filter: drop findings < 80                      │
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
