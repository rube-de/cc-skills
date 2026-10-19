// The renderer runs as a real shell script, which `claude plugin test` cannot
// spawn, so these run under `bun test plugins/mods-toolbox/renderer`.
import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const SCRIPT = join(import.meta.dir, 'statusline.sh')
const SHELLS = ['sh', ...(Bun.which('dash') === null ? [] : ['dash'])]
const ESC = String.fromCharCode(27)

const INPUT = {
  session_id: 'session-1',
  workspace: { current_dir: '/home/someone/projects/app' },
  model: { id: 'claude-opus-5-5', display_name: 'Opus 5.5' },
  version: '2.1.296',
  output_style: { name: 'Concise' },
  effort: { level: 'high' },
  cost: { total_cost_usd: 0.5321, total_duration_ms: 135_000, total_lines_added: 42, total_lines_removed: 18 },
  context_window: { used_percentage: 34.4 },
  rate_limits: { five_hour: { used_percentage: 23 }, seven_day: { used_percentage: 81.5 } },
}

type Layout = {
  version: 1
  mode: 'replace' | 'extend'
  icons: 'glyph' | 'emoji' | 'none'
  lines: string[][]
  base?: { kind: 'command'; command: string } | { kind: 'file'; path: string } | null
}

const layoutOf = (overrides: Partial<Layout> = {}): Layout => ({
  version: 1,
  mode: 'replace',
  icons: 'glyph',
  lines: [['model', 'effort'], ['cost', 'lines', 'time']],
  ...overrides,
})

let dir = ''

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'statusline-'))
})

afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
})

type Run = { shell?: string; layout?: Layout | null; input?: unknown; env?: Record<string, string>; columns?: number }

function render({ shell = 'sh', layout = layoutOf(), input = INPUT, env = {}, columns = 200 }: Run = {}): string {
  const file = join(dir, 'layout.json')
  if (layout !== null) {
    writeFileSync(file, JSON.stringify(layout))
  }
  const ran = Bun.spawnSync([Bun.which(shell) ?? shell, SCRIPT, file], {
    stdin: new TextEncoder().encode(JSON.stringify(input)),
    env: {
      PATH: process.env.PATH ?? '',
      HOME: '/home/someone',
      CLAUDE_CONFIG_DIR: join(dir, 'config'),
      COLUMNS: String(columns),
      NO_COLOR: '1',
      ...env,
    },
  })
  expect(ran.exitCode).toBe(0)

  return new TextDecoder().decode(ran.stdout)
}

const preview = (run: Run = {}) =>
  JSON.parse(render({ ...run, env: { MODS_TOOLBOX_PREVIEW: '1', ...run.env } })) as { base: string[]; lines: string[]; dropped: string[] }

describe.each(SHELLS)('under %s', shell => {
  test('Replace prints one row per line of blocks, in order', () => {
    expect(render({ shell })).toBe('◆ Opus 5.5  ◎ high\n$0.53  +42 -18  ◷ 2m15s\n')
  })

  test('every block draws from the documented fields', () => {
    const out = render({
      shell,
      layout: layoutOf({ lines: [['folder', 'model', 'effort', 'version', 'style'], ['context', 'cost', 'lines', 'time', 'limits']] }),
    })
    expect(out).toBe(
      '⌂ ~/projects/app  ◆ Opus 5.5  ◎ high  v2.1.296  ✎ Concise\n' + '███░░░░░░░ 34%  $0.53  +42 -18  ◷ 2m15s  ◔ 5h 23% · 7d 82%\n',
    )
  })

  test('Extend keeps the Base status line on top', () => {
    const out = render({ shell, layout: layoutOf({ mode: 'extend', base: { kind: 'command', command: "printf 'mine\\nsecond\\n'" } }) })
    expect(out).toBe('mine\nsecond\n◆ Opus 5.5  ◎ high\n$0.53  +42 -18  ◷ 2m15s\n')
  })

  test('Replace ignores a recorded base', () => {
    const out = render({ shell, layout: layoutOf({ base: { kind: 'command', command: 'echo mine' } }) })
    expect(out).not.toContain('mine')
  })
})

describe('blocks', () => {
  test('a block Claude Code sent nothing for is left out, never drawn empty', () => {
    const out = render({ input: { ...INPUT, effort: undefined, cost: { total_cost_usd: 0 } } })
    expect(out).toBe('◆ Opus 5.5\n$0.00\n')
  })

  test('a line whose blocks are all empty prints no row', () => {
    expect(render({ layout: layoutOf({ lines: [['effort'], ['model']] }), input: { ...INPUT, effort: undefined } })).toBe('◆ Opus 5.5\n')
  })

  test("the model's context size reads short", () => {
    const named = (display_name: string) => render({ layout: layoutOf({ lines: [['model']] }), input: { ...INPUT, model: { display_name } } })
    expect(named('Opus 5.5 (1M context)')).toBe('◆ Opus 5.5(1M)\n')
    expect(named('Sonnet 5 (200K context)')).toBe('◆ Sonnet 5(200K)\n')
    expect(named('Opus 5.5')).toBe('◆ Opus 5.5\n')
  })

  test('a long folder loses its front, keeping whole folders within 30 columns', () => {
    const folder = (current_dir: string) => render({ layout: layoutOf({ lines: [['folder']] }), input: { ...INPUT, workspace: { current_dir } } })
    expect(folder('/home/someone/dev/claude-code/cc-skills')).toBe('⌂ ~/dev/claude-code/cc-skills\n')
    expect(folder('/home/someone/dev/blockmind/oasis/flexvaults-service')).toBe('⌂ .../oasis/flexvaults-service\n')
    expect(folder('/srv/a-folder-name-far-too-long-to-keep-whole')).toBe('⌂ ...-far-too-long-to-keep-whole\n')
  })

  test('emoji and no icons', () => {
    expect(render({ layout: layoutOf({ icons: 'emoji', lines: [['model', 'cost']] }) })).toBe('🤖 Opus 5.5  💰 $0.53\n')
    expect(render({ layout: layoutOf({ icons: 'none', lines: [['model', 'time']] }) })).toBe('Opus 5.5  2m15s\n')
  })

  test('colors unless NO_COLOR', () => {
    const out = render({ layout: layoutOf({ lines: [['model']] }), env: { NO_COLOR: '' } })
    expect(out).toBe(`◆ ${ESC}[38;5;147mOpus 5.5${ESC}[0m\n`)
  })

  test('the context bar turns red past 80%', () => {
    const out = render({ layout: layoutOf({ lines: [['context']] }), input: { ...INPUT, context_window: { used_percentage: 91 } }, env: { NO_COLOR: '' } })
    expect(out).toBe(`${ESC}[38;5;203m█████████░ 91%${ESC}[0m\n`)
  })

  test("the Agents block reads the Agent Dock's count for this session", () => {
    const counts = join(dir, 'config', 'agent-dock', 'agents-now')
    mkdirSync(counts, { recursive: true })
    writeFileSync(join(counts, 'session-1.json'), JSON.stringify({ working: 3, queued: 1 }))
    expect(render({ layout: layoutOf({ lines: [['agents']] }) })).toBe('◇ 3 agents\n')
    writeFileSync(join(counts, 'session-1.json'), JSON.stringify({ working: 1, queued: 0 }))
    expect(render({ layout: layoutOf({ lines: [['agents']] }) })).toBe('◇ 1 agent\n')
  })

  test('each rate window shows its reset while it is ahead', () => {
    // The half minute keeps each countdown on its figure however long the run takes.
    const now = Math.floor(Date.now() / 1000)
    const limits = (rate_limits: unknown) => render({ layout: layoutOf({ lines: [['limits']] }), input: { ...INPUT, rate_limits } })
    expect(
      limits({ five_hour: { used_percentage: 23, resets_at: now + 2 * 3600 + 10 * 60 + 30 }, seven_day: { used_percentage: 41, resets_at: now + 3 * 86_400 + 4 * 3600 + 30 } }),
    ).toBe('◔ 5h 23% ↺2h10m · 7d 41% ↺3d4h\n')
    expect(limits({ five_hour: { used_percentage: 23, resets_at: now - 60 }, seven_day: { used_percentage: 41, resets_at: 'soon' } })).toBe('◔ 5h 23% · 7d 41%\n')
    expect(limits({ seven_day: { used_percentage: 41, resets_at: now + 12 * 60 + 30 } })).toBe('◔ 7d 41% ↺12m\n')
  })

  test('the prompt cache counts down while warm, amber in the last sixth of its TTL, and reads cold after', () => {
    const now = Math.floor(Date.now() / 1000)
    const cache = (prompt_cache: unknown, env: Record<string, string> = {}) =>
      render({ layout: layoutOf({ lines: [['cache']] }), input: { ...INPUT, prompt_cache }, env })
    expect(cache({ caching_observed: true, warm: true, ttl: '1h', expires_at: now + 47 * 60 + 30 })).toBe('⟳ cache 47m\n')
    expect(cache({ caching_observed: true, warm: true, ttl: '1h', expires_at: now + 47 * 60 + 30 }, { NO_COLOR: '' })).toBe(
      `⟳ ${ESC}[38;5;158mcache 47m${ESC}[0m\n`,
    )
    expect(cache({ caching_observed: true, warm: true, ttl: '1h', expires_at: now + 5 * 60 + 30 }, { NO_COLOR: '' })).toBe(
      `⟳ ${ESC}[38;5;215mcache 5m${ESC}[0m\n`,
    )
    expect(cache({ caching_observed: true, warm: true, ttl: '5m', expires_at: now + 4 * 60 + 30 }, { NO_COLOR: '' })).toBe(
      `⟳ ${ESC}[38;5;158mcache 4m${ESC}[0m\n`,
    )
    expect(cache({ caching_observed: true, warm: false, ttl: '1h', expires_at: now + 600 })).toBe('⟳ cache cold\n')
    expect(cache({ caching_observed: true, warm: true, ttl: '1h', expires_at: now - 5 })).toBe('⟳ cache cold\n')
  })

  test('no prompt cache figure, or none observed yet, leaves the block out', () => {
    const now = Math.floor(Date.now() / 1000)
    const cache = (prompt_cache: unknown) => render({ layout: layoutOf({ lines: [['cache', 'model']] }), input: { ...INPUT, prompt_cache } })
    expect(cache(undefined)).toBe('◆ Opus 5.5\n')
    expect(cache(null)).toBe('◆ Opus 5.5\n')
    expect(cache({ caching_observed: false, warm: false, ttl: '1h', expires_at: now + 600 })).toBe('◆ Opus 5.5\n')
  })

  test("the Skill block reads the Dock's file for this session: bright while it runs, gray after", () => {
    const skills = join(dir, 'config', 'mods-toolbox', 'skill-now')
    mkdirSync(skills, { recursive: true })
    const skill = (value: unknown, env: Record<string, string> = {}) => {
      writeFileSync(join(skills, 'session-1.json'), typeof value === 'string' ? value : JSON.stringify(value))
      return render({ layout: layoutOf({ lines: [['skill']] }), env })
    }
    expect(skill({ name: 'council:review-plan', isRunning: true })).toBe('✦ council:review-plan\n')
    expect(skill({ name: 'council:review-plan', isRunning: true }, { NO_COLOR: '' })).toBe(`✦ ${ESC}[38;5;81mcouncil:review-plan${ESC}[0m\n`)
    expect(skill({ name: 'council:review-plan', isRunning: false }, { NO_COLOR: '' })).toBe(`✦ ${ESC}[38;5;245mcouncil:review-plan${ESC}[0m\n`)
    expect(skill({ name: 'mattpocock-skills:diagnosing-bugs-and-regressions', isRunning: true })).toBe('✦ mattpocock-skills:diagnosing-bu…\n')
    expect(skill({ name: `bad${ESC}[2Jname`, isRunning: true })).toBe('✦ bad[2Jname\n')
    expect(skill('not json')).toBe('')
    expect(render({ layout: layoutOf({ lines: [['skill']] }), input: { ...INPUT, session_id: 'session-2' } })).toBe('')
  })

  test('the preview takes its skill from MODS_TOOLBOX_SKILL', () => {
    const out = preview({ layout: layoutOf({ icons: 'emoji', lines: [['skill']] }), env: { MODS_TOOLBOX_SKILL: JSON.stringify({ name: 'code-review', isRunning: true }) } })
    expect(out.lines).toEqual(['⚡ code-review'])
  })

  test('the Git branch and its dirty mark', () => {
    const repo = join(dir, 'repo')
    mkdirSync(repo)
    const git = (...args: string[]) => Bun.spawnSync(['git', '-C', repo, ...args], { env: { ...process.env, GIT_CONFIG_GLOBAL: '/dev/null' } })
    git('init', '-q', '-b', 'trunk')
    git('-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-q', '--allow-empty', '-m', 'one')
    const input = { ...INPUT, workspace: { current_dir: repo, project_dir: repo } }
    expect(render({ layout: layoutOf({ lines: [['branch']] }), input })).toBe('⎇ trunk\n')

    writeFileSync(join(repo, 'new.txt'), 'x')
    rmSync(join(dir, 'config', 'mods-toolbox', 'cache'), { recursive: true, force: true })
    expect(render({ layout: layoutOf({ lines: [['branch']] }), input })).toBe('⎇ trunk ✗\n')
  })

  test("a repo's own core.fsmonitor never runs", () => {
    const repo = join(dir, 'repo')
    const ran = join(dir, 'fsmonitor-ran')
    const hook = join(dir, 'fsmonitor')
    mkdirSync(repo)
    writeFileSync(hook, `#!/bin/sh\ntouch '${ran}'\n`, { mode: 0o755 })
    const git = (...args: string[]) => Bun.spawnSync(['git', '-C', repo, ...args], { env: { ...process.env, GIT_CONFIG_GLOBAL: '/dev/null' } })
    git('init', '-q', '-b', 'trunk')
    git('-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-q', '--allow-empty', '-m', 'one')
    git('config', 'core.fsmonitor', hook)
    writeFileSync(join(repo, 'new.txt'), 'x')

    expect(render({ layout: layoutOf({ lines: [['branch']] }), input: { ...INPUT, workspace: { current_dir: repo, project_dir: repo } } })).toBe('⎇ trunk ✗\n')
    expect(existsSync(ran)).toBe(false)
  })

  test('a repo the session moved into shows its branch alone, and its clean filter never runs', () => {
    const project = join(dir, 'project')
    const repo = join(project, 'unpacked')
    const ran = join(dir, 'filter-ran')
    mkdirSync(repo, { recursive: true })
    const git = (cwd: string, ...args: string[]) => Bun.spawnSync(['git', '-C', cwd, ...args], { env: { ...process.env, GIT_CONFIG_GLOBAL: '/dev/null' } })
    git(project, 'init', '-q', '-b', 'main')
    git(repo, 'init', '-q', '-b', 'trunk')
    writeFileSync(join(repo, '.gitattributes'), '* filter=evil\n')
    writeFileSync(join(repo, 'file.txt'), 'one\n')
    git(repo, '-c', 'filter.evil.clean=cat', 'add', '.')
    git(repo, '-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-q', '-m', 'one')
    git(repo, 'config', 'filter.evil.clean', `touch '${ran}'; cat`)
    writeFileSync(join(repo, 'file.txt'), 'two\n')

    const input = { ...INPUT, workspace: { current_dir: repo, project_dir: project } }
    expect(render({ layout: layoutOf({ lines: [['branch']] }), input })).toBe('⎇ trunk\n')
    expect(existsSync(ran)).toBe(false)
  })
})

describe('width', () => {
  test('blocks drop whole from the end of a line until it fits', () => {
    // The second line is 23 wide, and 2 columns stay free.
    expect(render({ columns: 25 })).toBe('◆ Opus 5.5  ◎ high\n$0.53  +42 -18  ◷ 2m15s\n')
    expect(render({ columns: 19 })).toBe('◆ Opus 5.5\n$0.53  +42 -18\n')
  })

  test('emoji count two cells', () => {
    // "🤖 Opus 5.5" is 11 wide.
    expect(render({ layout: layoutOf({ icons: 'emoji', lines: [['model', 'effort']] }), columns: 13 })).toBe('🤖 Opus 5.5\n')
  })

  test('wide text counts two cells a character, and combining marks none', () => {
    const styled = (name: string, columns: number) =>
      render({ layout: layoutOf({ icons: 'none', lines: [['model', 'style']] }), input: { ...INPUT, output_style: { name } }, columns })
    // "Opus 5.5  簡潔" is 14 wide in 12 codepoints.
    expect(styled('簡潔', 15)).toBe('Opus 5.5\n')
    expect(styled('簡潔', 16)).toBe('Opus 5.5  簡潔\n')
    // "Opus 5.5  Café" is 14 wide in 15 codepoints.
    expect(styled('Cafe\u0301', 16)).toBe('Opus 5.5  Cafe\u0301\n')
    // Emoji in the Basic Multilingual Plane, and a text symbol made emoji by VS16, are two wide too.
    expect(styled('✅', 13)).toBe('Opus 5.5\n')
    expect(styled('✅', 14)).toBe('Opus 5.5  ✅\n')
    expect(styled('\u2764\uFE0F', 13)).toBe('Opus 5.5\n')
    expect(styled('\u2764\uFE0F', 14)).toBe('Opus 5.5  \u2764\uFE0F\n')
  })

  test('a wide folder is cut by cells', () => {
    const folder = (current_dir: string) => render({ layout: layoutOf({ lines: [['folder']] }), input: { ...INPUT, workspace: { current_dir } } })
    expect(folder('/srv/プロジェクト/アプリケーション/サービス')).toBe('⌂ .../アプリケーション/サービス\n')
    expect(folder(`/srv/${'ア'.repeat(20)}`)).toBe(`⌂ ...${'ア'.repeat(13)}\n`)
  })

  test('the preview names what dropped', () => {
    expect(preview({ columns: 19 })).toEqual({
      base: [],
      lines: ['◆ Opus 5.5', '$0.53  +42 -18'],
      dropped: ['effort', 'time'],
    })
  })
})

describe('Base status line', () => {
  test("a base kept as a settings file follows that file's command", () => {
    const settings = join(dir, 'settings.json')
    writeFileSync(settings, JSON.stringify({ statusLine: { type: 'command', command: 'echo first' } }))
    const layout = layoutOf({ mode: 'extend', lines: [['model']], base: { kind: 'file', path: settings } })
    expect(render({ layout })).toBe('first\n◆ Opus 5.5\n')

    writeFileSync(settings, JSON.stringify({ statusLine: { type: 'command', command: 'echo second' } }))
    expect(render({ layout })).toBe('second\n◆ Opus 5.5\n')
  })

  test('the base reads the same stdin', () => {
    const layout = layoutOf({ mode: 'extend', lines: [], base: { kind: 'command', command: "jq -r '.model.display_name'" } })
    expect(render({ layout })).toBe('Opus 5.5\n')
  })

  test('a renderer that is its own base draws its blocks once, and the chain ends', () => {
    const settings = join(dir, 'settings.json')
    const file = join(dir, 'layout.json')
    writeFileSync(settings, JSON.stringify({ statusLine: { command: `sh ${SCRIPT} ${file}` } }))
    const layout = layoutOf({ mode: 'extend', lines: [['model']], base: { kind: 'file', path: settings } })
    expect(render({ layout })).toBe('◆ Opus 5.5\n')
  })

  test("a base that runs another Dock line adds only that line's own base, so no block shows twice", () => {
    const settings = join(dir, 'settings.json')
    const global = join(dir, 'global.json')
    writeFileSync(global, JSON.stringify(layoutOf({ mode: 'extend', lines: [['effort']], base: { kind: 'command', command: 'echo mine' } })))
    writeFileSync(settings, JSON.stringify({ statusLine: { command: `sh ${SCRIPT} ${global}` } }))
    const layout = layoutOf({ mode: 'extend', lines: [['model']], base: { kind: 'file', path: settings } })
    expect(render({ layout })).toBe('mine\n◆ Opus 5.5\n')
  })

  test('the preview hands the base back apart from the blocks', () => {
    const layout = layoutOf({ mode: 'extend', lines: [['model']], base: { kind: 'command', command: 'echo mine' } })
    expect(preview({ layout })).toEqual({ base: ['mine'], lines: ['◆ Opus 5.5'], dropped: [] })
  })
})

describe('input and setup', () => {
  test('the last input is kept per session, with the width, except for the preview', () => {
    const kept = join(dir, 'config', 'mods-toolbox', 'last-input', 'session-1.json')
    preview()
    expect(existsSync(kept)).toBe(false)

    render({ columns: 142 })
    expect(JSON.parse(readFileSync(kept, 'utf8'))).toMatchObject({ session_id: 'session-1', columns: 142 })
  })

  test('a Layout not yet applied comes in through MODS_TOOLBOX_LAYOUT', () => {
    const draft = layoutOf({ lines: [['version']] })
    expect(render({ env: { MODS_TOOLBOX_LAYOUT: JSON.stringify(draft) } })).toBe('v2.1.296\n')
  })

  test('a missing Layout says where to set one up', () => {
    expect(render({ layout: null })).toBe('status line layout missing: open /status-dock\n')
  })

  test('without jq it says so rather than guessing', () => {
    const bin = join(dir, 'bin')
    mkdirSync(bin)
    for (const tool of ['cat', 'dirname']) {
      const found = Bun.which(tool)
      if (found !== null) {
        symlinkSync(found, join(bin, tool))
      }
    }
    expect(render({ env: { PATH: bin } })).toBe('status line needs jq\n')
  })
})
