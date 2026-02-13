# CLAUDE.md

@AGENTS.md

## Plugins (Claude Code skills)

| Plugin | Category | Skill Triggers |
|--------|----------|----------------|
| council | Code Review | `/council` |
| cdt | Development | `/cdt` |
| project-manager | Productivity | `/pm`, `/pm:next`, `/pm:update`, `/pm:review` |
| plugin-dev | Development | `/plugin-dev`, `/plugin-dev:create` |
| temporal | Development | `/temporal` |
| doppler | DevOps | `/doppler` |
| oasis-dev | Development | `/oasis-dev` |
| jules-review | Code Review | `/jules-review` |
| dlc | Quality | `/dlc`, `/dlc:security`, `/dlc:quality`, `/dlc:perf`, `/dlc:test`, `/dlc:pr-check`, `/dlc:pr-validity` |

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
