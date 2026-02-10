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

> Source: Observed in [`jules-review` SKILL.md](../plugins/jules-review/skills/jules-review/SKILL.md) — a single passive reference near the end of the file was consistently skipped; adding a second directive near the top fixed it. Pattern also used in the setup section of the [`cdt` skill](../plugins/cdt/skills/cdt/SKILL.md).

### Multi-skill plugins: shared references via relative paths

When a plugin has multiple sibling skills that share reference files (templates, format specs), put the references under the **router skill's** `references/` directory and reference them from siblings via relative paths:

```
plugins/dlc/
├── skills/
│   ├── dlc/              ← router skill
│   │   ├── SKILL.md
│   │   └── references/   ← shared references live here
│   │       ├── ISSUE-TEMPLATE.md
│   │       └── REPORT-FORMAT.md
│   ├── security/
│   │   └── SKILL.md      ← uses ../dlc/references/ISSUE-TEMPLATE.md
│   └── quality/
│       └── SKILL.md      ← uses ../dlc/references/ISSUE-TEMPLATE.md
```

This keeps shared format definitions centralized while each skill remains self-contained. The `../dlc/references/` relative path convention works for all sibling skills at the same depth.

> Source: [`dlc` plugin](../plugins/dlc/) — first multi-skill plugin with shared references across 5 domain-specific skills. Pattern modeled on `council` (multi-skill) + `jules-review` (reference file directives).

### Defense-in-depth applies to data classification, not just output format

The defense-in-depth pattern (inline critical rules as reinforcement) isn't limited to output templates. It also applies to **severity mappings** and **data classification rules**. Each DLC check skill inlines its own severity mapping table even though `REPORT-FORMAT.md` defines the canonical structure — because the model may not load the reference at classification time.

> Source: [`dlc` check skills](../plugins/dlc/skills/) — each skill has a "Severity mapping (reinforced here for defense-in-depth)" section with domain-specific severity criteria inlined.

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

## Shell Code in Skills

### Never chain CLI tools with `||` for fallback selection

Skills often include bash code blocks that agents execute. A common mistake is using `||` to "try tool A, fall back to tool B":

**Bad** — `||` triggers fallback on *any* non-zero exit, including "tool found issues":
```bash
npm audit --json 2>/dev/null || bun audit 2>/dev/null
eslint . --format=json 2>/dev/null || biome check . --reporter=json 2>/dev/null
```

CLI tools like `npm audit`, `eslint`, `pytest`, and `cargo clippy` exit non-zero when they **successfully find problems** — the same exit code as "tool not installed." Chaining with `||` conflates both cases, causing double runs, mixed output, and lost findings.

**Good** — select tool by availability, allow non-zero exits:
```bash
if command -v eslint >/dev/null 2>&1; then
  eslint . --format=json 2>/dev/null
elif command -v biome >/dev/null 2>&1; then
  biome check . --reporter=json 2>/dev/null
fi
```

This separates "is the tool installed?" from "did the tool find problems?" and ensures only one tool runs.

Also watch for:
- **`grep` portability**: `\s` isn't POSIX — use `[[:space:]]`; brace expansion (`*.{ts,js}`) doesn't work in `--include` — use separate `--include` flags
- **Unguarded command sequences**: listing multiple commands without `if`/`elif` causes the agent to run all of them, not just the first match

> Source: [PR #40](https://github.com/rube-de/cc-skills/pull/40) — Copilot review caught this across 4 DLC skills (`security`, `quality`, `test`, `perf`). All fixed with `command -v` selection pattern.

---

## Common Pitfalls

| Pitfall | Symptom | Fix |
|---------|---------|-----|
| Passive reference links | Model ignores reference file, guesses format | Use imperative "Read X now" directives |
| `@file` in SKILL.md | Reference silently ignored | Use markdown links `[name](path)` instead |
| Single directive at bottom | Model forgets by the time it reaches the step | Add directive both at top and at the relevant step |
| Fallback framing | Model skips file, uses "fallback" path | Frame inline rules as reinforcement, not fallback |
| Manual version edits | Conflicts with semantic-release | Never edit versions — CI handles it |
| `\|\|` chaining for tool fallback | Double runs, mixed output when primary tool finds issues | Use `command -v` to select tool by availability |
| `\s` in grep patterns | No match on POSIX grep | Use `[[:space:]]` instead |
| Brace expansion in `--include` | grep ignores the filter silently | Use separate `--include` flags per extension |

> Sources for pitfalls table: [AGENTS.md](../AGENTS.md) (conventions section), [Plugin Authoring guide](PLUGIN-AUTHORING.md), [Claude Code Skills docs](https://code.claude.com/docs/en/skills), [PR #40](https://github.com/rube-de/cc-skills/pull/40)
