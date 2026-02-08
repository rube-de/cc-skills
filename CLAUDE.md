# CLAUDE.md

@AGENTS.md

## Plugins (Claude Code skills)

| Plugin | Category | Skill Triggers |
|--------|----------|----------------|
| council | Code Review | `/council` |
| cdt | Development | `/cdt` |
| project-manager | Productivity | `/project-manager` |
| plugin-dev | Development | `/plugin-dev`, `/plugin-dev:create` |
| temporal | Development | `/temporal` |
| doppler | DevOps | `/doppler` |

## Navigation

| Topic | Document |
|-------|----------|
| Installation | README.md |
| Marketplace Registry | .claude-plugin/marketplace.json |
| Plugin Authoring | docs/PLUGIN-AUTHORING.md |

## Claude Code Specifics

- Skills activate via slash commands (see table above)
- `plugins/*/skills/*/SKILL.md` — skill activation definitions (YAML frontmatter + instructions)
- `plugins/*/hooks/hooks.json` — hook definitions (PreToolUse, PostToolUse, SessionStart)
- `plugins/*/agents/*.md` — agent/subagent definitions with YAML frontmatter
- Validate with: `bun scripts/validate-plugins.mjs`
