# CC Skills

A monorepo of [Claude Code](https://docs.anthropic.com/en/docs/claude-code) plugins and [agent skills](https://agentskills.io).

## Quick Start

### Skills (via [skills.sh](https://skills.sh))

```sh
# List available skills
npx skills add rube-de/cc-skills --list

# Install specific skills
npx skills add rube-de/cc-skills --skill project-manager
npx skills add rube-de/cc-skills --skill council

# Install all skills
npx skills add rube-de/cc-skills --skill '*'
```

### Plugins (via Claude Code marketplace)

```sh
# Add the marketplace
/plugin marketplace add rube-de/cc-skills

# Install a plugin
/plugin install council@rube-de/cc-skills
/plugin install claude-dev-team@rube-de/cc-skills
/plugin install project-manager@rube-de/cc-skills
```

## Plugins

| Plugin | Category | Description |
|--------|----------|-------------|
| council | Code Review | Orchestrate Gemini, Codex, Qwen, and GLM-4.7 for consensus-driven reviews |
| claude-dev-team | Development | Multi-agent development team for Claude Code |
| project-manager | Productivity | Interactive issue creation optimized for LLM agent teams |

## Structure

```
plugins/
├── council/              # Code review council
│   ├── agents/           # Consultant agent definitions
│   ├── hooks/            # Pre/post tool-use hooks
│   ├── scripts/          # Validation scripts
│   └── skills/           # council, council-reference
├── claude-dev-team/      # Multi-agent dev team
│   ├── agents/           # Researcher agent
│   ├── commands/         # Task workflow commands
│   ├── hooks/            # Hooks
│   ├── scripts/          # Agent team checks
│   └── skills/           # claude-dev-team
└── project-manager/      # Issue creation
    └── skills/           # project-manager
```

## License

MIT
