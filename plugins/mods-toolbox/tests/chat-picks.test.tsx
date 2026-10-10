import type { On } from 'claude-code'
import { describe, expect, mock, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'

import {
  effortFromSettings,
  effortTaken,
  familyOf,
  modelArgs,
  modelLabel,
  offeredFamilies,
  refusal,
  ultracodeAsked,
  ultracodeTaken,
} from '../hooks/chat-picks-logic'

const PLUGIN = 'mods-toolbox'
const OPTIONS = ['default', 'sonnet', 'opus', 'haiku', 'fable', 'best', 'sonnet[1m]', 'opus[1m]', 'fable[1m]', 'opusplan']
// What /model makes of each alias it is given.
const MODEL_IDS: Record<string, string> = {
  haiku: 'claude-haiku-4-5',
  sonnet: 'claude-sonnet-5-5',
  'sonnet[1m]': 'claude-sonnet-5-5[1m]',
  opus: 'claude-opus-5-5',
  'opus[1m]': 'claude-opus-5-5[1m]',
  fable: 'claude-fable-5-1',
  'fable[1m]': 'claude-fable-5-1[1m]',
}

const band = (isWorking = false) =>
  ({
    plugin: PLUGIN,
    component: 'AbovePrompt',
    props: { hasSurvey: false, isWorking, maxRows: 30, bodyColumns: 140, scroll: { offset: 0, bodyRows: 29 }, view: {} },
  }) as const

type Seen = {
  state: Record<string, unknown>
  model: string
  runs: string[]
  toasts: string[]
  // While set, /model and /effort wait as they do while Claude works.
  isBusy: boolean
  idle: Array<() => void>
}

type Options = {
  model?: string
  rows?: Array<{ key: string; options?: string[]; isLocked?: boolean }>
  settings?: Record<string, unknown>
  failingCommand?: 'model' | 'effort' | 'ultracode'
  isQuiet?: boolean
}

// What the engine would do beneath the plugin, answered from memory.
function world(
  on: On,
  {
    model = 'claude-opus-5-5[1m]',
    rows = [{ key: 'model', options: OPTIONS }],
    settings = { effortLevel: 'high', modelSettings: { 'claude-opus-5-5': { effortLevel: 'xhigh' } } },
    failingCommand,
    isQuiet = false,
  }: Options = {},
) {
  const seen: Seen = { state: {}, model, runs: [], toasts: [], isBusy: false, idle: [] }
  on('state.set', { plugin: PLUGIN }, ($, e, next) => {
    seen.state[e.key] = e.value
    return next(e)
  })
  const clock = mock.clock(on, { now: 1_000_000 })
  on('session.start', ($, e) => ({ cwd: e.cwd }))
  on('store.get', () => ({ value: undefined }))
  on('store.set', () => ({ value: undefined }))
  on('command.register', ($, e) => ({ value: { command: e.name } }))
  on('tool.register', ($, e) => ({ value: { tool: `mcp__mods-toolbox__${e.name}` } }))
  on('prompt.compose', () => ({ sections: [] }))
  on('agent.list', () => ({ value: [] }))
  on('fs.exists', () => ({ value: false }))
  on('process.run', () => ({
    value: { exitCode: 0, stdout: '', stderr: '', isStdoutTruncated: false, isStderrTruncated: false },
  }))
  on('classic.Stop', () => ({}))
  on('config.list', () => ({
    value: rows.map(row => ({
      key: row.key,
      label: row.key,
      kind: 'choice' as const,
      value: 'opus[1m]',
      options: row.options,
      provider: { plugin: 'engine', tier: 'core' as const },
      isLocked: row.isLocked ?? false,
    })),
  }))
  on('settings.read', () => ({ value: settings }))
  on('session.model', () => ({ value: seen.model }))
  // A refusal answers in text too, as Claude Code's own commands do; an
  // interactive run (`isQuiet`) answers none, its line going to the chat.
  on('command.run', { command: /^(model|effort)$/ }, async ($, e) => {
    seen.runs.push(`/${e.command} ${e.args}`)
    if (seen.isBusy) {
      await new Promise<void>(resolve => seen.idle.push(resolve))
    }
    const isUltracode = e.args.startsWith('ultracode')
    if (isUltracode && !/^ultracode( on| off)?$/i.test(e.args)) {
      return { text: `Invalid argument: ${e.args}. Valid options are: low, medium, high, xhigh, max, auto, ultracode [on|off]` }
    }
    if (failingCommand === (isUltracode ? 'ultracode' : e.command)) {
      return {
        text: isUltracode
          ? 'Ultracode needs a Max plan'
          : e.command === 'model'
            ? 'Unable to validate model: nope'
            : `Invalid argument: ${e.args}`,
      }
    }
    if (e.command === 'model') {
      seen.model = MODEL_IDS[e.args] ?? seen.model
    }
    if (isQuiet) {
      return {}
    }
    if (isUltracode) {
      return { text: e.args === 'ultracode off' ? 'Ultracode off. Effort stays medium.' : 'Ultracode on: dynamic workflows on every task.' }
    }

    return {
      text:
        e.command === 'model'
          ? `Set model to \`${e.args}\` and saved as your default for new sessions`
          : `Set effort level to ${e.args} (saved as your default for new sessions): how hard Claude thinks`,
    }
  })
  on('config.set', ($, e) => {
    if (e.key === 'model') {
      seen.model = MODEL_IDS[String(e.value)] ?? seen.model
    }
    return { value: e.value }
  })
  on('ui.toast', ($, e) => {
    seen.toasts.push(e.text)
    return { value: undefined }
  })
  on('ui.render', { component: 'AbovePrompt' }, ($, e) => {
    const { Box } = $.ui.resolve(e)

    return <Box />
  })

  return { clock, seen }
}

async function openToolbox($: Engine) {
  await $.session.start({ cwd: '/tmp', surface: 'terminal', isInteractive: true })
  await $.command.run({
    command: 'toolbox',
    args: '',
    origin: { kind: 'composer' },
    presentation: { isFullscreen: false, columns: 140 },
  })
}

async function finishWork(seen: Seen) {
  seen.isBusy = false
  for (const resolve of seen.idle.splice(0)) {
    resolve()
  }
}

describe('naming and arguments', () => {
  test('model ids read as families and short names', () => {
    expect(familyOf('claude-opus-5-5[1m]')).toBe('opus')
    expect(familyOf('claude-haiku-4-5')).toBe('haiku')
    expect(familyOf('opusplan')).toBeNull()
    expect(modelLabel('claude-opus-5-5[1m]')).toBe('Opus 5.5 · 1M')
    expect(modelLabel('claude-sonnet-5-5')).toBe('Sonnet 5.5')
    expect(modelLabel('something-else')).toBe('something-else')
  })

  test('only the families the /config row offers are shown', () => {
    expect(offeredFamilies(OPTIONS)).toEqual(['haiku', 'sonnet', 'opus', 'fable'])
    expect(offeredFamilies(['default', 'sonnet', 'opus'])).toEqual(['sonnet', 'opus'])
    expect(offeredFamilies(undefined)).toEqual([])
  })

  test('a chat on 1M context keeps it where the family offers it', () => {
    expect(modelArgs('sonnet', 'claude-opus-5-5[1m]', OPTIONS)).toBe('sonnet[1m]')
    expect(modelArgs('haiku', 'claude-opus-5-5[1m]', OPTIONS)).toBe('haiku')
    expect(modelArgs('sonnet', 'claude-opus-5-5', OPTIONS)).toBe('sonnet')
  })

  test("settings give the model's own effort first, then the general one", () => {
    const settings = { effortLevel: 'high', modelSettings: { 'claude-opus-5-5': { effortLevel: 'xhigh' } } }
    expect(effortFromSettings(settings, 'claude-opus-5-5[1m]')).toBe('xhigh')
    expect(effortFromSettings(settings, 'claude-sonnet-5-5')).toBe('high')
    expect(effortFromSettings({ effortLevel: 'turbo' }, 'claude-sonnet-5-5')).toBeNull()
    expect(effortFromSettings({}, 'claude-sonnet-5-5')).toBeNull()
  })

  test('a command answers success in text, or with none when it ran interactively', () => {
    expect(effortTaken(undefined)).toBe(true)
    expect(effortTaken('')).toBe(true)
    expect(effortTaken('Set effort level to low (saved as your default for new sessions): Quick')).toBe(true)
    expect(effortTaken('Invalid argument: turbo. Valid options are: low, medium')).toBe(false)
    expect(ultracodeTaken('Ultracode on (this session only): dynamic workflows on every task.')).toBe(true)
    expect(ultracodeTaken('Ultracode needs a Max plan')).toBe(false)
    expect(refusal('\n  Invalid argument: turbo\nmore', 'fallback')).toBe('Invalid argument: turbo')
    expect(refusal(undefined, 'fallback')).toBe('fallback')
  })

  test('/effort ultracode reads as on, off, or not about Ultracode', () => {
    expect(ultracodeAsked('ultracode')).toBe(true)
    expect(ultracodeAsked('ultracode on')).toBe(true)
    expect(ultracodeAsked(' Ultracode OFF ')).toBe(false)
    expect(ultracodeAsked('high')).toBeNull()
    // Claude Code refuses these as invalid arguments, not for the plan.
    expect(ultracodeAsked('ultracode onn')).toBeNull()
    expect(ultracodeAsked('ultracode on extra')).toBeNull()
  })
})

describe('model config rows', () => {
  test("the popup shows the chat's model and effort", async ($, on) => {
    world(on)
    await openToolbox($)

    const ui = await $.ui.mount({ ...band(), surface: 'terminal' })
    expect(await ui.find({ type: 'Text', text: 'Opus 5.5 · 1M · xhigh' })).toBeDefined()
    expect(await ui.find({ type: 'Button', key: 'chat-model-opus' })).toBeUndefined()
    expect(await ui.find({ type: 'Button', key: 'chat-model-sonnet' })).toBeDefined()
    expect(await ui.find({ type: 'Button', key: 'chat-effort-xhigh' })).toBeUndefined()
    expect(await ui.find({ type: 'Button', key: 'chat-effort-low' })).toBeDefined()
  })

  test('a model press runs /model, keeping 1M context', async ($, on) => {
    const { clock, seen } = world(on)
    await openToolbox($)

    const ui = await $.ui.mount({ ...band(), surface: 'terminal' })
    await ui.press({ key: 'chat-model-sonnet' })
    await clock.advance(1)
    await clock.settle()
    expect(seen.runs).toEqual(['/model sonnet[1m]'])
    expect(seen.state.chatModelPending).toBeNull()

    // Sonnet has no effort of its own in settings, so the general one holds.
    expect(seen.state.chatEffort).toBe('high')
    await ui.redraw()
    expect(await ui.find({ type: 'Text', text: 'Sonnet 5.5 · 1M · high' })).toBeDefined()
    expect(await ui.find({ type: 'Button', key: 'chat-model-sonnet' })).toBeUndefined()
    expect(await ui.find({ type: 'Button', key: 'chat-model-opus' })).toBeDefined()
  })

  test('while Claude works a pick waits, and says so', async ($, on) => {
    const { clock, seen } = world(on)
    await openToolbox($)
    seen.isBusy = true

    const ui = await $.ui.mount({ ...band(true), surface: 'terminal' })
    await ui.press({ key: 'chat-effort-low' })
    await clock.advance(1)
    expect(seen.state.chatEffortPending).toBe('low')
    await ui.redraw()
    expect(await ui.find({ type: 'Text', text: 'switches when Claude is done working' })).toBeDefined()
    expect(await ui.find({ type: 'Button', key: 'chat-effort-low' })).toBeUndefined()

    await finishWork(seen)
    await clock.settle()
    expect(seen.runs).toEqual(['/effort low'])
    expect(seen.state.chatEffortPending).toBeNull()
    expect(seen.state.chatEffort).toBe('low')
    await ui.redraw()
    expect(await ui.find({ type: 'Text', text: 'switches when Claude is done working' })).toBeUndefined()
  })

  test('a turn that ends shows the effort it ran at; a typed /effort shows too', async ($, on) => {
    world(on)
    await openToolbox($)

    await $.classic.Stop({ stop_hook_active: false, effort: { level: 'medium' } })
    const ui = await $.ui.mount({ ...band(), surface: 'terminal' })
    expect(await ui.find({ type: 'Text', text: 'Opus 5.5 · 1M · medium' })).toBeDefined()

    await $.classic.Stop({ stop_hook_active: false, effort: { level: 'low' }, agent_id: 'helper-1' })
    await ui.redraw()
    expect(await ui.find({ type: 'Text', text: 'Opus 5.5 · 1M · medium' })).toBeDefined()

    await $.command.run({ command: 'effort', args: 'max', origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 140 } })
    await ui.redraw()
    expect(await ui.find({ type: 'Text', text: 'Opus 5.5 · 1M · max' })).toBeDefined()
  })

  test('without a /config model row the Model row stays out; Effort stays', async ($, on) => {
    world(on, { rows: [{ key: 'theme' }] })
    await openToolbox($)

    const ui = await $.ui.mount({ ...band(), surface: 'terminal' })
    expect(await ui.find({ type: 'Button', key: 'chat-model-sonnet' })).toBeUndefined()
    expect(await ui.find({ type: 'Button', key: 'chat-effort-low' })).toBeDefined()
  })

  test('a model locked by the organization offers no switch', async ($, on) => {
    world(on, { rows: [{ key: 'model', options: OPTIONS, isLocked: true }] })
    await openToolbox($)

    const ui = await $.ui.mount({ ...band(), surface: 'terminal' })
    expect(await ui.find({ type: 'Button', key: 'chat-model-sonnet' })).toBeUndefined()
  })

  test('a model the command refuses says so and leaves nothing pending', async ($, on) => {
    const { clock, seen } = world(on, { failingCommand: 'model' })
    await openToolbox($)

    const ui = await $.ui.mount({ ...band(), surface: 'terminal' })
    await ui.press({ key: 'chat-model-haiku' })
    await clock.advance(1)
    await clock.settle()
    expect(seen.toasts).toContain('Unable to validate model: nope')
    expect(seen.state.chatModelPending).toBeNull()
    expect(seen.model).toBe('claude-opus-5-5[1m]')
  })

  test('an effort the command refuses says so and keeps the one shown', async ($, on) => {
    const { clock, seen } = world(on, { failingCommand: 'effort' })
    await openToolbox($)

    const ui = await $.ui.mount({ ...band(), surface: 'terminal' })
    await ui.press({ key: 'chat-effort-max' })
    await clock.advance(1)
    await clock.settle()
    expect(seen.toasts).toContain('Invalid argument: max')
    expect(seen.state.chatEffortPending).toBeNull()
    await ui.redraw()
    expect(await ui.find({ type: 'Text', text: 'Opus 5.5 · 1M · xhigh' })).toBeDefined()
  })

  test('a typed /model and the /config row move the popup too', async ($, on) => {
    const { seen } = world(on)
    await openToolbox($)

    await $.command.run({ command: 'model', args: 'haiku', origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 140 } })
    expect(seen.state.chatModel).toBe('claude-haiku-4-5')

    // The person picking Fable in the /config menu.
    await $.config.set({
      key: 'model',
      value: 'fable',
      previous: 'haiku',
      provider: { plugin: 'engine', tier: 'core' },
      origin: { kind: 'composer' },
    })
    expect(seen.state.chatModel).toBe('claude-fable-5-1')
    const ui = await $.ui.mount({ ...band(), surface: 'terminal' })
    expect(await ui.find({ type: 'Text', text: 'Fable 5.1 · high' })).toBeDefined()
  })

  test("a new model brings its own effort; the same model keeps the one shown", async ($, on) => {
    const { seen } = world(on, {
      settings: {
        effortLevel: 'high',
        modelSettings: { 'claude-opus-5-5': { effortLevel: 'xhigh' }, 'claude-sonnet-5-5': { effortLevel: 'low' } },
      },
    })
    await openToolbox($)
    const typed = { origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 140 } } as const

    await $.command.run({ command: 'model', args: 'sonnet', ...typed })
    expect(seen.state.chatEffort).toBe('low')

    // A bare /model only shows the model, so a turn's effort stays.
    await $.classic.Stop({ stop_hook_active: false, effort: { level: 'medium' } })
    await $.command.run({ command: 'model', args: '', ...typed })
    expect(seen.state.chatEffort).toBe('medium')
  })

  test('a reload while a pick waits leaves nothing stuck pending', async ($, on) => {
    const { clock, seen } = world(on)
    await openToolbox($)
    seen.isBusy = true

    const ui = await $.ui.mount({ ...band(true), surface: 'terminal' })
    await ui.press({ key: 'chat-model-sonnet' })
    await clock.advance(1)
    expect(seen.state.chatModelPending).toBe('sonnet')

    await $.session.start({ cwd: '/tmp', surface: 'terminal', isInteractive: true })
    expect(seen.state.chatModelPending).toBeNull()
    expect(seen.state.chatEffortPending).toBeNull()
  })

  test('an interactive run answers no text, and the pick still counts', async ($, on) => {
    const { clock, seen } = world(on, { isQuiet: true })
    await openToolbox($)

    const ui = await $.ui.mount({ ...band(), surface: 'terminal' })
    await ui.press({ key: 'chat-effort-low' })
    await clock.advance(1)
    await clock.settle()
    expect(seen.toasts).toEqual([])
    expect(seen.state.chatEffort).toBe('low')
    await ui.redraw()
    expect(await ui.find({ type: 'Text', text: 'Opus 5.5 · 1M · low' })).toBeDefined()
  })

  test('Ultracode turns on and off, and shows in the header while on', async ($, on) => {
    const { clock, seen } = world(on)
    await openToolbox($)

    const ui = await $.ui.mount({ ...band(), surface: 'terminal' })
    expect(await ui.find({ type: 'Button', key: 'chat-ultracode-off' })).toBeUndefined()
    await ui.press({ key: 'chat-ultracode-on' })
    await clock.advance(1)
    await clock.settle()
    expect(seen.runs).toEqual(['/effort ultracode on'])
    expect(seen.state.chatUltracode).toBe('on')
    await ui.redraw()
    expect(await ui.find({ type: 'Text', text: 'Opus 5.5 · 1M · xhigh · ultracode' })).toBeDefined()

    await ui.press({ key: 'chat-ultracode-off' })
    await clock.advance(1)
    await clock.settle()
    expect(seen.runs).toEqual(['/effort ultracode on', '/effort ultracode off'])
    expect(seen.state.chatUltracode).toBe('off')
  })

  test('a plan without Ultracode says so, and the row goes', async ($, on) => {
    const { clock, seen } = world(on, { failingCommand: 'ultracode' })
    await openToolbox($)

    const ui = await $.ui.mount({ ...band(), surface: 'terminal' })
    await ui.press({ key: 'chat-ultracode-on' })
    await clock.advance(1)
    await clock.settle()
    expect(seen.toasts).toContain('Ultracode needs a Max plan')
    expect(seen.state.chatUltracode).toBe('unavailable')
    await ui.redraw()
    expect(await ui.find({ type: 'Button', key: 'chat-ultracode-on' })).toBeUndefined()
  })

  test('a typed /effort ultracode moves the toggle too', async ($, on) => {
    const { seen } = world(on)
    await openToolbox($)

    await $.command.run({ command: 'effort', args: 'ultracode', origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 140 } })
    expect(seen.state.chatUltracode).toBe('on')
    // Ultracode leaves the effort level where it was.
    expect(seen.state.chatEffort).toBe('xhigh')
  })

  test('a mistyped /effort ultracode leaves the toggle where it was', async ($, on) => {
    const { seen } = world(on)
    await openToolbox($)

    await $.command.run({ command: 'effort', args: 'ultracode onn', origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 140 } })
    expect(seen.state.chatUltracode).not.toBe('unavailable')
    const ui = await $.ui.mount({ ...band(), surface: 'terminal' })
    expect(await ui.find({ type: 'Button', key: 'chat-ultracode-on' })).toBeDefined()
  })
})
