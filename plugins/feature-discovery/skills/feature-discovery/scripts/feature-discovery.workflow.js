// The Workflow harness statically extracts this `meta` object from source text
// and executes the rest of this file's body inside its own async wrapper - it
// does not load this file as a plain Node ES module. The `export` keyword below
// and the top-level `await`/`return` further down are both legal only under
// that harness-specific execution model, not under `node script.js`.
export const meta = {
  name: 'feature-discovery',
  description:
    'Exhaustive multi-agent discovery of new value-adding features for a product: map the current product from its repo, research competitors, ideate across product lenses, dedup and shortlist, spec and adversarially validate the winners, then synthesize a ranked roadmap.',
  phases: [
    { title: 'Ground' },
    { title: 'Ideate' },
    { title: 'Shortlist' },
    { title: 'Spec & Validate' },
    { title: 'Synthesize' },
  ],
}

// ---------------------------------------------------------------------------
// Parameters (passed via the Workflow tool's `args`)
//   product: string  - one-line description of the product. Optional; if
//                      omitted, agents infer it from the current repository.
//   scope:   'mixed' | 'internal' | 'competitor'   (default 'mixed')
//   depth:   'exhaustive' | 'quick'                 (default 'exhaustive')
// The product is ALWAYS mapped first regardless of scope, because ideation
// must know what already exists to avoid re-proposing it. `scope` controls
// whether competitor research runs and where ideators look for gaps.
// ---------------------------------------------------------------------------
// `args` can cross the Workflow tool boundary as an already-parsed object or as
// a JSON string (harness-dependent). Normalize to an object so scope/depth are
// honored rather than silently falling back to the expensive exhaustive default.
const isPlainArgsObject = (v) => typeof v === 'object' && v !== null && !Array.isArray(v)

const parsedArgs =
  typeof args === 'string'
    ? (() => { try { return { ok: true, value: JSON.parse(args) } } catch { return { ok: false } } })()
    : { ok: true, value: typeof args === 'undefined' ? {} : args }

if (!parsedArgs.ok) {
  return { error: 'invalid-args', reason: 'malformed-json-args' }
}
if (!isPlainArgsObject(parsedArgs.value)) {
  return { error: 'invalid-args', reason: 'args-not-an-object' }
}
const ARGS = parsedArgs.value
const productInput = ARGS.product === undefined ? '' : ARGS.product
if (typeof productInput !== 'string') {
  return { error: 'invalid-args', reason: 'invalid-product' }
}
const product = productInput.trim()

const VALID_SCOPES = ['mixed', 'internal', 'competitor']
const VALID_DEPTHS = ['exhaustive', 'quick']
const scopeInput = ARGS.scope === undefined ? 'mixed' : ARGS.scope
const depthInput = ARGS.depth === undefined ? 'exhaustive' : ARGS.depth
const rawScope = typeof scopeInput === 'string' ? scopeInput.trim().toLowerCase() : ''
const rawDepth = typeof depthInput === 'string' ? depthInput.trim().toLowerCase() : ''
if (!VALID_SCOPES.includes(rawScope) || !VALID_DEPTHS.includes(rawDepth)) {
  return {
    error: 'invalid-args',
    allowed: { scope: VALID_SCOPES, depth: VALID_DEPTHS },
    received: { scope: ARGS.scope, depth: ARGS.depth },
  }
}
const scope = rawScope
const depth = rawDepth

const includeCompetitors = scope !== 'internal'

const PRODUCT = product
  ? `The product is: ${product}.`
  : 'The product is the one built in the current repository; infer what it is from the code, README, and docs.'

const CONTEXT = `${PRODUCT} Its source code is the current working directory. Map what it does from the repo: entry points and routes, data models, content, services, config, and docs. If a connected MCP server or CLI exposes live product data, you may make read-only calls to inspect real usage - never call anything that creates, modifies, deletes, or sends.`

const ALL_LENSES = [
  { key: 'discoverability', name: 'Discoverability & acquisition', brief: 'how people and AI agents find the product and its content: search, SEO, structured data, machine-readable surfaces, integrations, shareable and programmatic access.' },
  { key: 'core-value', name: 'Core value & depth', brief: 'the richness, completeness, and freshness of the product\'s core objects and the primary workflows built on them.' },
  { key: 'user-ux', name: 'User & contributor UX', brief: 'onboarding, the core task flows, editing and correction, and how data or content stays up to date.' },
  { key: 'monetization', name: 'Monetization & sustainability', brief: 'ethical, non-annoying ways the product can fund itself: subscriptions, usage tiers, sponsorship, paid placement, pro access.' },
  { key: 'engagement', name: 'Engagement & retention', brief: 'reasons for users to return: accounts, notifications, digests, collections, collaboration, following.' },
  { key: 'trust', name: 'Trust, quality & credibility', brief: 'how the product earns trust: verification, moderation, provenance, ratings, transparency about data and sources.' },
  { key: 'ia-nav', name: 'Information architecture & navigation', brief: 'how content and features are organized and traversed: filtering, faceting, related-entity links, comparison, cross-surface flows.' },
]

const LENSES = depth === 'quick' ? ALL_LENSES.slice(0, 4) : ALL_LENSES
const SEGMENT_COUNT = depth === 'quick' ? 2 : 4
const SHORTLIST_TARGET = depth === 'quick' ? '5-6' : '8-12'
const SHORTLIST_MAX = depth === 'quick' ? 6 : 12

// Of the large collection payloads re-embedded into downstream prompts
// (inventory, competitor research, raw ideas, specced results), only
// competitor research is bounded. Inventory is a single reused object that
// doesn't grow with fan-out (see below), and ideas/specced-features are
// ranked/selected collections where character-slicing would silently drop
// candidates - see docs/learnings.md. Competitor research is the one
// collection that both grows with fan-out (segment count) and isn't itself a
// ranked/selected output, so it's the one that needs a budget.
const MAX_CONTEXT_CHARS = 12000

// competitorResults is one entry per researched segment - unlike inventory
// (a single object), it genuinely grows with segment count, so it still needs
// a budget. But bounding the whole serialized array as one string means later
// segments can be entirely excluded once earlier ones consume the budget,
// while hasCompetitorData/competitorCount are computed from the full,
// untruncated data - silently reporting success while omitting whole tracks.
// Split the budget evenly per segment instead, so every segment keeps at
// least a proportional share of representation. Within a segment that still
// exceeds its share, drop whole competitor records from the tail rather than
// slicing the JSON string, so every record that reaches the prompt is
// complete and parseable instead of cut off mid-record. A single competitor
// can still exceed the entire per-segment budget on its own - compact it
// rather than dropping it wholesale, so a genuinely substantive competitor
// doesn't vanish from every downstream prompt while hasCompetitorData/coverage
// (computed from the unbounded results) keep reporting the track as usable.
// Capping array length alone doesn't bound total size if individual strings
// are long, so every string field is also capped - this gives a fixed,
// calculable worst-case size per compacted competitor (well under any
// realistic perSegmentBudget) instead of another size-dependent edge case.
const MAX_FIELD_CHARS = 200
const truncateField = (s) => (typeof s === 'string' && s.length > MAX_FIELD_CHARS ? `${s.slice(0, MAX_FIELD_CHARS)}...` : s)
// Reconstructed explicitly from only the known COMPETITOR_SCHEMA item fields
// (same reasoning as the segment wrapper below) - COMPETITOR_SCHEMA doesn't
// forbid additional properties on a competitor, so spreading `...c` back in
// would leave any oversized extra field completely uncapped regardless of
// how well the known fields are truncated.
const compactCompetitor = (c) => {
  // Blindly slicing the first 3 entries can drop the only nonblank one if it
  // isn't among them (e.g. ["", " ", "", "actual capability"]) - the same
  // hasSubstance check downstream still sees the full unbounded array and
  // reports the track as usable, while compaction silently kept only filler.
  // Prioritize nonblank entries so real evidence survives capping first.
  const isSubstantive = (s) => typeof s === 'string' && s.trim().length > 0
  const cap = (arr) => {
    const list = arr || []
    const substantive = list.filter(isSubstantive)
    const filler = list.filter((s) => !isSubstantive(s))
    return [...substantive, ...filler].slice(0, 3).map(truncateField)
  }
  return { name: truncateField(c.name), url: truncateField(c.url), whatItIs: truncateField(c.whatItIs), notableFeatures: cap(c.notableFeatures), lessonsForUs: cap(c.lessonsForUs) }
}
const boundedCompetitorJson = (results) => {
  if (!results.length) return '[]'
  const perSegmentBudget = Math.max(1, Math.floor(MAX_CONTEXT_CHARS / results.length))
  return `[${results.map((r) => {
    const full = JSON.stringify(r)
    if (full.length <= perSegmentBudget) return full
    const competitors = (r && r.competitors) || []
    // Greedily filling in original order lets an early name-only record
    // (hasSubstance below is defined later, but resolved at call time - safe
    // since boundedCompetitorJson is only ever called after Ground) consume
    // the budget before a later substantive one is reached, even though the
    // track has real evidence. Pack substantive competitors first (stable
    // sort preserves original order within each group) so a track that has
    // any substance at all is more likely to actually surface some.
    const ordered = [...competitors].sort((a, b) => (hasSubstance(b) ? 1 : 0) - (hasSubstance(a) ? 1 : 0))
    const kept = []
    let used = 0
    for (const c of ordered) {
      const candidate = JSON.stringify(c).length > perSegmentBudget ? compactCompetitor(c) : c
      const size = JSON.stringify(candidate).length + 1
      if (used + size > perSegmentBudget) break
      kept.push(candidate)
      used += size
    }
    // Spreading `...r` back in preserves competitors' bound but leaves every
    // OTHER field on the wrapper (e.g. `segment`, or any additional
    // schema-allowed property) completely unbounded - a single oversized
    // `segment` string alone can blow the budget regardless of how well
    // `competitors` is capped. Rebuild explicitly from only the known,
    // capped fields instead of spreading whatever the agent returned.
    return JSON.stringify({ segment: truncateField(r && r.segment), competitors: kept })
  }).join(', ')}]`
}

// ---- Schemas --------------------------------------------------------------
const INVENTORY_SCHEMA = {
  type: 'object',
  properties: {
    features: { type: 'array', items: { type: 'object', properties: { name: { type: 'string' }, description: { type: 'string' }, files: { type: 'array', items: { type: 'string' } } }, required: ['name', 'description'] } },
    dataTypes: { type: 'array', items: { type: 'object', properties: { name: { type: 'string' }, fields: { type: 'array', items: { type: 'string' } }, notes: { type: 'string' } }, required: ['name'] } },
    interfaces: { type: 'array', items: { type: 'string' } },
    gaps: { type: 'array', items: { type: 'string' } },
  },
  required: ['features', 'gaps'],
}

const SEGMENTS_SCHEMA = {
  type: 'object',
  properties: {
    segments: { type: 'array', minItems: SEGMENT_COUNT, maxItems: SEGMENT_COUNT, items: { type: 'object', properties: {
      key: { type: 'string' }, focus: { type: 'string' }, angle: { type: 'string' },
    }, required: ['key', 'focus'] } },
  },
  required: ['segments'],
}

const COMPETITOR_SCHEMA = {
  type: 'object',
  properties: {
    segment: { type: 'string' },
    competitors: { type: 'array', items: { type: 'object', properties: {
      name: { type: 'string' }, url: { type: 'string' }, whatItIs: { type: 'string' },
      notableFeatures: { type: 'array', items: { type: 'string' } },
      lessonsForUs: { type: 'array', items: { type: 'string' } },
    }, required: ['name', 'whatItIs'] } },
  },
  required: ['competitors'],
}

// maxItems bounds ideas per lens at the source - unlike allIdeas/clean
// (ranked/selected collections downstream that must never be
// character-truncated, see docs/learnings.md), this caps how many ideas a
// single ideator can generate in the first place, so the curator's prompt
// can't be blown up by one over-eager lens without ever needing to drop an
// already-generated candidate.
const MAX_IDEAS_PER_LENS = 10
const IDEAS_SCHEMA = {
  type: 'object',
  properties: {
    ideas: { type: 'array', maxItems: MAX_IDEAS_PER_LENS, items: { type: 'object', properties: {
      title: { type: 'string' }, description: { type: 'string' }, lens: { type: 'string' },
      valueHypothesis: { type: 'string' }, evidence: { type: 'string' }, effort: { type: 'string', enum: ['S', 'M', 'L'] },
    }, required: ['title', 'description', 'lens', 'valueHypothesis', 'evidence', 'effort'] } },
  },
  required: ['ideas'],
}

const SHORTLIST_SCHEMA = {
  type: 'object',
  properties: {
    features: { type: 'array', maxItems: SHORTLIST_MAX, items: { type: 'object', properties: {
      title: { type: 'string' }, description: { type: 'string' }, value: { type: 'string' },
      effort: { type: 'string' }, evidence: { type: 'string' },
    }, required: ['title', 'description', 'value', 'effort', 'evidence'] } },
  },
  required: ['features'],
}

const SPEC_SCHEMA = {
  type: 'object',
  properties: {
    title: { type: 'string' }, problem: { type: 'string' }, solution: { type: 'string' },
    userValue: { type: 'string' }, architectureFit: { type: 'string' },
    scope: { type: 'array', minItems: 1, items: { type: 'string', pattern: '\\S' } },
    successMetrics: { type: 'array', minItems: 1, items: { type: 'string', pattern: '\\S' } },
    openQuestions: { type: 'array', items: { type: 'string' } },
  },
  required: ['title', 'problem', 'solution', 'userValue', 'architectureFit', 'scope', 'successMetrics', 'openQuestions'],
}

const VERDICT_SCHEMA = {
  type: 'object',
  properties: {
    verdict: { type: 'string', enum: ['build', 'maybe', 'drop'] },
    confidence: { type: 'number', minimum: 1, maximum: 10 },
    objections: { type: 'array', minItems: 1, items: { type: 'string', pattern: '\\S' } },
    refinements: { type: 'array', items: { type: 'string' } },
  },
  required: ['verdict', 'confidence', 'objections', 'refinements'],
}

// ---- Phase 1: Ground ------------------------------------------------------
phase('Ground')
log(`scope=${scope}, depth=${depth} - mapping the product${includeCompetitors ? ` + planning ${SEGMENT_COUNT} competitor tracks` : ''}`)

const groundThunks = [
  () => agent(
    `${CONTEXT}\n\nYou are the PRODUCT-MAPPER. Explore this repository thoroughly: entry points and routes, components, the data and content files and their shapes, services, any externally callable interfaces (HTTP APIs, MCP tools, CLIs), config, and docs. Produce a precise inventory of what the product does TODAY: every user-facing feature or surface, every content/data type and its fields, every callable interface, and any obvious gaps, rough edges, or half-finished areas you notice. Cite concrete file paths.`,
    { label: 'map:current-product', phase: 'Ground', schema: INVENTORY_SCHEMA },
  ),
]
if (includeCompetitors) {
  groundThunks.push(() => agent(
    `${CONTEXT}\n\nYou are the SEGMENT PLANNER. Based on what this product is, propose ${SEGMENT_COUNT} distinct competitor or market segments worth researching to find features this product could adopt. Cover different angles: direct competitors, adjacent tools, best-in-class examples of a specific capability, and how modern products in this space expose themselves to AI agents. For each segment return a short key, a focus (what kinds of products or sites to research), and the angle to study them from.`,
    { label: 'plan:competitor-segments', phase: 'Ground', schema: SEGMENTS_SCHEMA },
  ))
}

const ground = await parallel(groundThunks)
const inventory = ground[0]
if (!inventory || !inventory.features || !inventory.features.length) {
  log('Product mapping failed or returned no features - cannot ground ideation. Aborting.')
  return { error: 'product-mapping-failed' }
}

const segments = includeCompetitors && ground[1] && ground[1].segments ? ground[1].segments : []
if (includeCompetitors && !segments.length) {
  if (scope === 'competitor') {
    log('Segment planner returned nothing for a competitor-focused run - aborting rather than reporting on missing competitor data.')
    return { error: 'competitor-research-failed' }
  }
  log('Segment planner returned nothing - proceeding without competitor research.')
}

const competitorResults = segments.length
  ? (await parallel(segments.map((seg) => () => agent(
      `${CONTEXT}\n\nYou are a COMPETITOR ANALYST focused on: ${seg.focus}. Use WebSearch and WebFetch to research real, current products and sites in this segment. For each, capture what it is, its URL, the notable features or content that make it valuable, how it handles ${seg.angle || 'its core job'}, and what this product could learn or adopt. Prioritize concrete, verifiable features over generic advice.`,
      { label: `competitor:${seg.key}`, phase: 'Ground', schema: COMPETITOR_SCHEMA },
    )))).filter(Boolean)
  : []

// A truthy per-segment result can still carry zero competitors (the schema
// allows `{ competitors: [] }`), so count the flattened total rather than just
// how many analyst calls returned something. Only `name`+`whatItIs` are
// schema-required, so a competitor entry can be little more than a label
// ("Rival: a tool") - count only entries with actual substance (notable
// features or lessons), not just array presence. The schema doesn't enforce
// nonblank strings, so a blank entry ("" in notableFeatures) would otherwise
// pass this check with zero real information - require at least one entry
// with actual (trimmed, nonempty) content.
const hasContent = (arr) => (arr || []).some((s) => typeof s === 'string' && s.trim().length > 0)
const hasSubstance = (c) => c && (hasContent(c.notableFeatures) || hasContent(c.lessonsForUs))
const competitorCount = competitorResults.reduce((sum, r) => sum + ((r && r.competitors) || []).filter(hasSubstance).length, 0)
const hasCompetitorData = competitorCount > 0

// Segments planned but every analyst still failed or returned nothing usable
// (e.g. WebSearch/WebFetch not pre-approved in the session - Workflow
// sub-agents run in the background and can't prompt for tool approval). Same
// failure mode as the segment-planning guard above, just one step later. Only
// `competitor` scope hard-fails here - it has no fallback framing without
// competitor data. `mixed` degrades gracefully via `emphasis` below instead.
if (scope === 'competitor' && includeCompetitors && segments.length && !hasCompetitorData) {
  log('Competitor research produced no usable results for a competitor-focused run - aborting rather than reporting on missing data.')
  return { error: 'competitor-research-failed' }
}

// Emphasis depends on whether competitor research actually produced data, not
// just on the requested scope - a mixed run with no competitor data falls back
// to internal-only framing instead of asking ideators for competitor precedent
// that doesn't exist.
const emphasis = !hasCompetitorData
  ? 'Focus ideas on gaps in the existing product.'
  : scope === 'competitor'
    ? 'Focus ideas on capabilities competitors have that this product lacks.'
    : 'Draw ideas from a balanced mix of internal gaps and competitor precedent.'

// ---- Phase 2: Ideate ------------------------------------------------------
phase('Ideate')
// Inventory is a single mapped object, reused as-is everywhere below - unlike
// competitor/idea/feature collections it doesn't grow with fan-out, so it is
// never bounded: truncating it would silently hide already-built features
// from novelty checks in every downstream phase. Only competitor research
// (which grows with segment count) gets a character budget here.
const groundContext = `Inventory: ${JSON.stringify(inventory)}\nCompetitor research: ${boundedCompetitorJson(competitorResults)}`

const ideaResults = await parallel(LENSES.map((lens) => () => agent(
  `${CONTEXT}\n\nGround truth (current-product inventory + competitor research):\n${groundContext}\n\nYou are a PRODUCT IDEATOR working the "${lens.name}" lens: ${lens.brief}\n\n${emphasis}\n\nPropose new, value-adding features or improvements through this lens. Rules: never propose anything the inventory shows already exists; ground every idea in either a concrete product gap or a named competitor precedent; prefer depth and specificity over a long list of shallow ideas. For each idea give: title, description, the lens, the user-value hypothesis, the evidence (the gap or competitor it comes from), and a rough effort estimate (S, M, or L).`,
  { label: `ideate:${lens.key}`, phase: 'Ideate', schema: IDEAS_SCHEMA },
)))

const successfulLenses = ideaResults.filter(Boolean)
const allIdeas = successfulLenses.flatMap((r) => (r && r.ideas) || [])
log(`${allIdeas.length} raw ideas from ${successfulLenses.length}/${LENSES.length} lenses`)
if (!allIdeas.length) {
  log('No ideas survived ideation - cannot curate a shortlist. Aborting.')
  return { error: 'empty-ideation' }
}
// A lens whose ideator call failed outright is indistinguishable downstream
// from one that completed but genuinely found nothing to propose - both just
// contribute zero ideas. A truthy `{ ideas: [] }` response still counts
// toward successfulLenses (the call didn't fail), so it doesn't by itself
// mean the lens is missing - only lenses that contributed zero ideas overall
// are worth flagging as a gap, same principle as the hasSubstance filter used
// for competitor tracks above.
const contributingLenses = successfulLenses.filter((r) => r.ideas && r.ideas.length)
const lensCoverageNote = contributingLenses.length < LENSES.length
  ? ` ${LENSES.length - contributingLenses.length} of ${LENSES.length} ideation lens(es) failed to return results or found nothing to propose and are not reflected below - mention this gap in the executive summary rather than silently omitting it.`
  : ''

// ---- Phase 3: Shortlist (barrier: needs every idea at once to dedup) ------
phase('Shortlist')
const shortlist = await agent(
  `${CONTEXT}\n\nHere are ${allIdeas.length} candidate ideas from parallel ideators across different lenses:\n${JSON.stringify(allIdeas)}\n\nCurrent-product inventory:\n${JSON.stringify(inventory)}\n\nYou are the CURATOR. Merge duplicate and near-duplicate ideas into single consolidated items. Remove anything that already exists or is trivial. Rank the survivors by value-to-effort and select the TOP ${SHORTLIST_TARGET} for full speccing. For each selected item return: a clear title, a merged description, why it matters (value), rough effort, and the supporting evidence (gaps and/or competitors).`,
  { label: 'curate:shortlist', phase: 'Shortlist', schema: SHORTLIST_SCHEMA },
)

const features = (shortlist && shortlist.features) || []
if (!features.length) {
  log('Curator returned no features. Aborting before spec phase.')
  return { error: 'empty-shortlist', ideaCount: allIdeas.length }
}
log(`${features.length} features shortlisted for spec + validation`)

// ---- Phase 4: Spec + adversarial validate (pipeline, per feature) --------
phase('Spec & Validate')
const invJson = JSON.stringify(inventory)
const specced = await pipeline(
  features,
  (f) => agent(
    `${CONTEXT}\n\nCurrent-product inventory (for feasibility grounding):\n${invJson}\n\nWrite a crisp product + engineering spec for this feature:\n${JSON.stringify(f)}\n\nInclude: problem statement, proposed solution, user value, how it fits the existing architecture and stack (data-model changes, new pages/components/endpoints, interface implications), rough scope/milestones, success metrics, and open questions/risks. Be concrete about implementation given the current codebase.`,
    { label: `spec:${f.title}`, phase: 'Spec & Validate', schema: SPEC_SCHEMA },
  ),
  (spec, f) => spec
    ? agent(
        `${CONTEXT}\n\nAdversarially validate this feature spec. Be a skeptic: your job is to find why it might NOT be worth building.\n\nFeature: ${JSON.stringify(f)}\nSpec: ${JSON.stringify(spec)}\nCurrent-product inventory: ${invJson}\nCompetitor research: ${boundedCompetitorJson(competitorResults)}\n\nAssess: (1) is it genuinely NEW versus what already exists? (2) real, sizable user value or just nice-to-have? (3) feasible in the current architecture and stack? (4) real competitor precedent or user demand, or speculative - check this against the competitor research above, not just the feature's own evidence claim? (5) maintenance burden. Return a verdict (build / maybe / drop), a 1-10 confidence score, the strongest objections, and concrete refinements that would make it stronger.`,
        { label: `validate:${f.title}`, phase: 'Spec & Validate', schema: VERDICT_SCHEMA },
      ).then((v) => (v ? { feature: f, spec, verdict: v } : null))
    : null,
)

const clean = specced.filter(Boolean)
if (!clean.length) {
  log('No features survived spec + validation. Aborting before synthesis.')
  return { error: 'empty-validated-results', shortlisted: features.length }
}
// A feature whose spec or validator call failed partway is indistinguishable
// from one the validator deliberately rejected - both are just absent from
// `clean`. Note the count so the synthesizer doesn't conflate "evaluated and
// passed" with "never got evaluated."
const specCoverageNote = clean.length < features.length
  ? ` ${features.length - clean.length} of ${features.length} shortlisted feature(s) could not be spec'd or validated due to an agent failure and are missing below - this is different from a deliberate "drop" verdict; mention it in the executive summary rather than silently omitting it.`
  : ''

// ---- Phase 5: Synthesize --------------------------------------------------
phase('Synthesize')
// A competitor-scoped run only hard-fails when every planned track comes back
// empty - partial completion (e.g. 1 of 4 analysts succeeding) is treated as
// a normal success today, with nothing telling the reader how much research
// actually landed. Surface the gap in the report instead of hiding it. A
// track only counts as completed if it produced at least one competitor with
// real substance (the same hasSubstance check used for competitorCount above)
// - a track that came back truthy but empty, or name-only, is not "completed"
// research even though the analyst call itself didn't fail.
const usableTrackCount = competitorResults.filter((r) => ((r && r.competitors) || []).some(hasSubstance)).length
const competitorCoverageNote = segments.length && usableTrackCount < segments.length
  ? ` (${usableTrackCount} of ${segments.length} planned competitor tracks completed - some analyst calls failed, returned nothing, or returned no substantive competitors)`
  : ''
const gapsInstruction = hasCompetitorData
  ? `key gaps found, split into internal gaps and gaps versus competitors${competitorCoverageNote}`
  : 'key gaps found in the existing product (no competitor research was available for this run)'
const report = await agent(
  `${CONTEXT}\n\nYou are the SYNTHESIZER. Produce the final report in polished Markdown for the product owner.\n\nInputs:\nCurrent-product inventory: ${invJson}\nCompetitor research: ${boundedCompetitorJson(competitorResults)}\nSpecced & validated features: ${JSON.stringify(clean)}\n\nStructure the report as: (1) a short executive summary${specCoverageNote}${lensCoverageNote}; (2) ${gapsInstruction}; (3) a RANKED roadmap table (rank, feature, value, effort, verdict, confidence); (4) a full spec section per recommended feature (only those the validator rated build or maybe, strongest first), incorporating the validator's refinements; (5) a short list of dropped ideas with one-line reasons; (6) a "quick wins vs bigger bets" split. Write in plain, skimmable prose. Use plain dashes, never em dashes.`,
  { label: 'synthesize:report', phase: 'Synthesize' },
)

if (!report) {
  log('Synthesizer failed to produce a report. Aborting.')
  return { error: 'synthesis-failed', counts: { rawIdeas: allIdeas.length, shortlisted: features.length, specced: clean.length } }
}

return {
  report,
  meta: {
    product: product || '(mapped from repo)',
    scope,
    depth,
    competitorSegmentsPlanned: segments.length,
    competitorSegmentsCompleted: usableTrackCount,
    lenses: contributingLenses.length,
  },
  counts: { rawIdeas: allIdeas.length, shortlisted: features.length, specced: clean.length },
}
