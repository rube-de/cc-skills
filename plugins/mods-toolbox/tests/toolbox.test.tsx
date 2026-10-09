import type { On } from 'claude-code'
import { describe, expect, mock, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'

import { BIG_TEAM_QUESTION } from '../hooks/dock-logic'

const PLUGIN = 'mods-toolbox'
const PANE = 'agent-dock'
const PLAN = 'mcp__mods-toolbox__plan_steps'
const SURFACES = ['terminal', 'desktop'] as const
const WORDMARK = '◆  T O O L B O X'

const band = (bodyColumns = 140, hasSurvey = false) =>
  ({
    plugin: PLUGIN,
    component: 'AbovePrompt',
    props: {
      hasSurvey,
      isWorking: true,
      maxRows: 30,
      bodyColumns,
      scroll: { offset: 0, bodyRows: 29 },
      view: {},
    },
  }) as const

const footer = { plugin: PLUGIN, component: 'SessionMode', props: { modes: ['auto mode on'] } } as const

// The test engine has no $.state or $.store to read back: the plugin's
// writes are watched on their way down, and the store is kept here.
type Seen = {
  state: Record<string, unknown>
  stored: Record<string, unknown>
  open: Set<string>
  toasts: string[]
}

type Options = {
  stored?: Record<string, unknown>
  bandBelow?: string
}

// What the engine would do beneath the plugin, answered from memory.
function world(on: On, { stored = {}, bandBelow }: Options = {}) {
  const seen: Seen = { state: {}, stored: { ...stored }, open: new Set(), toasts: [] }
  on('state.set', { plugin: PLUGIN }, ($, e, next) => {
    seen.state[e.key] = e.value
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
  on('prompt.compose', () => ({ sections: [] }))
  on('tool.call', () => ({ result: 'ok' }))
  on('tool.describe', ($, e) => ({ description: e.description }))
  on('tool.register', ($, e) => ({ value: { tool: `mcp__mods-toolbox__${e.name}` } }))
  on('command.register', ($, e) => ({ value: { command: e.name } }))
  on('model.complete', () => ({
    value: {
      isAnswered: false as const,
      reason: 'empty-reply' as const,
      usage: { input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 },
    },
  }))
  on('agent.list', () => ({ value: [] }))
  on('process.run', () => ({
    value: { exitCode: 0, stdout: '', stderr: '', isStdoutTruncated: false, isStderrTruncated: false },
  }))
  on('fs.exists', () => ({ value: false }))
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
  on('ui.status', () => ({ value: undefined }))
  on('ui.toast', ($, e) => {
    seen.toasts.push(e.text)
    return { value: undefined }
  })
  on('ui.render', { component: 'SessionMode' }, ($, e) => {
    const { Text } = $.ui.resolve(e)

    return <Text>{e.props.modes.join(' & ')}</Text>
  })
  // What the band holds beneath the plugin: another mod's row, or nothing.
  on('ui.render', { component: 'AbovePrompt' }, ($, e) => {
    const { Box, Text } = $.ui.resolve(e)

    return bandBelow === undefined ? <Box /> : <Text>{bandBelow}</Text>
  })

  return { clock, seen }
}

type Drawn = { type?: string; props?: Record<string, unknown>; children?: unknown[] }

// The nodes from the drawing's root down to the string holding `text`.
function pathTo(node: unknown, text: string, path: Drawn[] = []): Drawn[] | null {
  if (typeof node === 'string') {
    return node.includes(text) ? path : null
  }
  if (node === null || typeof node !== 'object') {
    return null
  }
  const drawn = node as Drawn
  for (const child of drawn.children ?? []) {
    const found = pathTo(child, text, [...path, drawn])
    if (found !== null) {
      return found
    }
  }

  return null
}

async function begin($: Engine) {
  await $.session.start({ cwd: '/tmp', surface: 'terminal', isInteractive: true })
}

async function toolbox($: Engine) {
  return $.command.run({
    command: 'toolbox',
    args: '',
    origin: { kind: 'composer' },
    presentation: { isFullscreen: false, columns: 140 },
  })
}

// A request with a two-step plan, so Clean View has a checklist to draw.
async function planned($: Engine) {
  await $.turn.start({ text: 'Build me a landing page with pricing', turnId: 'turn-1' })
  await $.tool.call({ tool: PLAN, steps: ['Read your brand notes', 'Build the pricing section'] })
}

describe('opening', () => {
  test('the footer button opens the popup, and ✕ closes it', async ($, on) => {
    world(on)
    await begin($)

    for (const surface of SURFACES) {
      const foot = await $.ui.mount({ ...footer, surface })
      expect((await foot.find({ type: 'Button', key: 'toolbox-button' }))?.text).toBe('◆ Toolbox ▾')
      expect(await foot.find({ type: 'Text', text: 'auto mode on' })).toBeDefined()

      await foot.press({ key: 'toolbox-button' })
      expect((await foot.find({ type: 'Button', key: 'toolbox-button' }))?.text).toBe('◆ Toolbox ▴')
      const ui = await $.ui.mount({ ...band(), surface })
      expect(await ui.find({ type: 'Text', text: WORDMARK })).toBeDefined()

      await ui.press({ key: 'toolbox-close' })
      expect(await ui.find({ type: 'Text', text: WORDMARK })).toBeUndefined()
      expect((await foot.find({ type: 'Button', key: 'toolbox-button' }))?.text).toBe('◆ Toolbox ▾')
      await ui.unmount()
      await foot.unmount()
    }
  })

  test('/toolbox opens and closes it', async ($, on) => {
    world(on)
    await begin($)

    expect((await toolbox($)).text).toBe('Toolbox open above the prompt.')
    const ui = await $.ui.mount({ ...band(), surface: 'terminal' })
    expect(await ui.find({ type: 'Text', text: WORDMARK })).toBeDefined()

    expect((await toolbox($)).text).toBe('Toolbox closed.')
    expect(await ui.find({ type: 'Text', text: WORDMARK })).toBeUndefined()
  })

  test('a survey takes the band, popup or not', async ($, on) => {
    world(on)
    await begin($)
    await toolbox($)

    const ui = await $.ui.mount({ ...band(140, true), surface: 'terminal' })
    expect(await ui.find({ type: 'Text', text: WORDMARK })).toBeUndefined()
  })
})

describe('layout', () => {
  test('wide: the checklist keeps its rows beside the popup at the right edge', async ($, on) => {
    world(on)
    await begin($)
    await planned($)
    await toolbox($)

    const ui = await $.ui.mount({ ...band(140), surface: 'terminal' })
    const drawn = await ui.drawn()
    expect((drawn as Drawn).children?.[0]).toMatchObject({
      type: 'Box',
      props: { flexDirection: 'row', justifyContent: 'flex-end' },
    })
    // 140 = 72 for the checklist + 2 apart + 66 for the popup.
    expect(JSON.stringify(drawn)).toContain('"width":72')
    expect(JSON.stringify(drawn)).toContain('"width":66')
    expect(await ui.find({ type: 'Text', text: 'Read your brand notes' })).toBeDefined()
  })

  test('narrow: the checklist folds to its header and the popup sits under it, right-aligned', async ($, on) => {
    world(on)
    await begin($)
    await planned($)
    await toolbox($)

    const ui = await $.ui.mount({ ...band(100), surface: 'terminal' })
    expect(await ui.find({ type: 'Text', text: 'Read your brand notes' })).toBeUndefined()
    expect(JSON.stringify(await ui.drawn())).toContain(' · step 1 of 2')
    expect(await ui.find({ type: 'Text', text: WORDMARK })).toBeDefined()
    expect(JSON.stringify(await ui.drawn())).toContain('"justifyContent":"flex-end"')

    await toolbox($)
    expect(await ui.find({ type: 'Text', text: 'Read your brand notes' })).toBeDefined()
  })

  test('with Clean View off the popup still sits at the right edge', async ($, on) => {
    world(on, { stored: { cleanViewEnabled: false } })
    await begin($)
    await toolbox($)

    for (const columns of [140, 100]) {
      const ui = await $.ui.mount({ ...band(columns), surface: 'terminal' })
      const drawn = JSON.stringify(await ui.drawn())
      expect(drawn).toContain('"justifyContent":"flex-end"')
      expect(drawn).toContain('"width":66')
      await ui.unmount()
    }
  })

  // The engine refuses its own band node under a Box with a width, so what
  // comes up through `next` (another mod's row stands in for it) stays outside
  // the sized row beside the popup.
  test("other mods' rows stay in the band, never under a sized Box", async ($, on) => {
    world(on, { bandBelow: 'Other mod row' })
    await begin($)
    await planned($)
    await toolbox($)

    for (const columns of [140, 100]) {
      const ui = await $.ui.mount({ ...band(columns), surface: 'terminal' })
      expect(await ui.find({ type: 'Text', text: WORDMARK })).toBeDefined()
      const path = pathTo(await ui.drawn(), 'Other mod row')
      expect(path).not.toBeNull()
      expect((path ?? []).filter(node => node.props?.width !== undefined)).toEqual([])
      await ui.unmount()
    }
  })
})

describe('settings', () => {
  test('Clean View On and Off switch it and save it', async ($, on) => {
    const { seen } = world(on)
    await begin($)
    await toolbox($)

    for (const surface of SURFACES) {
      const ui = await $.ui.mount({ ...band(), surface })
      expect(await ui.find({ type: 'Button', key: 'cv-on' })).toBeUndefined()

      await ui.press({ key: 'cv-off' })
      expect(seen.state.cleanViewEnabled).toBe(false)
      expect(seen.stored.cleanViewEnabled).toBe(false)
      expect(await ui.find({ type: 'Button', key: 'cv-off' })).toBeUndefined()

      await ui.press({ key: 'cv-on' })
      expect(seen.state.cleanViewEnabled).toBe(true)
      expect(seen.stored.cleanViewEnabled).toBe(true)
      await ui.unmount()
    }
  })

  test('a saved Off shows as Off', async ($, on) => {
    world(on, { stored: { cleanViewEnabled: false } })
    await begin($)
    await toolbox($)

    const ui = await $.ui.mount({ ...band(), surface: 'terminal' })
    expect(await ui.find({ type: 'Button', key: 'cv-on' })).toBeDefined()
    expect(await ui.find({ type: 'Button', key: 'cv-off' })).toBeUndefined()
  })

  test('Team size 5 sticks; 50 asks first', async ($, on) => {
    const { seen } = world(on)
    await begin($)
    await toolbox($)

    const ui = await $.ui.mount({ ...band(), surface: 'terminal' })
    await ui.press({ key: 'size-5' })
    expect(seen.state.dockTeamSize).toBe(5)
    expect(seen.stored['dock.teamSize']).toBe(5)
    expect(await ui.find({ type: 'Button', key: 'size-5' })).toBeUndefined()

    await ui.press({ key: 'size-50' })
    expect(seen.state.dockTeamSize).toBe(5)
    expect(await ui.find({ type: 'Text', text: BIG_TEAM_QUESTION })).toBeDefined()
    await ui.press({ key: 'big-cancel' })
    expect(await ui.find({ type: 'Text', text: BIG_TEAM_QUESTION })).toBeUndefined()
    expect(seen.state.dockTeamSize).toBe(5)

    await ui.press({ key: 'size-50' })
    await ui.press({ key: 'big-continue' })
    expect(seen.state.dockTeamSize).toBe(50)
  })

  test('Custom takes a typed number and toasts a bad one', async ($, on) => {
    const { seen } = world(on)
    await begin($)
    await toolbox($)

    const ui = await $.ui.mount({ ...band(), surface: 'terminal' })
    await ui.press({ key: 'size-custom' })
    await ui.input({ key: 'custom-size', text: 'lots' })
    expect(seen.toasts).toContain('Type a whole number from 1 to 100')

    await ui.input({ key: 'custom-size', text: '7' })
    expect(seen.state.dockTeamSize).toBe(7)
    expect(await ui.find({ type: 'Text', text: ' 7 ' })).toBeDefined()

    await ui.press({ key: 'size-custom' })
    await ui.press({ key: 'custom-cancel' })
    expect(seen.state.dockIsCustomOpen).toBe(false)
  })

  test('the helper model is picked and saved', async ($, on) => {
    const { seen } = world(on)
    await begin($)
    await toolbox($)

    const ui = await $.ui.mount({ ...band(), surface: 'terminal' })
    await ui.press({ key: 'model-same' })
    expect(seen.state.dockHelperModel).toBe('same')
    expect(seen.stored['dock.helperModel']).toBe('same')
    await ui.press({ key: 'model-fast' })
    expect(seen.state.dockHelperModel).toBe('fast')
  })

  test('Agent Dock opens the dock and closes the popup', async ($, on) => {
    const { seen } = world(on)
    await begin($)
    await toolbox($)

    const ui = await $.ui.mount({ ...band(), surface: 'terminal' })
    await ui.press({ key: 'toolbox-dock' })
    expect(seen.open.has(PANE)).toBe(true)
    expect(seen.state.toolboxIsOpen).toBe(false)
    expect(await ui.find({ type: 'Text', text: WORDMARK })).toBeUndefined()
  })
})
