// The Workflow harness statically extracts this `meta` object from source text
// and executes the rest of this file's body inside its own async wrapper - it
// does not load this file as a plain Node ES module. The `export` keyword above
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

// Large collection payloads (inventory, competitor research, raw ideas, specced
// results) get re-embedded into many downstream prompts - every ideator lens,
// every spec/validate pipeline stage - so an unbounded JSON.stringify compounds
// token cost across the fan-out. Cap each at a fixed character budget instead.
const MAX_CONTEXT_CHARS = 12000
const boundedJson = (value) => {
  const json = JSON.stringify(value)
  return json.length > MAX_CONTEXT_CHARS
    ? `${json.slice(0, MAX_CONTEXT_CHARS)}\n...(truncated, ${json.length} chars total)`
    : json
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
    segments: { type: 'array', items: { type: 'object', properties: {
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

const IDEAS_SCHEMA = {
  type: 'object',
  properties: {
    ideas: { type: 'array', items: { type: 'object', properties: {
      title: { type: 'string' }, description: { type: 'string' }, lens: { type: 'string' },
      valueHypothesis: { type: 'string' }, evidence: { type: 'string' }, effort: { type: 'string', enum: ['S', 'M', 'L'] },
    }, required: ['title', 'description', 'valueHypothesis', 'evidence', 'effort'] } },
  },
  required: ['ideas'],
}

const SHORTLIST_SCHEMA = {
  type: 'object',
  properties: {
    features: { type: 'array', items: { type: 'object', properties: {
      title: { type: 'string' }, description: { type: 'string' }, value: { type: 'string' },
      effort: { type: 'string' }, evidence: { type: 'string' },
    }, required: ['title', 'description'] } },
  },
  required: ['features'],
}

const SPEC_SCHEMA = {
  type: 'object',
  properties: {
    title: { type: 'string' }, problem: { type: 'string' }, solution: { type: 'string' },
    userValue: { type: 'string' }, architectureFit: { type: 'string' },
    scope: { type: 'array', items: { type: 'string' } },
    successMetrics: { type: 'array', items: { type: 'string' } },
    openQuestions: { type: 'array', items: { type: 'string' } },
  },
  required: ['title', 'problem', 'solution'],
}

const VERDICT_SCHEMA = {
  type: 'object',
  properties: {
    verdict: { type: 'string', enum: ['build', 'maybe', 'drop'] },
    confidence: { type: 'number', minimum: 1, maximum: 10 },
    objections: { type: 'array', items: { type: 'string' } },
    refinements: { type: 'array', items: { type: 'string' } },
  },
  required: ['verdict', 'confidence'],
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
      `${CONTEXT}\n\nYou are a COMPETITOR ANALYST focused on: ${seg.focus}. Use web search and fetch to research real, current products and sites in this segment. For each, capture what it is, its URL, the notable features or content that make it valuable, how it handles ${seg.angle || 'its core job'}, and what this product could learn or adopt. Prioritize concrete, verifiable features over generic advice.`,
      { label: `competitor:${seg.key}`, phase: 'Ground', schema: COMPETITOR_SCHEMA },
    )))).filter(Boolean)
  : []

// A truthy per-segment result can still carry zero competitors (the schema
// allows `{ competitors: [] }`), so count the flattened total rather than just
// how many analyst calls returned something.
const competitorCount = competitorResults.reduce((sum, r) => sum + ((r && r.competitors) || []).length, 0)
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
const groundContext = `Inventory: ${JSON.stringify(inventory)}\nCompetitor research: ${boundedJson(competitorResults)}`

const ideaResults = await parallel(LENSES.map((lens) => () => agent(
  `${CONTEXT}\n\nGround truth (current-product inventory + competitor research):\n${groundContext}\n\nYou are a PRODUCT IDEATOR working the "${lens.name}" lens: ${lens.brief}\n\n${emphasis}\n\nPropose new, value-adding features or improvements through this lens. Rules: never propose anything the inventory shows already exists; ground every idea in either a concrete product gap or a named competitor precedent; prefer depth and specificity over a long list of shallow ideas. For each idea give: title, description, the lens, the user-value hypothesis, the evidence (the gap or competitor it comes from), and a rough effort estimate (S, M, or L).`,
  { label: `ideate:${lens.key}`, phase: 'Ideate', schema: IDEAS_SCHEMA },
)))

const allIdeas = ideaResults.filter(Boolean).flatMap((r) => (r && r.ideas) || [])
log(`${allIdeas.length} raw ideas from ${LENSES.length} lenses`)
if (!allIdeas.length) {
  log('No ideas survived ideation - cannot curate a shortlist. Aborting.')
  return { error: 'empty-ideation' }
}

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
        `${CONTEXT}\n\nAdversarially validate this feature spec. Be a skeptic: your job is to find why it might NOT be worth building.\n\nFeature: ${JSON.stringify(f)}\nSpec: ${JSON.stringify(spec)}\nCurrent-product inventory: ${invJson}\n\nAssess: (1) is it genuinely NEW versus what already exists? (2) real, sizable user value or just nice-to-have? (3) feasible in the current architecture and stack? (4) real competitor precedent or user demand, or speculative? (5) maintenance burden. Return a verdict (build / maybe / drop), a 1-10 confidence score, the strongest objections, and concrete refinements that would make it stronger.`,
        { label: `validate:${f.title}`, phase: 'Spec & Validate', schema: VERDICT_SCHEMA },
      ).then((v) => (v ? { feature: f, spec, verdict: v } : null))
    : null,
)

const clean = specced.filter(Boolean)
if (!clean.length) {
  log('No features survived spec + validation. Aborting before synthesis.')
  return { error: 'empty-validated-results', shortlisted: features.length }
}

// ---- Phase 5: Synthesize --------------------------------------------------
phase('Synthesize')
const gapsInstruction = hasCompetitorData
  ? 'key gaps found, split into internal gaps and gaps versus competitors'
  : 'key gaps found in the existing product (no competitor research was available for this run)'
const report = await agent(
  `${CONTEXT}\n\nYou are the SYNTHESIZER. Produce the final report in polished Markdown for the product owner.\n\nInputs:\nCurrent-product inventory: ${invJson}\nCompetitor research: ${boundedJson(competitorResults)}\nSpecced & validated features: ${JSON.stringify(clean)}\n\nStructure the report as: (1) a short executive summary; (2) ${gapsInstruction}; (3) a RANKED roadmap table (rank, feature, value, effort, verdict, confidence); (4) a full spec section per recommended feature (only those the validator rated build or maybe, strongest first), incorporating the validator's refinements; (5) a short list of dropped ideas with one-line reasons; (6) a "quick wins vs bigger bets" split. Write in plain, skimmable prose. Use plain dashes, never em dashes.`,
  { label: 'synthesize:report', phase: 'Synthesize' },
)

if (!report) {
  log('Synthesizer failed to produce a report. Aborting.')
  return { error: 'synthesis-failed', counts: { rawIdeas: allIdeas.length, shortlisted: features.length, specced: clean.length } }
}

return {
  report,
  meta: { product: product || '(mapped from repo)', scope, depth, competitorSegments: competitorResults.length, lenses: LENSES.length },
  counts: { rawIdeas: allIdeas.length, shortlisted: features.length, specced: clean.length },
}
