# CLAUDE.md

Claude Code skills marketplace: **4 plugins** for multi-agent development, AI council reviews, project management, and plugin development.

## Navigation

| Topic | Document |
|-------|----------|
| Installation | [README.md](./README.md) |
| Marketplace Registry | [.claude-plugin/marketplace.json](./.claude-plugin/marketplace.json) |
| Plugin Authoring | [docs/PLUGIN-AUTHORING.md](./docs/PLUGIN-AUTHORING.md) |

## Plugins

| Plugin | Category | Version | Skill Triggers |
|--------|----------|---------|----------------|
| [council](./plugins/council/) | Code Review | 1.1.0 | `/council` |
| [claude-dev-team](./plugins/claude-dev-team/) | Development | 1.0.0 | `/claude-dev-team` |
| [project-manager](./plugins/project-manager/) | Productivity | `/project-manager` |
| [plugin-dev](./plugins/plugin-dev/) | Development | 1.0.0 | `/plugin-dev`, `/plugin-dev:create` |

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
│   ├── claude-dev-team/         ← Multi-agent dev team (Agent Teams)
│   │   ├── agents/              # Researcher subagent (Context7)
│   │   ├── commands/            # plan-task, dev-task, full-task, auto-task
│   │   ├── hooks/               # Session start validation
│   │   ├── scripts/             # Agent teams prerequisite check
│   │   └── skills/              # claude-dev-team
│   ├── project-manager/         ← GitHub issue creation
│   │   └── skills/              # project-manager
│   └── plugin-dev/              ← Plugin development tools
│       ├── commands/            # create (scaffolding)
│       ├── scripts/             # audit-hooks.sh
│       └── skills/              # plugin-dev
├── scripts/
│   ├── validate-plugins.mjs     ← Plugin validation
│   └── marketplace.schema.json  ← JSON Schema for marketplace.json
├── docs/
│   └── PLUGIN-AUTHORING.md      ← How to create plugins
├── CLAUDE.md                    ← This file
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

Each plugin follows the Claude Code plugin structure:

```
plugin-name/
├── agents/       → Agent definitions (subagents, teammates)
├── commands/     → Slash commands (/plugin:command)
├── hooks/        → hooks.json (PreToolUse, PostToolUse, SessionStart)
├── scripts/      → Shell scripts for hooks and validation
└── skills/       → Bundled skills with SKILL.md + references/
```

## Essential Commands

| Task | Command |
|------|---------|
| Validate plugins | `bun scripts/validate-plugins.mjs` |

## Conventions

- **Marketplace SSoT**: All plugin metadata lives in `.claude-plugin/marketplace.json`
- **Versioning**: Semantic-release via GitHub Actions on merge to `main` — do not edit versions manually
- **Branching**: PRs against `main`, CI validates on PR, release runs on merge
- **License**: MIT across all plugins
