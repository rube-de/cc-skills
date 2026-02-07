# CC Skills

A monorepo of [Claude Code](https://docs.anthropic.com/en/docs/claude-code) plugins and [agent skills](https://agentskills.io).

[![Plugins](https://img.shields.io/badge/plugins-3-green.svg)](#plugins)
[![License](https://img.shields.io/badge/license-MIT-yellow.svg)](./LICENSE)

## Plugins

| Plugin | Category | Install | Description |
|--------|----------|---------|-------------|
| [council](./plugins/council/) | Code Review | Plugin or Skill | Orchestrate Gemini, Codex, Qwen, GLM-4.7, and Kimi K2.5 for consensus-driven reviews |
| [claude-dev-team](./plugins/claude-dev-team/) | Development | Plugin only | Multi-agent dev team with four modes: plan, dev, full, and auto via Agent Teams |
| [project-manager](./plugins/project-manager/) | Productivity | Plugin or Skill | Interactive issue creation optimized for LLM agent teams |

> **Plugin vs Skill**: Plugins use the full Claude Code plugin system (hooks, agents, commands, scripts). Skills install only SKILL.md definitions via [skills.sh](https://skills.sh). Plugins that rely on hooks, commands, or agent definitions need plugin install. See each plugin's README for details.

## Installation

### Prerequisites

| Requirement | Check | Install |
|-------------|-------|---------|
| Claude Code CLI | `claude --version` | [Getting Started](https://docs.anthropic.com/en/docs/claude-code/getting-started) |

### Quick Start (Recommended)

Run these commands in your **terminal** (not inside Claude Code):

```bash
# 1. Add the marketplace
claude plugin marketplace add rube-de/cc-skills

# 2. Install all plugins
for p in council claude-dev-team project-manager; do claude plugin install "$p@rube-cc-skills"; done

# 3. Restart Claude Code to activate
claude
```

### Step-by-Step Installation

#### Step 1: Add the Marketplace

```bash
claude plugin marketplace add rube-de/cc-skills
```

This clones the marketplace to `~/.claude/plugins/marketplaces/rube-cc-skills/`.

**Verify:**

```bash
claude plugin marketplace list
# Should show: rube-cc-skills - Source: GitHub (rube-de/cc-skills)
```

#### Step 2: Install Plugins

```bash
# Install individual plugins
claude plugin install council@rube-cc-skills
claude plugin install claude-dev-team@rube-cc-skills
claude plugin install project-manager@rube-cc-skills
```

#### Step 3: Restart Claude Code

Plugins require a **fresh session** to take effect:

```bash
claude
```

### Verify Installation

```bash
# Check installed plugins
claude plugin list | grep rube-cc-skills

# Inside Claude Code, type "/" and look for:
#   /council, /claude-dev-team, /project-manager
```

### Skills (via [skills.sh](https://skills.sh))

Alternatively, install as standalone skills (no marketplace required). This installs only skill definitions — no hooks, agents, or commands.

```bash
# List available skills
npx skills add rube-de/cc-skills --list

# Install specific skills
npx skills add rube-de/cc-skills --skill project-manager
npx skills add rube-de/cc-skills --skill council

# Install all skills
npx skills add rube-de/cc-skills --skill '*'
```

> [!NOTE]
> **Not all plugins work as standalone skills.** `claude-dev-team` requires plugin install because its interface is command-based (`/plan-task`, `/dev-task`, etc.). `council` works as a skill but loses preflight hooks and JSON validation. `project-manager` is fully equivalent either way.

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
│   ├── claude-dev-team/     # Multi-agent dev team
│   │   ├── agents/          # Researcher subagent
│   │   ├── commands/        # Task workflow commands
│   │   ├── hooks/           # Session start hooks
│   │   ├── scripts/         # Agent team checks
│   │   └── skills/          # claude-dev-team
│   └── project-manager/     # Issue creation
│       └── skills/          # project-manager
├── scripts/
│   └── validate-plugins.mjs # Plugin validation
├── CLAUDE.md                # Claude Code context
└── LICENSE                  # MIT
```

## Updating

When new versions are released:

```bash
cd ~/.claude/plugins/marketplaces/rube-cc-skills && git pull
claude plugin install council@rube-cc-skills  # reinstall updated plugins
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

1. Fork the repository
2. Create a plugin in `plugins/your-plugin/`
3. Add an entry to `.claude-plugin/marketplace.json`
4. Run `bun scripts/validate-plugins.mjs`
5. Submit a pull request

## Acknowledgments

Marketplace structure, validation tooling, and release workflow inspired by [terrylica/cc-skills](https://github.com/terrylica/cc-skills).

## License

MIT
