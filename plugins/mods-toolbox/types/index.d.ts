export type CleanViewPhase = 'working' | 'needsYou' | 'stuck' | 'stopped' | 'done'

export type CleanViewTaskStatus = 'done' | 'active' | 'upcoming'

export type CleanViewTask = {
  id: string
  name: string
  status: CleanViewTaskStatus
  percent: number
  hasReported: boolean
}

// Where the real plan came from; null while only the placeholder steps show.
export type CleanViewPlanSource = 'steps' | 'todos' | 'tasks'

export type CleanViewChecklist = {
  jobId: string
  title: string
  phase: CleanViewPhase
  tasks: CleanViewTask[]
  planSource: CleanViewPlanSource | null
  needsYouReason: string | null
  stuckReason: string | null
  failedInARow: number
  // The main turn working on this job right now; null between turns.
  turnId: string | null
  // Background helpers still out between turns: their reports start the next
  // turn, so the job keeps working. 0 otherwise.
  waitingOnHelpers: number
  startedAt: number
  finishedAt: number | null
  isCollapsed: boolean
}

export type DockCardStatus = 'queued' | 'working' | 'done' | 'stuck'

// One helper: an Agent call of the main loop, keyed by its tool_use_id.
export type DockCard = {
  id: string
  task: string
  initials: string
  colorIndex: number
  status: DockCardStatus
  percent: number
  hasReported: boolean
  // The subagent's id once agent.spawn answered; its report_progress and
  // turn.complete carry it.
  agentId: string | null
  // From agent.spawn; null when the spawn was never seen.
  isBackground: boolean | null
  startedAt: number | null
  finishedAt: number | null
}

// One request split across helpers, from the person's prompt to the main
// turn that ends after every helper has finished.
export type DockMission = {
  id: string
  job: string
  size: number
  cards: DockCard[]
  hasNudged: boolean
  startedAt: number
  finishedAt: number | null
}

export type DockHelperModel = 'fast' | 'same'

export type ChatEffort = 'low' | 'medium' | 'high' | 'xhigh' | 'max'

// Ultracode (`/effort ultracode on|off`, Max plans); unavailable once the command refused it.
export type ChatUltracode = 'on' | 'off' | 'unavailable'

// What the band above the prompt shows of the Toolbox's: its popup or the Status Line Dock.
export type BandView = 'toolbox' | 'statusLineDock'

export type StatusLineBlockId =
  | 'folder'
  | 'branch'
  | 'model'
  | 'effort'
  | 'version'
  | 'style'
  | 'context'
  | 'cost'
  | 'lines'
  | 'time'
  | 'limits'
  | 'cache'
  | 'agents'
  | 'skill'

// The skill the main conversation ran last, by the name the engine resolved
// (`council:review-plan`); running until that turn ends.
export type StatusLineSkill = { name: string; isRunning: boolean }

export type StatusLineMode = 'replace' | 'extend'

export type StatusLineIcons = 'glyph' | 'emoji' | 'none'

// The Base status line Extend keeps on top: a command kept from the settings
// file the install changed, or the one a settings file holds now.
export type StatusLineBase = { kind: 'command'; command: string } | { kind: 'file'; path: string }

// The Layout file the renderer reads; a block in no line is off.
export type StatusLineLayout = {
  version: 1
  mode: StatusLineMode
  icons: StatusLineIcons
  lines: StatusLineBlockId[][]
  base: StatusLineBase | null
}

// Global is the user's settings.json; project is this project's .claude/settings.local.json.
export type StatusLineScope = 'global' | 'project'

export type StatusLineScopeState = {
  // The settings file an install of this scope changes, absolute.
  file: string
  layoutFile: string
  // The status line command an install of this scope sets.
  command: string
  isInstalled: boolean
  layout: StatusLineLayout | null
  // What Extend keeps on top if this scope is installed now.
  base: StatusLineBase | null
  // What an uninstall puts back, as the confirm says it; null when this scope isn't installed.
  restores: string | null
  // Whether this machine keeps a record of the install, so Uninstall can put back what was there.
  isRecorded: boolean
  // Why the settings file cannot be changed (it is not plain JSON), or null.
  problem: string | null
}

export type StatusLineSetup = {
  // A status line from managed (policy) settings, which nothing here can change.
  isLocked: boolean
  // The command in force in this project and where it comes from.
  inForce: { source: 'local' | 'project' | 'user'; command: string } | null
  global: StatusLineScopeState
  project: StatusLineScopeState
}

// One run of text in one style, as the preview draws it.
export type StatusLineRun = {
  text: string
  color?: string
  backgroundColor?: string
  bold?: true
  dimColor?: true
  italic?: true
  underline?: true
  strikethrough?: true
  inverse?: true
}

export type StatusLinePreview = {
  base: StatusLineRun[][]
  lines: StatusLineRun[][]
  dropped: StatusLineBlockId[]
  // The blocks drawn from sample figures, Claude Code having none yet.
  samples: StatusLineBlockId[]
  columns: number
  error: string | null
}

// A press that waits for Continue in the Dock's gold box.
export type StatusLineConfirm = 'install' | 'uninstall'

declare module 'claude-code' {
  interface PluginState {
    'mods-toolbox': {
      cleanViewEnabled: boolean
      checklist: CleanViewChecklist | null
      tick: number
      dockTeamSize: number
      dockHelperModel: DockHelperModel
      // A size above the big-team line waiting for Continue or Cancel.
      dockPendingSize: number | null
      dockIsCustomOpen: boolean
      dockIsFolded: boolean
      dockMission: DockMission | null
      dockTick: number
      // What the band above the prompt shows: the Toolbox popup, the Status Line Dock, or neither. This session only.
      bandView: BandView | null
      // What the Status Line Dock found in the settings files, read again each time it opens.
      statusLineSetup: StatusLineSetup | null
      statusLineScope: StatusLineScope
      // Edits not applied yet, per scope; null while a scope shows its saved Layout.
      statusLineDrafts: { global: StatusLineLayout | null; project: StatusLineLayout | null }
      statusLineSelected: StatusLineBlockId | null
      statusLineConfirm: StatusLineConfirm | null
      statusLinePreview: StatusLinePreview | null
      // What the Skill block shows for this session; null until a skill runs or after /clear.
      statusLineSkill: StatusLineSkill | null
      // The aliases /config's model row offers; empty when it has none or is locked.
      chatModelOptions: string[] | null
      // The session's model id, read back after /model, /config and the Toolbox change it.
      chatModel: string | null
      // The session's effort as last seen (a turn's Stop, /effort); null when unknown.
      chatEffort: ChatEffort | null
      // A family or level the Toolbox asked /model or /effort for, waiting to run.
      chatModelPending: string | null
      chatEffortPending: ChatEffort | null
      // Ultracode for this session as last set; off until someone turns it on.
      chatUltracode: ChatUltracode
      chatUltracodePending: 'on' | 'off' | null
    }
  }
}
