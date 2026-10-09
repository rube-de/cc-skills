import { atom, read, update } from 'claude-code'
import type {
  EngineInterface,
  On,
  RenderInput,
  Timer,
  ToolCallInput,
  ToolCallResult,
  TurnCompleteInput,
} from 'claude-code'

import type { CleanViewChecklist, CleanViewTask } from '../types'
import { API_TROUBLE, WAITING_FOR_REPLY, checklistView, isAnimated } from './checklist-view'
import { cleanName } from './clean-name'
import { ACTIVE_STATUSES } from './dock-logic'
import { clampPercent } from './progress'

type Engine = EngineInterface
type Checklist = CleanViewChecklist

const enabledAtom = atom({ plugin: 'mods-toolbox', key: 'cleanViewEnabled' } as const, true)
const checklistAtom = atom({ plugin: 'mods-toolbox', key: 'checklist' } as const, null)
const tickAtom = atom({ plugin: 'mods-toolbox', key: 'tick' } as const, 0)
// The Toolbox's: while its popup is open it draws the checklist beside it.
const toolboxOpenAtom = atom({ plugin: 'mods-toolbox', key: 'toolboxIsOpen' } as const, false)

const STORE_KEY = 'cleanViewEnabled'
const ALWAYS_ALLOWED = new Set([
  'ToolSearch',
  'TodoWrite',
  'TaskCreate',
  'TaskUpdate',
  'AskUserQuestion',
])

const FRAME_MS = 250
const COLLAPSE_AFTER_MS = 5000
const FAILURES_BEFORE_STUCK = 3
const MAX_STEPS = 8
const HELPER_CHECK_MS = 5000
// Checks in a row that find no helper out before the job stops waiting, so the
// turn their reports start has time to begin.
const QUIET_CHECKS = 2

const DEFAULT_TITLE = 'Working on your request'
const NEEDS_OK = 'Claude needs your OK to continue'
const HAS_QUESTION = 'Claude has a question for you'
const SAID_NO = 'you said no to a step, so Claude paused'
const KEEPS_FAILING = 'a step keeps failing, Claude is trying another way'
const REFUSED = "Claude couldn't help with that request"
const OFF_NOTE = 'Clean View is off, so there is no checklist to update. Carry on without it.'

// The words Claude Code hands the model when the person rejects a permission prompt.
const PERSON_SAID_NO = /doesn't want to proceed|tool use was rejected/i

function gateMessage(): string {
  return (
    `Clean View: call ${tools.plan} first to lay out the steps of this request ` +
    `(if it is deferred, load it with ToolSearch "select:${tools.plan},${tools.progress}"), then try again.`
  )
}

function guide(): string {
  return [
    '# Clean View',
    'The person sees a short checklist of your steps instead of your tool calls, so keep it accurate and friendly.',
    `- For every request, even a quick question, call ${tools.plan} first with every step of the job, 2 to 8 in order. If it is deferred, load it with ToolSearch ("select:${tools.plan},${tools.progress}"). Other tools are refused until a plan exists. If this session has TodoWrite or TaskCreate, your to-do list can serve as the plan instead.`,
    `- Call ${tools.progress} with the step's name and a percent as real progress happens, and with 100 the moment a step is finished.`,
    '- Write every step name in plain English a non-technical person understands: under 40 characters, starting with a verb, like "Build the pricing section".',
    '- Never put file paths, file names, commands, code or tool names in a step name.',
  ].join('\n')
}

const TITLE_PROMPT =
  'Name this request in 2 to 6 plain words a non-technical person understands, starting with a verb, ' +
  'like "Build my landing page". No file names, code or punctuation. Reply with the name only.\n\nRequest:\n'

// Timers and per-turn flags live with the module: a reload drops them and
// session.start puts the timers back from the checklist.
// The engine names the two tools when it registers them (mcp__<plugin>__<name>);
// these defaults hold until it has.
let tools = { plan: 'mcp__mods-toolbox__plan_steps', progress: 'mcp__mods-toolbox__report_progress' }
let ticker: Timer | null = null
let collapseTimer: Timer | null = null
let helperWatch: Timer | null = null
let quietChecks = 0
let areToolsReady = false
let isExpansionPending = false
let lastApiTrouble: string | null = null

/** The dock tells helpers to call these by the names the engine gave them. */
export function cleanViewTools(): { plan: string; progress: string } {
  return tools
}

export function registerCleanView(on: On) {
  on('session.start', async ($, e, next) => {
    const saved = await $.store.get(STORE_KEY)
    await update($, enabledAtom, () => saved !== false)

    const job = await read($, checklistAtom)
    syncTicker($, job)
    syncHelperWatch($, job)
    scheduleCollapse($, job, await $.clock.now())

    await $.command.register({
      name: 'simple',
      description: 'Turn Clean View on or off',
      argumentHint: 'on|off',
      immediate: true,
    })
    // The plan-first gate only stands once Claude can call plan_steps.
    areToolsReady = await registerTools($).then(
      names => {
        tools = names
        return true
      },
      () => false,
    )

    return next(e)
  })

  on('command.run', { command: 'simple' }, async ($, e) => {
    const wanted = e.args.trim().toLowerCase()
    if (wanted !== '' && wanted !== 'on' && wanted !== 'off') {
      return { text: 'Type /simple on, /simple off, or just /simple to switch.' }
    }
    const isOn = await setEnabled($, wanted === '' ? 'toggle' : wanted === 'on')

    return { text: isOn ? 'Clean View is on.' : 'Clean View is off.' }
  })

  // While off, plan_steps waits behind ToolSearch so its "before anything else" doesn't nudge Claude.
  // report_progress stays in front: the dock's helpers call it whether Clean View is on or not.
  on('tool.describe', async ($, e, next) => {
    const described = await next(e)
    const tool = String(e.tool)
    if (!isOwnTool(tool)) {
      return described
    }

    return { ...described, isDeferred: tool === tools.plan && !(await read($, enabledAtom)) }
  })

  on('prompt.compose', async ($, e, next) => {
    const composed = await next(e)
    if (!(await read($, enabledAtom))) {
      return composed
    }

    return { sections: [...composed.sections, { id: 'clean-view:guide', text: guide(), scope: 'session' }] }
  })

  on('classic.UserPromptExpansion', ($, e, next) => {
    isExpansionPending = true

    return next(e)
  })

  on('turn.start', async ($, e, next) => {
    const isCommand = isExpansionPending || e.text.trimStart().startsWith('/')
    isExpansionPending = false
    lastApiTrouble = null
    if (isCommand || e.text.trim() === '') {
      return next(e)
    }
    // While off there is no job to show, so no checklist to keep and no title to ask Haiku for.
    if (!(await read($, enabledAtom))) {
      await change($, () => null)
      return next(e)
    }

    const now = await $.clock.now()
    // The person's answer, or the helpers' reports, carry the same job on.
    const job = await change($, current =>
      current !== null && (isWaitingOnPerson(current) || isWaitingOnHelpers(current))
        ? { ...working(current), turnId: e.turnId, failedInARow: 0, finishedAt: null, isCollapsed: false, waitingOnHelpers: 0 }
        : newJob(e.turnId, e.turnId, now),
    )
    if (job?.jobId === e.turnId) {
      nameJob($, e.turnId, e.text)
    }

    return next(e)
  })

  on('tool.call', async ($, e, next) => {
    const tool = String(e.tool)
    if (isOwnTool(tool)) {
      // While off there is no checklist, so a stray call has nothing to update.
      if (!(await read($, enabledAtom))) {
        return { result: OFF_NOTE }
      }
      return tool === tools.plan ? planSteps($, e) : reportProgress($, e)
    }
    if (e.agentId !== undefined) {
      return next(e)
    }

    const job = await read($, checklistAtom)
    const needsPlan = areToolsReady && isTurnRunning(job) && job.planSource === null
    if (needsPlan && !ALWAYS_ALLOWED.has(tool) && (await read($, enabledAtom))) {
      return { deny: gateMessage() }
    }

    await change($, current => {
      if (!isTurnRunning(current)) {
        return current
      }
      if (tool === 'AskUserQuestion') {
        return { ...current, phase: 'needsYou', needsYouReason: HAS_QUESTION, stuckReason: null }
      }

      return current.phase === 'needsYou' ? working(current) : current
    })

    const ran = await next(e)
    if (ran.deny === undefined) {
      await change($, current => (isTurnRunning(current) ? afterTool(current, e, ran) : current))
    }

    return ran
  })

  on('classic.Notification', async ($, e, next) => {
    const kind = e.notification_type
    const reason = /permission/i.test(kind) ? NEEDS_OK : /elicitation|question/i.test(kind) ? HAS_QUESTION : null
    if (reason !== null) {
      await needsYou($, reason)
    }

    return next(e)
  })

  on('classic.PermissionRequest', async ($, e, next) => {
    await needsYou($, NEEDS_OK)

    return next(e)
  })

  on('classic.StopFailure', async ($, e, next) => {
    if (e.agent_id === undefined) {
      const trouble = describeApiTrouble(e.error, e.error_details ?? '')
      lastApiTrouble = trouble
      // Whichever of this and turn.complete lands first, the plain reason wins.
      await change($, job =>
        job?.phase === 'stuck' && job.stuckReason === API_TROUBLE ? { ...job, stuckReason: trouble } : job,
      )
    }

    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    if (e.agentId !== undefined) {
      return next(e)
    }
    const now = await $.clock.now()
    const trouble = lastApiTrouble
    const helpers = isTurnRunning(await read($, checklistAtom)) ? ((await runningHelpers($)) ?? 0) : 0
    const job = await change($, current =>
      isTurnRunning(current) ? finished(current, e, now, trouble, helpers) : current,
    )
    scheduleCollapse($, job, now)

    return next(e)
  })

  on('ui.render', { component: 'ToolUse' }, async ($, e, next) => {
    if (!(await read($, enabledAtom))) {
      return next(e)
    }
    const { Box } = $.ui.resolve(e)

    return <Box display="none" />
  })

  on('ui.render', { component: 'ToolResult' }, async ($, e, next) => {
    if (!(await read($, enabledAtom))) {
      return next(e)
    }
    const { Box } = $.ui.resolve(e)

    return <Box display="none" />
  })

  on('ui.render', { component: 'ToolGroup' }, async ($, e, next) => {
    if (!(await read($, enabledAtom))) {
      return next(e)
    }
    const { Box } = $.ui.resolve(e)

    return <Box display="none" />
  })

  on('ui.render', { component: 'ToolProgress' }, async ($, e, next) =>
    (await read($, enabledAtom)) ? next({ ...e, props: { ...e.props, hint: '' } }) : next(e),
  )

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey || (await read($, toolboxOpenAtom))) {
      return next(e)
    }
    // The band is shared with other mods: Clean View sits on top of whatever the hooks beneath draw.
    const { Box } = $.ui.resolve(e)
    const band = await drawChecklist($, e)
    const below = await next(e)

    return (
      <Box flexDirection="column">
        {band}
        {below}
      </Box>
    )
  })

  // The Toolbox popup draws the switch; flipping it is Clean View's own business.
  on('ui.press', { plugin: 'mods-toolbox', component: 'AbovePrompt', element: /^cv-(on|off)$/ }, async ($, e) => {
    try {
      await setEnabled($, e.element === 'cv-on')
    } catch {
      $.ui.toast('Clean View could not switch. Try /simple.')
    }

    return { element: e.element }
  })
}

// Nothing while Clean View is off or idle.
async function drawChecklist($: Engine, e: RenderInput<'AbovePrompt'>) {
  const job = (await read($, enabledAtom)) ? await read($, checklistAtom) : null
  if (job === null) {
    return null
  }
  const { Box, Text } = $.ui.resolve(e)
  const frame = isAnimated(job.phase) ? await read($, tickAtom) : 0

  return checklistView(Box, Text, job, { columns: e.props.bodyColumns, isFolded: false, now: await $.clock.now(), frame })
}

async function registerTools($: Engine) {
  const plan = await $.tool.register({
    name: 'plan_steps',
    description:
      'Lay out every step of the current job before doing anything else: 2 to 8 short names in order, ' +
      'in plain English, each under 40 characters and starting with a verb. No file names, paths, commands or code. ' +
      'The first step starts right away.',
    inputSchema: {
      type: 'object',
      properties: {
        steps: {
          type: 'array',
          items: { type: 'string' },
          minItems: 2,
          maxItems: MAX_STEPS,
          description: 'The steps in order, like "Build the pricing section"',
        },
      },
      required: ['steps'],
      additionalProperties: false,
    },
  })
  const progress = await $.tool.register({
    name: 'report_progress',
    description:
      'Report progress on a step of the plan: its name as planned and a percent from 0 to 100. ' +
      'Report 100 the moment a step is finished; that checks it off and starts the next one.',
    inputSchema: {
      type: 'object',
      properties: {
        task: { type: 'string', description: 'The step name, as planned' },
        percent: { type: 'number', minimum: 0, maximum: 100 },
      },
      required: ['task', 'percent'],
      additionalProperties: false,
    },
  })

  return { plan: plan.tool, progress: progress.tool }
}

async function planSteps($: Engine, e: ToolCallInput): Promise<ToolCallResult> {
  const steps = stringList(argsOf(e).steps).slice(0, MAX_STEPS).map(cleanName)
  if (steps.length < 2) {
    return { deny: 'plan_steps needs "steps": a list of 2 to 8 short step names.' }
  }
  const answer = { result: `Planned ${steps.length} steps. The first one has started.` }
  // A subagent's plan is its own business; the checklist follows the main agent.
  if (e.agentId !== undefined) {
    return answer
  }

  const now = await $.clock.now()
  const job = await change($, current => {
    // No job yet (a slash command's turn, say): start one; turn.complete still ends it.
    const base = isTurnRunning(current) ? current : newJob(`plan-${now}`, 'untracked', now)

    return {
      ...working(base),
      planSource: 'steps',
      tasks: steps.map((name, index) => newTask(`step-${index + 1}`, name, index === 0 ? 'active' : 'upcoming')),
    }
  })
  if (job?.jobId === `plan-${now}`) {
    nameJob($, job.jobId, steps.join('; '))
  }

  return answer
}

async function reportProgress($: Engine, e: ToolCallInput): Promise<ToolCallResult> {
  const args = argsOf(e)
  const percent = clampPercent(args.percent)
  if (e.agentId === undefined && typeof args.task === 'string') {
    const name = args.task
    await change($, current => (isTurnRunning(current) ? progressed(current, name, percent) : current))
  }

  return { result: `Progress noted: ${percent}%.` }
}

async function setEnabled($: Engine, wanted: boolean | 'toggle'): Promise<boolean> {
  const wasOn = await read($, enabledAtom)
  const isOn = await update($, enabledAtom, current => (wanted === 'toggle' ? !current : wanted))
  // The engine keeps tool.describe's answer for the session; asking again moves plan_steps.
  // Only on a real change, since each ask spends the prompt cache.
  if (isOn !== wasOn) {
    $.ui.invalidate('tool.describe')
  }
  await $.store.set(STORE_KEY, isOn)
  $.ui.toast(isOn ? 'Clean View is on: you see the plan, not the details' : 'Clean View is off: every detail is showing')

  return isOn
}

async function needsYou($: Engine, reason: string) {
  await change($, job =>
    isTurnRunning(job) ? { ...job, phase: 'needsYou', needsYouReason: reason, stuckReason: null } : job,
  )
}

async function change($: Engine, fn: (job: Checklist | null) => Checklist | null): Promise<Checklist | null> {
  const job = await update($, checklistAtom, fn)
  syncTicker($, job)
  syncHelperWatch($, job)

  return job
}

// Between turns the helpers' count follows the engine, and a job whose helpers
// all left without a report starting a turn ends the way a turn without them
// would, so it never waits for good.
function syncHelperWatch($: Engine, job: Checklist | null) {
  const shouldWatch = job !== null && isWaitingOnHelpers(job)
  if (shouldWatch && helperWatch === null) {
    quietChecks = 0
    helperWatch = $.clock.every(HELPER_CHECK_MS, () => {
      void recheckHelpers($)
    })
  } else if (!shouldWatch && helperWatch !== null) {
    helperWatch.cancel()
    helperWatch = null
  }
}

async function recheckHelpers($: Engine) {
  const helpers = await runningHelpers($)
  if (helpers === null) {
    return
  }
  quietChecks = helpers === 0 ? quietChecks + 1 : 0
  const now = await $.clock.now()
  const job = await change($, current => {
    if (current === null || !isWaitingOnHelpers(current)) {
      return current
    }
    if (helpers > 0) {
      return helpers === current.waitingOnHelpers ? current : { ...current, waitingOnHelpers: helpers }
    }

    return quietChecks < QUIET_CHECKS ? current : settled(current, now)
  })
  scheduleCollapse($, job, now)
}

// Helpers the engine still runs for this session; null when it can't say.
async function runningHelpers($: Engine): Promise<number | null> {
  try {
    return (await $.agent.list()).filter(agent => ACTIVE_STATUSES.has(agent.status)).length
  } catch {
    return null
  }
}

function syncTicker($: Engine, job: Checklist | null) {
  const shouldTick = job !== null && isAnimated(job.phase)
  if (shouldTick && ticker === null) {
    ticker = $.clock.every(FRAME_MS, () => {
      void update($, tickAtom, frame => frame + 1)
    })
  } else if (!shouldTick && ticker !== null) {
    ticker.cancel()
    ticker = null
  }
}

function scheduleCollapse($: Engine, job: Checklist | null, now: number) {
  collapseTimer?.cancel()
  collapseTimer = null
  if (job === null || job.phase !== 'done' || job.isCollapsed || job.finishedAt === null) {
    return
  }
  const { jobId } = job
  const wait = Math.max(1, job.finishedAt + COLLAPSE_AFTER_MS - now)
  collapseTimer = $.clock.after(wait, () => {
    void update($, checklistAtom, current =>
      current?.jobId === jobId && current.phase === 'done' ? { ...current, isCollapsed: true } : current,
    )
  })
}

// Started from a timer so the request is not tied to the turn.start dispatch.
function nameJob($: Engine, jobId: string, request: string) {
  $.clock.after(1, () => {
    void askForTitle($, jobId, request)
  })
}

async function askForTitle($: Engine, jobId: string, request: string) {
  try {
    const reply = await $.model.complete({
      model: 'haiku',
      effort: 'low',
      maxTokens: 30,
      timeoutMs: 20_000,
      prompt: TITLE_PROMPT + request.slice(0, 2000),
    })
    if (!reply.isAnswered) {
      return
    }
    const words = reply.text.replace(/[^\p{L}\p{N}\s'’-]/gu, ' ').trim().split(/\s+/).filter(Boolean)
    if (words.length < 2) {
      return
    }
    const title = cleanName(words.slice(0, 6).join(' '))
    await update($, checklistAtom, job => (job?.jobId === jobId ? { ...job, title } : job))
  } catch {
    // The placeholder title stays; naming is a nicety.
  }
}

function newJob(jobId: string, turnId: string, now: number): Checklist {
  return {
    jobId,
    title: DEFAULT_TITLE,
    phase: 'working',
    tasks: [newTask('placeholder-1', 'Understand your request', 'active'), newTask('placeholder-2', 'Plan the steps', 'upcoming')],
    planSource: null,
    needsYouReason: null,
    stuckReason: null,
    failedInARow: 0,
    turnId,
    waitingOnHelpers: 0,
    startedAt: now,
    finishedAt: null,
    isCollapsed: false,
  }
}

function newTask(id: string, name: string, status: CleanViewTask['status']): CleanViewTask {
  return { id, name, status, percent: status === 'done' ? 100 : 0, hasReported: false }
}

function working(job: Checklist): Checklist {
  return { ...job, phase: 'working', needsYouReason: null, stuckReason: null }
}

function progressed(job: Checklist, rawName: string, percent: number): Checklist {
  const name = cleanName(rawName)
  const tasks = job.planSource === null ? [] : job.tasks
  let index = tasks.findIndex(task => task.name.toLowerCase() === name.toLowerCase())
  let list = tasks
  if (index < 0) {
    const active = tasks.findIndex(task => task.status === 'active')
    index = active < 0 ? tasks.length : active
    list = [...tasks.slice(0, index), newTask(`added-${tasks.length + 1}`, name, 'upcoming'), ...tasks.slice(index)]
  }
  const isFinished = percent >= 100
  const reported = list.map((task, at): CleanViewTask => {
    if (at < index) {
      return { ...task, status: 'done', percent: 100 }
    }
    if (at === index) {
      return { ...task, status: isFinished ? 'done' : 'active', percent, hasReported: true }
    }

    return task.status === 'active' ? { ...task, status: 'upcoming' } : task
  })

  return { ...working(job), tasks: withOneActive(reported) }
}

function afterTool(job: Checklist, e: ToolCallInput, ran: ToolCallResult): Checklist {
  if (ran.isError === true) {
    if (PERSON_SAID_NO.test(ran.text ?? '')) {
      return { ...job, phase: 'stuck', stuckReason: SAID_NO, needsYouReason: null, failedInARow: 0 }
    }
    const failedInARow = job.failedInARow + 1
    if (failedInARow >= FAILURES_BEFORE_STUCK) {
      return { ...job, failedInARow, phase: 'stuck', stuckReason: KEEPS_FAILING, needsYouReason: null }
    }

    return { ...(job.phase === 'needsYou' ? working(job) : job), failedInARow }
  }

  // A success clears both Stuck and Needs you.
  const next = { ...working(job), failedInARow: 0 }
  if (e.tool === 'TodoWrite') {
    return fromTodos(next, e.todos)
  }
  if (e.tool === 'TaskCreate') {
    const id = createdTaskId(ran.result)

    return id === null ? next : withCreatedTask(next, id, e.subject)
  }
  if (e.tool === 'TaskUpdate') {
    return withUpdatedTask(next, e.taskId, e.status, e.subject)
  }

  return next
}

const TODO_STATUS = { completed: 'done', in_progress: 'active', pending: 'upcoming' } as const

function fromTodos(
  job: Checklist,
  todos: ReadonlyArray<{ content: string; status: keyof typeof TODO_STATUS }>,
): Checklist {
  const tasks = todos.map((todo, index) => {
    const id = `todo-${index + 1}`
    const name = cleanName(todo.content)
    const status = TODO_STATUS[todo.status] ?? 'upcoming'
    const before = job.tasks.find(task => task.name === name && task.status === 'active')

    return status === 'active' && before !== undefined ? { ...before, id } : newTask(id, name, status)
  })

  return { ...job, planSource: 'todos', tasks: withOneActive(tasks) }
}

function withCreatedTask(job: Checklist, id: string, subject: string): Checklist {
  const tasks = job.planSource === 'tasks' ? job.tasks : []

  return { ...job, planSource: 'tasks', tasks: withOneActive([...tasks, newTask(`task-${id}`, cleanName(subject), 'upcoming')]) }
}

function withUpdatedTask(
  job: Checklist,
  taskId: string,
  status: keyof typeof TODO_STATUS | 'deleted' | undefined,
  subject: string | undefined,
): Checklist {
  const id = `task-${taskId}`
  if (job.planSource !== 'tasks' || !job.tasks.some(task => task.id === id)) {
    return job
  }
  if (status === 'deleted') {
    return { ...job, tasks: withOneActive(job.tasks.filter(task => task.id !== id)) }
  }
  const next = status === undefined ? undefined : TODO_STATUS[status]
  const tasks = job.tasks.map((task): CleanViewTask => {
    if (task.id !== id) {
      return next === 'active' && task.status === 'active' ? { ...task, status: 'upcoming' } : task
    }
    const renamed = subject === undefined ? task : { ...task, name: cleanName(subject) }

    return next === undefined ? renamed : { ...renamed, status: next, percent: next === 'done' ? 100 : renamed.percent }
  })

  return { ...job, tasks: withOneActive(tasks) }
}

function withOneActive(tasks: CleanViewTask[]): CleanViewTask[] {
  if (tasks.some(task => task.status === 'active')) {
    return tasks
  }
  const next = tasks.findIndex(task => task.status === 'upcoming')

  return next < 0 ? tasks : tasks.map((task, index) => (index === next ? { ...task, status: 'active' } : task))
}

function finished(job: Checklist, e: TurnCompleteInput, now: number, trouble: string | null, helpers: number): Checklist {
  const ended: Checklist = { ...job, turnId: null, needsYouReason: null, waitingOnHelpers: 0 }
  if (e.reason === 'error') {
    return { ...ended, phase: 'stuck', stuckReason: trouble ?? API_TROUBLE }
  }
  if (e.reason === 'refusal') {
    return { ...ended, phase: 'stuck', stuckReason: REFUSED }
  }
  // Saying no to a permission prompt also ends the turn; the no is the news.
  if (job.phase === 'stuck' && job.stuckReason === SAID_NO) {
    return ended
  }
  if (e.reason === 'aborted') {
    return { ...ended, phase: 'stopped', stuckReason: null, finishedAt: now }
  }
  // Claude ends its turn while background helpers run, and goes on when they
  // report: it is not waiting for the person.
  if (helpers > 0) {
    return { ...ended, phase: 'working', stuckReason: null, waitingOnHelpers: helpers }
  }

  return settled(ended, now)
}

// A job with no turn and no helper left: unfinished steps wait for the person.
function settled(job: Checklist, now: number): Checklist {
  const ended: Checklist = { ...job, waitingOnHelpers: 0 }
  if (job.planSource !== null && job.tasks.some(task => task.status !== 'done')) {
    return { ...ended, phase: 'needsYou', stuckReason: null, needsYouReason: WAITING_FOR_REPLY }
  }

  return {
    ...ended,
    phase: 'done',
    stuckReason: null,
    finishedAt: now,
    tasks: job.tasks.map(task => ({ ...task, status: 'done', percent: 100 })),
  }
}

function describeApiTrouble(kind: string, details: string): string {
  if (/too long|context window|too many tokens/i.test(details)) {
    return 'this chat got too long, type /compact and try again'
  }
  if (/network|connection|socket|econn|enotfound|fetch failed|offline/i.test(details)) {
    return 'the internet connection dropped'
  }
  switch (kind) {
    case 'rate_limit':
      return 'you hit your usage limit, try again a little later'
    case 'overloaded':
    case 'server_error':
      return "Claude's servers are busy, try again in a minute"
    case 'authentication_failed':
    case 'oauth_org_not_allowed':
    case 'cloud_credential_error':
      return "you're signed out, type /login"
    case 'billing_error':
    case 'account_on_hold':
    case 'verification_required':
      return 'your account needs attention, check your plan'
    default:
      return API_TROUBLE
  }
}

function isOwnTool(tool: string): boolean {
  return tool === tools.plan || tool === tools.progress
}

function isTurnRunning(job: Checklist | null): job is Checklist {
  return job !== null && job.turnId !== null
}

function isWaitingOnHelpers(job: Checklist): boolean {
  return job.turnId === null && job.waitingOnHelpers > 0
}

function isWaitingOnPerson(job: Checklist): boolean {
  const isPaused = job.phase === 'needsYou' || job.phase === 'stuck'

  return isPaused && job.planSource !== null && job.tasks.some(task => task.status !== 'done')
}

function argsOf(e: ToolCallInput): Record<string, unknown> {
  return e as unknown as Record<string, unknown>
}

function stringList(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string' && item.trim() !== '') : []
}

function createdTaskId(result: unknown): string | null {
  const id = (result as { task?: { id?: unknown } } | null | undefined)?.task?.id

  return typeof id === 'string' || typeof id === 'number' ? String(id) : null
}
