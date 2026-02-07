# CC Skills

A curated collection of [Claude Code](https://docs.anthropic.com/en/docs/claude-code) plugins and skills.

## Quick Start

```sh
# Install a skill via npx skills
npx skills add rube-de/cc-skills --list
npx skills add rube-de/cc-skills --skill project-manager

# Or add the marketplace for plugins
/plugin marketplace add rube-de/cc-skills

# Install a plugin
/plugin install council@rube-marketplace
/plugin install claude-dev-team@rube-marketplace
```

## Plugins & Skills

| Plugin | Category | Source | Description |
|--------|----------|--------|-------------|
| [council](https://github.com/rube-de/claude-council) | Code Review | `rube-de/claude-council` | Orchestrate Gemini, Codex, Qwen, and GLM-4.7 for consensus-driven reviews |
| [claude-dev-team](https://github.com/Chalet-Labs/chalet-agent-dev-team) | Development | `Chalet-Labs/chalet-agent-dev-team` | Multi-agent development team for Claude Code |
| project-manager | Productivity | local | Interactive issue creation optimized for LLM agent teams |

## Adding a Plugin

Add an entry to the `plugins` array in `.claude-plugin/marketplace.json`:

```json
{
  "name": "your-plugin",
  "source": {
    "source": "github",
    "repo": "owner/repo-name"
  },
  "category": "your-category"
}
```

Validate before submitting:

```sh
claude plugin validate .
```

See the [plugin marketplace docs](https://code.claude.com/docs/en/plugin-marketplaces) for the full schema and source options.

## License

MIT
