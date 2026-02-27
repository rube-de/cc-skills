# AGENTS.md

Claude Code skills marketplace — plugins for multi-agent development, AI council reviews, project management, plugin development, quality gates, and platform-specific tooling. See `.claude-plugin/marketplace.json` for the full plugin registry.

## Plugin Architecture

Each plugin follows this structure:

```
plugin-name/
├── agents/       → Agent definitions (subagents, teammates)
├── commands/     → Slash commands (/plugin:command)
├── hooks/        → hooks.json (PreToolUse, PostToolUse, SessionStart)
├── scripts/      → Shell scripts for hooks and validation
└── skills/       → Bundled skills with SKILL.md + references/
```

See [docs/PLUGIN-AUTHORING.md](./docs/PLUGIN-AUTHORING.md) for the full authoring guide.

## Dev Environment

- Run `bun install` to install dependencies
- Check the `name` field in `package.json` to confirm the correct package identity — skip the top-level one when looking at plugins
- Plugin directories live under `plugins/` — each is self-contained
- Refer to `.claude-plugin/marketplace.json` as the single source of truth for all plugin metadata

## Git Workflow

- Always run `git fetch origin && git pull origin main` before planning or starting any work
- Always create a fresh branch off remote main before editing: `git checkout -b <branch-name> origin/main`
- Never commit directly to `main`
- Use conventional commits (`feat:`, `fix:`, `docs:`, `chore:`, etc.) — semantic-release picks these up

## Validation & PRs

- CI plan lives in `.github/workflows/` (`ci.yml` validates on PR, `release.yml` runs on merge to main)
- Run `bun scripts/validate-plugins.mjs` before committing — CI runs the same check
- After adding or moving plugin files, re-run validation to catch orphaned dirs or missing marketplace entries
- PRs target `main`; semantic-release handles versioning on merge — never edit versions by hand

## Learnings

Accumulated lessons from developing skills and plugins live in [`docs/learnings.md`](docs/learnings.md).

**Update it automatically**: When you fix a bug, discover a pitfall, or learn something non-obvious about skill authoring, plugin structure, or agent teams — append it to `docs/learnings.md` with a `> Source:` linking to the relevant file, PR, or docs page. Don't wait to be asked.

**PR review feedback is a learning trigger**: When you fix issues raised by PR reviewers (Copilot, external reviewers, council), add the underlying pattern to `docs/learnings.md` — not just the fix, but the *generalizable mistake* so it's caught at authoring time next round. Include the bad/good pattern and link to the PR. If the fix touches multiple files for the same root cause, document the root cause once (not per file).
