import type {
  ChatEffort,
  StatusLineBase,
  StatusLineBlockId,
  StatusLineIcons,
  StatusLineLayout,
  StatusLineMode,
  StatusLinePreview,
  StatusLineRun,
  StatusLineScope,
  StatusLineScopeState,
  StatusLineSetup,
  StatusLineSkill,
} from '../types'
import { modelLabel } from './chat-picks-logic'

// What the Status Line Dock needs with no `$`: the blocks, Layout edits, what
// the settings files hold, the install and uninstall changes, the preview's
// input, and the renderer's colors turned into styled runs.

export const BLOCKS: ReadonlyArray<{ id: StatusLineBlockId; name: string }> = [
  { id: 'folder', name: 'Folder' },
  { id: 'branch', name: 'Branch' },
  { id: 'model', name: 'Model' },
  { id: 'effort', name: 'Effort' },
  { id: 'version', name: 'Version' },
  { id: 'style', name: 'Style' },
  { id: 'context', name: 'Context' },
  { id: 'cost', name: 'Cost' },
  { id: 'lines', name: 'Lines changed' },
  { id: 'time', name: 'Session time' },
  { id: 'limits', name: 'Rate limits' },
  { id: 'cache', name: 'Prompt cache' },
  { id: 'agents', name: 'Agents' },
  { id: 'skill', name: 'Skill' },
]

export const LINE_COUNT = 2
export const ICON_STYLES: readonly StatusLineIcons[] = ['glyph', 'emoji', 'none']
export const ICON_NAMES: Record<StatusLineIcons, string> = { glyph: 'Glyph', emoji: 'Emoji', none: 'None' }

const DEFAULT_LINES: readonly StatusLineBlockId[][] = [
  ['folder', 'branch', 'model', 'effort'],
  ['context', 'cost', 'lines', 'time', 'agents'],
]

// Every command this renderer runs as ends with these, wherever the config folder is.
const RENDERER_NAME = 'mods-toolbox/statusline.sh'
const AGENT_DOCK_ADDON = /^(\S*agent-dock\/statusline\.sh)(?:\s+'((?:[^']|'\\'')*)')?\s*$/
const REFRESH_SECONDS = 2

export function isBlockId(value: unknown): value is StatusLineBlockId {
  return BLOCKS.some(block => block.id === value)
}

export function blockName(id: StatusLineBlockId): string {
  return BLOCKS.find(block => block.id === id)?.name ?? id
}

/** A first Layout: Extend when there is a status line to keep, Replace when there is none. */
export function defaultLayout(base: StatusLineBase | null): StatusLineLayout {
  return {
    version: 1,
    mode: base === null ? 'replace' : 'extend',
    icons: 'glyph',
    lines: DEFAULT_LINES.map(line => [...line]),
    base,
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function parseBase(value: unknown): StatusLineBase | null {
  if (!isRecord(value)) {
    return null
  }
  if (value.kind === 'command' && typeof value.command === 'string' && value.command.trim() !== '') {
    return { kind: 'command', command: value.command }
  }
  if (value.kind === 'file' && typeof value.path === 'string' && value.path !== '') {
    return { kind: 'file', path: value.path }
  }

  return null
}

/** A Layout file's text as the Dock edits it; null when it is not one. Unknown and repeated blocks are dropped. */
export function parseLayout(text: string | null): StatusLineLayout | null {
  if (text === null) {
    return null
  }
  let value: unknown
  try {
    value = JSON.parse(text)
  } catch {
    return null
  }
  if (!isRecord(value) || !Array.isArray(value.lines)) {
    return null
  }
  const seen = new Set<StatusLineBlockId>()
  const lines = Array.from({ length: LINE_COUNT }, (_, index) => {
    const line = (value as { lines: unknown[] }).lines[index]
    return (Array.isArray(line) ? line : []).filter((id): id is StatusLineBlockId => {
      if (!isBlockId(id) || seen.has(id)) {
        return false
      }
      seen.add(id)
      return true
    })
  })
  const mode: StatusLineMode = value.mode === 'extend' ? 'extend' : 'replace'
  const icons = ICON_STYLES.find(style => style === value.icons) ?? 'glyph'

  return { version: 1, mode, icons, lines, base: parseBase(value.base) }
}

export function layoutText(layout: StatusLineLayout): string {
  return `${JSON.stringify(layout, null, 2)}\n`
}

export function sameLayout(a: StatusLineLayout, b: StatusLineLayout): boolean {
  return JSON.stringify(a) === JSON.stringify(b)
}

/** "2 lines · 9 blocks" */
export function layoutSummary(layout: StatusLineLayout): string {
  const lines = layout.lines.filter(line => line.length > 0).length
  const blocks = layout.lines.reduce((sum, line) => sum + line.length, 0)

  return `${lines} line${lines === 1 ? '' : 's'} · ${blocks} block${blocks === 1 ? '' : 's'}`
}

/** Line 1, line 2, then the blocks that are off, in the catalog's order. */
export function rows(layout: StatusLineLayout): StatusLineBlockId[][] {
  const on = new Set(layout.lines.flat())

  return [...layout.lines.map(line => [...line]), BLOCKS.map(block => block.id).filter(id => !on.has(id))]
}

function rowOf(layout: StatusLineLayout, id: StatusLineBlockId): number {
  const index = layout.lines.findIndex(line => line.includes(id))

  return index === -1 ? LINE_COUNT : index
}

/** One place left or right within its line; the off row keeps the catalog's order. */
export function moveAlong(layout: StatusLineLayout, id: StatusLineBlockId, step: -1 | 1): StatusLineLayout {
  const row = rowOf(layout, id)
  const line = layout.lines[row]
  if (line === undefined) {
    return layout
  }
  const from = line.indexOf(id)
  const to = from + step
  if (to < 0 || to >= line.length) {
    return layout
  }
  const moved = [...line]
  moved.splice(from, 1)
  moved.splice(to, 0, id)

  return { ...layout, lines: layout.lines.map((other, index) => (index === row ? moved : other)) }
}

/** Up or down a row: line 1, line 2, off. It lands at the end of a line. */
export function moveAcross(layout: StatusLineLayout, id: StatusLineBlockId, step: -1 | 1): StatusLineLayout {
  const from = rowOf(layout, id)
  const to = Math.min(LINE_COUNT, Math.max(0, from + step))
  if (to === from) {
    return layout
  }

  return {
    ...layout,
    lines: layout.lines.map((line, index) => {
      const without = line.filter(other => other !== id)
      return index === to ? [...without, id] : without
    }),
  }
}

export function isOff(layout: StatusLineLayout, id: StatusLineBlockId): boolean {
  return rowOf(layout, id) === LINE_COUNT
}

/** On at the end of the last line in use, where the status line ends; line 1 when none is. */
export function turnOn(layout: StatusLineLayout, id: StatusLineBlockId): StatusLineLayout {
  if (!isOff(layout, id)) {
    return layout
  }
  const last = layout.lines.reduce((found, line, index) => (line.length > 0 ? index : found), 0)

  return { ...layout, lines: layout.lines.map((line, index) => (index === last ? [...line, id] : line)) }
}

export function turnOff(layout: StatusLineLayout, id: StatusLineBlockId): StatusLineLayout {
  return isOff(layout, id) ? layout : { ...layout, lines: layout.lines.map(line => line.filter(other => other !== id)) }
}

export function toggleBlock(layout: StatusLineLayout, id: StatusLineBlockId): StatusLineLayout {
  return isOff(layout, id) ? turnOn(layout, id) : turnOff(layout, id)
}

export function nextIcons(layout: StatusLineLayout): StatusLineLayout {
  const index = ICON_STYLES.indexOf(layout.icons)

  return { ...layout, icons: ICON_STYLES[(index + 1) % ICON_STYLES.length] ?? 'glyph' }
}

// --- Files and commands -----------------------------------------------------

export type Paths = {
  config: string
  home: string
  root: string
  userSettings: string
  projectSettings: string
  localSettings: string
  renderer: string
  rendererJq: string
  records: string
  agentDockRecords: string
  agentDockAddon: string
  captures: string
  skills: string
}

/** Claude Code's config folder ($CLAUDE_CONFIG_DIR, else ~/.claude) and every file the Dock reads or writes. */
export function pathsFor(configDir: string | undefined, home: string, root: string): Paths {
  const config = (configDir !== undefined && configDir !== '' ? configDir : `${home}/.claude`).replace(/\/+$/, '')
  const own = `${config}/mods-toolbox`

  return {
    config,
    home,
    root,
    userSettings: `${config}/settings.json`,
    projectSettings: `${root}/.claude/settings.json`,
    localSettings: `${root}/.claude/settings.local.json`,
    renderer: `${own}/statusline.sh`,
    rendererJq: `${own}/statusline.jq`,
    records: `${own}/installs.json`,
    agentDockRecords: `${config}/agent-dock/installs`,
    agentDockAddon: `${config}/agent-dock/statusline.sh`,
    captures: `${own}/last-input`,
    skills: `${own}/skill-now`,
  }
}

/** A session's file in a per-session folder, named the way the renderer names it. */
export function sessionFile(dir: string, sessionId: string): string {
  return `${dir}/${sessionId.replace(/[^A-Za-z0-9._-]/g, '_')}.json`
}

// 32-bit FNV-1a, so two project paths that read alike once cleaned keep apart.
function hash(text: string): string {
  let value = 0x811c9dc5
  for (let index = 0; index < text.length; index++) {
    value ^= text.charCodeAt(index)
    value = Math.imul(value, 0x01000193) >>> 0
  }

  return value.toString(16).padStart(8, '0')
}

export function layoutFile(paths: Paths, scope: StatusLineScope): string {
  const folder = `${paths.config}/mods-toolbox/layouts`
  if (scope === 'global') {
    return `${folder}/global.json`
  }
  const name = paths.root.replace(/[^A-Za-z0-9._-]/g, '_').replace(/^_+/, '').slice(-80)

  return `${folder}/project-${name}-${hash(paths.root)}.json`
}

export function shellQuote(word: string): string {
  return /^[A-Za-z0-9_@%+=:,./-]+$/.test(word) ? word : `'${word.replace(/'/g, `'\\''`)}'`
}

// Under the home folder a path is written with ~, so a settings file kept in a
// dotfiles repository works on every machine it is used on.
function shellPath(path: string, home: string): string {
  if (home !== '' && path.startsWith(`${home}/`)) {
    const rest = path.slice(home.length + 1)
    if (/^[A-Za-z0-9_@%+=:,./-]+$/.test(rest)) {
      return `~/${rest}`
    }
  }

  return shellQuote(path)
}

/** The status line command for one scope's Layout. */
export function rendererCommand(paths: Paths, scope: StatusLineScope): string {
  return `sh ${shellPath(paths.renderer, paths.home)} ${shellPath(layoutFile(paths, scope), paths.home)}`
}

export function isOwnCommand(command: string | null): boolean {
  return command !== null && command.includes(RENDERER_NAME)
}

/** The Agent Dock add-on wraps a person's command as `statusline.sh '<command>'`; this is that command, if any. */
export function unwrapAgentDock(command: string): { isWrapped: boolean; base: string | null } {
  const match = AGENT_DOCK_ADDON.exec(command.trim())
  if (match === null) {
    return { isWrapped: false, base: null }
  }
  const quoted = match[2]

  return { isWrapped: true, base: quoted === undefined ? null : quoted.replace(/'\\''/g, "'") }
}

type Parsed = { settings: Record<string, unknown> | null; problem: string | null }

/** A settings file as JSON; null settings when there is no file, a problem when it is not plain JSON (comments, say). */
export function parseSettings(text: string | null, path: string): Parsed {
  if (text === null) {
    return { settings: null, problem: null }
  }
  try {
    const value: unknown = JSON.parse(text)
    return isRecord(value) ? { settings: value, problem: null } : { settings: null, problem: `${path} is not a JSON object` }
  } catch {
    return { settings: null, problem: `${path} is not plain JSON, so it is left alone` }
  }
}

export function statusLineCommand(settings: Record<string, unknown> | null): string | null {
  const statusLine = settings?.statusLine
  if (!isRecord(statusLine) || typeof statusLine.command !== 'string' || statusLine.command.trim() === '') {
    return null
  }

  return statusLine.command
}

// What Extend keeps of a command a settings file holds: the person's own
// command, unwrapped from the Agent Dock add-on, or nothing for our own.
function keptCommand(command: string): StatusLineBase | null {
  if (isOwnCommand(command)) {
    return null
  }
  const { isWrapped, base } = unwrapAgentDock(command)
  const kept = isWrapped ? base : command

  return kept === null ? null : { kind: 'command', command: kept }
}

export type SetupFiles = {
  paths: Paths
  user: string | null
  project: string | null
  local: string | null
  globalLayout: string | null
  projectLayout: string | null
  records: string | null
  isLocked: boolean
}

// What an uninstall puts back, as the confirm says it; null when the scope isn't installed.
function restoreText(isInstalled: boolean, record: InstallRecord | undefined, inherited: string | null): string | null {
  if (!isInstalled) {
    return null
  }
  const before = record?.before ?? null
  if (isRecord(before) && typeof before.command === 'string' && before.command.trim() !== '') {
    return before.command
  }
  if (before !== null) {
    return 'its statusLine block as it was'
  }
  const none = inherited === null ? 'no status line' : `no status line of its own, so ${inherited} shows again`

  return record === undefined ? `${none}: there is no record here of the one before` : none
}

/** What the settings files and Layouts hold, read the way Claude Code picks a status line. */
export function setupFrom(files: SetupFiles): StatusLineSetup {
  const { paths } = files
  const user = parseSettings(files.user, paths.userSettings)
  const project = parseSettings(files.project, paths.projectSettings)
  const local = parseSettings(files.local, paths.localSettings)
  const commands = {
    local: statusLineCommand(local.settings),
    project: statusLineCommand(project.settings),
    user: statusLineCommand(user.settings),
  }
  const source = (['local', 'project', 'user'] as const).find(name => commands[name] !== null)
  const inForce = source === undefined ? null : { source, command: commands[source] ?? '' }

  const globalLayout = parseLayout(files.globalLayout)
  const projectLayout = parseLayout(files.projectLayout)
  const isGlobalInstalled = isOwnCommand(commands.user)
  const isProjectInstalled = isOwnCommand(commands.local)
  const globalBase = isGlobalInstalled ? (globalLayout?.base ?? null) : commands.user === null ? null : keptCommand(commands.user)

  // A project with no status line of its own follows the file it inherits
  // from, so a later change there still shows. A file that runs this Dock's
  // line is not followed, or its blocks would show twice: the project keeps
  // what the global Layout keeps.
  const inheritedBase = (): StatusLineBase | null => {
    if (commands.project !== null) {
      return isOwnCommand(commands.project) ? null : { kind: 'file', path: paths.projectSettings }
    }
    if (commands.user !== null) {
      return isGlobalInstalled ? globalBase : { kind: 'file', path: paths.userSettings }
    }
    return null
  }
  const projectBase = isProjectInstalled
    ? (projectLayout?.base ?? null)
    : commands.local !== null
      ? keptCommand(commands.local)
      : inheritedBase()

  const records = parseRecords(files.records)
  const inherited = commands.project !== null ? 'the one in .claude/settings.json' : commands.user !== null ? 'the global one' : null

  const scope = (
    scopeName: StatusLineScope,
    file: string,
    isInstalled: boolean,
    layout: StatusLineLayout | null,
    base: StatusLineBase | null,
    problem: string | null,
  ): StatusLineScopeState => ({
    file,
    layoutFile: layoutFile(paths, scopeName),
    command: rendererCommand(paths, scopeName),
    isInstalled,
    layout,
    base,
    restores: restoreText(isInstalled, records[file], scopeName === 'project' ? inherited : null),
    isRecorded: records[file] !== undefined,
    problem,
  })

  return {
    isLocked: files.isLocked,
    inForce,
    global: scope('global', paths.userSettings, isGlobalInstalled, globalLayout, globalBase, user.problem),
    project: scope('project', paths.localSettings, isProjectInstalled, projectLayout, projectBase, local.problem),
  }
}

/** The Layout the Dock opens on for a scope: its saved one, the global one for a new project, else the default. */
export function startingLayout(setup: StatusLineSetup, scope: StatusLineScope): StatusLineLayout {
  const own = setup[scope]
  const saved = own.layout ?? (scope === 'project' ? setup.global.layout : null)
  if (saved === null) {
    return defaultLayout(own.base)
  }

  return own.isInstalled ? saved : { ...saved, base: own.base, mode: own.base === null ? 'replace' : saved.mode }
}

// --- Install and uninstall --------------------------------------------------

/** What an install found, so an uninstall puts back exactly that. */
export type InstallRecord = {
  scope: StatusLineScope
  layoutFile: string
  // The statusLine block before the install; null when there was none.
  before: unknown
  createdFile: boolean
}

export type InstallRecords = Record<string, InstallRecord>

export function parseRecords(text: string | null): InstallRecords {
  if (text === null) {
    return {}
  }
  try {
    const value: unknown = JSON.parse(text)
    const installs = isRecord(value) && isRecord(value.installs) ? value.installs : {}
    const records: InstallRecords = {}
    for (const [file, record] of Object.entries(installs)) {
      if (isRecord(record) && (record.scope === 'global' || record.scope === 'project') && typeof record.layoutFile === 'string') {
        records[file] = {
          scope: record.scope,
          layoutFile: record.layoutFile,
          before: record.before ?? null,
          createdFile: record.createdFile === true,
        }
      }
    }
    return records
  } catch {
    return {}
  }
}

export function recordsText(records: InstallRecords): string {
  return `${JSON.stringify({ version: 1, installs: records }, null, 2)}\n`
}

// The file's own indent and final newline, so a rewrite changes only the statusLine lines.
function formatLike(value: Record<string, unknown>, original: string | null): string {
  const indent = original === null ? '  ' : (/^([ \t]+)"/m.exec(original)?.[1] ?? '  ')
  const isNewlineEnded = original === null || original.endsWith('\n')

  return `${JSON.stringify(value, null, indent)}${isNewlineEnded ? '\n' : ''}`
}

/** The line the Agent Dock's setup kept for a settings file in agent-dock/installs: a number, none, new, new-file, unknown; null when absent. */
export function agentDockRecord(text: string | null, file: string): string | null {
  for (const line of (text ?? '').split('\n')) {
    const [path, value] = line.split('\t')
    if (path === file) {
      return value === undefined || value === '' ? 'unknown' : value
    }
  }

  return null
}

export function withoutAgentDockRecord(text: string | null, file: string): string {
  return (text ?? '')
    .split('\n')
    .filter(line => line !== '' && line.split('\t')[0] !== file)
    .map(line => `${line}\n`)
    .join('')
}

export type InstallPlan = {
  file: string
  text: string
  createsFile: boolean
  oldCommand: string | null
  newCommand: string
  layout: StatusLineLayout
  record: InstallRecord
  // The file was the Agent Dock add-on's: its line in agent-dock/installs goes.
  wasAgentDock: boolean
}

type InstallArgs = {
  scope: StatusLineScope
  state: StatusLineScopeState
  settingsText: string | null
  draft: StatusLineLayout
  command: string
  existing: InstallRecord | undefined
  agentDockValue: string | null
}

// What the file held before, as the Agent Dock's own uninstall would have put it back.
function beforeAgentDock(statusLine: Record<string, unknown>, base: string | null, recorded: string | null): { before: unknown; createdFile: boolean } {
  if (recorded === 'new' || base === null) {
    return { before: null, createdFile: recorded === 'new-file' }
  }
  if (recorded === 'new-file') {
    return { before: null, createdFile: true }
  }
  const { refreshInterval, ...rest } = statusLine
  if (recorded === 'none') {
    return { before: { ...rest, command: base }, createdFile: false }
  }
  if (recorded !== null && /^\d+$/.test(recorded)) {
    return { before: { ...rest, command: base, refreshInterval: Number(recorded) }, createdFile: false }
  }

  return { before: { ...rest, command: base, ...(refreshInterval === undefined ? {} : { refreshInterval }) }, createdFile: false }
}

/** The settings file's new text and what to remember, or why it can't be changed. */
export function installPlan({ scope, state, settingsText, draft, command, existing, agentDockValue }: InstallArgs): InstallPlan | { problem: string } {
  const parsed = parseSettings(settingsText, state.file)
  if (parsed.problem !== null) {
    return { problem: parsed.problem }
  }
  const settings = parsed.settings ?? {}
  const current = settings.statusLine
  const statusLine = isRecord(current) ? current : {}
  const oldCommand = statusLineCommand(settings)
  const wrapped = oldCommand === null ? { isWrapped: false, base: null } : unwrapAgentDock(oldCommand)

  const found =
    current === undefined
      ? { before: null, createdFile: settingsText === null }
      : isOwnCommand(oldCommand)
        ? { before: existing?.before ?? null, createdFile: existing?.createdFile ?? false }
        : wrapped.isWrapped
          ? beforeAgentDock(statusLine, wrapped.base, agentDockValue)
          : { before: current, createdFile: false }

  const interval = statusLine.refreshInterval
  const next: Record<string, unknown> = {
    ...statusLine,
    type: 'command',
    command,
    refreshInterval: typeof interval === 'number' && interval >= 1 && interval <= REFRESH_SECONDS ? interval : REFRESH_SECONDS,
  }

  return {
    file: state.file,
    text: formatLike({ ...settings, statusLine: next }, settingsText),
    createsFile: settingsText === null,
    oldCommand,
    newCommand: command,
    layout: { ...draft, base: state.base },
    record: { scope, layoutFile: state.layoutFile, before: found.before, createdFile: found.createdFile },
    wasAgentDock: wrapped.isWrapped,
  }
}

export type UninstallPlan = {
  // The settings file's new text; null to delete the file the install created; undefined to leave it alone.
  text: string | null | undefined
}

/**
 * Puts back what the install found. With no record of the install, as when the
 * settings file came from another machine's dotfiles, the statusLine block just
 * goes. A status line someone changed since is theirs, and stays.
 */
export function uninstallPlan(settingsText: string | null, file: string, record: InstallRecord | undefined): UninstallPlan | { problem: string } {
  const parsed = parseSettings(settingsText, file)
  if (parsed.problem !== null) {
    return { problem: parsed.problem }
  }
  if (parsed.settings === null || !isOwnCommand(statusLineCommand(parsed.settings))) {
    return { text: undefined }
  }
  const { statusLine: _ours, ...rest } = parsed.settings
  const before = record?.before ?? null
  const restored = before === null ? rest : { ...parsed.settings, statusLine: before }
  if (record?.createdFile === true && Object.keys(restored).length === 0) {
    return { text: null }
  }

  return { text: formatLike(restored, settingsText) }
}

// --- Preview ----------------------------------------------------------------

export type PreviewFacts = {
  // The last input Claude Code gave the installed renderer, for this session.
  captured: Record<string, unknown> | null
  sessionId: string
  cwd: string
  // The folder the session started in: the renderer runs git status only in its repo.
  root: string
  modelId: string | null
  version: string | null
  effort: ChatEffort | null
  outputStyle: string | null
  usage: {
    startedAt: number
    context: { percent?: number }
    rateLimits: ReadonlyArray<{ kind: string; percentUsed: number; resetsAt?: string }>
    cost?: { usd: number }
  } | null
  now: number
  agents: number
  skill: StatusLineSkill | null
}

const SAMPLE = {
  model: 'Opus 5.5',
  effort: 'high',
  version: '2.1.0',
  style: 'default',
  context: 34,
  cost: 0.42,
  added: 42,
  removed: 18,
  durationMs: 754_000,
  fiveHour: 23,
  sevenDay: 41,
  // Seconds from now; the half minute keeps the countdown on its figure between refreshes.
  fiveHourResets: 2 * 3600 + 10 * 60 + 30,
  sevenDayResets: 3 * 86_400 + 4 * 3600 + 30,
  cacheExpires: 47 * 60 + 30,
  agents: 3,
  skill: { name: 'code-review', isRunning: true },
}

function at(value: unknown, ...keys: string[]): unknown {
  let current = value
  for (const key of keys) {
    current = isRecord(current) ? current[key] : undefined
  }

  return current
}

const isMissing = (value: unknown) => value === undefined || value === null || value === ''

// The name Claude Code's own status line input carries, "Opus 5.5 (1M context)", which the renderer shortens.
function displayName(modelId: string): string {
  const isLong = modelId.endsWith('[1m]')
  const name = modelLabel(isLong ? modelId.slice(0, -'[1m]'.length) : modelId)

  return isLong ? `${name} (1M context)` : name
}

/** The stdin the preview's renderer gets: this session's real figures, and samples for the blocks that have none yet. */
export function previewInput(facts: PreviewFacts): {
  input: Record<string, unknown>
  samples: StatusLineBlockId[]
  agents: number
  skill: StatusLineSkill
} {
  const nowSeconds = Math.floor(facts.now / 1000)
  // A window as the status line input has it: resets_at in epoch seconds.
  const rateWindow = (kind: string) => {
    const limit = facts.usage?.rateLimits.find(found => found.kind === kind)
    if (limit === undefined) {
      return {}
    }
    const resets = limit.resetsAt === undefined ? Number.NaN : Date.parse(limit.resetsAt)
    return {
      [kind]: { used_percentage: limit.percentUsed, ...(Number.isFinite(resets) ? { resets_at: Math.floor(resets / 1000) } : {}) },
    }
  }
  const built: Record<string, unknown> = {
    session_id: facts.sessionId,
    cwd: facts.cwd,
    workspace: { current_dir: facts.cwd, project_dir: facts.root },
    ...(facts.modelId === null ? {} : { model: { id: facts.modelId, display_name: displayName(facts.modelId) } }),
    ...(facts.version === null ? {} : { version: facts.version }),
    ...(facts.effort === null ? {} : { effort: { level: facts.effort } }),
    ...(facts.outputStyle === null ? {} : { output_style: { name: facts.outputStyle } }),
    cost: {
      ...(facts.usage?.cost === undefined ? {} : { total_cost_usd: facts.usage.cost.usd }),
      ...(facts.usage === null ? {} : { total_duration_ms: Math.max(0, facts.now - facts.usage.startedAt) }),
    },
    context_window: facts.usage?.context.percent === undefined ? {} : { used_percentage: facts.usage.context.percent },
    rate_limits: { ...rateWindow('five_hour'), ...rateWindow('seven_day') },
  }
  const { columns: _columns, ...captured } = facts.captured ?? {}
  const real = facts.captured === null ? built : captured

  const samples: StatusLineBlockId[] = []
  const fill = (id: StatusLineBlockId, isEmpty: boolean, patch: Record<string, unknown>) => {
    if (isEmpty) {
      samples.push(id)
      Object.assign(real, merge(real, patch))
    }
  }
  fill('model', isMissing(at(real, 'model', 'display_name')) && isMissing(at(real, 'model', 'id')), { model: { display_name: SAMPLE.model } })
  fill('effort', isMissing(at(real, 'effort', 'level')), { effort: { level: SAMPLE.effort } })
  fill('version', isMissing(at(real, 'version')), { version: SAMPLE.version })
  fill('style', isMissing(at(real, 'output_style', 'name')), { output_style: { name: SAMPLE.style } })
  fill('context', isMissing(at(real, 'context_window', 'used_percentage')), { context_window: { used_percentage: SAMPLE.context } })
  fill('cost', isMissing(at(real, 'cost', 'total_cost_usd')), { cost: { total_cost_usd: SAMPLE.cost } })
  fill('lines', !at(real, 'cost', 'total_lines_added') && !at(real, 'cost', 'total_lines_removed'), {
    cost: { total_lines_added: SAMPLE.added, total_lines_removed: SAMPLE.removed },
  })
  fill('time', !at(real, 'cost', 'total_duration_ms'), { cost: { total_duration_ms: SAMPLE.durationMs } })
  fill('limits', isMissing(at(real, 'rate_limits', 'five_hour')) && isMissing(at(real, 'rate_limits', 'seven_day')), {
    rate_limits: {
      five_hour: { used_percentage: SAMPLE.fiveHour, resets_at: nowSeconds + SAMPLE.fiveHourResets },
      seven_day: { used_percentage: SAMPLE.sevenDay, resets_at: nowSeconds + SAMPLE.sevenDayResets },
    },
  })
  fill('cache', isMissing(at(real, 'prompt_cache', 'expires_at')), {
    prompt_cache: { caching_observed: true, warm: true, ttl: '1h', expires_at: nowSeconds + SAMPLE.cacheExpires },
  })
  const agents = facts.agents > 0 ? facts.agents : SAMPLE.agents
  if (facts.agents <= 0) {
    samples.push('agents')
  }
  if (facts.skill === null) {
    samples.push('skill')
  }

  return { input: real, samples, agents, skill: facts.skill ?? SAMPLE.skill }
}

function merge(target: Record<string, unknown>, patch: Record<string, unknown>): Record<string, unknown> {
  const merged: Record<string, unknown> = { ...target }
  for (const [key, value] of Object.entries(patch)) {
    const current = merged[key]
    merged[key] = isRecord(current) && isRecord(value) ? merge(current, value) : value
  }

  return merged
}

/** The renderer's preview JSON as the Dock draws it, or why there is none. */
export function previewFrom(stdout: string, columns: number, samples: StatusLineBlockId[]): StatusLinePreview {
  try {
    const value: unknown = JSON.parse(stdout)
    if (!isRecord(value) || !Array.isArray(value.lines)) {
      throw new Error('not a preview')
    }
    const texts = (list: unknown) => (Array.isArray(list) ? list.filter((line): line is string => typeof line === 'string') : [])

    return {
      base: texts(value.base).flatMap(line => styledLines(line)),
      lines: texts(value.lines).flatMap(line => styledLines(line)),
      dropped: (Array.isArray(value.dropped) ? value.dropped : []).filter(isBlockId),
      samples,
      columns,
      error: null,
    }
  } catch {
    const said = stdout.split('\n').find(line => line.trim() !== '')

    return { base: [], lines: [], dropped: [], samples, columns, error: said === undefined ? 'The preview could not run.' : stripControls(said) }
  }
}

// --- ANSI colors to styled runs ---------------------------------------------

// The xterm palette: the 16 named colors, a 6×6×6 cube, then 24 grays.
const NAMED = [
  '#000000', '#cd0000', '#00cd00', '#cdcd00', '#0000ee', '#cd00cd', '#00cdcd', '#e5e5e5',
  '#7f7f7f', '#ff0000', '#00ff00', '#ffff00', '#5c5cff', '#ff00ff', '#00ffff', '#ffffff',
]
const CUBE = [0, 95, 135, 175, 215, 255]

const hex = (red: number, green: number, blue: number) =>
  `#${[red, green, blue].map(part => Math.max(0, Math.min(255, part)).toString(16).padStart(2, '0')).join('')}`

export function paletteColor(index: number): string | undefined {
  if (!Number.isInteger(index) || index < 0 || index > 255) {
    return undefined
  }
  if (index < 16) {
    return NAMED[index]
  }
  if (index < 232) {
    const cube = index - 16
    return hex(CUBE[Math.floor(cube / 36)] ?? 0, CUBE[Math.floor(cube / 6) % 6] ?? 0, CUBE[cube % 6] ?? 0)
  }
  const gray = 8 + (index - 232) * 10

  return hex(gray, gray, gray)
}

type Style = Omit<StatusLineRun, 'text'>

// An extended color (38;5;n or 38;2;r;g;b) from the parameters after 38 or 48; how many it used.
function extendedColor(params: number[], from: number): { color: string | undefined; used: number } {
  if (params[from] === 5) {
    return { color: paletteColor(params[from + 1] ?? -1), used: 2 }
  }
  if (params[from] === 2) {
    return { color: hex(params[from + 1] ?? 0, params[from + 2] ?? 0, params[from + 3] ?? 0), used: 4 }
  }

  return { color: undefined, used: 0 }
}

function applySgr(style: Style, params: number[]): Style {
  let next: Style = { ...style }
  const list = params.length === 0 ? [0] : params
  for (let index = 0; index < list.length; index++) {
    const code = list[index] ?? 0
    if (code === 0) {
      next = {}
    } else if (code === 1) {
      next.bold = true
    } else if (code === 2) {
      next.dimColor = true
    } else if (code === 3) {
      next.italic = true
    } else if (code === 4) {
      next.underline = true
    } else if (code === 7) {
      next.inverse = true
    } else if (code === 9) {
      next.strikethrough = true
    } else if (code === 22) {
      delete next.bold
      delete next.dimColor
    } else if (code === 23) {
      delete next.italic
    } else if (code === 24) {
      delete next.underline
    } else if (code === 27) {
      delete next.inverse
    } else if (code === 29) {
      delete next.strikethrough
    } else if (code >= 30 && code <= 37) {
      next.color = NAMED[code - 30]
    } else if (code >= 90 && code <= 97) {
      next.color = NAMED[code - 90 + 8]
    } else if (code === 39) {
      delete next.color
    } else if (code >= 40 && code <= 47) {
      next.backgroundColor = NAMED[code - 40]
    } else if (code >= 100 && code <= 107) {
      next.backgroundColor = NAMED[code - 100 + 8]
    } else if (code === 49) {
      delete next.backgroundColor
    } else if (code === 38 || code === 48) {
      const { color, used } = extendedColor(list, index + 1)
      if (color !== undefined) {
        next[code === 38 ? 'color' : 'backgroundColor'] = color
      }
      index += used
    }
  }

  return next
}

/**
 * Terminal output as lines of styled runs. Colors and text styles become
 * props; every other escape sequence and control character is dropped, since
 * one left in a Text refuses the whole band.
 */
export function styledLines(text: string): StatusLineRun[][] {
  return text.split('\n').map(line => {
    const runs: StatusLineRun[] = []
    let style: Style = {}
    let chunk = ''
    const flush = () => {
      if (chunk !== '') {
        const last = runs[runs.length - 1]
        if (last !== undefined && JSON.stringify({ ...last, text: '' }) === JSON.stringify({ ...style, text: '' })) {
          last.text += chunk
        } else {
          runs.push({ text: chunk, ...style })
        }
        chunk = ''
      }
    }
    for (let index = 0; index < line.length; index++) {
      const char = line[index] ?? ''
      const code = char.charCodeAt(0)
      if (char === '\u001b') {
        const kind = line[index + 1]
        if (kind === '[') {
          let end = index + 2
          while (end < line.length && !/[@-~]/.test(line[end] ?? '')) {
            end++
          }
          if (line[end] === 'm') {
            flush()
            const params = line
              .slice(index + 2, end)
              .split(/[;:]/)
              .map(part => (part === '' ? 0 : Number(part)))
            style = applySgr(style, params.every(Number.isFinite) ? params : [])
          }
          index = end
        } else if (kind === ']') {
          // An OSC (a link, a title) runs to BEL or ESC \.
          let end = index + 2
          while (end < line.length && line[end] !== '\u0007' && !(line[end] === '\u001b' && line[end + 1] === '\\')) {
            end++
          }
          index = line[end] === '\u001b' ? end + 1 : end
        } else {
          index++
        }
      } else if (char === '\t') {
        chunk += ' '
      } else if (code < 0x20 || code === 0x7f || (code >= 0x80 && code <= 0x9f)) {
        // Dropped: a control character refuses the tree.
      } else {
        chunk += char
      }
    }
    flush()

    return runs
  })
}

export function stripControls(text: string): string {
  return styledLines(text)
    .map(line => line.map(run => run.text).join(''))
    .join(' ')
}
