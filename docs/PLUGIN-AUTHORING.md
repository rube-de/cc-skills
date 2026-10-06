# Plugin Authoring Guide

How to create and publish a plugin in the cc-skills marketplace.

## Plugin Structure

Every plugin lives under `plugins/<name>/` and follows this layout:

```
my-plugin/
├── agents/                    # Agent definitions (optional)
│   └── my-agent.md           # Subagent or teammate definition
├── commands/                  # Slash commands (optional)
│   └── my-command.md         # Becomes /my-plugin:my-command
├── hooks/                     # Hook definitions (optional)
│   └── hooks.json            # PreToolUse, PostToolUse, SessionStart
├── scripts/                   # Shell scripts for hooks (optional)
│   └── validate.sh           # Referenced by hooks.json
└── skills/                    # Bundled skills
    └── my-skill/
        ├── SKILL.md           # Skill activation definition
        └── references/        # Supporting docs (loaded on demand)
            └── WORKFLOW.md
```

All directories are optional — a plugin only needs to provide what it uses.

## Registering a Plugin

Add an entry to `.claude-plugin/marketplace.json`:

```json
{
  "name": "my-plugin",
  "description": "What it does in one sentence (min 10 chars)",
  "version": "1.0.0",
  "source": "./plugins/my-plugin",
  "category": "development",
  "author": {
    "name": "Your Name",
    "url": "https://github.com/username"
  },
  "keywords": ["relevant", "search", "terms"]
}
```

### Required Fields

| Field | Rules |
|-------|-------|
| `name` | kebab-case, matches directory name: `^[a-z0-9-]+$` |
| `description` | Minimum 10 characters |
| `version` | Semver: `^\\d+\\.\\d+\\.\\d+$` |
| `source` | Path to plugin dir: `^\\./plugins/[a-z0-9-]+$` |
| `category` | One of: `code-review`, `development`, `productivity`, `quality`, `automation`, `documentation`, `devops`, `utilities` |

### Optional Fields

| Field | Purpose |
|-------|---------|
| `author` | `{ "name": "...", "url": "..." }` — must be object, not string |
| `keywords` | Array of strings for marketplace discovery |
| `hooks` | Path to hooks.json: `./plugins/name/hooks/hooks.json` |
| `requires` | Array of plugin names this plugin depends on |

## SKILL.md Format

The `SKILL.md` file defines when and how a skill activates:

```markdown
# My Skill

Brief description of what this skill does.

## Triggers

- keyword1, keyword2, keyword3

## Instructions

What the skill should do when activated...
```

## Hooks

Define hooks in `hooks/hooks.json`:

```json
{
  "hooks": [
    {
      "type": "PreToolUse",
      "matcher": "Bash",
      "hook": {
        "type": "command",
        "command": "bash scripts/validate.sh"
      }
    }
  ]
}
```

Hook types: `PreToolUse`, `PostToolUse`, `SessionStart`, `Stop`.

### Function-hook plugins (mods)

A plugin can instead ship a TypeScript hooks module that runs inside Claude Code (Claude Code 2.1.291+, early-access API): it can draw UI above the prompt, register tools and slash commands, gate tool calls and rewrite the system prompt. [`plugins/clean-view/`](../plugins/clean-view/) is the reference:

```
clean-view/
├── .claude-plugin/plugin.json   # "types": "./types/index.d.ts"
├── hooks/
│   ├── hooks.json               # { "modules": ["./register.tsx"] }
│   └── register.tsx             # export const register: Register = on => { ... }
├── tests/*.test.tsx             # run with `claude plugin test`
├── types/index.d.ts             # PluginState contract for $.state
└── tsconfig.json                # extends ./.claude-plugin/types/tsconfig.json
```

- Leave `version` out of `plugin.json`: the marketplace entry carries it and semantic-release bumps it.
- `.claude-plugin/types/` is written by Claude Code on load and is gitignored.
- `bun scripts/validate-plugins.mjs` only checks that `hooks/` exists. Also run `claude plugin validate plugins/<name>` and `claude plugin test plugins/<name>`; CI does not run them yet.

## Validation

Always validate before committing:

```bash
bun scripts/validate-plugins.mjs
```

This checks:
1. All entries pass JSON Schema validation
2. All source paths exist on disk
3. No orphaned plugin directories without marketplace entries
4. SKILL.md frontmatter has a kebab-case `name` and a `description`
5. No `.claude-plugin/plugin.json` pins a `version` (at install it would override the marketplace entry, which semantic-release bumps)

## Common Mistakes

- **`author` as string** — must be `{ "name": "..." }` object
- **Trailing slash in source** — use `./plugins/name` not `./plugins/name/`
- **Missing marketplace entry** — plugin won't be discoverable
- **Custom fields in marketplace entry** — `additionalProperties: false` will reject them
