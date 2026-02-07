---
name: plugin-dev
description: "Validate plugin SKILL.md frontmatter and audit hook scripts for silent failures. Run validation to check all plugins pass schema, source path, and frontmatter checks. Run hook audit to detect unhandled errors in shell and Python scripts."
allowed-tools: [Read, Bash, Grep, Glob]
user-invocable: true
---

# Plugin Development Tools

On-demand validation and hook auditing for the cc-skills marketplace.

## Triggers

Use this skill when the user says: "validate plugins", "check plugin", "hook audit", "validate skills", "audit hooks", "check skill frontmatter", "plugin validation".

## Available Tools

### 1. Plugin Validation

Validates all registered plugins: JSON Schema, source paths, orphan detection, and SKILL.md frontmatter.

```bash
bun scripts/validate-plugins.mjs
```

**What it checks:**
- marketplace.json conforms to JSON Schema
- All plugin `source` paths exist on disk
- No orphaned plugin directories (dirs without marketplace entries)
- SKILL.md frontmatter has valid `name` (kebab-case) and non-empty `description`
- Every plugin has at least one component directory (skills/, hooks/, commands/, agents/)

### 2. Hook Audit

Scans hook and script files for silent failure patterns.

```bash
bash plugins/plugin-dev/scripts/audit-hooks.sh
```

**What it checks:**
- Shell scripts (`.sh`): `mkdir`/`cp`/`mv`/`rm` without error handling (unless `set -e` is active)
- Python scripts (`.py`): bare `except: pass` or `except Exception: pass`
- Optional: ShellCheck integration (skipped with message if not installed)

**Exit codes:** 0 = clean, 1 = findings

## Workflow

When the user asks to validate or audit:

1. Run `bun scripts/validate-plugins.mjs` for plugin validation
2. Run `bash plugins/plugin-dev/scripts/audit-hooks.sh` for hook auditing
3. Report results clearly — separate passing checks from failures
4. For failures, suggest specific fixes

## Scaffolding

To scaffold a new plugin interactively, use the command:

```
/plugin-dev:create [plugin-name]
```

This is a separate slash command — not part of this skill.
