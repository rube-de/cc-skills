import type { On, ToolCallInput, ToolCallResult } from 'claude-code'
import { describe, expect, mock, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'

import { cleanName } from '../hooks/clean-name'
import type { CleanViewChecklist } from '../types'

const PLUGIN = 'clean-view'
const PLAN = 'mcp__clean-view__plan_steps'
const PROGRESS = 'mcp__clean-view__report_progress'
const SURFACES = ['terminal', 'desktop'] as const
const LABELS = ['Done', 'Working', 'Next', 'Up next', /^\d+%$/]

const band = (bodyColumns = 80) =>
  ({
    plugin: PLUGIN,
    component: 'AbovePrompt',
    props: {
      hasSurvey: false,
      isWorking: true,
      maxRows: 20,
      bodyColumns,
      scroll: { offset: 0, bodyRows: 19 },
      view: {},
    },
  }) as const

const TOOL_ROW = {
  tool_use_id: 'toolu_1',
  tool: 'Bash',
  input: { command: 'ls' },
  isRunning: false,
  isErrored: false,
  isInterrupted: false,
} as const

const TOOL_RESULT = { tool_use_id: 'toolu_1', tool: 'Bash', output: { stdout: 'a.txt' }, isErrored: false } as const

const TOOL_GROUP = { calls: [], isActive: false, isExpanded: false } as const

// The test engine has no $.state or $.store to read back: the plugin's
// writes are watched on their way down, and the store is kept here.
type Seen = {
  checklist: CleanViewChecklist | null
  tick: number
  isEnabled: boolean | undefined
  stored: Record<string, unknown>
}

type Options = {
  stored?: Record<string, unknown>
  toolPrefix?: string
  answerTool?: (e: ToolCallInput) => ToolCallResult
}

// What the engine would do beneath the plugin, answered from memory.
function world(
  on: On,
  { stored = {}, toolPrefix = 'mcp__clean-view__', answerTool = () => ({ result: 'ok' }) }: Options = {},
) {
  const seen: Seen = { checklist: null, tick: 0, isEnabled: undefined, stored: { ...stored } }
  on('state.set', { plugin: 'clean-view' }, ($, e, next) => {
    if (e.key === 'checklist') seen.checklist = e.value as CleanViewChecklist | null
    if (e.key === 'tick') seen.tick = e.value as number
    if (e.key === 'cleanViewEnabled') seen.isEnabled = e.value as boolean
    return next(e)
  })
  on('store.get', ($, e) => ({ value: seen.stored[e.key] }))
  on('store.set', ($, e) => {
    seen.stored[e.key] = e.value
    return { value: undefined }
  })
  const clock = mock.clock(on, { now: 1_000_000 })
  on('session.start', ($, e) => ({ cwd: e.cwd }))
  on('turn.start', ($, e) => ({ turnId: e.turnId }))
  on('turn.complete', ($, e) => ({ text: e.answer }))
  on('prompt.compose', () => ({ sections: [] }))
  on('tool.call', ($, e) => answerTool(e))
  on('classic.Notification', () => ({}))
  on('classic.StopFailure', () => ({}))
  on('tool.register', ($, e) => ({ value: { tool: `${toolPrefix}${e.name}` } }))
  on('command.register', ($, e) => ({ value: { command: e.name } }))
  on('model.complete', () => ({
    value: {
      isAnswered: true as const,
      text: 'Build my landing page',
      usage: { input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 },
    },
  }))
  on('ui.render', { component: 'ToolUse' }, ($, e) => {
    const { Text } = $.ui.resolve(e)

    return <Text>Bash(ls)</Text>
  })

  return { clock, seen }
}

async function startJob($: Engine, text = 'Build me a landing page with pricing') {
  await $.session.start({ cwd: '/tmp', surface: 'terminal', isInteractive: true })
  await $.turn.start({ text, turnId: 'turn-1' })
}

async function labelsOf(ui: { findAll: (q: { type: string }) => Promise<{ text: string }[]> }) {
  const texts = (await ui.findAll({ type: 'Text' })).map(found => found.text)

  return texts.filter(text => LABELS.some(label => (typeof label === 'string' ? label === text : label.test(text))))
}

describe('names', () => {
  test('code, paths and long names are cleaned', () => {
    expect(cleanName('Build the pricing section in `src/Pricing.tsx`')).toBe('Build the pricing section in')
    expect(cleanName('Update the header in src/components/Header.tsx today')).toBe('Update the header in today')
    expect(cleanName('tidy up Footer.tsx styles')).toBe('Tidy up styles')

    const long = cleanName(
      'Write a friendly welcome message for the landing page that explains every pricing plan clearly',
    )
    expect(long.length).toBeLessThanOrEqual(40)
    expect(long).toEndWith('…')
    expect(long).toBe('Write a friendly welcome message for…')

    expect(cleanName('`npm test`')).toBe('Working on it')
  })
})

describe('checklist', () => {
  test('a to-do list and a 60% report draw ✓ / ▶ 60% / Next / Up next', async ($, on) => {
    world(on)
    await startJob($)
    await $.tool.call({
      tool: 'TodoWrite',
      todos: [
        { content: 'Read your brand notes', status: 'completed', activeForm: 'Reading your brand notes' },
        { content: 'Build the pricing section', status: 'in_progress', activeForm: 'Building the pricing section' },
        { content: 'Add the contact form', status: 'pending', activeForm: 'Adding the contact form' },
        { content: 'Polish the footer', status: 'pending', activeForm: 'Polishing the footer' },
      ],
    })
    await $.tool.call({ tool: PROGRESS, task: 'Build the pricing section', percent: 60 })

    for (const surface of SURFACES) {
      const ui = await $.ui.mount({ ...band(), surface })
      expect(await labelsOf(ui)).toEqual(['Done', '60%', 'Next', 'Up next'])
      expect(await ui.find({ type: 'Text', text: '✓' })).toBeDefined()
      expect(await ui.find({ type: 'Text', text: '▶' })).toBeDefined()
      expect((await ui.find({ type: 'Text', text: '██████░░░░' }))?.text).toBe('██████░░░░')
      expect((await ui.find({ type: 'Button', key: 'toggle' }))?.text).toContain('Clean View: ON')
      await ui.unmount()
    }
  })

  test('plan_steps then 100% checks off step one and starts step two', async ($, on) => {
    const { seen } = world(on)
    await startJob($)

    const planned = await $.tool.call({
      tool: PLAN,
      steps: ['Read your brand notes', 'Build the pricing section', 'Add the contact form'],
    })
    expect(planned.result).toBe('Planned 3 steps. The first one has started.')
    expect(seen.checklist?.tasks.map(task => task.status)).toEqual(['active', 'upcoming', 'upcoming'])

    const noted = await $.tool.call({ tool: PROGRESS, task: 'Read your brand notes', percent: 100 })
    expect(noted.result).toBe('Progress noted: 100%.')
    expect(seen.checklist?.tasks.map(task => task.status)).toEqual(['done', 'active', 'upcoming'])

    const clamped = await $.tool.call({ tool: PROGRESS, task: 'Write the thank-you note', percent: 250 })
    expect(clamped.result).toBe('Progress noted: 100%.')
    expect(seen.checklist?.tasks.map(task => task.name)).toEqual([
      'Read your brand notes',
      'Write the thank-you note',
      'Build the pricing section',
      'Add the contact form',
    ])
    expect(seen.checklist?.tasks.map(task => task.status)).toEqual(['done', 'done', 'active', 'upcoming'])
  })

  test('narrow bands size the name column so rows never wrap', async ($, on) => {
    world(on)
    await startJob($)
    await $.tool.call({ tool: PLAN, steps: ['Read your brand notes', 'Build the pricing section'] })

    const ui = await $.ui.mount({ ...band(40), surface: 'terminal' })
    expect(JSON.stringify(await ui.drawn())).toContain('"width":18')
  })
})

describe('needs you, stuck and done', () => {
  test('a permission prompt shows Needs you', async ($, on) => {
    const { seen } = world(on)
    await startJob($)
    await $.classic.Notification({
      message: 'Claude needs your permission to use Bash',
      notification_type: 'permission_prompt',
    })

    const ui = await $.ui.mount({ ...band(), surface: 'terminal' })
    expect(await ui.find({ type: 'Text', text: 'Needs you' })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: 'Claude needs your OK to continue' })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: '‖' })).toBeDefined()

    await $.tool.call({ tool: 'ToolSearch', query: 'select:Read', max_results: 5 })
    expect(seen.checklist?.phase).toBe('working')
  })

  test('three failures in a row mean Stuck, a success clears it', async ($, on) => {
    const { seen } = world(on, {
      answerTool: e => (e.tool === 'Bash' ? { isError: true, result: 'boom', text: 'boom' } : { result: 'ok' }),
    })
    await startJob($)
    await $.tool.call({ tool: PLAN, steps: ['Build the page', 'Check it works'] })

    for (let attempt = 0; attempt < 3; attempt++) {
      await $.tool.call({ tool: 'Bash', command: 'false' })
    }
    expect(seen.checklist?.stuckReason).toBe('a step keeps failing, Claude is trying another way')

    await $.tool.call({ tool: 'ToolSearch', query: 'select:Read', max_results: 5 })
    expect(seen.checklist?.phase).toBe('working')
  })

  test('saying no to a permission prompt shows Stuck, even when the turn then ends', async ($, on) => {
    const { seen } = world(on, {
      answerTool: e =>
        e.tool === 'Bash'
          ? {
              isError: true,
              result: 'rejected',
              text: "The user doesn't want to proceed with this tool use. The tool use was rejected.",
            }
          : { result: 'ok' },
    })
    await startJob($)
    await $.tool.call({ tool: PLAN, steps: ['Build the page', 'Check it works'] })
    await $.tool.call({ tool: 'Bash', command: 'rm -rf build' })
    await $.turn.complete({ answer: '', durationMs: 10, isAborted: true, turnId: 'turn-1', reason: 'aborted' })

    expect(seen.checklist?.phase).toBe('stuck')
    expect(seen.checklist?.stuckReason).toBe('you said no to a step, so Claude paused')
  })

  test('an API error becomes one calm sentence', async ($, on) => {
    world(on)
    await startJob($)
    await $.classic.StopFailure({ error: 'rate_limit' })
    await $.turn.complete({ answer: '', durationMs: 10, isAborted: false, turnId: 'turn-1', reason: 'error' })

    const ui = await $.ui.mount({ ...band(), surface: 'terminal' })
    expect(await ui.find({ type: 'Text', text: 'you hit your usage limit, try again a little later' })).toBeDefined()
  })

  test('the API error reads right when it arrives after the turn ended', async ($, on) => {
    const { seen } = world(on)
    await startJob($)
    await $.turn.complete({ answer: '', durationMs: 10, isAborted: false, turnId: 'turn-1', reason: 'error' })
    await $.classic.StopFailure({ error: 'invalid_request', error_details: 'prompt is too long: 210000 tokens' })

    expect(seen.checklist?.stuckReason).toBe('this chat got too long, type /compact and try again')
  })

  test('Esc shows Stopped', async ($, on) => {
    const { seen } = world(on)
    await startJob($)
    await $.turn.complete({ answer: '', durationMs: 10, isAborted: true, turnId: 'turn-1', reason: 'aborted' })

    expect(seen.checklist?.phase).toBe('stopped')
  })

  test('a finished job says All done, then shrinks to one line after 5 seconds', async ($, on) => {
    const { clock } = world(on)
    await startJob($)
    await $.tool.call({ tool: PLAN, steps: ['Build the page', 'Check it works'] })
    await $.tool.call({ tool: PROGRESS, task: 'Check it works', percent: 100 })
    await clock.advance(134_000)
    await $.turn.complete({ answer: 'Done!', durationMs: 134_000, isAborted: false, turnId: 'turn-1', reason: 'answer' })

    const ui = await $.ui.mount({ ...band(), surface: 'terminal' })
    expect(await ui.find({ type: 'Text', text: 'took 2m 14s' })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: 'Check it works' })).toBeDefined()

    await clock.advance(5000)
    await ui.redraw()
    expect(await ui.find({ type: 'Text', text: 'All done' })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: 'Check it works' })).toBeUndefined()
  })

  test('unfinished steps at the end of a turn mean Claude is waiting for a reply', async ($, on) => {
    const { seen } = world(on)
    await startJob($)
    await $.tool.call({ tool: PLAN, steps: ['Build the page', 'Check it works'] })
    await $.turn.complete({ answer: 'Which colour?', durationMs: 10, isAborted: false, turnId: 'turn-1', reason: 'answer' })

    expect(seen.checklist?.phase).toBe('needsYou')
    expect(seen.checklist?.needsYouReason).toBe('Claude is waiting for your reply')

    await $.turn.start({ text: 'Blue please', turnId: 'turn-2' })
    expect(seen.checklist?.phase).toBe('working')
    expect(seen.checklist?.tasks.map(task => task.name)).toEqual(['Build the page', 'Check it works'])
  })

  test('slash commands do not start a job', async ($, on) => {
    const { seen } = world(on)
    await $.session.start({ cwd: '/tmp', surface: 'terminal', isInteractive: true })
    await $.turn.start({ text: '/compact', turnId: 'turn-1' })

    expect(seen.checklist).toBeNull()
  })
})

describe('gate', () => {
  test('any tool is denied before a plan exists and allowed after', async ($, on) => {
    world(on)
    await startJob($)

    const before = await $.tool.call({ tool: 'Bash', command: 'ls' })
    expect(before.result).toBeUndefined()
    expect(before.deny).toContain(PLAN)

    const search = await $.tool.call({ tool: 'ToolSearch', query: `select:${PLAN}`, max_results: 5 })
    expect(search.result).toBe('ok')

    await $.tool.call({ tool: PLAN, steps: ['Look around', 'Make the change'] })
    const after = await $.tool.call({ tool: 'Bash', command: 'ls' })
    expect(after.result).toBe('ok')
  })

  test('the gate follows the names the engine gave the tools', async ($, on) => {
    world(on, { toolPrefix: 'mcp__clean-view-marketplace__' })
    await startJob($)

    const before = await $.tool.call({ tool: 'Bash', command: 'ls' })
    expect(before.deny).toContain('mcp__clean-view-marketplace__plan_steps')

    const planned = await $.tool.call({
      tool: 'mcp__clean-view-marketplace__plan_steps',
      steps: ['Look around', 'Make the change'],
    })
    expect(planned.result).toBe('Planned 2 steps. The first one has started.')

    const after = await $.tool.call({ tool: 'Bash', command: 'ls' })
    expect(after.result).toBe('ok')
  })

  test('nothing is gated while Clean View is off', async ($, on) => {
    world(on)
    await startJob($)
    await $.command.run({
      command: 'simple',
      args: 'off',
      origin: { kind: 'composer' },
      presentation: { isFullscreen: false, columns: 80 },
    })

    const ran = await $.tool.call({ tool: 'Bash', command: 'ls' })
    expect(ran.result).toBe('ok')
  })
})

describe('switching', () => {
  test('/simple off hides the band and brings the tool rows back', async ($, on) => {
    world(on)
    await startJob($)

    for (const surface of SURFACES) {
      const rows = [
        await $.ui.mount({ plugin: PLUGIN, surface, component: 'ToolUse', props: TOOL_ROW }),
        await $.ui.mount({ plugin: PLUGIN, surface, component: 'ToolResult', props: TOOL_RESULT }),
        await $.ui.mount({ plugin: PLUGIN, surface, component: 'ToolGroup', props: TOOL_GROUP }),
      ]
      for (const row of rows) {
        expect(await row.drawn()).toMatchObject({ type: 'Box', props: { display: 'none' } })
        await row.unmount()
      }
    }

    const off = await $.command.run({
      command: 'simple',
      args: 'off',
      origin: { kind: 'composer' },
      presentation: { isFullscreen: false, columns: 80 },
    })
    expect(off.text).toBe('Clean View is off.')

    const ui = await $.ui.mount({ ...band(), surface: 'terminal' })
    expect(await ui.find({ type: 'Text', text: 'Understand your request' })).toBeUndefined()
    expect((await ui.find({ type: 'Button', key: 'toggle' }))?.text).toContain('Clean View: OFF')

    const shown = await $.ui.mount({ plugin: PLUGIN, surface: 'terminal', component: 'ToolUse', props: TOOL_ROW })
    expect(await shown.find({ type: 'Text', text: 'Bash(ls)' })).toBeDefined()
  })

  test('the button flips the setting on every surface and saves it', async ($, on) => {
    const { seen } = world(on)
    await $.session.start({ cwd: '/tmp', surface: 'terminal', isInteractive: true })

    for (const surface of SURFACES) {
      const ui = await $.ui.mount({ ...band(), surface })
      await ui.press({ key: 'toggle' })
      expect((await ui.find({ type: 'Button', key: 'toggle' }))?.text).toContain('Clean View: OFF')
      expect(seen.stored.cleanViewEnabled).toBe(false)
      await ui.press({ key: 'toggle' })
      expect((await ui.find({ type: 'Button', key: 'toggle' }))?.text).toContain('Clean View: ON')
      expect(seen.stored.cleanViewEnabled).toBe(true)
      await ui.unmount()
    }
  })

  test('the saved setting is read back at session start', async ($, on) => {
    const { seen } = world(on, { stored: { cleanViewEnabled: false } })
    await $.session.start({ cwd: '/tmp', surface: 'terminal', isInteractive: true })

    expect(seen.isEnabled).toBe(false)
    const ui = await $.ui.mount({ ...band(), surface: 'terminal' })
    expect((await ui.find({ type: 'Button', key: 'toggle' }))?.text).toContain('Clean View: OFF')
  })
})

describe('animation and naming', () => {
  test('the clock ticks only while a job is working', async ($, on) => {
    const { clock, seen } = world(on)
    await startJob($)
    const first = seen.tick

    await clock.advance(1000)
    const later = seen.tick
    expect(later - first).toBe(4)

    await $.turn.complete({ answer: 'ok', durationMs: 1000, isAborted: false, turnId: 'turn-1', reason: 'answer' })
    await clock.advance(1000)
    expect(seen.tick).toBe(later)
  })

  test('Haiku names the job in the background', async ($, on) => {
    const { clock, seen } = world(on)
    await startJob($)
    expect(seen.checklist?.title).toBe('Working on your request')

    await clock.advance(10)
    expect(seen.checklist?.title).toBe('Build my landing page')
  })
})
