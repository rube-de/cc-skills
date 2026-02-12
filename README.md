# CC Skills

A monorepo of [Claude Code](https://docs.anthropic.com/en/docs/claude-code) plugins and [agent skills](https://agentskills.io).

[![Plugins](https://img.shields.io/badge/plugins-8-green.svg)](#plugins)
[![License](https://img.shields.io/badge/license-MIT-yellow.svg)](./LICENSE)

## Plugins

| Plugin | Category | Install | Description |
|--------|----------|---------|-------------|
| [council](./plugins/council/) | Code Review | Plugin or Skill | Orchestrate Gemini, Codex, Qwen, GLM-4.7, and Kimi K2.5 for consensus-driven reviews |
| [cdt](./plugins/cdt/) | Development | Plugin only | Multi-agent dev team with four modes: plan, dev, full, and auto via Agent Teams |
| [project-manager](./plugins/project-manager/) | Productivity | Plugin or Skill | GitHub issue lifecycle: create, triage, and audit issues for LLM agent teams |
| [plugin-dev](./plugins/plugin-dev/) | Development | Plugin or Skill | Scaffold plugins, validate SKILL.md frontmatter, audit hooks |
| [temporal](./plugins/temporal/) | Development | Plugin or Skill | Temporal durable execution: CLI, SDK patterns, workflow orchestration |
| [doppler](./plugins/doppler/) | DevOps | Plugin or Skill | Doppler secrets management: CLI, secrets injection, CI/CD integrations |
| [oasis-dev](./plugins/oasis-dev/) | Development | Plugin or Skill | Oasis Network: Sapphire confidential EVM, ROFL apps, CLI, SDK patterns |
| [jules-review](./plugins/jules-review/) | Code Review | Plugin or Skill | Review Jules AI agent PRs using council with smart quick/full mode |

> **Plugin vs Skill**: Plugins use the full Claude Code plugin system (hooks, agents, commands, scripts). Skills install only SKILL.md definitions via [skills.sh](https://skills.sh). Plugins that rely on hooks, commands, or agent definitions need plugin install. See each plugin's README for details.

## Installation

### Prerequisites

| Requirement | Check | Install |
|-------------|-------|---------|
| Claude Code CLI | `claude --version` | [Getting Started](https://docs.anthropic.com/en/docs/claude-code/getting-started) |

### Getting Started (Recommended)

Open Claude Code and type `/plugin` — this opens an interactive UI where you can add marketplaces, browse, install, and update plugins. Add the marketplace using the GitHub repo `rube-de/cc-skills`, then install the plugins you want.

<details>
<summary><strong>Alternative: Add the marketplace from the terminal</strong></summary>

```bash
claude plugin marketplace add rube-de/cc-skills
```

This clones the marketplace to `~/.claude/plugins/marketplaces/rube-cc-skills/`.

</details>

> [!TIP]
> After installing, restart Claude Code (fresh session) to activate the plugins. Type `/` and look for `/council`, `/cdt`, `/pm`, etc.

<details>
<summary><strong>Alternative: Install from the terminal</strong></summary>

```bash
# Install individual plugins
claude plugin install council@rube-cc-skills
claude plugin install cdt@rube-cc-skills
claude plugin install project-manager@rube-cc-skills
claude plugin install plugin-dev@rube-cc-skills
claude plugin install temporal@rube-cc-skills
claude plugin install doppler@rube-cc-skills
claude plugin install oasis-dev@rube-cc-skills
claude plugin install jules-review@rube-cc-skills

# Or install all at once
for p in council cdt project-manager plugin-dev temporal doppler oasis-dev jules-review; do claude plugin install "$p@rube-cc-skills"; done

# Restart Claude Code to activate
claude
```

For cloud agents or shared teams, use `--scope project` instead — see [Installation Scopes](#installation-scopes).

</details>

### Skills via npx (Not Recommended)

> [!WARNING]
> **We recommend installing via the plugin system instead of `npx skills`.** The plugin system gives you the full experience — hooks, agents, commands, and scripts. `npx skills` installs only bare SKILL.md definitions, which means you lose preflight hooks, JSON validation, agent definitions, and command-based interfaces. Several plugins (like `cdt`) don't work at all as standalone skills.

If you still want standalone skill definitions (no marketplace required):

By default, `npx skills` installs skills at **project scope** (`.claude/` in the current directory). Use `-g` for global (user-level) install, or `-a claude-code` to install specifically for Claude Code:

```bash
# List available skills
npx skills add rube-de/cc-skills --list

# Install specific skills (project scope by default)
npx skills add rube-de/cc-skills --skill project-manager
npx skills add rube-de/cc-skills --skill council

# Install all skills
npx skills add rube-de/cc-skills --skill '*'

# Install globally (user-level, available everywhere)
npx skills add rube-de/cc-skills --skill council -g

# Install for Claude Code specifically
npx skills add rube-de/cc-skills --skill council -a claude-code
```

Use `-g` for global install and `-a claude-code` to target Claude Code.

#### Updating Skills

```bash
npx skills update
```

This updates all installed skills to their latest versions.

#### Removing Skills

```bash
# Interactive removal (select which skills to remove)
npx skills remove

# Remove a specific skill
npx skills remove --skill council
```

### Installation Scopes

By default, `claude plugin install` installs plugins at the **user** level (`~/.claude/`). This means plugins are only available to your local user and won't be picked up by cloud agents or teammates checking out the repo.

The `--scope` flag controls where plugins are installed:

| Scope | Location | Shared | Use Case |
|-------|----------|--------|----------|
| `user` (default) | `~/.claude/plugins/` | No | Personal local development |
| `project` | `.claude/plugins/` in project root | Yes (committable) | Teams, cloud agents, CI/CD |
| `local` | `.claude/plugins/` (gitignored) | No | Local project-specific overrides |

#### Project-Scoped Installation (for cloud agents)

To make plugins available to Claude cloud agents, CI runners, or teammates without requiring each person to install manually:

```bash
# 1. Add the marketplace (one-time, user-level)
claude plugin marketplace add rube-de/cc-skills

# 2. Install plugins at project scope
for p in council cdt project-manager plugin-dev temporal doppler oasis-dev jules-review; do
  claude plugin install "$p@rube-cc-skills" --scope project
done

# 3. Commit the .claude/ directory
git add .claude/
git commit -m "chore: add plugins at project scope"
```

This creates a `.claude/plugins/` directory in your project root. Any agent or developer checking out the repo will have the plugins available automatically — no manual install needed.

> [!TIP]
> Use **project scope** when you want plugins to travel with the repo (cloud agents, shared teams). Use **user scope** (the default) when you only need plugins for yourself.

## Structure

```
cc-skills/
├── .claude-plugin/
│   └── marketplace.json     ← Plugin registry (SSoT)
├── plugin.json              ← Root metadata
├── plugins/
│   ├── council/             # AI council code reviews
│   │   ├── agents/          # Consultant agents + Claude subagents
│   │   ├── hooks/           # Pre/post tool-use hooks
│   │   ├── scripts/         # Validation scripts
│   │   └── skills/          # council, council-reference
│   ├── cdt/                 # Multi-agent dev team
│   │   ├── agents/          # Researcher subagent
│   │   ├── commands/        # Task workflow commands
│   │   ├── hooks/           # Session start hooks
│   │   ├── scripts/         # Agent team checks
│   │   └── skills/          # cdt
│   ├── project-manager/     # Issue lifecycle
│   │   └── skills/          # pm, next, update
│   ├── plugin-dev/          # Plugin development tools
│   │   ├── commands/        # Scaffolding command
│   │   ├── scripts/         # Hook audit script
│   │   └── skills/          # plugin-dev
│   ├── temporal/            # Temporal durable execution
│   │   └── skills/          # temporal + references
│   ├── doppler/             # Doppler secrets management
│   │   └── skills/          # doppler + references
│   ├── oasis-dev/           # Oasis Network development
│   │   └── skills/          # oasis-dev + references
│   └── jules-review/        # Jules PR review via council
│       └── skills/          # jules-review + references
├── scripts/
│   └── validate-plugins.mjs # Plugin validation
├── CLAUDE.md                # Claude Code context
└── LICENSE                  # MIT
```

## Updating

When new versions are released, the easiest way to update is to type `/plugin` inside Claude Code and use the UI to update your plugins.

### Updating Plugins from the Terminal

Pull the latest marketplace and reinstall. Reinstalling overwrites existing plugins — no need to remove them first.

```bash
# 1. Pull the latest marketplace
cd ~/.claude/plugins/marketplaces/rube-cc-skills && git pull

# 2. Reinstall a single plugin
claude plugin install council@rube-cc-skills

# Or reinstall all plugins
for p in council cdt project-manager plugin-dev temporal doppler oasis-dev jules-review; do
  claude plugin install "$p@rube-cc-skills"
done

# 3. Restart Claude Code to activate changes
claude
```

For **project-scoped** plugins, add `--scope project` and re-commit:

```bash
cd ~/.claude/plugins/marketplaces/rube-cc-skills && git pull

for p in council cdt project-manager plugin-dev temporal doppler oasis-dev jules-review; do
  claude plugin install "$p@rube-cc-skills" --scope project
done

git add .claude/ && git commit -m "chore: update plugins"
```

### Updating Skills

If you installed via [skills.sh](https://skills.sh):

```bash
npx skills update
```

## Troubleshooting

### "Source path does not exist" Error

**Cause:** Marketplace repository is out of sync.

```bash
cd ~/.claude/plugins/marketplaces/rube-cc-skills && git pull
claude plugin install plugin-name@rube-cc-skills
```

### "Plugin not found in marketplace" Error

**Cause:** Using the GitHub path instead of the marketplace name in the install command.

```bash
# WRONG
claude plugin install council@rube-de/cc-skills

# CORRECT
claude plugin install council@rube-cc-skills
```

### Slash Commands Not Appearing

1. Verify the plugin is installed: `claude plugin list | grep rube-cc-skills`
2. Restart Claude Code (fresh session required)

### Hooks Not Working

Hooks must be synced to `~/.claude/settings.json`. Restart Claude Code after installing a plugin with hooks.

```bash
cat ~/.claude/settings.json | jq '.hooks | keys'
# Should show: ["PreToolUse", "PostToolUse", "SessionStart"]
```

## For Plugin Developers

See [docs/PLUGIN-AUTHORING.md](./docs/PLUGIN-AUTHORING.md) for the full authoring guide.

### Plugin Structure

```
my-plugin/
├── agents/       → Agent definitions
├── commands/     → Slash commands (/plugin:command)
├── hooks/        → hooks.json
├── scripts/      → Shell scripts
└── skills/       → SKILL.md + references/
```

All directories are optional — a plugin only needs to provide what it uses.

### Critical Schema Requirements

Based on compatibility with Claude Code's plugin loader:

#### 1. Source Paths (marketplace.json)

**DO NOT** use trailing slashes in `source` paths:

```json
// CORRECT
"source": "./plugins/my-plugin"

// WRONG - causes "Source path does not exist" error
"source": "./plugins/my-plugin/"
```

#### 2. Author Field (plugin.json)

The `author` field **must** be an object, not a string:

```json
// CORRECT
"author": {
  "name": "Your Name",
  "url": "https://github.com/username"
}

// WRONG - causes validation error
"author": "Your Name"
```

#### 3. No Custom Fields (plugin.json)

Only standard fields are allowed. These cause validation errors:

```json
// WRONG - unrecognized keys
"commands_dir": "commands",
"references_dir": "references"
```

### Valid plugin.json Example

```json
{
  "name": "my-plugin",
  "version": "1.0.0",
  "description": "Plugin description (min 10 chars)",
  "keywords": ["keyword1", "keyword2"],
  "author": {
    "name": "Your Name",
    "url": "https://github.com/username"
  }
}
```

### Valid marketplace.json Entry

```json
{
  "name": "my-plugin",
  "description": "Plugin description (min 10 chars)",
  "version": "1.0.0",
  "source": "./plugins/my-plugin",
  "category": "development",
  "author": {
    "name": "Your Name",
    "url": "https://github.com/username"
  },
  "keywords": ["keyword1", "keyword2"],
  "strict": false
}
```

### Validation

```bash
bun scripts/validate-plugins.mjs
```

Checks: JSON Schema validation, source paths exist, no orphaned plugin directories.

## Release Workflow (for maintainers)

This marketplace uses [semantic-release](https://semantic-release.gitbook.io/) with conventional commits and GitHub Actions. Versions are managed automatically — **do not manually edit version numbers**.

### How It Works

1. Create a branch and open a PR against `main`
2. CI runs plugin validation on the PR ([`.github/workflows/ci.yml`](./.github/workflows/ci.yml))
3. Merge the PR to `main`
4. Release workflow runs automatically ([`.github/workflows/release.yml`](./.github/workflows/release.yml))
5. semantic-release bumps versions, updates CHANGELOG, creates GitHub release
6. Users update via `git pull` in their marketplace clone

### Version Bumps

Semantic-release determines the next version from commit messages:

| Commit Type | Release |
|-------------|---------|
| `feat:` | minor |
| `fix:` | patch |
| `docs:`, `chore:`, `style:`, `refactor:`, `test:` | patch |
| `BREAKING CHANGE:` in footer | major |

Files bumped on release:
- `package.json`
- `plugin.json`
- `.claude-plugin/marketplace.json`
- `CHANGELOG.md` (generated)

## Contributing

The easiest way to create a new plugin is to use the `/plugin-dev:create` skill inside Claude Code — it scaffolds the directory structure, manifests, and marketplace registration for you.

1. Fork the repository
2. Run `/plugin-dev:create` in Claude Code to scaffold your plugin
3. Run `bun scripts/validate-plugins.mjs` to validate
4. Submit a pull request

## Acknowledgments

Marketplace structure, validation tooling, and release workflow inspired by [terrylica/cc-skills](https://github.com/terrylica/cc-skills).

## License

MIT
