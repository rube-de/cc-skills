# plugin-dev

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Skills](https://img.shields.io/badge/Skills-1-blue.svg)]()
[![Commands](https://img.shields.io/badge/Commands-1-green.svg)]()
[![Claude Code](https://img.shields.io/badge/Claude%20Code-Plugin-purple.svg)]()
[![Install](https://img.shields.io/badge/Install-Plugin%20%7C%20Skill-informational.svg)]()

Plugin development tools for the cc-skills marketplace: scaffold new plugins, validate SKILL.md frontmatter, and audit hooks for silent failures.

## Features

| Tool | Type | What it does |
|------|------|-------------|
| `/plugin-dev:create` | Command | Interactive scaffolding — creates directory structure, SKILL.md, marketplace entry |
| `bun scripts/validate-plugins.mjs` | Script | Validates schema, source paths, orphans, and SKILL.md frontmatter |
| `bash plugins/plugin-dev/scripts/audit-hooks.sh` | Script | Detects silent failure patterns in hook/script files |

## Installation

### As Plugin (recommended)

```bash
claude plugin install plugin-dev@rube-cc-skills
```

### As Skill (validation + audit only, no `/plugin-dev:create` command)

```bash
npx skills add rube-de/cc-skills --skill plugin-dev
```

## Usage

### Scaffold a New Plugin

```
/plugin-dev:create my-new-plugin
```

Walks you through category selection, component choice, and generates the full directory structure with marketplace registration.

### Validate All Plugins

Inside Claude Code, say "validate plugins" or run directly:

```bash
bun scripts/validate-plugins.mjs
```

Checks:
- marketplace.json schema conformance
- Source paths exist
- No orphaned directories
- SKILL.md frontmatter: `name` (kebab-case), `description` (non-empty)
- Every plugin has at least one component dir

### Audit Hooks

Inside Claude Code, say "hook audit" or run directly:

```bash
bash plugins/plugin-dev/scripts/audit-hooks.sh
```

Detects:
- Shell: `mkdir`/`cp`/`mv`/`rm` without error handling (no `set -e`)
- Python: bare `except: pass` or `except Exception: pass`
- Optional ShellCheck integration

## License

MIT
