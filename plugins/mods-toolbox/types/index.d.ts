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
    }
  }
}
