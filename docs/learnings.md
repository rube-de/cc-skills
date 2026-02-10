# Learnings from Developing Skills & Plugins

Hard-won lessons from building and debugging Claude Code skills and plugins.

---

## Skill Authoring

> Source: [Claude Code — Skills](https://code.claude.com/docs/en/skills) — official skill authoring guide covering SKILL.md frontmatter, reference file linking, and context modes
> Source: [Agent Skills Specification](https://agentskills.io/specification) — open spec for portable agent skills (SKILL.md format, frontmatter schema, tool permissions)

### Reference files must be explicitly loaded

Claude Code skills use markdown links (`[name](path)`) to reference companion files — but **the model only reads them if the skill text issues an imperative directive**.

**Bad** — passive, treated as FYI:
```markdown
See [WORKFLOW.md](references/WORKFLOW.md) for the posting format.
```

**Good** — imperative, specifies *when* and *what*:
```markdown
**Read [references/WORKFLOW.md](references/WORKFLOW.md) now** and follow its posting format exactly.
```

Per the official docs, you must tell Claude both **what** a file contains and **when** to load it. Omitting either causes the model to skip the file and guess.

> `@file` syntax only works in `CLAUDE.md` — skills use standard markdown links.

> Source: [Claude Code — Skills](https://code.claude.com/docs/en/skills) — see "Reference files" section on link syntax and loading directives

### Defense-in-depth for critical formatting

If a skill depends on a specific output format (tags, templates, structure), surface the critical rules **inline in SKILL.md** in addition to the reference file. This way, even if the model skips the reference, the essential format is visible in context.

Frame inline rules as **reinforcement**, not fallback — saying "if you cannot read the file" gives the model an excuse to skip it.

> Source: Learned from [`jules-review` fix](../plugins/jules-review/skills/jules-review/SKILL.md) — model skipped `WORKFLOW.md` and invented its own format, producing wrong `@jules` tags

### Directive placement matters

Place read directives at **two points**:
1. **Top of the skill** (after the intro) — sets expectations early
2. **At the step that needs it** — triggers loading at the right moment

A single directive at the bottom of a long skill is easily lost in context.

> Source: Observed in [`jules-review` SKILL.md](../plugins/jules-review/skills/jules-review/SKILL.md) — single passive reference at line 144 was consistently skipped; adding a second directive at line 20 fixed it. Pattern also used in [`cdt` skill](../plugins/cdt/skills/cdt/SKILL.md) (line 23).

---

## Agent Teams

> Source: [Claude Code — Agent Teams](https://code.claude.com/docs/en/agent-teams) — multi-agent orchestration, subagent definitions, and team coordination patterns

*Learnings to be added as the [`cdt` plugin](../plugins/cdt/) matures.*

---

## Plugin Structure

> Source: [Claude Code — Plugins](https://code.claude.com/docs/en/plugins) — official plugin architecture, `marketplace.json` schema, hook lifecycle, and distribution model

### Validation catches drift early

Always run `bun scripts/validate-plugins.mjs` after any file move or rename. It catches:
- Orphaned plugin directories not registered in `marketplace.json`
- Missing `SKILL.md` files or invalid frontmatter
- Source path mismatches

> Source: [`scripts/validate-plugins.mjs`](../scripts/validate-plugins.mjs) — see also CI config in [`.github/workflows/`](../.github/workflows/)

### Marketplace is the single source of truth

All plugin metadata lives in `.claude-plugin/marketplace.json`. Don't duplicate version numbers, descriptions, or tool lists elsewhere — they'll drift.

> Source: [`.claude-plugin/marketplace.json`](../.claude-plugin/marketplace.json) — validated against [`marketplace.schema.json`](../scripts/marketplace.schema.json)

---

## Common Pitfalls

| Pitfall | Symptom | Fix |
|---------|---------|-----|
| Passive reference links | Model ignores reference file, guesses format | Use imperative "Read X now" directives |
| `@file` in SKILL.md | Reference silently ignored | Use markdown links `[name](path)` instead |
| Single directive at bottom | Model forgets by the time it reaches the step | Add directive both at top and at the relevant step |
| Fallback framing | Model skips file, uses "fallback" path | Frame inline rules as reinforcement, not fallback |
| Manual version edits | Conflicts with semantic-release | Never edit versions — CI handles it |

> Sources for pitfalls table: [AGENTS.md](../AGENTS.md) (conventions section), [Plugin Authoring guide](PLUGIN-AUTHORING.md), [Claude Code Skills docs](https://code.claude.com/docs/en/skills)
