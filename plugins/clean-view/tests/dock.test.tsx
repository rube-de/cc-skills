import type { On, ToolCallInput, ToolCallResult } from 'claude-code'
import { describe, expect, mock, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'

import { jobName, parseSize, restoreSize } from '../hooks/dock-logic'
import type { DockMission } from '../types'

const PLUGIN = 'clean-view'
const PANE = 'agent-dock'
const PLAN = 'mcp__clean-view__plan_steps'
const PROGRESS = 'mcp__clean-view__report_progress'
const SURFACES = ['terminal', 'desktop'] as const
const REQUEST = 'Research bakery pricing for five shops, then sum it up'
const JOB = 'Research bakery pricing for five shops'

type Seen = {
  status: string | undefined
  toasts: string[]
  open: Set<string>
  sleeps: number
  spawnModels: Array<string | undefined>
  spawnPrompts: string[]
  running: Set<string>
  processes: string[][]
  files: Record<string, string>
  // The test engine has no $.state to read back: the plugin's writes are watched on their way down.
  state: Record<string, unknown>
}

type Options = {
  stored?: Record<string, unknown>
  env?: Record<string, string>
  // Whether a helper's spawn runs in the background (its own turn.complete ends it).
  isBackground?: boolean
}

// What the engine would do beneath the plugin, answered from memory.
function world($: Engine, on: On, { stored = {}, env, isBackground = true }: Options = {}) {
  const seen: Seen = {
    status: undefined,
    toasts: [],
    open: new Set(),
    sleeps: 0,
    spawnModels: [],
    spawnPrompts: [],
    running: new Set(),
    processes: [],
    files: {},
    state: {},
  }
  on('state.set', { plugin: PLUGIN }, ($, e, next) => {
    seen.state[e.key] = e.value
    return next(e)
  })
  mock.store(on, stored)
  if (env !== undefined) {
    mock.env(on, env)
  }
  const clock = mock.clock(on, { now: 1_000_000 })
  on('session.start', ($, e) => ({ cwd: e.cwd }))
  on('session.end', ($, e) => ({ sessionId: e.sessionId }))
  on('turn.start', ($, e) => ({ turnId: e.turnId }))
  on('turn.complete', ($, e) => ({ text: e.answer }))
  on('prompt.compose', () => ({ sections: [] }))
  on('prompt.submit', ($, e) => ({ text: e.text, context: e.context }))
  // The footer's own mode labels, beneath the dock's button.
  on('ui.render', { component: 'SessionMode' }, ($, e) => {
    const { Text } = $.ui.resolve(e)

    return <Text>{e.props.modes.join(' & ')}</Text>
  })
  on('classic.Stop', () => ({}))
  on('tool.register', ($, e) => ({ value: { tool: `mcp__clean-view__${e.name}` } }))
  on('command.register', ($, e) => ({ value: { command: e.name } }))
  on('model.complete', () => ({
    value: {
      isAnswered: false as const,
      reason: 'empty-reply' as const,
      usage: { input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 },
    },
  }))
  on('agent.list', () => ({
    value: [...seen.running].map(id => ({ id, description: id, type: 'general-purpose', status: 'running' as const })),
  }))
  // The hold sleeps on the host; here each sleep waits for the test's clock.
  on('process.run', async ($, e) => {
    seen.processes.push([...e.argv])
    if (e.argv[0] === '/bin/sleep') {
      seen.sleeps += 1
      await clock.sleep(1000)
    }
    if (e.argv[0] === 'rm') {
      delete seen.files[e.argv[2] ?? '']
    }
    return { value: { exitCode: 0, stdout: '', stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }
  })
  on('fs.write', ($, e) => {
    seen.files[e.path] = e.text
    return { value: undefined }
  })
  on('fs.exists', () => ({ value: true }))
  on('session.id', () => ({ value: 'session-1' }))
  on('ui.open', ($, e) => {
    seen.open.add(e.id)
    return { value: { isPlaced: true as const } }
  })
  on('ui.close', ($, e) => {
    seen.open.delete(e.id)
    return { value: undefined }
  })
  on('ui.panes', () => ({
    value: [...seen.open].map(id => ({ id, title: 'Agent Dock', isShown: true, isFocused: false, isPlaced: true })),
  }))
  on('ui.status', ($, e) => {
    seen.status = e.text
    return { value: undefined }
  })
  on('ui.toast', ($, e) => {
    seen.toasts.push(e.text)
    return { value: undefined }
  })
  on('agent.spawn', ($, e) => {
    seen.spawnModels.push(e.model)
    seen.spawnPrompts.push(e.prompt)
    seen.running.add(`agent-${e.tool_use_id}`)
    return { model: e.model ?? 'inherit', agentId: `agent-${e.tool_use_id}` }
  })
  // The Agent tool starts its subagent through agent.spawn, as the engine's does.
  on('tool.call', async ($inner, e): Promise<ToolCallResult> => {
    if (e.tool === 'Agent') {
      await $.agent.spawn({
        tool_use_id: e.tool_use_id,
        prompt: e.prompt,
        description: e.description,
        subagentType: 'general-purpose',
        provider: { plugin: 'engine', tier: 'core' },
        parentModel: 'claude-opus-5-5',
        background: isBackground,
        fork: false,
        ...(e.model === undefined ? {} : { model: e.model }),
      })
      return { result: 'Launched.' }
    }
    return { result: 'ok' }
  })

  return { clock, seen }
}

async function begin($: Engine) {
  await $.session.start({ cwd: '/tmp', surface: 'terminal', isInteractive: true })
}

async function dock($: Engine, args: string) {
  return $.command.run({
    command: 'dock',
    args,
    origin: { kind: 'composer' },
    presentation: { isFullscreen: true, columns: 160 },
  })
}

// The person's request, the turn it starts, and Clean View's plan.
async function request($: Engine, text = REQUEST) {
  const entered = await $.prompt.submit({ text, wait: false, origin: { kind: 'composer' } })
  await $.turn.start({ text, turnId: 'turn-1' })
  await $.tool.call({ tool: PLAN, steps: ['Split the work', 'Combine the results'] })

  return entered
}

async function writeAgentCalls($: Engine, ids: readonly string[]) {
  await $.session.append({
    message: {
      type: 'assistant',
      role: 'assistant',
      content: ids.map(id => ({
        type: 'tool_use' as const,
        id,
        name: 'Agent',
        input: { description: `Price check: ${id}`, prompt: `Check the prices at ${id}.` },
      })),
    },
    door: 'response',
    origin: { kind: 'model', model: 'claude-opus-5-5' },
    uuid: `row-${ids.join('-')}`,
  })
}

function launch($: Engine, id: string, model?: 'haiku' | 'opus') {
  return $.tool.call({
    tool: 'Agent',
    tool_use_id: id,
    description: `Price check: ${id}`,
    prompt: `Check the prices at ${id}.`,
    ...(model === undefined ? {} : { model }),
  })
}

// A helper's own tool call, made in its subagent loop.
function helperCall($: Engine, agentId: string, input: Record<string, unknown>) {
  return $.tool.call({ ...input, agentId } as unknown as ToolCallInput)
}

async function helperDone($: Engine, agentId: string, reason: 'answer' | 'error' = 'answer') {
  await $.turn.complete({ answer: 'Done.', durationMs: 10, isAborted: false, turnId: `t-${agentId}`, agentId, reason })
}

async function mainDone($: Engine) {
  await $.turn.complete({ answer: 'Here is the summary.', durationMs: 10, isAborted: false, turnId: 'turn-1', reason: 'answer' })
}

function missionOf(seen: Seen): DockMission | null {
  return (seen.state.dockMission as DockMission | null | undefined) ?? null
}

function pane(bodyColumns = 76) {
  return {
    plugin: PLUGIN,
    component: 'Pane',
    requestId: PANE,
    props: {
      title: 'Agent Dock',
      isFocused: false,
      bodyColumns,
      placement: 'dock',
      scroll: { offset: 0, bodyRows: 40 },
      view: {},
    },
  } as const
}

describe('team size', () => {
  test('parseSize takes whole numbers from 1 to 100', () => {
    expect(parseSize('10')).toBe(10)
    expect(parseSize(' 25 ')).toBe(25)
    for (const bad of ['0', '101', 'abc', '2.5', '', '-3', '1e2']) {
      expect(parseSize(bad)).toBeNull()
    }
  })

  test('a saved 50 comes back as 1 in a new session; 10 stays 10', async ($, on) => {
    expect(restoreSize(50)).toBe(1)
    expect(restoreSize(10)).toBe(10)

    const { seen } = world($, on, { stored: { 'dock.teamSize': 50 } })
    await begin($)
    expect(seen.state.dockTeamSize).toBe(1)
  })

  test('a saved 10 is read back at session start', async ($, on) => {
    const { seen } = world($, on, { stored: { 'dock.teamSize': 10 } })
    await begin($)

    expect(seen.state.dockTeamSize).toBe(10)
  })

  test('/dock with a bad number explains the range', async ($, on) => {
    const { seen } = world($, on)
    await begin($)

    expect((await dock($, 'lots')).text).toBe('Team Size is a whole number from 1 to 100, e.g. /dock 10.')
    expect((await dock($, '0')).text).toBe('Team Size is a whole number from 1 to 100, e.g. /dock 10.')
  })

  test('a big team waits for Continue, then sticks', async ($, on) => {
    const { clock, seen } = world($, on)
    await begin($)

    expect((await dock($, '50')).text).toBe('Confirm the team of 50 in the Agent Dock.')
    await clock.settle()
    expect(seen.state.dockTeamSize).toBe(1)
    expect(seen.open.has(PANE)).toBe(true)

    const ui = await $.ui.mount({ ...pane(), surface: 'terminal' })
    expect(await ui.find({ type: 'Text', text: 'Big team: this uses your plan quickly. Continue?' })).toBeDefined()
    await ui.press({ key: 'big-continue' })
    expect(seen.state.dockTeamSize).toBe(50)
    expect(await ui.find({ type: 'Text', text: /Splits each request across 50 helpers {2}· {2}10 at a time/ })).toBeDefined()
  })

  test('Custom takes a number and toasts a bad one', async ($, on) => {
    const { clock, seen } = world($, on)
    await begin($)
    await dock($, '')
    await clock.settle()

    const ui = await $.ui.mount({ ...pane(), surface: 'terminal' })
    await ui.press({ key: 'size-custom' })
    await ui.input({ key: 'custom-size', text: '2.5' })
    expect(seen.toasts).toContain('Type a whole number from 1 to 100')

    await ui.press({ key: 'size-custom' })
    await ui.input({ key: 'custom-size', text: '7' })
    expect(seen.state.dockTeamSize).toBe(7)
  })
})

describe('splitting', () => {
  test('size 5 adds the exactly-5 instruction; size 1 adds nothing', async ($, on) => {
    const { clock, seen } = world($, on)
    await begin($)

    const alone = await request($)
    expect(alone.context ?? []).toEqual([])

    await dock($, '5')
    await clock.settle()
    await mainDone($)
    const split = await $.prompt.submit({ text: REQUEST, wait: false, origin: { kind: 'composer' } })
    expect(split.context?.join('\n')).toContain('exactly 5 independent pieces')
    expect(split.context?.join('\n')).toContain(PROGRESS)
  })

  test('a task notification is not a new request', async ($, on) => {
    const { clock, seen } = world($, on)
    await begin($)
    await dock($, '5')
    await clock.settle()

    const notice = await $.prompt.submit({ text: 'Agent finished', wait: false, origin: { kind: 'task-notification' } })
    expect(notice.context ?? []).toEqual([])
    expect(missionOf(seen)).toBeNull()
  })

  test('the 6th Agent call at size 5 is denied', async ($, on) => {
    const { clock, seen } = world($, on)
    await begin($)
    await dock($, '5')
    await clock.settle()
    await request($)

    for (const id of ['a', 'b', 'c', 'd', 'e']) {
      expect((await launch($, id)).result).toBe('Launched.')
    }
    const sixth = await launch($, 'f')
    expect(sixth.deny).toBe('Team Size is 5: this request already has 5 helpers. Finish with the helpers you have.')
    expect(missionOf(seen)?.cards).toHaveLength(5)
  })

  test('a request that used 3 of 10 gets exactly one nudge', async ($, on) => {
    const { clock, seen } = world($, on)
    await begin($)
    await dock($, '10')
    await clock.settle()
    await request($)
    for (const id of ['a', 'b', 'c']) {
      await launch($, id)
    }

    const first = await $.classic.Stop({ stop_hook_active: false })
    expect(first.block).toBe(
      'You used 3 of 10 helpers. Split the remaining work across the other 7, one helper per piece, all in parallel.',
    )
    const second = await $.classic.Stop({ stop_hook_active: true })
    expect(second.block).toBeUndefined()
  })

  test('Fast & Cheap puts helpers on Haiku unless the call names a model', async ($, on) => {
    const { clock, seen } = world($, on)
    await begin($)
    await dock($, '3')
    await clock.settle()
    await request($)

    await launch($, 'a')
    await launch($, 'b', 'opus')
    expect(seen.spawnModels).toEqual(['haiku', 'opus'])
    expect(seen.spawnPrompts[0]).toContain(`As you work, call ${PROGRESS}`)
  })

  test("a slash command's helpers are drawn but never capped, moved or nudged", async ($, on) => {
    const { clock, seen } = world($, on)
    await begin($)
    await dock($, '3')
    await clock.settle()
    const command = await $.prompt.submit({ text: '/review 277', wait: false, origin: { kind: 'composer' } })
    expect(command.context ?? []).toEqual([])

    await writeAgentCalls($, ['a', 'b', 'c', 'd'])
    for (const id of ['a', 'b', 'c', 'd']) {
      expect((await launch($, id)).result).toBe('Launched.')
    }
    expect(missionOf(seen)?.size).toBe(1)
    expect(missionOf(seen)?.cards).toHaveLength(4)
    expect(seen.spawnModels).toEqual([undefined, undefined, undefined, undefined])
    expect(seen.spawnPrompts[0]).toBe('Check the prices at a.')
    expect((await $.classic.Stop({ stop_hook_active: false })).block).toBeUndefined()
  })

  test('a request whose helpers all finished still caps a later call in the same turn', async ($, on) => {
    const { clock, seen } = world($, on, { isBackground: false })
    await begin($)
    await dock($, '3')
    await clock.settle()
    await request($)

    for (const id of ['a', 'b', 'c']) {
      await launch($, id)
    }
    expect(missionOf(seen)?.cards.every(card => card.status === 'done')).toBe(true)
    const fourth = await launch($, 'd')
    expect(fourth.deny).toBe('Team Size is 3: this request already has 3 helpers. Finish with the helpers you have.')
  })

  test('at size 1 helpers keep their model and prompt', async ($, on) => {
    const { seen } = world($, on)
    await begin($)
    await request($)

    await launch($, 'a')
    expect(seen.spawnModels).toEqual([undefined])
    expect(seen.spawnPrompts[0]).toBe('Check the prices at a.')
  })
})

describe('cards', () => {
  test('three calls go queued, working, done; a 60% report shows on its card', async ($, on) => {
    const { clock, seen } = world($, on)
    await begin($)
    await dock($, '3')
    await clock.settle()
    await request($)

    await writeAgentCalls($, ['toolu_a', 'toolu_b', 'toolu_c'])
    expect(missionOf(seen)?.cards.map(card => card.status)).toEqual(['queued', 'queued', 'queued'])
    for (const surface of SURFACES) {
      const ui = await $.ui.mount({ ...pane(), surface })
      for (const id of ['toolu_a', 'toolu_b', 'toolu_c']) {
        expect(await ui.find({ key: `card-${id}` })).toBeDefined()
      }
      await ui.unmount()
    }

    for (const id of ['toolu_a', 'toolu_b', 'toolu_c']) {
      await launch($, id)
    }
    expect(missionOf(seen)?.cards.map(card => card.status)).toEqual(['working', 'working', 'working'])

    const noted = await helperCall($, 'agent-toolu_a', { tool: PROGRESS, task: 'Price check: toolu_a', percent: 60 })
    expect(noted.result).toBe('Progress noted: 60%.')
    const planned = await helperCall($, 'agent-toolu_b', { tool: PLAN, steps: ['One', 'Two'] })
    expect(planned.result).toBe('Helpers skip the plan. Just call report_progress as you work.')

    const ui = await $.ui.mount({ ...pane(), surface: 'terminal' })
    expect(await ui.find({ type: 'Text', text: '  60%' })).toBeDefined()

    for (const id of ['toolu_a', 'toolu_b', 'toolu_c']) {
      await helperDone($, `agent-${id}`)
    }
    expect(missionOf(seen)?.cards.map(card => card.status)).toEqual(['done', 'done', 'done'])
  })

  test('all done shows "3 agents finished <job> in …"', async ($, on) => {
    const { clock, seen } = world($, on)
    await begin($)
    await dock($, '3')
    await clock.settle()
    await request($)
    for (const id of ['a', 'b', 'c']) {
      await launch($, id)
    }
    await clock.advance(134_000)
    await helperDone($, 'agent-a')
    await helperDone($, 'agent-b', 'error')
    await helperDone($, 'agent-c')
    await mainDone($)

    expect(jobName(REQUEST)).toBe(JOB)
    for (const surface of SURFACES) {
      const ui = await $.ui.mount({ ...pane(), surface })
      expect(await ui.find({ type: 'Text', text: `3 agents finished ${JOB} in 2m 14s (1 got stuck)` })).toBeDefined()
      expect(await ui.find({ type: 'Text', text: 'C O M P L E T E' })).toBeDefined()
      await ui.unmount()
    }
  })

  test('all done cleanly reads "3 agents finished <job> in 2m 14s"', async ($, on) => {
    const { clock, seen } = world($, on)
    await begin($)
    await dock($, '3')
    await clock.settle()
    await request($)
    for (const id of ['a', 'b', 'c']) {
      await launch($, id)
    }
    await clock.advance(134_000)
    for (const id of ['a', 'b', 'c']) {
      await helperDone($, `agent-${id}`)
    }
    await mainDone($)

    expect(missionOf(seen)?.finishedAt).not.toBeNull()
    const ui = await $.ui.mount({ ...pane(), surface: 'terminal' })
    expect(await ui.find({ type: 'Text', text: new RegExp(`3 agents finished ${JOB} in 2m 14s$`) })).toBeDefined()
  })

  test('a missed finish never leaves the next request unsplit', async ($, on) => {
    const { clock, seen } = world($, on)
    await begin($)
    await dock($, '3')
    await clock.settle()
    await request($)
    await launch($, 'a')
    await mainDone($)
    expect(missionOf(seen)?.finishedAt).toBeNull()

    // The helper is gone, but its own turn.complete never reached the dock.
    seen.running.delete('agent-a')
    const next = await $.prompt.submit({ text: 'Now compare the shops', wait: false, origin: { kind: 'composer' } })
    expect(next.context?.join('\n')).toContain('exactly 3 independent pieces')
    expect(missionOf(seen)?.job).toBe('Now compare the shops')
  })

  test('a request sent while helpers still run joins their mission', async ($, on) => {
    const { clock, seen } = world($, on)
    await begin($)
    await dock($, '3')
    await clock.settle()
    await request($)
    await launch($, 'a')
    await mainDone($)

    const next = await $.prompt.submit({ text: 'Also check opening hours', wait: false, origin: { kind: 'composer' } })
    expect(next.context ?? []).toEqual([])
    expect(missionOf(seen)?.job).toBe(JOB)
  })

  test('a foreground helper is done when its call returns', async ($, on) => {
    const { clock, seen } = world($, on, { isBackground: false })
    await begin($)
    await dock($, '3')
    await clock.settle()
    await request($)

    await launch($, 'a')
    expect(missionOf(seen)?.cards[0]?.status).toBe('done')
  })

  test('more than 12 helpers draw as tiles', async ($, on) => {
    const { clock, seen } = world($, on)
    await begin($)
    await dock($, '20')
    await clock.settle()
    await request($)
    const ids = Array.from({ length: 13 }, (_, index) => `toolu_${index}`)
    await writeAgentCalls($, ids)

    const ui = await $.ui.mount({ ...pane(), surface: 'terminal' })
    expect(await ui.find({ key: 'tile-toolu_12' })).toBeDefined()
    expect(await ui.find({ key: 'card-toolu_0' })).toBeUndefined()
  })

  test('past the engine limit a call waits for a slot', async ($, on) => {
    const { clock, seen } = world($, on, {
      env: { CLAUDE_CODE_MAX_CONCURRENT_SUBAGENTS: '2', CLAUDE_CODE_MAX_TOOL_USE_CONCURRENCY: '20' },
    })
    await begin($)
    await dock($, '3')
    await clock.settle()
    await request($)
    await launch($, 'a')
    await launch($, 'b')

    const third = launch($, 'c')
    await clock.settle()
    expect(seen.sleeps).toBeGreaterThan(0)
    expect(missionOf(seen)?.cards.map(card => card.status)).toEqual(['working', 'working', 'queued'])

    seen.running.delete('agent-a')
    await helperDone($, 'agent-a')
    await clock.advance(1000)
    expect((await third).result).toBe('Launched.')
    expect(missionOf(seen)?.cards.map(card => card.status)).toEqual(['done', 'working', 'working'])
  })
})

describe('status line count', () => {
  const FILE = '/home/me/.claude/agent-dock/agents-now/session-1.json'

  test('the live helper count is written for the status line and removed when done', async ($, on) => {
    const { clock, seen } = world($, on, { env: { HOME: '/home/me' } })
    await begin($)
    expect(seen.processes).toContainEqual([
      'find',
      '/home/me/.claude/agent-dock/agents-now',
      '-type',
      'f',
      '-name',
      '*.json',
      '-mmin',
      '+1440',
      '-delete',
    ])
    await dock($, '3')
    await clock.settle()
    await request($)
    expect(seen.files[FILE]).toBeUndefined()

    await writeAgentCalls($, ['a', 'b'])
    expect(JSON.parse(seen.files[FILE] ?? '{}')).toMatchObject({ working: 0, queued: 2, job: JOB })
    await launch($, 'a')
    await launch($, 'b')
    expect(JSON.parse(seen.files[FILE] ?? '{}')).toMatchObject({ working: 2, queued: 0, done: 0 })

    await helperDone($, 'agent-a')
    expect(JSON.parse(seen.files[FILE] ?? '{}')).toMatchObject({ working: 1, done: 1 })
    await helperDone($, 'agent-b')
    expect(seen.files[FILE]).toBeUndefined()
  })

  test('CLAUDE_CONFIG_DIR moves the folder, and session end removes the file', async ($, on) => {
    const { clock, seen } = world($, on, { env: { HOME: '/home/me', CLAUDE_CONFIG_DIR: '/cfg/claude' } })
    await begin($)
    await dock($, '3')
    await clock.settle()
    await request($)
    await launch($, 'a')
    expect(seen.files['/cfg/claude/agent-dock/agents-now/session-1.json']).toBeDefined()

    await $.session.end({ reason: 'prompt_input_exit', sessionId: 'session-1', resume: { id: 'session-1' } })
    expect(seen.files['/cfg/claude/agent-dock/agents-now/session-1.json']).toBeUndefined()
  })
})

describe('pane', () => {
  test('/dock folds to the badge and back', async ($, on) => {
    const { clock, seen } = world($, on)
    await begin($)

    await dock($, '')
    await clock.settle()
    expect(seen.open.has(PANE)).toBe(true)
    expect(seen.status).toBeUndefined()

    await dock($, '')
    await clock.settle()
    expect(seen.open.has(PANE)).toBe(false)
    expect(seen.status).toBe('◆ Dock · team of 1')

    await dock($, '3')
    await clock.settle()
    await request($)
    await launch($, 'a')
    await dock($, '')
    await clock.settle()
    expect(seen.open.has(PANE)).toBe(false)
    expect(seen.status).toBe('1 working · 0 queued · 0 done')

    await dock($, '')
    await clock.settle()
    expect(seen.open.has(PANE)).toBe(true)
    expect(seen.status).toBeUndefined()
  })

  test('the status bar button opens the dock', async ($, on) => {
    const { seen } = world($, on)
    await begin($)

    for (const surface of SURFACES) {
      seen.open.clear()
      const ui = await $.ui.mount({ plugin: PLUGIN, surface, component: 'SessionMode', props: { modes: [] } })
      await ui.press({ key: 'dock-button' })
      expect(seen.open.has(PANE)).toBe(true)
      await ui.unmount()
    }
  })

  test('idle shows the team standing by on every surface', async ($, on) => {
    const { clock, seen } = world($, on)
    await begin($)
    await dock($, '5')
    await clock.settle()

    for (const surface of ['terminal', 'desktop', 'vscode', 'mobile'] as const) {
      const ui = await $.ui.mount({ ...pane(), surface })
      expect(await ui.find({ type: 'Text', text: 'Your team of 5 is standing by' })).toBeDefined()
      expect(await ui.find({ type: 'Text', text: 'S T A N D I N G   B Y' })).toBeDefined()
      await ui.unmount()
    }
  })

  test('no clock runs while idle', async ($, on) => {
    const { clock, seen } = world($, on)
    await begin($)
    await clock.advance(5000)

    expect(seen.state.dockTick).toBeUndefined()
  })
})
