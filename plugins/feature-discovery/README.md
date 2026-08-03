# feature-discovery

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Claude Code](https://img.shields.io/badge/Claude%20Code-Plugin-purple.svg)](https://docs.anthropic.com/en/docs/claude-code)

Turns "what should we build next?" into a researched, ranked roadmap instead of one
agent guessing. Fans out a deterministic multi-agent Workflow that maps the current
product from its repo, researches competitors, ideates across seven value lenses,
dedups and shortlists, then specs and adversarially validates the winners. Every
idea traces to a concrete product gap or a named competitor feature.

> **Distinct from `pm:brainstorm`.** Brainstorm goes deep on one feature; this goes
> wide across the whole product and returns a ranked roadmap of many candidates.

## Prerequisite

Requires the **Workflow** tool (multi-agent orchestration). Invoking the skill is
your opt-in to a heavyweight fan-out of roughly 35-40 sub-agents at exhaustive
depth. If the Workflow tool is unavailable in your environment, the skill cannot
run. For `scope: competitor` or `mixed` runs, your session also needs `WebSearch`
and `WebFetch` available - Workflow sub-agents run in the background and can't
prompt for tool approval, so competitor research fails loudly (`competitor-research-failed`)
rather than silently if those tools aren't pre-approved.

## Installation

```bash
claude plugin install feature-discovery@rube-cc-skills
```

## Usage

Run it with `/feature-discovery`, or just ask what to build next. The skill maps
the repo in the current working directory, so run it from the product's codebase.

### Example Triggers

- "What should we build next?"
- "Do a gap analysis and competitor analysis for this product"
- "What are we missing / where can we add value?"
- "Ideate features across the whole product and spec the best ones"

### Pipeline

| Phase | What happens |
|-------|--------------|
| Ground | Map the current product from the repo; plan competitor segments and research each via web search |
| Ideate | One agent per value lens, forbidden from proposing anything that already exists |
| Shortlist | A curator dedups, drops the trivial and already-built, ranks by value-to-effort |
| Spec & Validate | Spec each finalist, then an adversarial skeptic returns build / maybe / drop with a confidence score |
| Synthesize | A single ranked-roadmap Markdown report: exec summary, gaps, roadmap table, full specs, dropped ideas |

### Args

| key | values | default | effect |
|-----|--------|---------|--------|
| `product` | free text one-liner | mapped from the repo | Description of the product; inferred from code/README/docs if omitted |
| `scope` | `mixed` \| `internal` \| `competitor` | `mixed` | `internal` skips competitor research; `competitor` hunts for capabilities rivals have |
| `depth` | `exhaustive` \| `quick` | `exhaustive` | `exhaustive` = 4 competitor tracks, 7 lenses, top 8-12. `quick` = 2 tracks, 4 lenses, top 5-6 |

## Caveat

35-40 agents at full depth. It is for when you sit down to plan the next chunk of
work, not a ten-times-a-day tool. For three quick ideas, ask an agent directly. Use
`depth: quick` for a faster, cheaper first pass.

## Credit

Ported from the open-source
[feature-discovery-skill](https://github.com/fabianhug/feature-discovery-skill) by
Fabian Hug ([0xfabs](https://x.com/0xfabs)), MIT licensed. The Workflow engine is
kept verbatim; the packaging, frontmatter, script path, and result handling were
adapted for this marketplace.

## License

MIT
