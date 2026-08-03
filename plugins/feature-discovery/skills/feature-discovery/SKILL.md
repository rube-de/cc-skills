---
name: feature-discovery
description: >-
  Discover what to build next across a whole product: fan out parallel agents to
  map the current repo into a feature inventory, research competitors, ideate
  across seven value lenses, dedup and shortlist, spec and adversarially validate
  the winners, then synthesize a ranked roadmap. Distinct from brainstorm, which
  goes deep on one feature - this goes wide and returns a ranked roadmap of many
  candidates. Heavyweight: runs a deterministic multi-agent Workflow of roughly
  35-40 sub-agents at exhaustive depth. Use when the user asks what to build next,
  wants feature ideas, a roadmap or gap analysis, a competitor analysis, "what are
  we missing", or "where can we add value". For a casual "give me three ideas",
  answer directly instead of invoking this.
user-invocable: true
argument-hint: "[product one-liner] [scope: internal|competitor|mixed] [depth: quick|exhaustive]"
compatibility: "Requires the Workflow tool (multi-agent orchestration). Invoking this skill opts into a heavyweight fan-out of up to ~40 sub-agents at exhaustive depth."
allowed-tools:
  - Workflow
  - Artifact
  - Write
  - Read
  - AskUserQuestion
metadata:
  author: rube-de
  version: "1.0.0"
---

# Feature discovery

Turns "what should we build next?" into a grounded, ranked roadmap by fanning out
many agents instead of one agent guessing. The whole run is a deterministic
Workflow script, so every invocation follows the same pipeline rather than being
re-improvised.

**Distinct from `brainstorm`.** `pm:brainstorm` goes deep on one known-ish feature
(interactive Q&A, a single spec doc). This goes wide across the whole product and
returns a ranked roadmap of many candidate features. Reach for brainstorm to design
*how* to build a chosen feature; reach for this to discover *what* to build.

## When this fits

Use it when the user wants ideas that are researched, deduped, specced, and
pressure-tested, not a quick off-the-cuff list. It is deliberately heavyweight
(roughly 35-40 agents at exhaustive depth), so for a casual "give me three ideas"
just answer directly.

## The pipeline (what the script runs)

The Workflow engine runs five phases - you do not run these yourself, the engine
does (see
[scripts/feature-discovery.workflow.js](scripts/feature-discovery.workflow.js)):

- **Ground** - one agent maps the current product from the repo (entry points,
  routes, data models, content, services, config, docs); in parallel a planner
  proposes competitor segments and one analyst researches each via web search. The
  product is always mapped, even in `internal` scope, so ideation never re-proposes
  what exists.
- **Ideate** - one agent per value lens (discoverability, core value, UX,
  monetization, engagement, trust, information architecture), each grounded in the
  inventory and competitor findings, each forbidden from proposing anything that
  already exists.
- **Shortlist** - a single curator merges duplicates, drops the trivial and the
  already-built, ranks by value-to-effort, and picks the top 8-12.
- **Spec & Validate** - a pipeline per feature: spec it, then an adversarial
  skeptic scores novelty, real value, feasibility in the current architecture,
  competitor precedent, and maintenance burden, returning build / maybe / drop with
  a confidence score.
- **Synthesize** - one agent writes the final Markdown report: exec summary, gaps
  (internal and versus competitors), a ranked roadmap table, full specs for the
  build/maybe features, dropped ideas with reasons, and a quick-wins-vs-bigger-bets
  split.

## Steps

1. Determine `product`, `scope` (default `mixed`), and `depth` (default
   `exhaustive`) from the user's request. If the user gave none and the intent is
   clearly the full run, default to a repo-mapped product with `mixed` +
   `exhaustive`; otherwise ask for the three values before launching.
2. Invoke the **Workflow** tool pointed at the bundled script by its plugin path.
   Do not paste the script inline - use its path so the persisted version stays the
   source of truth:
   ```
   Workflow({
     scriptPath: "${CLAUDE_SKILL_DIR}/scripts/feature-discovery.workflow.js",
     args: { product: "one-line description of your product", scope: "mixed", depth: "exhaustive" }
   })
   ```
   It runs in the background and returns `{ report, meta, counts }`, where `report`
   is finished Markdown.
3. If the result has an `error` key - currently `invalid-args`, `product-mapping-failed`,
   `empty-ideation`, `empty-shortlist`, `empty-validated-results`, or `synthesis-failed`,
   though the script may add others later - treat it as a failed run: say so plainly
   with the error code and offer to rerun. Any `error` key short-circuits processing;
   never extract `report` or `counts` from an error result, including codes not listed
   here.
4. Lead in chat with the executive summary and the ranked roadmap table from
   `report`, then report the `counts` funnel (raw ideas / shortlisted / specced) so
   the user can see how the funnel narrowed.
5. Offer to render the full `report` as an **Artifact** for readability.
6. Offer to save the full `report` to `.dev/feature-discovery/<date>-roadmap.md`
   with `Write` (create the directory if needed; never write under `.claude/`).
   Treat the report as a working artifact - do not write it unless the user asks.

### Parameters (`args`)

| key       | values                                | default            | effect |
|-----------|---------------------------------------|--------------------|--------|
| `product` | free text                             | (mapped from repo) | One-line description of the product. If omitted, the mapper infers it from the code, README, and docs. |
| `scope`   | `mixed` \| `internal` \| `competitor` | `mixed`            | Where ideas come from. `internal` skips competitor research; `competitor` still maps the product but tells ideators to hunt for capabilities rivals have that it lacks. |
| `depth`   | `exhaustive` \| `quick`               | `exhaustive`       | `exhaustive` = 4 competitor tracks, 7 lenses, top 8-12. `quick` = 2 tracks, 4 lenses, top 5-6, for a faster first pass. |

## Extending

The lens list (`ALL_LENSES`) lives at the top of the script; add or reword entries
to change ideation coverage. Competitor segments are planned dynamically from the
product, so no market list is hardcoded. The phase wiring and schemas do not need
to change.

## Credit

Ported from the open-source
[feature-discovery-skill](https://github.com/fabianhug/feature-discovery-skill) by
Fabian Hug (0xfabs), MIT licensed. The Workflow engine
(`scripts/feature-discovery.workflow.js`) is kept verbatim; only the packaging,
frontmatter, script path, and result handling were adapted for this marketplace.
