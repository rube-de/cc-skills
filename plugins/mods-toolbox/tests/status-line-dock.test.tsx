import type { On, ToolCallInput } from 'claude-code'
import { describe, expect, mock, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'

const PLUGIN = 'mods-toolbox'
const SURFACES = ['terminal', 'desktop'] as const
const WORDMARK = '◆  S T A T U S   L I N E   D O C K'
const HOME = '/Users/me'
const ROOT = '/Users/me/code/app'
const USER_SETTINGS = `${HOME}/.claude/settings.json`
const LOCAL_SETTINGS = `${ROOT}/.claude/settings.local.json`
const OWN = `${HOME}/.claude/mods-toolbox`
const GLOBAL_LAYOUT = `${OWN}/layouts/global.json`
const COMMAND = 'sh ~/.claude/mods-toolbox/statusline.sh ~/.claude/mods-toolbox/layouts/global.json'
const ADDON = "~/.claude/agent-dock/statusline.sh '~/.claude/statusline.sh'"
const ESC = String.fromCharCode(27)

const band = (bodyColumns = 140) =>
  ({
    plugin: PLUGIN,
    component: 'AbovePrompt',
    props: { hasSurvey: false, isWorking: false, maxRows: 40, bodyColumns, scroll: { offset: 0, bodyRows: 39 }, view: {} },
  }) as const

const json = (value: unknown) => `${JSON.stringify(value, null, 2)}\n`

type Seen = {
  state: Record<string, unknown>
  files: Record<string, string>
  runs: string[][]
  previewRuns: Array<{ layout: unknown; columns: string | undefined; stdin: string; skill: string | undefined }>
  toasts: string[]
}

type Options = {
  files?: Record<string, string>
  policy?: Record<string, unknown>
  preview?: { base?: string[]; lines?: string[]; dropped?: string[] }
}

// What the engine would do beneath the plugin, answered from memory.
function world(on: On, { files = {}, policy = {}, preview = { lines: ['◆ Opus 5.5'] } }: Options = {}) {
  const seen: Seen = { state: {}, files: { ...files }, runs: [], previewRuns: [], toasts: [] }
  on('state.set', { plugin: PLUGIN }, ($, e, next) => {
    seen.state[e.key] = e.value
    return next(e)
  })
  mock.store(on)
  mock.env(on, { HOME })
  mock.clock(on, { now: 1_000_000 })
  on('session.start', ($, e) => ({ cwd: e.cwd }))
  on('session.root', () => ({ value: ROOT }))
  on('session.cwd', () => ({ value: ROOT }))
  on('session.id', () => ({ value: 'session-1' }))
  on('session.model', () => ({ value: 'claude-opus-5-5' }))
  on('session.version', () => ({ value: { version: '2.1.296' } }))
  on('session.usage', () => ({ value: { startedAt: 0, context: { window: 200_000, percent: 10 }, rateLimits: [] } }))
  on('settings.read', ($, e) => ({ value: e.source === 'policy' ? policy : {} }))
  on('command.register', ($, e) => ({ value: { command: e.name } }))
  on('tool.register', ($, e) => ({ value: { tool: `mcp__mods-toolbox__${e.name}` } }))
  on('prompt.compose', () => ({ sections: [] }))
  on('agent.list', () => ({ value: [] }))
  on('ui.status', () => ({ value: undefined }))
  on('ui.toast', ($, e) => {
    seen.toasts.push(e.text)
    return { value: undefined }
  })
  on('fs.exists', ($, e) => ({ value: e.path in seen.files || e.path.endsWith('/renderer/statusline.sh') }))
  on('fs.read', ($, e) => {
    if (e.path.includes('/renderer/')) {
      return { value: `shipped ${e.path.split('/').pop()}` }
    }
    const text = seen.files[e.path]
    if (text === undefined) {
      throw new Error(`ENOENT: ${e.path}`)
    }
    return { value: text }
  })
  on('fs.write', ($, e) => {
    seen.files[e.path] = e.text
    return { value: undefined }
  })
  on('process.run', ($, e) => {
    const argv = [...e.argv]
    seen.runs.push(argv)
    let stdout = ''
    if (argv[0] === 'sh' && (argv[1] ?? '').endsWith('/renderer/statusline.sh')) {
      const env = e.init?.env ?? {}
      seen.previewRuns.push({
        layout: JSON.parse(env.MODS_TOOLBOX_LAYOUT ?? 'null'),
        columns: env.COLUMNS,
        stdin: e.init?.stdin ?? '',
        skill: env.MODS_TOOLBOX_SKILL,
      })
      stdout = JSON.stringify({ base: [], dropped: [], ...preview })
    }
    if (argv[0] === 'rm') {
      for (const target of argv.slice(2)) {
        for (const path of Object.keys(seen.files)) {
          if (path === target || path.startsWith(`${target}/`)) {
            delete seen.files[path]
          }
        }
      }
    }
    const exitCode = argv[0] === 'git' ? 1 : 0
    return { value: { exitCode, stdout, stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }
  })
  on('ui.render', { component: 'AbovePrompt' }, ($, e) => {
    const { Box } = $.ui.resolve(e)
    return <Box />
  })

  return { seen }
}

// Skills as the engine runs them, found by probing it: a typed /name and a
// Skill call each expand the prompt inside their own call, under the name the
// engine resolves (the tool takes `review`, the prompt says `kit:review`).
function skillEngine($: Engine, on: On) {
  on('tool.call', { tool: 'Skill' }, async ($inner, e) => {
    await $.skill.prompt({ skill: `kit:${e.skill}`, text: 'Review it.' })
    // A forked skill's call resolves only once its subagent is done, skills and all.
    if (e.skill === 'forked') {
      await $.skill.prompt({ skill: 'kit:nested', text: 'Nested.' })
    }
    return { result: `Launching skill: ${e.skill}` }
  })
  on('command.run', { command: /^kit:/ }, async ($inner, e) => {
    await $.skill.prompt({ skill: e.command, text: 'Plan it.' })
    return { text: '' }
  })
  on('skill.prompt', ($inner, e) => ({ text: e.text }))
  on('session.end', ($inner, e) => ({ sessionId: e.sessionId }))
  on('turn.complete', ($inner, e) => ({ text: e.answer }))
}

async function begin($: Engine) {
  await $.session.start({ cwd: ROOT, surface: 'terminal', isInteractive: true })
}

async function installGlobal($: Engine) {
  await statusDock($)
  const ui = await $.ui.mount({ ...band(), surface: 'terminal' })
  await ui.press({ key: 'sl-apply' })
  await ui.press({ key: 'sl-confirm' })

  return ui
}

function callSkill($: Engine, skill: string, agentId?: string) {
  return $.tool.call({ tool: 'Skill', tool_use_id: `tu-${skill}`, skill, ...(agentId === undefined ? {} : { agentId }) } as unknown as ToolCallInput)
}

function typeSkill($: Engine, command: string) {
  return $.command.run({ command, args: '', origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 140 } })
}

const SKILL_FILE = `${OWN}/skill-now/session-1.json`

async function statusDock($: Engine) {
  return $.command.run({
    command: 'status-dock',
    args: '',
    origin: { kind: 'composer' },
    presentation: { isFullscreen: false, columns: 140 },
  })
}

describe('opening', () => {
  test('/status-dock opens it in the band and closes it again', async ($, on) => {
    const { seen } = world(on)
    await begin($)

    expect((await statusDock($)).text).toBe('Status Line Dock open above the prompt.')
    const ui = await $.ui.mount({ ...band(), surface: 'terminal' })
    expect(await ui.find({ type: 'Text', text: WORDMARK })).toBeDefined()
    expect(seen.state.bandView).toBe('statusLineDock')

    expect((await statusDock($)).text).toBe('Status Line Dock closed.')
    expect(await ui.find({ type: 'Text', text: WORDMARK })).toBeUndefined()
  })

  test("the Toolbox's Launch entry opens it in the popup's place", async ($, on) => {
    const { seen } = world(on)
    await begin($)
    await $.command.run({ command: 'toolbox', args: '', origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 140 } })

    for (const surface of SURFACES) {
      const ui = await $.ui.mount({ ...band(), surface })
      if (seen.state.bandView !== 'toolbox') {
        await $.command.run({ command: 'toolbox', args: '', origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 140 } })
      }
      expect((await ui.find({ type: 'Button', key: 'toolbox-status-line' }))?.text).toContain('Status Line Dock  not set up')
      await ui.press({ key: 'toolbox-status-line' })
      expect(seen.state.bandView).toBe('statusLineDock')
      expect(await ui.find({ type: 'Text', text: WORDMARK })).toBeDefined()
      expect(await ui.find({ type: 'Text', text: '◆  T O O L B O X' })).toBeUndefined()
      await ui.press({ key: 'sl-close' })
      expect(seen.state.bandView).toBe(null)
      await ui.unmount()
    }
  })

  test('with nothing set up it starts in Replace with the default blocks', async ($, on) => {
    world(on)
    await begin($)
    await statusDock($)

    const ui = await $.ui.mount({ ...band(), surface: 'terminal' })
    expect(JSON.stringify(await ui.drawn())).toContain('Global · not installed')
    expect(await ui.find({ type: 'Button', key: 'sl-block-folder' })).toBeDefined()
    expect(await ui.find({ type: 'Button', key: 'sl-mode-extend' })).toBeUndefined()
    expect(await ui.find({ type: 'Button', key: 'sl-apply' })).toMatchObject({ text: 'Install', props: { hotkey: 'a' } })
  })
})

describe('editing', () => {
  test('select a block, then move it along, across and off with the keys', async ($, on) => {
    const { seen } = world(on)
    await begin($)
    await statusDock($)
    const ui = await $.ui.mount({ ...band(), surface: 'terminal' })
    const drafted = () => (seen.state.statusLineDrafts as { global: { lines: string[][] } | null }).global?.lines

    await ui.press({ key: 'sl-block-model' })
    await ui.press({ key: 'sl-left' })
    expect(drafted()?.[0]).toEqual(['folder', 'model', 'branch', 'effort'])
    await ui.press({ key: 'sl-down' })
    expect(drafted()?.[1]).toEqual(['context', 'cost', 'lines', 'time', 'agents', 'model'])
    await ui.press({ key: 'sl-down' })
    expect(drafted()?.flat()).not.toContain('model')
    await ui.press({ key: 'sl-icons' })
    expect((seen.state.statusLineDrafts as { global: { icons: string } }).global.icons).toBe('emoji')
    expect(JSON.stringify(await ui.drawn())).toContain('unapplied changes')

    await ui.press({ key: 'sl-revert' })
    expect(seen.state.statusLineDrafts).toEqual({ global: null, project: null })
  })

  test('a click turns an Off block on at the end of the last line; o turns the selected one off and on', async ($, on) => {
    const { seen } = world(on)
    await begin($)
    await statusDock($)
    const ui = await $.ui.mount({ ...band(), surface: 'terminal' })
    const drafted = () => (seen.state.statusLineDrafts as { global: { lines: string[][] } | null }).global?.lines

    await ui.press({ key: 'sl-block-limits' })
    expect(drafted()?.[1]).toEqual(['context', 'cost', 'lines', 'time', 'agents', 'limits'])
    expect(seen.state.statusLineSelected).toBe('limits')
    expect(JSON.stringify(await ui.find({ type: 'Button', key: 'sl-block-limits' }))).toContain('"inverse":true')

    await ui.press({ key: 'sl-toggle' })
    expect(drafted()).toBeUndefined()
    await ui.press({ key: 'sl-block-model' })
    expect(drafted()).toBeUndefined()
    await ui.press({ key: 'sl-toggle' })
    expect(drafted()?.[0]).toEqual(['folder', 'branch', 'effort'])
    await ui.press({ key: 'sl-toggle' })
    expect(drafted()?.[1]).toEqual(['context', 'cost', 'lines', 'time', 'agents', 'model'])
    expect(await ui.find({ type: 'Button', key: 'sl-toggle' })).toMatchObject({ text: 'on/off', props: { hotkey: 'o' } })

    const desktop = await $.ui.mount({ ...band(), surface: 'desktop' })
    expect(await desktop.find({ type: 'Text', text: WORDMARK })).toBeDefined()
    expect(JSON.stringify(await desktop.find({ type: 'Button', key: 'sl-block-model' }))).toContain('"inverse":true')
  })

  test('the icons are chips like Mode and Scope', async ($, on) => {
    const { seen } = world(on)
    await begin($)
    await statusDock($)
    const ui = await $.ui.mount({ ...band(), surface: 'terminal' })

    expect(await ui.find({ type: 'Button', key: 'sl-icons-glyph' })).toBeUndefined()
    await ui.press({ key: 'sl-icons-emoji' })
    expect((seen.state.statusLineDrafts as { global: { icons: string } }).global.icons).toBe('emoji')
    expect(await ui.find({ type: 'Button', key: 'sl-icons-glyph' })).toBeDefined()
  })

  test('the preview runs the real renderer on the Layout being edited and draws its colors', async ($, on) => {
    const { seen } = world(on, { preview: { lines: [`◆ ${ESC}[38;5;147mOpus 5.5${ESC}[0m`], dropped: ['cost'] } })
    await begin($)
    await statusDock($)
    const ui = await $.ui.mount({ ...band(), surface: 'terminal' })

    expect(seen.previewRuns.length).toBeGreaterThan(0)
    expect(JSON.stringify(await ui.drawn())).toContain('{"type":"Text","props":{"color":"#afafff"},"children":["Opus 5.5"]}')
    expect(JSON.stringify(await ui.drawn())).toContain('drops: Cost')
    // No effort seen yet, no cost ledger in this world, no lines changed, no helpers out.
    expect(JSON.stringify(await ui.drawn())).toContain('sample figures until Claude Code has them: Effort, Cost, Lines changed, Agents')

    await ui.press({ key: 'sl-block-agents' })
    await ui.press({ key: 'sl-up' })
    const last = seen.previewRuns[seen.previewRuns.length - 1]
    expect((last?.layout as { lines: string[][] }).lines[1]).not.toContain('agents')
    expect(JSON.parse(last?.stdin ?? '{}')).toMatchObject({ session_id: 'session-1', workspace: { current_dir: ROOT } })
  })
})

describe('install and uninstall', () => {
  test('Install asks first, then sets the global status line and keeps what was there', async ($, on) => {
    const before = json({ theme: 'dark', statusLine: { type: 'command', command: '~/.claude/statusline.sh', padding: 0 } })
    const { seen } = world(on, { files: { [USER_SETTINGS]: before } })
    await begin($)
    await statusDock($)
    const ui = await $.ui.mount({ ...band(), surface: 'terminal' })
    expect(await ui.find({ type: 'Button', key: 'sl-mode-extend' })).toBeUndefined()

    await ui.press({ key: 'sl-apply' })
    expect(JSON.stringify(await ui.drawn())).toContain(`Set the status line in ${USER_SETTINGS}?`)
    expect(seen.files[USER_SETTINGS]).toBe(before)

    await ui.press({ key: 'sl-confirm' })
    expect(JSON.parse(seen.files[USER_SETTINGS] ?? '{}')).toEqual({
      theme: 'dark',
      statusLine: { type: 'command', command: COMMAND, padding: 0, refreshInterval: 2 },
    })
    expect(JSON.parse(seen.files[GLOBAL_LAYOUT] ?? '{}')).toMatchObject({ mode: 'extend', base: { kind: 'command', command: '~/.claude/statusline.sh' } })
    expect(JSON.parse(seen.files[`${OWN}/installs.json`] ?? '{}').installs[USER_SETTINGS]).toEqual({
      scope: 'global',
      layoutFile: GLOBAL_LAYOUT,
      before: { type: 'command', command: '~/.claude/statusline.sh', padding: 0 },
      createdFile: false,
    })
    expect(seen.files[`${OWN}/statusline.sh`]).toBe('shipped statusline.sh')
    expect(seen.files[`${OWN}/statusline.jq`]).toBe('shipped statusline.jq')
    expect(JSON.stringify(await ui.drawn())).toContain('Global · installed')
  })

  test('the Agent Dock add-on is unwrapped, and goes once no settings file lists it', async ($, on) => {
    const { seen } = world(on, {
      files: {
        [USER_SETTINGS]: json({ statusLine: { type: 'command', command: ADDON, refreshInterval: 2 } }),
        [`${HOME}/.claude/agent-dock/installs`]: `${USER_SETTINGS}\tnone\n`,
        [`${HOME}/.claude/agent-dock/statusline.sh`]: 'addon',
      },
    })
    await begin($)
    await statusDock($)
    const ui = await $.ui.mount({ ...band(), surface: 'terminal' })
    expect(await ui.find({ type: 'Button', key: 'sl-mode-extend' })).toBeUndefined()
    expect(JSON.stringify(await ui.drawn())).toContain('Keeps  ~/.claude/statusline.sh')

    await ui.press({ key: 'sl-apply' })
    await ui.press({ key: 'sl-confirm' })
    expect(JSON.parse(seen.files[`${OWN}/installs.json`] ?? '{}').installs[USER_SETTINGS].before).toEqual({
      type: 'command',
      command: '~/.claude/statusline.sh',
    })
    expect(seen.files[`${HOME}/.claude/agent-dock/installs`]).toBeUndefined()
    expect(seen.files[`${HOME}/.claude/agent-dock/statusline.sh`]).toBeUndefined()
  })

  test('the add-on stays while another project still runs it', async ($, on) => {
    const other = '/Users/me/code/other/.claude/settings.local.json'
    const { seen } = world(on, {
      files: {
        [USER_SETTINGS]: json({ statusLine: { type: 'command', command: ADDON, refreshInterval: 2 } }),
        [`${HOME}/.claude/agent-dock/installs`]: `${USER_SETTINGS}\tnone\n${other}\tnew\n`,
        [`${HOME}/.claude/agent-dock/statusline.sh`]: 'addon',
      },
    })
    await begin($)
    await statusDock($)
    const ui = await $.ui.mount({ ...band(), surface: 'terminal' })
    await ui.press({ key: 'sl-apply' })
    await ui.press({ key: 'sl-confirm' })

    expect(seen.files[`${HOME}/.claude/agent-dock/installs`]).toBe(`${other}\tnew\n`)
    expect(seen.files[`${HOME}/.claude/agent-dock/statusline.sh`]).toBe('addon')
  })

  test('once installed, Apply only saves the Layout', async ($, on) => {
    const { seen } = world(on)
    await begin($)
    await statusDock($)
    const ui = await $.ui.mount({ ...band(), surface: 'terminal' })
    await ui.press({ key: 'sl-apply' })
    await ui.press({ key: 'sl-confirm' })
    const settingsAfterInstall = seen.files[USER_SETTINGS]

    await ui.press({ key: 'sl-block-cost' })
    await ui.press({ key: 'sl-up' })
    expect((await ui.find({ type: 'Button', key: 'sl-apply' }))?.text).toBe('Apply')
    await ui.press({ key: 'sl-apply' })
    expect(JSON.parse(seen.files[GLOBAL_LAYOUT] ?? '{}').lines[0]).toContain('cost')
    expect(seen.files[USER_SETTINGS]).toBe(settingsAfterInstall)
    expect(seen.toasts).toContain('Status line updated.')
  })

  test('This project installs into settings.local.json and follows the global status line', async ($, on) => {
    const { seen } = world(on, { files: { [USER_SETTINGS]: json({ statusLine: { type: 'command', command: 'mine' } }) } })
    await begin($)
    await statusDock($)
    const ui = await $.ui.mount({ ...band(), surface: 'terminal' })
    await ui.press({ key: 'sl-scope-project' })
    expect(JSON.stringify(await ui.drawn())).toContain(`Keeps  the status line ${USER_SETTINGS} sets`)

    await ui.press({ key: 'sl-apply' })
    await ui.press({ key: 'sl-confirm' })
    expect(JSON.parse(seen.files[LOCAL_SETTINGS] ?? '{}').statusLine.command).toContain('/mods-toolbox/layouts/project-')
    expect(seen.files[USER_SETTINGS]).toBe(json({ statusLine: { type: 'command', command: 'mine' } }))
    expect(seen.toasts).toContain('Keep .claude/settings.local.json out of git: add it to .gitignore.')
  })

  test('Uninstall asks, puts the status line back exactly, and clears what the install made', async ($, on) => {
    const before = json({ statusLine: { type: 'command', command: 'mine', refreshInterval: 10 } })
    const { seen } = world(on, { files: { [USER_SETTINGS]: before } })
    await begin($)
    await statusDock($)
    const ui = await $.ui.mount({ ...band(), surface: 'terminal' })
    await ui.press({ key: 'sl-apply' })
    await ui.press({ key: 'sl-confirm' })
    expect(seen.files[USER_SETTINGS]).not.toBe(before)

    await ui.press({ key: 'sl-uninstall' })
    expect(JSON.stringify(await ui.drawn())).toContain(`Put back the status line ${USER_SETTINGS} had before the Dock?`)
    expect(JSON.stringify(await ui.drawn())).toContain('back to  mine')
    await ui.press({ key: 'sl-confirm' })
    expect(seen.files[USER_SETTINGS]).toBe(before)
    expect(Object.keys(seen.files).filter(path => path.startsWith(OWN))).toEqual([])
    expect(JSON.stringify(await ui.drawn())).toContain('Global · not installed')
  })

  test('with no record here, Uninstall takes the Dock line out, and keeps the renderer while the project runs it', async ($, on) => {
    const ours = json({ statusLine: { type: 'command', command: COMMAND } })
    const { seen } = world(on, { files: { [USER_SETTINGS]: ours, [LOCAL_SETTINGS]: ours } })
    await begin($)
    await statusDock($)
    const ui = await $.ui.mount({ ...band(), surface: 'terminal' })

    await ui.press({ key: 'sl-scope-global' })
    await ui.press({ key: 'sl-uninstall' })
    expect(JSON.stringify(await ui.drawn())).toContain(`Take the Dock's status line out of ${USER_SETTINGS}?`)
    expect(JSON.stringify(await ui.drawn())).toContain('back to  no status line: there is no record here of the one before')
    await ui.press({ key: 'sl-confirm' })
    expect(seen.files[USER_SETTINGS]).toBe('{}\n')
    expect(seen.files[`${OWN}/statusline.sh`]).toBe('shipped statusline.sh')
    expect(seen.toasts).toContain(`Status line taken out of ${USER_SETTINGS}.`)

    await ui.press({ key: 'sl-scope-project' })
    await ui.press({ key: 'sl-uninstall' })
    await ui.press({ key: 'sl-confirm' })
    expect(seen.files[LOCAL_SETTINGS]).toBe('{}\n')
    expect(Object.keys(seen.files).filter(path => path.startsWith(OWN))).toEqual([])
  })

  test("a status line from managed settings can't be changed here", async ($, on) => {
    world(on, { policy: { statusLine: { type: 'command', command: 'company' } } })
    await begin($)
    await statusDock($)
    const ui = await $.ui.mount({ ...band(), surface: 'terminal' })

    expect(JSON.stringify(await ui.drawn())).toContain("Your organization sets the status line, so it can't be changed here.")
    expect(await ui.find({ type: 'Button', key: 'sl-apply' })).toBeUndefined()
  })

  test('a settings file with comments is left alone', async ($, on) => {
    const { seen } = world(on, { files: { [USER_SETTINGS]: '{\n  // mine\n}\n' } })
    await begin($)
    await statusDock($)
    const ui = await $.ui.mount({ ...band(), surface: 'terminal' })

    expect(JSON.stringify(await ui.drawn())).toContain('is not plain JSON, so it is left alone')
    expect(await ui.find({ type: 'Button', key: 'sl-apply' })).toBeUndefined()
    expect(seen.files[USER_SETTINGS]).toBe('{\n  // mine\n}\n')
  })
})

describe('session start', () => {
  test('the renderer copy is refreshed only while an install uses it', async ($, on) => {
    const { seen } = world(on)
    await begin($)
    expect(seen.files[`${OWN}/statusline.sh`]).toBeUndefined()
  })

  test("a settings file from another machine's dotfiles gets its renderer, with no record here", async ($, on) => {
    const { seen } = world(on, { files: { [USER_SETTINGS]: json({ statusLine: { type: 'command', command: COMMAND } }) } })
    await begin($)
    expect(seen.files[`${OWN}/statusline.sh`]).toBe('shipped statusline.sh')
    expect(seen.files[`${OWN}/statusline.jq`]).toBe('shipped statusline.jq')
  })

  test('an installed renderer is brought up to the shipped one', async ($, on) => {
    const { seen } = world(on, {
      files: {
        [`${OWN}/installs.json`]: json({ version: 1, installs: { [USER_SETTINGS]: { scope: 'global', layoutFile: GLOBAL_LAYOUT, before: null, createdFile: true } } }),
        [`${OWN}/statusline.sh`]: 'old',
      },
    })
    await begin($)
    expect(seen.files[`${OWN}/statusline.sh`]).toBe('shipped statusline.sh')
  })
})

describe('skill block', () => {
  const skillOf = (seen: Seen) => JSON.parse(seen.files[SKILL_FILE] ?? 'null') as { name: string; isRunning: boolean } | null

  test('a skill the main conversation calls shows under its resolved name, bright until its turn ends', async ($, on) => {
    const { seen } = world(on)
    skillEngine($, on)
    await begin($)
    await installGlobal($)

    await callSkill($, 'review')
    expect(skillOf(seen)).toEqual({ name: 'kit:review', isRunning: true })

    await $.turn.complete({ answer: 'Done.', durationMs: 10, isAborted: false, turnId: 'turn-1', reason: 'answer' })
    expect(skillOf(seen)).toEqual({ name: 'kit:review', isRunning: false })
  })

  test("a typed /skill counts; a subagent's call and a preload don't", async ($, on) => {
    const { seen } = world(on)
    skillEngine($, on)
    await begin($)
    await installGlobal($)

    await typeSkill($, 'kit:plan')
    expect(skillOf(seen)).toEqual({ name: 'kit:plan', isRunning: true })

    await callSkill($, 'review', 'agent-1')
    await $.skill.prompt({ skill: 'kit:preloaded', text: 'Preloaded.' })
    await $.turn.complete({ answer: 'Done.', durationMs: 10, isAborted: false, turnId: 't-agent-1', agentId: 'agent-1', reason: 'answer' })
    expect(skillOf(seen)).toEqual({ name: 'kit:plan', isRunning: true })
  })

  test("a forked skill shows, not the skills its subagent runs while the call is out", async ($, on) => {
    const { seen } = world(on)
    skillEngine($, on)
    await begin($)
    await installGlobal($)

    await callSkill($, 'forked')
    expect(skillOf(seen)).toEqual({ name: 'kit:forked', isRunning: true })
  })

  test('before an install the preview shows it, and no file is written', async ($, on) => {
    const { seen } = world(on)
    skillEngine($, on)
    await begin($)

    await callSkill($, 'review')
    expect(seen.state.statusLineSkill).toEqual({ name: 'kit:review', isRunning: true })
    expect(Object.keys(seen.files).filter(path => path.startsWith(OWN))).toEqual([])

    await statusDock($)
    expect(JSON.parse(seen.previewRuns[seen.previewRuns.length - 1]?.skill ?? 'null')).toEqual({ name: 'kit:review', isRunning: true })

    // The install writes it at once.
    const ui = await $.ui.mount({ ...band(), surface: 'terminal' })
    await ui.press({ key: 'sl-apply' })
    await ui.press({ key: 'sl-confirm' })
    expect(skillOf(seen)).toEqual({ name: 'kit:review', isRunning: true })
  })

  test('with no skill run yet the preview shows a sample, named under it', async ($, on) => {
    const { seen } = world(on)
    await begin($)
    await statusDock($)
    const ui = await $.ui.mount({ ...band(), surface: 'terminal' })
    await ui.press({ key: 'sl-block-skill' })

    expect(JSON.parse(seen.previewRuns[seen.previewRuns.length - 1]?.skill ?? 'null')).toEqual({ name: 'code-review', isRunning: true })
    expect(JSON.stringify(await ui.drawn())).toMatch(/sample figures until Claude Code has them: [^"]*Skill/)
  })

  test('a /clear takes the skill and its file along', async ($, on) => {
    const { seen } = world(on)
    skillEngine($, on)
    await begin($)
    await installGlobal($)
    await callSkill($, 'review')
    expect(seen.files[SKILL_FILE]).toBeDefined()

    await $.session.end({ reason: 'clear', sessionId: 'session-1', resume: { id: 'session-1' } })
    expect(seen.files[SKILL_FILE]).toBeUndefined()
    expect(seen.state.statusLineSkill).toBeNull()
  })

  test('after an uninstall a skill never brings the folder back', async ($, on) => {
    const { seen } = world(on)
    skillEngine($, on)
    await begin($)
    const ui = await installGlobal($)
    await callSkill($, 'review')
    await ui.press({ key: 'sl-uninstall' })
    await ui.press({ key: 'sl-confirm' })
    expect(Object.keys(seen.files).filter(path => path.startsWith(OWN))).toEqual([])

    await callSkill($, 'plan')
    expect(Object.keys(seen.files).filter(path => path.startsWith(OWN))).toEqual([])
  })
})
