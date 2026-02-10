# jules-review

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Claude Code](https://img.shields.io/badge/Claude%20Code-Plugin-purple.svg)](https://docs.anthropic.com/en/docs/claude-code)

Review Jules (Google's AI coding agent) pull requests using AI council. Automatically detects Jules PRs, gathers context, invokes the appropriate council workflow (quick or full), and posts structured GitHub PR reviews with inline line comments tagging `@jules`.

## Installation

```bash
claude plugin install jules-review@rube-cc-skills
```

## Usage

```bash
# Review the current branch's PR (auto-detects Jules PRs)
/jules-review

# Quick review using parallel triage
/jules-review -quick

# Review a specific PR by number
/jules-review 42

# Quick review of a specific PR
/jules-review -quick 123
```

## Features

- Auto-detects Jules PRs from branch name or PR author
- Smart mode selection: auto-quick for small diffs (≤100 lines), full review for larger changes
- Delegates to `/council review` (full) or `/council quick` (parallel triage)
- Posts GitHub PR reviews with inline line comments on diff-relevant findings
- Tags `@jules` in review body and inline comments for Jules to act on
- Maps council severity to GitHub review events (APPROVE, COMMENT, REQUEST_CHANGES)
- Falls back to `gh pr comment` if review API permissions fail

## How It Works

1. **PR Resolution** — Resolves PR from argument, current branch, or auto-detect
2. **Diff Gathering** — Fetches PR diff and counts changed lines
3. **Mode Selection** — `-quick` flag, auto-quick (≤100 lines), or full review
4. **Council Invocation** — Delegates to `/council quick` or `/council review`
5. **PR Review Posting** — Parses findings, maps to inline comments, posts via GitHub API

## License

MIT
