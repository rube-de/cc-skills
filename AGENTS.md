# AGENTS.md

Claude Code skills marketplace: **8 plugins** for multi-agent development, AI council reviews, project management, plugin development, and platform-specific tooling.

## Directory Structure

```
cc-skills/
├── .claude-plugin/
│   └── marketplace.json         ← Plugin registry (SSoT)
├── plugin.json                  ← Root plugin metadata
├── plugins/
│   ├── council/                 ← AI council code reviews
│   │   ├── agents/              # External AI consultants + internal Claude subagents
│   │   ├── hooks/               # Pre/post tool-use hooks
│   │   ├── scripts/             # Preflight, JSON validation
│   │   └── skills/              # council, council-reference
│   ├── cdt/                     ← Multi-agent dev team (Agent Teams)
│   │   ├── agents/              # Researcher subagent (Context7)
│   │   ├── commands/            # plan-task, dev-task, full-task, auto-task
│   │   ├── hooks/               # Session start validation
│   │   ├── scripts/             # Agent teams prerequisite check
│   │   └── skills/              # cdt
│   ├── project-manager/         ← GitHub issue creation
│   │   └── skills/              # project-manager
│   ├── plugin-dev/              ← Plugin development tools
│   │   ├── commands/            # create (scaffolding)
│   │   ├── scripts/             # audit-hooks.sh
│   │   └── skills/              # plugin-dev
│   ├── temporal/                ← Temporal durable execution
│   │   └── skills/              # temporal + references
│   ├── doppler/                 ← Doppler secrets management
│   │   └── skills/              # doppler + references
│   ├── oasis-dev/               ← Oasis Network development
│   │   └── skills/              # oasis-dev + references
│   └── jules-review/            ← Jules PR review via council
│       └── skills/              # jules-review + references
├── scripts/
│   ├── validate-plugins.mjs     ← Plugin validation
│   └── marketplace.schema.json  ← JSON Schema for marketplace.json
├── docs/
│   └── PLUGIN-AUTHORING.md      ← How to create plugins
├── AGENTS.md                    ← Universal agent instructions (this file)
├── CLAUDE.md                    ← Claude Code-specific instructions
├── README.md                    ← Installation & overview
├── LICENSE                      ← MIT
├── .releaserc.yml               ← Semantic release config
└── package.json                 ← Dependencies & scripts
```

## Key Files

| File | Purpose |
|------|---------|
| `.claude-plugin/marketplace.json` | Plugin registry — single source of truth for all plugin metadata |
| `plugin.json` | Root plugin metadata (name, version, description) |
| `plugins/*/skills/*/SKILL.md` | Skill activation definitions |
| `plugins/*/hooks/hooks.json` | Hook definitions per plugin |
| `plugins/*/agents/*.md` | Agent/subagent definitions |

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

## Testing / Validation

- Find the CI plan in `.github/workflows/` (`ci.yml` validates on PR, `release.yml` runs on merge to main)
- Run `bun scripts/validate-plugins.mjs` to validate all plugins locally
- Fix any validation errors until the suite is clean before committing
- After adding or moving plugin files, re-run validation to catch orphaned dirs or missing marketplace entries

## PR Instructions

- PRs target `main`
- Always run `bun scripts/validate-plugins.mjs` before committing
- CI will run the same validation — make sure it passes locally first
- Semantic-release handles versioning on merge — do not edit version numbers manually

## Learnings

Accumulated lessons from developing skills and plugins live in [`docs/learnings.md`](docs/learnings.md).

**Update it automatically**: When you fix a bug, discover a pitfall, or learn something non-obvious about skill authoring, plugin structure, or agent teams — append it to `docs/learnings.md` with a `> Source:` linking to the relevant file, PR, or docs page. Don't wait to be asked.

## Conventions

- **Marketplace SSoT**: All plugin metadata lives in `.claude-plugin/marketplace.json`
- **Versioning**: Semantic-release via GitHub Actions — never edit versions by hand
- **Branching**: PRs against `main`, CI validates on PR, release on merge
- **License**: MIT across all plugins
