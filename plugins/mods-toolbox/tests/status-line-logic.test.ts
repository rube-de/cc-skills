import { describe, expect, test } from 'claude-code/testing'

import type { StatusLineLayout } from '../types'
import {
  agentDockRecord,
  defaultLayout,
  installPlan,
  layoutFile,
  layoutSummary,
  moveAcross,
  moveAlong,
  nextIcons,
  parseLayout,
  pathsFor,
  previewFrom,
  previewInput,
  rendererCommand,
  rows,
  setupFrom,
  startingLayout,
  styledLines,
  toggleBlock,
  turnOff,
  turnOn,
  uninstallPlan,
  unwrapAgentDock,
  withoutAgentDockRecord,
} from '../hooks/status-line-logic'
import type { PreviewFacts, SetupFiles } from '../hooks/status-line-logic'

const ESC = String.fromCharCode(27)
const PATHS = pathsFor(undefined, '/Users/me', '/Users/me/code/app')
const OURS_GLOBAL = 'sh ~/.claude/mods-toolbox/statusline.sh ~/.claude/mods-toolbox/layouts/global.json'
const ADDON = "~/.claude/agent-dock/statusline.sh '~/.claude/statusline.sh'"

const layout = (overrides: Partial<StatusLineLayout> = {}): StatusLineLayout => ({
  version: 1,
  mode: 'replace',
  icons: 'glyph',
  lines: [['model', 'effort'], ['cost']],
  base: null,
  ...overrides,
})

const settings = (statusLine: unknown, rest: Record<string, unknown> = {}) =>
  `${JSON.stringify({ ...rest, ...(statusLine === undefined ? {} : { statusLine }) }, null, 2)}\n`

const files = (overrides: Partial<SetupFiles> = {}): SetupFiles => ({
  paths: PATHS,
  user: null,
  project: null,
  local: null,
  globalLayout: null,
  projectLayout: null,
  records: null,
  isLocked: false,
  ...overrides,
})

describe('Layout', () => {
  test('a Layout file drops unknown and repeated blocks and always has two lines', () => {
    const parsed = parseLayout(JSON.stringify({ mode: 'extend', icons: 'emoji', lines: [['model', 'nope', 'model'], ['cost'], ['time']] }))
    expect(parsed).toEqual({ version: 1, mode: 'extend', icons: 'emoji', lines: [['model'], ['cost']], base: null })
    expect(parseLayout(JSON.stringify({ lines: [] }))?.lines).toEqual([[], []])
    expect(parseLayout('not json')).toBeNull()
    expect(parseLayout(JSON.stringify({ mode: 'replace' }))).toBeNull()
  })

  test('the rows are line 1, line 2 and the blocks that are off, in catalog order', () => {
    expect(rows(layout())).toEqual([
      ['model', 'effort'],
      ['cost'],
      ['folder', 'branch', 'version', 'style', 'context', 'lines', 'time', 'limits', 'agents'],
    ])
  })

  test('h and l move a block along its line, and stop at the ends', () => {
    expect(moveAlong(layout(), 'effort', -1).lines[0]).toEqual(['effort', 'model'])
    expect(moveAlong(layout(), 'model', -1).lines[0]).toEqual(['model', 'effort'])
    expect(moveAlong(layout(), 'effort', 1).lines[0]).toEqual(['model', 'effort'])
    expect(moveAlong(layout(), 'time', 1)).toEqual(layout())
  })

  test('k and j move a block between line 1, line 2 and off, landing at the end', () => {
    expect(moveAcross(layout(), 'model', 1).lines).toEqual([['effort'], ['cost', 'model']])
    expect(moveAcross(layout(), 'cost', 1).lines).toEqual([['model', 'effort'], []])
    expect(moveAcross(layout(), 'time', -1).lines).toEqual([['model', 'effort'], ['cost', 'time']])
    expect(moveAcross(layout(), 'model', -1)).toEqual(layout())
    expect(moveAcross(layout(), 'time', 1)).toEqual(layout())
  })

  test('a block turned on goes to the end of the last line in use', () => {
    expect(turnOn(layout(), 'time').lines).toEqual([['model', 'effort'], ['cost', 'time']])
    expect(turnOn(layout({ lines: [['model'], []] }), 'time').lines).toEqual([['model', 'time'], []])
    expect(turnOn(layout({ lines: [[], []] }), 'time').lines).toEqual([['time'], []])
    expect(turnOn(layout(), 'model')).toEqual(layout())
  })

  test('a block turned off leaves its line; o toggles either way', () => {
    expect(turnOff(layout(), 'effort').lines).toEqual([['model'], ['cost']])
    expect(turnOff(layout(), 'time')).toEqual(layout())
    expect(toggleBlock(layout(), 'cost').lines).toEqual([['model', 'effort'], []])
    expect(toggleBlock(toggleBlock(layout(), 'cost'), 'cost').lines).toEqual([['model', 'effort', 'cost'], []])
  })

  test('i cycles Glyph, Emoji, None', () => {
    expect(nextIcons(layout()).icons).toBe('emoji')
    expect(nextIcons(nextIcons(layout())).icons).toBe('none')
    expect(nextIcons(layout({ icons: 'none' })).icons).toBe('glyph')
  })

  test('a summary counts the lines in use and the blocks on', () => {
    expect(layoutSummary(layout())).toBe('2 lines · 3 blocks')
    expect(layoutSummary(layout({ lines: [['model'], []] }))).toBe('1 line · 1 block')
  })

  test('the default extends when there is a status line to keep', () => {
    expect(defaultLayout(null).mode).toBe('replace')
    expect(defaultLayout({ kind: 'command', command: 'mine' }).mode).toBe('extend')
    expect(defaultLayout(null).lines.flat()).toContain('agents')
  })
})

describe('files and commands', () => {
  test('the command is written with ~ so a dotfiles settings file works on every machine', () => {
    expect(rendererCommand(PATHS, 'global')).toBe(OURS_GLOBAL)
  })

  test('a config folder outside home, or with a space, is quoted', () => {
    const custom = pathsFor('/opt/claude config', '/Users/me', '/Users/me/code/app')
    expect(rendererCommand(custom, 'global')).toBe(
      "sh '/opt/claude config/mods-toolbox/statusline.sh' '/opt/claude config/mods-toolbox/layouts/global.json'",
    )
  })

  test('each project has its own Layout file, apart from look-alike paths', () => {
    const one = layoutFile(pathsFor(undefined, '/h', '/work/a b'), 'project')
    const two = layoutFile(pathsFor(undefined, '/h', '/work/a_b'), 'project')
    expect(one).toStartWith('/h/.claude/mods-toolbox/layouts/project-work_a_b-')
    expect(one).not.toBe(two)
  })

  test("the Agent Dock add-on's wrapper is unwrapped to the command it runs", () => {
    expect(unwrapAgentDock(ADDON)).toEqual({ isWrapped: true, base: '~/.claude/statusline.sh' })
    expect(unwrapAgentDock("~/.claude/agent-dock/statusline.sh 'echo '\\''hi'\\'''")).toEqual({ isWrapped: true, base: "echo 'hi'" })
    expect(unwrapAgentDock('~/.claude/agent-dock/statusline.sh')).toEqual({ isWrapped: true, base: null })
    expect(unwrapAgentDock('~/.claude/statusline.sh')).toEqual({ isWrapped: false, base: null })
  })

  test("the Agent Dock's install list is read and trimmed by file", () => {
    const list = '/a/settings.json\t5\n/b/settings.local.json\tnew\n/c/old.json\n'
    expect(agentDockRecord(list, '/a/settings.json')).toBe('5')
    expect(agentDockRecord(list, '/c/old.json')).toBe('unknown')
    expect(agentDockRecord(list, '/d.json')).toBeNull()
    expect(withoutAgentDockRecord(list, '/a/settings.json')).toBe('/b/settings.local.json\tnew\n/c/old.json\n')
    expect(withoutAgentDockRecord('/a/settings.json\t5\n', '/a/settings.json')).toBe('')
  })
})

describe('what is in force', () => {
  test('nothing set: neither scope has a base', () => {
    const setup = setupFrom(files())
    expect(setup.inForce).toBeNull()
    expect(setup.global.base).toBeNull()
    expect(setup.project.base).toBeNull()
  })

  test('a global wrapped by the Agent Dock add-on keeps the command inside it', () => {
    const setup = setupFrom(files({ user: settings({ type: 'command', command: ADDON }) }))
    expect(setup.inForce).toEqual({ source: 'user', command: ADDON })
    expect(setup.global.base).toEqual({ kind: 'command', command: '~/.claude/statusline.sh' })
  })

  test('a project with no status line of its own follows the file it inherits from', () => {
    const fromUser = setupFrom(files({ user: settings({ command: 'mine' }) }))
    expect(fromUser.project.base).toEqual({ kind: 'file', path: '/Users/me/.claude/settings.json' })
    const fromProject = setupFrom(files({ user: settings({ command: 'mine' }), project: settings({ command: 'team' }) }))
    expect(fromProject.project.base).toEqual({ kind: 'file', path: '/Users/me/code/app/.claude/settings.json' })
    expect(fromProject.inForce?.source).toBe('project')
  })

  test("a project's own local status line is kept as a command", () => {
    const setup = setupFrom(files({ user: settings({ command: 'mine' }), local: settings({ command: 'just here' }) }))
    expect(setup.project.base).toEqual({ kind: 'command', command: 'just here' })
    expect(setup.inForce).toEqual({ source: 'local', command: 'just here' })
  })

  test("an install is seen by its command, and its Layout's base is the one kept", () => {
    const saved = layout({ mode: 'extend', base: { kind: 'command', command: '~/.claude/statusline.sh' } })
    const setup = setupFrom(files({ user: settings({ command: OURS_GLOBAL }), globalLayout: JSON.stringify(saved) }))
    expect(setup.global.isInstalled).toBe(true)
    expect(setup.global.base).toEqual({ kind: 'command', command: '~/.claude/statusline.sh' })
    expect(startingLayout(setup, 'global')).toEqual(saved)
  })

  test("a new project starts from the global Layout and keeps its base, not the Dock's global line", () => {
    const saved = layout({ mode: 'extend', base: { kind: 'command', command: '~/.claude/statusline.sh' } })
    const setup = setupFrom(files({ user: settings({ command: OURS_GLOBAL }), globalLayout: JSON.stringify(saved) }))
    expect(setup.project.base).toEqual(saved.base)
    expect(startingLayout(setup, 'project')).toEqual(saved)

    const done = installPlan({
      scope: 'project',
      state: setup.project,
      settingsText: null,
      draft: startingLayout(setup, 'project'),
      command: rendererCommand(PATHS, 'project'),
      existing: undefined,
      agentDockValue: null,
    })
    expect('problem' in done ? null : done.layout.base).toEqual(saved.base)
  })

  test('over a global Layout in Replace, a new project has nothing to keep', () => {
    const saved = layout({ mode: 'replace', base: null })
    const setup = setupFrom(files({ user: settings({ command: OURS_GLOBAL }), globalLayout: JSON.stringify(saved) }))
    expect(startingLayout(setup, 'project')).toMatchObject({ mode: 'replace', base: null })
  })

  test('a settings file with comments is reported, never rewritten', () => {
    const setup = setupFrom(files({ user: '{\n  // mine\n  "statusLine": {}\n}\n' }))
    expect(setup.global.problem).toBe('/Users/me/.claude/settings.json is not plain JSON, so it is left alone')
  })
})

describe('install', () => {
  const plan = (settingsText: string | null, agentDockValue: string | null = null, existing = undefined) => {
    const setup = setupFrom(files({ user: settingsText }))
    return installPlan({
      scope: 'global',
      state: setup.global,
      settingsText,
      draft: layout({ mode: 'extend' }),
      command: OURS_GLOBAL,
      existing,
      agentDockValue,
    })
  }

  test('only the statusLine block changes, in the file’s own indent, other keys kept', () => {
    const before = '{\n    "theme": "dark",\n    "statusLine": {\n        "type": "command",\n        "command": "mine",\n        "padding": 1\n    },\n    "model": "opus"\n}\n'
    const done = plan(before)
    if ('problem' in done) {
      throw new Error(done.problem)
    }
    expect(done.text).toBe(
      '{\n    "theme": "dark",\n    "statusLine": {\n        "type": "command",\n        "command": "' +
        OURS_GLOBAL +
        '",\n        "padding": 1,\n        "refreshInterval": 2\n    },\n    "model": "opus"\n}\n',
    )
    expect(done.record.before).toEqual({ type: 'command', command: 'mine', padding: 1 })
    expect(done.layout.base).toEqual({ kind: 'command', command: 'mine' })
  })

  test('a refresh of 1 second stays; a slower one becomes 2', () => {
    const fast = plan(settings({ command: 'mine', refreshInterval: 1 }))
    const slow = plan(settings({ command: 'mine', refreshInterval: 10 }))
    expect('problem' in fast ? null : JSON.parse(fast.text).statusLine.refreshInterval).toBe(1)
    expect('problem' in slow ? null : JSON.parse(slow.text).statusLine.refreshInterval).toBe(2)
  })

  test('no file yet: it is created, and Replace has nothing to keep', () => {
    const done = plan(null)
    expect('problem' in done ? null : done).toMatchObject({ createsFile: true, record: { before: null, createdFile: true }, layout: { base: null } })
  })

  test("the Agent Dock add-on's own record decides what an uninstall puts back", () => {
    const wrapped = settings({ type: 'command', command: ADDON, refreshInterval: 2 })
    const asWas = (value: string | null) => {
      const done = plan(wrapped, value)
      return 'problem' in done ? null : { before: done.record.before, createdFile: done.record.createdFile, wasAgentDock: done.wasAgentDock }
    }
    expect(asWas('5')).toEqual({
      before: { type: 'command', command: '~/.claude/statusline.sh', refreshInterval: 5 },
      createdFile: false,
      wasAgentDock: true,
    })
    expect(asWas('none')).toEqual({ before: { type: 'command', command: '~/.claude/statusline.sh' }, createdFile: false, wasAgentDock: true })
    expect(asWas('new')).toEqual({ before: null, createdFile: false, wasAgentDock: true })
    expect(asWas('new-file')).toEqual({ before: null, createdFile: true, wasAgentDock: true })
    expect(asWas(null)).toEqual({
      before: { type: 'command', command: '~/.claude/statusline.sh', refreshInterval: 2 },
      createdFile: false,
      wasAgentDock: true,
    })
  })

  test('installing again over our own keeps the first record', () => {
    const done = installPlan({
      scope: 'global',
      state: setupFrom(files({ user: settings({ command: OURS_GLOBAL }) })).global,
      settingsText: settings({ command: OURS_GLOBAL }),
      draft: layout(),
      command: OURS_GLOBAL,
      existing: { scope: 'global', layoutFile: 'x', before: { command: 'mine' }, createdFile: false },
      agentDockValue: null,
    })
    expect('problem' in done ? null : done.record.before).toEqual({ command: 'mine' })
  })

  test('a file that is not plain JSON is refused', () => {
    expect(plan('{ // no\n}')).toEqual({ problem: '/Users/me/.claude/settings.json is not plain JSON, so it is left alone' })
  })
})

describe('uninstall', () => {
  const record = (before: unknown, createdFile = false) => ({ scope: 'global' as const, layoutFile: 'x', before, createdFile })
  const file = '/Users/me/.claude/settings.json'

  test('the block goes back exactly as it was', () => {
    const now = settings({ type: 'command', command: OURS_GLOBAL, refreshInterval: 2 }, { theme: 'dark' })
    expect(uninstallPlan(now, file, record({ type: 'command', command: 'mine', refreshInterval: 10 }))).toEqual({
      text: settings({ type: 'command', command: 'mine', refreshInterval: 10 }, { theme: 'dark' }),
    })
  })

  test('a block the install added is removed, and a file it created goes when nothing else is in it', () => {
    const now = settings({ command: OURS_GLOBAL }, { theme: 'dark' })
    expect(uninstallPlan(now, file, record(null))).toEqual({ text: settings(undefined, { theme: 'dark' }) })
    expect(uninstallPlan(settings({ command: OURS_GLOBAL }), file, record(null, true))).toEqual({ text: null })
    expect(uninstallPlan(now, file, record(null, true))).toEqual({ text: settings(undefined, { theme: 'dark' }) })
  })

  test('with no record of the install, as from another machine, the block just goes', () => {
    expect(uninstallPlan(settings({ command: OURS_GLOBAL }, { theme: 'dark' }), file, undefined)).toEqual({ text: settings(undefined, { theme: 'dark' }) })
    expect(uninstallPlan(settings({ command: OURS_GLOBAL }), file, undefined)).toEqual({ text: '{}\n' })
  })

  test('a status line someone set since is theirs and stays', () => {
    expect(uninstallPlan(settings({ command: 'newer' }), file, record({ command: 'mine' }))).toEqual({ text: undefined })
  })

  test('the confirm says what goes back', () => {
    const local = '/Users/me/code/app/.claude/settings.local.json'
    const restores = (installs: Record<string, unknown>, more: Partial<SetupFiles> = {}) => {
      const setup = setupFrom(files({ records: JSON.stringify({ version: 1, installs }), ...more }))
      return { global: setup.global.restores, project: setup.project.restores }
    }
    const ours = settings({ command: OURS_GLOBAL })
    expect(restores({ [file]: record({ type: 'command', command: 'mine' }) }, { user: ours })).toEqual({ global: 'mine', project: null })
    expect(restores({ [file]: record(null) }, { user: ours }).global).toBe('no status line')
    expect(restores({ [local]: record(null) }, { user: ours, local: ours }).project).toBe(
      'no status line of its own, so the global one shows again',
    )
    expect(restores({ [local]: record(null) }, { project: settings({ command: 'team' }), local: ours }).project).toBe(
      'no status line of its own, so the one in .claude/settings.json shows again',
    )
    expect(restores({}, { user: ours })).toEqual({ global: 'no status line: there is no record here of the one before', project: null })
  })
})

describe('colors', () => {
  test('256 colors, true color, the 16 named ones and reset become props', () => {
    expect(styledLines(`a${ESC}[38;5;117mb${ESC}[0mc`)).toEqual([[{ text: 'a' }, { text: 'b', color: '#87d7ff' }, { text: 'c' }]])
    expect(styledLines(`${ESC}[1;38;2;255;122;102mx`)).toEqual([[{ text: 'x', bold: true, color: '#ff7a66' }]])
    expect(styledLines(`${ESC}[31mr${ESC}[39m${ESC}[44mb`)).toEqual([[{ text: 'r', color: '#cd0000' }, { text: 'b', backgroundColor: '#0000ee' }]])
    expect(styledLines(`${ESC}[38;5;245mgray`)).toEqual([[{ text: 'gray', color: '#8a8a8a' }]])
  })

  test('every other escape and control character is dropped, since one refuses the band', () => {
    const link = `${ESC}]8;;https://x.y${ESC}\\link${ESC}]8;;${ESC}\\`
    expect(styledLines(`${link} ${ESC}[2K\u0007bell\u0000\ttab`)).toEqual([[{ text: 'link bell tab' }]])
    expect(styledLines('one\ntwo')).toEqual([[{ text: 'one' }], [{ text: 'two' }]])
  })
})

describe('preview', () => {
  const facts = (overrides: Partial<PreviewFacts> = {}): PreviewFacts => ({
    captured: null,
    sessionId: 'session-1',
    cwd: '/Users/me/code/app',
    root: '/Users/me/code/app',
    modelId: 'claude-opus-5-5[1m]',
    version: '2.1.296',
    effort: 'high',
    outputStyle: 'Concise',
    usage: { startedAt: 1_000, context: { percent: 12 }, rateLimits: [{ kind: 'five_hour', percentUsed: 7 }], cost: { usd: 1.5 } },
    now: 61_000,
    agents: 2,
    ...overrides,
  })

  test("this session's real figures, and samples only where there are none", () => {
    const { input, samples, agents } = previewInput(facts())
    expect(input).toMatchObject({
      model: { display_name: 'Opus 5.5 (1M context)' },
      effort: { level: 'high' },
      cost: { total_cost_usd: 1.5, total_duration_ms: 60_000, total_lines_added: 42 },
      context_window: { used_percentage: 12 },
      rate_limits: { five_hour: { used_percentage: 7 } },
    })
    expect(samples).toEqual(['lines'])
    expect(agents).toBe(2)
  })

  test('before any answer most blocks show samples, and an idle team shows a sample count', () => {
    const { samples, agents } = previewInput(facts({ effort: null, usage: null, agents: 0 }))
    expect(samples).toEqual(['effort', 'context', 'cost', 'lines', 'time', 'limits', 'agents'])
    expect(agents).toBe(3)
  })

  test('the last input Claude Code gave the renderer wins over what the Dock gathers', () => {
    const captured = { model: { display_name: 'Sonnet 5.5' }, cost: { total_cost_usd: 9, total_lines_added: 3 }, columns: 180 }
    const { input } = previewInput(facts({ captured }))
    expect(input).toMatchObject({ model: { display_name: 'Sonnet 5.5' }, cost: { total_cost_usd: 9, total_lines_added: 3 } })
    expect(input).not.toHaveProperty('columns')
  })

  test("the renderer's preview JSON becomes styled lines; anything else is an error line", () => {
    const stdout = JSON.stringify({ base: ['mine'], lines: [`◆ ${ESC}[38;5;147mOpus${ESC}[0m`], dropped: ['cost', 'bogus'] })
    expect(previewFrom(stdout, 120, ['lines'])).toEqual({
      base: [[{ text: 'mine' }]],
      lines: [[{ text: '◆ ' }, { text: 'Opus', color: '#afafff' }]],
      dropped: ['cost'],
      samples: ['lines'],
      columns: 120,
      error: null,
    })
    expect(previewFrom('status line needs jq\n', 120, []).error).toBe('status line needs jq')
  })
})
