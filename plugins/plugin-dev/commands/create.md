---
allowed-tools: [Read, Write, Edit, Bash, Grep, Glob, AskUserQuestion]
description: "Scaffold a new plugin with directory structure, manifests, and marketplace registration"
---

# /plugin-dev:create — Plugin Scaffolding

Scaffold a new Claude Code plugin in the cc-skills marketplace.

## Step 1: Plugin Name

If `$ARGUMENTS` is provided and matches kebab-case (`^[a-z0-9-]+$`), use it as the plugin name.

Otherwise, ask the user:

```
AskUserQuestion: "What should the plugin be named? (kebab-case, e.g. my-plugin)"
```

Validate:
- Must match `^[a-z0-9-]+$`
- Must NOT already exist in `.claude-plugin/marketplace.json` (check `plugins[].name`)
- Must NOT have an existing directory at `plugins/<name>/`

If invalid, explain why and ask again.

## Step 2: Category

Ask the user to pick a category from the marketplace schema enum:

```
AskUserQuestion: "Which category?"
Options: code-review, development, productivity, quality, automation, documentation, devops, utilities
```

## Step 3: Components

Ask the user which components to include (multi-select):

```
AskUserQuestion: "Which components does your plugin need?" (multiSelect: true)
Options:
- skills — SKILL.md definitions (triggers, allowed-tools)
- hooks — Pre/PostToolUse, SessionStart hooks
- commands — Slash commands (/plugin:command)
- agents — Agent/subagent definitions
```

At least one must be selected. If none selected, default to `skills`.

## Step 4: Create Directory Structure

Create the plugin directory with selected components:

```
plugins/<name>/
├── skills/<name>/SKILL.md    (if skills selected)
├── hooks/hooks.json           (if hooks selected)
├── hooks/placeholder.sh       (if hooks selected)
├── commands/                   (if commands selected — empty, user fills in)
├── agents/                     (if agents selected — empty, user fills in)
├── README.md
└── LICENSE
```

### Generated SKILL.md (if skills selected)

```markdown
---
name: <plugin-name>
description: "<one-line description — user should update>"
allowed-tools: [Read, Bash, Grep, Glob]
user-invocable: true
---

# <Plugin Name>

TODO: Describe what this skill does and when it triggers.
```

### Generated hooks.json (if hooks selected)

```json
{
  "hooks": [
    {
      "type": "SessionStart",
      "command": "bash plugins/<name>/hooks/placeholder.sh"
    }
  ]
}
```

### Generated placeholder.sh (if hooks selected)

```bash
#!/bin/bash
# <name> plugin — SessionStart hook
# Replace this with your actual hook logic

set -e
echo "<name> plugin loaded."
exit 0
```

Make it executable: `chmod +x plugins/<name>/hooks/placeholder.sh`

### Generated README.md

```markdown
# <name>

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Claude Code](https://img.shields.io/badge/Claude%20Code-Plugin-purple.svg)]()

TODO: Describe your plugin here.

## Installation

```bash
claude plugin install <name>@rube-cc-skills
```

## Usage

TODO: Document usage.

## License

MIT
```

### Generated LICENSE

Use the standard MIT license text with `Copyright (c) 2025 rube-de`.

## Step 5: Register in Marketplace

Read `.claude-plugin/marketplace.json`, add a new entry to the `plugins` array:

```json
{
  "name": "<name>",
  "description": "TODO: Update plugin description (min 10 chars)",
  "version": "1.0.0",
  "source": "./plugins/<name>",
  "category": "<selected-category>",
  "author": {
    "name": "rube-de",
    "url": "https://github.com/rube-de"
  },
  "keywords": ["<name>"]
}
```

**Important**: Remind the user to update the `description` field — the placeholder won't pass schema validation (needs to be meaningful).

## Step 6: Validate

Run the validation script to confirm the new plugin passes all checks:

```bash
bun scripts/validate-plugins.mjs
```

If validation fails, diagnose and fix automatically if possible. Common issues:
- Description too short (< 10 chars) — ask user for a real description
- Name not kebab-case — should have been caught in Step 1

## Step 7: Summary

Present a summary of what was created:

```
✓ Created plugins/<name>/
  ├── skills/<name>/SKILL.md
  ├── hooks/hooks.json + placeholder.sh
  ├── README.md
  └── LICENSE
✓ Registered in .claude-plugin/marketplace.json
✓ Validation passed

Next steps:
1. Edit SKILL.md to define your skill's triggers and behavior
2. Update README.md with documentation
3. Update the description in marketplace.json
4. Run: bun scripts/validate-plugins.mjs
```

## Important Notes

- Do NOT create a per-plugin `plugin.json` — marketplace.json is the SSoT
- Do NOT modify CLAUDE.md or root README.md — those are updated manually or via separate PR
- If the user provides a description during scaffolding, use it in both SKILL.md and marketplace.json
