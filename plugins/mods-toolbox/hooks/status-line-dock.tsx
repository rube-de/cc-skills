import { atom, read, update } from 'claude-code'
import type { EngineInterface, On, RenderInput, RenderNode, Timer } from 'claude-code'

import type { StatusLineBlockId, StatusLineLayout, StatusLineRun, StatusLineScope, StatusLineSetup } from '../types'
import { checklistView, isAnimated } from './checklist-view'
import { CORAL, GOLD, HAIRLINE, INK, MUTED, counts, spaced } from './dock-logic'
import {
  ICON_NAMES,
  ICON_STYLES,
  agentDockRecord,
  blockName,
  installPlan,
  isOff,
  layoutFile,
  layoutSummary,
  layoutText,
  moveAcross,
  moveAlong,
  nextIcons,
  parseRecords,
  parseSettings,
  pathsFor,
  previewFrom,
  previewInput,
  recordsText,
  rows,
  sameLayout,
  sessionFile,
  setupFrom,
  startingLayout,
  statusLineCommand,
  toggleBlock,
  turnOn,
  uninstallPlan,
  withoutAgentDockRecord,
} from './status-line-logic'
import type { Paths } from './status-line-logic'

type Engine = EngineInterface
type Elements = ReturnType<Engine['ui']['resolve']>

const bandViewAtom = atom({ plugin: 'mods-toolbox', key: 'bandView' } as const, null)
const setupAtom = atom({ plugin: 'mods-toolbox', key: 'statusLineSetup' } as const, null)
const scopeAtom = atom({ plugin: 'mods-toolbox', key: 'statusLineScope' } as const, 'global')
const draftsAtom = atom({ plugin: 'mods-toolbox', key: 'statusLineDrafts' } as const, { global: null, project: null })
const selectedAtom = atom({ plugin: 'mods-toolbox', key: 'statusLineSelected' } as const, null)
const confirmAtom = atom({ plugin: 'mods-toolbox', key: 'statusLineConfirm' } as const, null)
const previewAtom = atom({ plugin: 'mods-toolbox', key: 'statusLinePreview' } as const, null)
const skillAtom = atom({ plugin: 'mods-toolbox', key: 'statusLineSkill' } as const, null)
// Clean View's, the Agent Dock's and the chat picks' values, read on the keys their files write.
const cleanViewAtom = atom({ plugin: 'mods-toolbox', key: 'cleanViewEnabled' } as const, true)
const checklistAtom = atom({ plugin: 'mods-toolbox', key: 'checklist' } as const, null)
const tickAtom = atom({ plugin: 'mods-toolbox', key: 'tick' } as const, 0)
const missionAtom = atom({ plugin: 'mods-toolbox', key: 'dockMission' } as const, null)
const chatModelAtom = atom({ plugin: 'mods-toolbox', key: 'chatModel' } as const, null)
const chatEffortAtom = atom({ plugin: 'mods-toolbox', key: 'chatEffort' } as const, null)

const PREVIEW_MS = 2000
const RUN_TIMEOUT_MS = 2000
const LABEL_WIDTH = 9
const ROW_LABELS = ['Line 1', 'Line 2', 'Off']
const SCOPE_NAMES: Record<StatusLineScope, string> = { global: 'Global', project: 'This project' }
const KEYS_HINT = 'ctrl+x tab, then the keys'
const CAPTURE_MAX_MINUTES = '+1440'

// Module state a reload may drop: session.start and the next open put it back.
let previewTimer: Timer | null = null
let isPreviewRunning = false
let isPreviewAgain = false
// The terminal's width as the band last measured it, until the renderer has reported Claude Code's own.
let terminalColumns = 0
// One grant per /command or Skill call of the main conversation in flight: the
// first skill.prompt after it is its own and takes the grant. Not matched by
// name, since the Skill tool takes `review-plan` where the engine resolves
// `council:review-plan`; and used once, since a forked skill's call stays in
// flight while its subagent runs skills of its own.
const skillGrants: Array<{ isUsed: boolean }> = []
// The skill file the status line reads: where it went, what it last held, in order.
let skillPath: string | null = null
let skillKey: string | null = null
let skillQueue: Promise<void> = Promise.resolve()

export function registerStatusLineDock(on: On) {
  // Clean View holds the bare session.start, the dock { cwd: /^/ }, the Toolbox
  // a surface matcher and the chat picks isInteractive; every cwd holds a slash.
  on('session.start', { cwd: /\// }, async ($, e, next) => {
    try {
      await $.command.register({
        name: 'status-dock',
        description: 'Open or close the Status Line Dock: build the status line from blocks, with a preview',
        immediate: true,
      })
    } catch {
      // The Toolbox's Launch entry still opens it.
    }
    try {
      const where = await currentPaths($)
      const setup = await loadSetup($, where)
      await keepRendererCurrent($, where, setup)
      await sweepDayOld($, where.captures)
      await sweepDayOld($, where.skills)
      if ((await read($, bandViewAtom)) === 'statusLineDock') {
        syncPreviewTimer($, true)
      }
    } catch {
      // The Dock reads the files again when it opens.
    }

    return next(e)
  })

  on('command.run', { command: 'status-dock' }, async $ => {
    if ((await read($, bandViewAtom)) === 'statusLineDock') {
      await closeDock($)
      return { text: 'Status Line Dock closed.' }
    }
    await openDock($).catch(() => $.ui.toast('The Status Line Dock could not open. Try /status-dock again.'))

    return { text: 'Status Line Dock open above the prompt.' }
  })

  // The Toolbox draws the Launch entry; opening the Dock is this file's to do.
  on('ui.press', { plugin: 'mods-toolbox', component: 'AbovePrompt', element: 'toolbox-status-line' }, async ($, e) => {
    await openDock($).catch(() => $.ui.toast('The Status Line Dock could not open. Try /status-dock.'))

    return { element: e.element }
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey || (await read($, bandViewAtom)) !== 'statusLineDock') {
      return next(e)
    }
    terminalColumns = e.viewport?.columns ?? e.props.bodyColumns + 5
    const { Box } = $.ui.resolve(e)
    const [checklist, dock, below] = await Promise.all([drawChecklist($, e), drawDock($, e), next(e)])

    // The engine refuses its own band rows under a sized Box, so they stay below.
    return (
      <Box flexDirection="column">
        {checklist}
        {dock}
        {below}
      </Box>
    )
  })

  // The Skill block. A skill typed as /name expands inside its command.run, and
  // one Claude calls inside its tool.call; skill.prompt alone can't tell either
  // from a subagent's call or preload, so it counts only with a caller's grant.
  on('command.run', async ($, e, next) => {
    const grant = { isUsed: false }
    skillGrants.push(grant)
    try {
      return await next(e)
    } finally {
      skillGrants.splice(skillGrants.indexOf(grant), 1)
    }
  })

  on('tool.call', { tool: 'Skill' }, async ($, e, next) => {
    if (e.agentId !== undefined) {
      return next(e)
    }
    const grant = { isUsed: false }
    skillGrants.push(grant)
    try {
      return await next(e)
    } finally {
      skillGrants.splice(skillGrants.indexOf(grant), 1)
    }
  })

  on('skill.prompt', async ($, e, next) => {
    const grant = skillGrants.findLast(open => !open.isUsed)
    if (grant !== undefined) {
      grant.isUsed = true
    }
    const expanded = await next(e)
    if (grant !== undefined) {
      try {
        await update($, skillAtom, () => ({ name: e.skill, isRunning: true }))
        await publishSkill($)
      } catch {
        // The block keeps the skill before this one.
      }
    }

    return expanded
  })

  on('turn.complete', { reason: /^/ }, async ($, e, next) => {
    if (e.agentId === undefined) {
      try {
        const skill = await read($, skillAtom)
        if (skill?.isRunning === true) {
          await update($, skillAtom, () => ({ ...skill, isRunning: false }))
          await publishSkill($)
        }
      } catch {
        // It stays bright until the next skill.
      }
    }

    return next(e)
  })

  // After a /clear or a resume the process goes on under a new session id with
  // no session.start, so the skill goes with the conversation that ran it.
  on('session.end', { reason: /^/ }, async ($, e, next) => {
    try {
      await update($, skillAtom, () => null)
      await publishSkill($)
    } catch {
      // A day later the sweep takes it.
    }

    return next(e)
  })
}

async function openDock($: Engine) {
  await update($, bandViewAtom, () => 'statusLineDock')
  const setup = await loadSetup($, await currentPaths($))
  // The Dock opens on the scope in force here.
  if (setup.project.isInstalled) {
    await update($, scopeAtom, () => 'project')
  }
  syncPreviewTimer($, true)
  await refreshPreview($)
}

async function closeDock($: Engine) {
  await update($, bandViewAtom, current => (current === 'statusLineDock' ? null : current))
  await update($, confirmAtom, () => null)
  syncPreviewTimer($, false)
}

// --- Files ------------------------------------------------------------------

async function currentPaths($: Engine): Promise<Paths> {
  const [configDir, home, root] = await Promise.all([$.env.get('CLAUDE_CONFIG_DIR'), $.env.get('HOME'), $.session.root()])

  return pathsFor(configDir, home ?? '', root)
}

async function readText($: Engine, path: string): Promise<string | null> {
  try {
    return (await $.fs.exists(path)) ? await $.fs.read(path) : null
  } catch {
    return null
  }
}

async function loadSetup($: Engine, where: Paths): Promise<StatusLineSetup> {
  const [policy, user, project, local, globalLayout, projectLayout, records] = await Promise.all([
    $.settings.read({ source: 'policy' }).catch(() => ({})),
    readText($, where.userSettings),
    readText($, where.projectSettings),
    readText($, where.localSettings),
    readText($, layoutFile(where, 'global')),
    readText($, layoutFile(where, 'project')),
    readText($, where.records),
  ])
  const setup = setupFrom({
    paths: where,
    user,
    project,
    local,
    globalLayout,
    projectLayout,
    records,
    isLocked: statusLineCommand(policy) !== null,
  })
  await update($, setupAtom, () => setup)

  return setup
}

async function remove($: Engine, ...targets: string[]) {
  await $.process.run(['rm', '-rf', ...targets]).catch(() => undefined)
}

// Settings files point at the copy under the config folder, since the plugin's
// own folder carries its version. Each session puts the shipped one there while
// any install or settings file uses it, so an update reaches every status line
// and a settings file from another machine's dotfiles finds its renderer here.
async function keepRendererCurrent($: Engine, where: Paths, setup: StatusLineSetup, isInstalling = false) {
  const records = parseRecords(await readText($, where.records))
  const isUsed = Object.keys(records).length > 0 || setup.global.isInstalled || setup.project.isInstalled
  if (!isInstalling && !isUsed) {
    return
  }
  for (const [shipped, copy] of [
    [`${$.plugin.root}/renderer/statusline.sh`, where.renderer],
    [`${$.plugin.root}/renderer/statusline.jq`, where.rendererJq],
  ] as const) {
    const text = await $.fs.read(shipped)
    if ((await readText($, copy)) !== text) {
      await $.fs.write(copy, text)
    }
  }
}

// Per-session files (the renderer's inputs, the skills) of sessions that ended a day ago or more.
async function sweepDayOld($: Engine, folder: string) {
  if (await $.fs.exists(folder).catch(() => false)) {
    await $.process.run(['find', folder, '-type', 'f', '-name', '*.json', '-mmin', CAPTURE_MAX_MINUTES, '-delete']).catch(() => undefined)
  }
}

// --- The skill file ---------------------------------------------------------

// Writes are chained so an older skill never lands after a newer one.
function publishSkill($: Engine): Promise<void> {
  skillQueue = skillQueue.then(() => writeSkill($)).catch(() => undefined)

  return skillQueue
}

// Only while an install runs the renderer: an uninstall takes the whole folder,
// and a skill after it must not bring the folder back.
async function writeSkill($: Engine) {
  const where = await currentPaths($)
  const skill = await read($, skillAtom)
  if (skill === null || !(await $.fs.exists(where.renderer).catch(() => false))) {
    await dropSkillFile($)
    return
  }
  // A /clear goes on under a new session id, so the path can move.
  const path = sessionFile(where.skills, await $.session.id())
  const text = JSON.stringify(skill)
  if (`${path}|${text}` === skillKey) {
    return
  }
  if (skillPath !== null && skillPath !== path) {
    await remove($, skillPath)
  }
  skillPath = path
  skillKey = `${path}|${text}`
  await $.fs.write(path, text)
}

async function dropSkillFile($: Engine) {
  if (skillPath === null) {
    return
  }
  const stale = skillPath
  skillPath = null
  skillKey = null
  await remove($, stale)
}

// --- Editing ----------------------------------------------------------------

type Editing = {
  setup: StatusLineSetup
  scope: StatusLineScope
  saved: StatusLineLayout
  layout: StatusLineLayout
  hasChanges: boolean
}

async function editing($: Engine): Promise<Editing | null> {
  const setup = await read($, setupAtom)
  if (setup === null) {
    return null
  }
  const scope = await read($, scopeAtom)
  const saved = startingLayout(setup, scope)
  const draft = (await read($, draftsAtom))[scope]
  const layout = draft ?? saved

  return { setup, scope, saved, layout, hasChanges: draft !== null && !sameLayout(draft, saved) }
}

async function edit($: Engine, change: (layout: StatusLineLayout, selected: StatusLineBlockId) => StatusLineLayout) {
  const current = await editing($)
  if (current === null) {
    return
  }
  const selected = (await read($, selectedAtom)) ?? rows(current.layout).flat()[0]
  if (selected === undefined) {
    return
  }
  await update($, selectedAtom, () => selected)
  const changed = change(current.layout, selected)
  await update($, draftsAtom, drafts => ({ ...drafts, [current.scope]: sameLayout(changed, current.saved) ? null : changed }))
  void refreshPreview($)
}

async function select($: Engine, id: StatusLineBlockId) {
  await update($, selectedAtom, () => id)
}

// A click selects a block; one that is off is turned on too.
async function pick($: Engine, id: StatusLineBlockId) {
  await select($, id)
  const current = await editing($)
  if (current !== null && isOff(current.layout, id)) {
    await edit($, now => turnOn(now, id))
  }
}

async function chooseScope($: Engine, scope: StatusLineScope) {
  await update($, scopeAtom, () => scope)
  await update($, confirmAtom, () => null)
  void refreshPreview($)
}

async function revert($: Engine) {
  const scope = await read($, scopeAtom)
  await update($, draftsAtom, drafts => ({ ...drafts, [scope]: null }))
  await update($, confirmAtom, () => null)
  void refreshPreview($)
}

// Installed, Apply saves the Layout the renderer reads; otherwise it asks first.
async function apply($: Engine) {
  const current = await editing($)
  if (current === null || current.setup.isLocked || current.setup[current.scope].problem !== null) {
    return
  }
  const state = current.setup[current.scope]
  if (!state.isInstalled) {
    await update($, confirmAtom, () => 'install')
    return
  }
  await $.fs.write(state.layoutFile, layoutText(current.layout))
  await update($, draftsAtom, drafts => ({ ...drafts, [current.scope]: null }))
  await loadSetup($, await currentPaths($))
  $.ui.toast('Status line updated.')
}

async function install($: Engine) {
  const current = await editing($)
  await update($, confirmAtom, () => null)
  if (current === null) {
    return
  }
  const where = await currentPaths($)
  const state = current.setup[current.scope]
  const [settingsText, recordsFile, agentDockText] = await Promise.all([
    readText($, state.file),
    readText($, where.records),
    readText($, where.agentDockRecords),
  ])
  const records = parseRecords(recordsFile)
  const plan = installPlan({
    scope: current.scope,
    state,
    settingsText,
    draft: current.layout,
    command: state.command,
    existing: records[state.file],
    agentDockValue: agentDockRecord(agentDockText, state.file),
  })
  if ('problem' in plan) {
    $.ui.toast(plan.problem)
    return
  }

  await keepRendererCurrent($, where, current.setup, true)
  await $.fs.write(state.layoutFile, layoutText(plan.layout))
  await $.fs.write(where.records, recordsText({ ...records, [plan.file]: plan.record }))
  // Written last: the status line only switches once its renderer and Layout are there.
  await $.fs.write(plan.file, plan.text)
  if (plan.wasAgentDock) {
    await retireAgentDockLine($, where, agentDockText, plan.file)
  }

  await update($, draftsAtom, drafts => ({ ...drafts, [current.scope]: null }))
  await loadSetup($, where)
  // A skill run before the install shows from the first refresh.
  await publishSkill($)
  await refreshPreview($)
  $.ui.toast(`Status line set in ${plan.file}.`)
  if (plan.createsFile && current.scope === 'project' && !(await isGitIgnored($, where.root, plan.file))) {
    $.ui.toast('Keep .claude/settings.local.json out of git: add it to .gitignore.')
  }
}

// The Agent Dock's add-on stays while any settings file it lists still runs it.
async function retireAgentDockLine($: Engine, where: Paths, text: string | null, file: string) {
  const rest = withoutAgentDockRecord(text, file)
  if (rest !== '') {
    await $.fs.write(where.agentDockRecords, rest)
    return
  }
  await remove($, where.agentDockRecords, where.agentDockAddon)
}

async function isGitIgnored($: Engine, root: string, file: string): Promise<boolean> {
  const ran = await $.process.run(['git', '-C', root, 'check-ignore', '-q', file]).catch(() => null)

  return ran === null || ran.exitCode === 0
}

async function uninstall($: Engine) {
  await update($, confirmAtom, () => null)
  const current = await editing($)
  if (current === null) {
    return
  }
  const where = await currentPaths($)
  const state = current.setup[current.scope]
  const records = parseRecords(await readText($, where.records))
  const record = records[state.file]
  const plan = uninstallPlan(await readText($, state.file), state.file, record)
  if ('problem' in plan) {
    $.ui.toast(plan.problem)
    return
  }
  if (plan.text === null) {
    await remove($, state.file)
  } else if (plan.text !== undefined) {
    await $.fs.write(state.file, plan.text)
  }

  const { [state.file]: _gone, ...rest } = records
  const other = current.setup[current.scope === 'global' ? 'project' : 'global']
  if (Object.keys(rest).length === 0 && !other.isInstalled) {
    // Nothing runs the renderer any more: everything the installs put under the config folder goes.
    await remove($, `${where.config}/mods-toolbox`)
  } else {
    await remove($, state.layoutFile)
    if (record !== undefined) {
      await $.fs.write(where.records, recordsText(rest))
    }
  }

  await update($, draftsAtom, drafts => ({ ...drafts, [current.scope]: null }))
  await loadSetup($, where)
  await refreshPreview($)
  $.ui.toast(
    plan.text === undefined
      ? `The status line in ${state.file} is no longer this Dock's, so it stays.`
      : record === undefined
        ? `Status line taken out of ${state.file}.`
        : `Status line in ${state.file} put back as it was.`,
  )
}

// --- Preview ----------------------------------------------------------------

function syncPreviewTimer($: Engine, isOpen: boolean) {
  if (isOpen && previewTimer === null) {
    previewTimer = $.clock.every(PREVIEW_MS, () => {
      void refreshPreview($)
    })
  } else if (!isOpen && previewTimer !== null) {
    previewTimer.cancel()
    previewTimer = null
  }
}

// One run at a time; an edit during a run asks for one more after it.
async function refreshPreview($: Engine) {
  if (isPreviewRunning) {
    isPreviewAgain = true
    return
  }
  isPreviewRunning = true
  try {
    if ((await read($, bandViewAtom)) !== 'statusLineDock') {
      syncPreviewTimer($, false)
      return
    }
    await runPreview($)
  } catch {
    // The next tick tries again.
  } finally {
    isPreviewRunning = false
  }
  if (isPreviewAgain) {
    isPreviewAgain = false
    await refreshPreview($)
  }
}

async function runPreview($: Engine) {
  const current = await editing($)
  if (current === null) {
    return
  }
  const where = await currentPaths($)
  const sessionId = await $.session.id()
  const capturedText = await readText($, sessionFile(where.captures, sessionId))
  const captured = parseSettings(capturedText, 'last input').settings
  const [cwd, model, version, effort, settings, usage, mission, skill] = await Promise.all([
    $.session.cwd(),
    read($, chatModelAtom).then(known => known ?? $.session.model().catch(() => null)),
    $.session.version().then(
      found => found.version,
      () => null,
    ),
    read($, chatEffortAtom),
    $.settings.read().catch(() => ({}) as Record<string, unknown>),
    $.session.usage().catch(() => null),
    read($, missionAtom),
    read($, skillAtom),
  ])
  const { input, samples, agents, skill: shownSkill } = previewInput({
    captured,
    sessionId,
    cwd,
    root: where.root,
    modelId: model,
    version,
    effort,
    outputStyle: typeof settings.outputStyle === 'string' ? settings.outputStyle : null,
    usage,
    now: await $.clock.now(),
    agents: counts(mission?.cards ?? []).working,
    skill,
  })
  const capturedColumns = captured?.columns
  const columns = typeof capturedColumns === 'number' && capturedColumns > 0 ? capturedColumns : terminalColumns > 0 ? terminalColumns : 120

  const ran = await $.process
    .run(['sh', `${$.plugin.root}/renderer/statusline.sh`], {
      stdin: JSON.stringify(input),
      cwd,
      timeoutMs: RUN_TIMEOUT_MS,
      env: {
        MODS_TOOLBOX_LAYOUT: JSON.stringify(current.layout),
        MODS_TOOLBOX_PREVIEW: '1',
        MODS_TOOLBOX_AGENTS: String(agents),
        MODS_TOOLBOX_SKILL: JSON.stringify(shownSkill),
        COLUMNS: String(columns),
      },
    })
    .catch(() => null)
  const on = new Set(current.layout.lines.flat())
  const preview = previewFrom(ran?.stdout ?? '', columns, samples.filter(id => on.has(id)))
  const shown = ran === null ? { ...preview, error: 'The preview took too long. It tries again in a moment.' } : preview
  await update($, previewAtom, before => (JSON.stringify(before) === JSON.stringify(shown) ? before : shown))
}

// --- Drawing ----------------------------------------------------------------

async function drawChecklist($: Engine, e: RenderInput<'AbovePrompt'>) {
  const job = (await read($, cleanViewAtom)) ? await read($, checklistAtom) : null
  if (job === null) {
    return null
  }
  const { Box, Text } = $.ui.resolve(e)
  const frame = isAnimated(job.phase) ? await read($, tickAtom) : 0

  return checklistView(Box, Text, job, { columns: e.props.bodyColumns, isFolded: true, now: await $.clock.now(), frame })
}

function runs(Text: Elements['Text'], line: StatusLineRun[]) {
  return line.map(({ text, ...style }) => <Text {...style}>{text}</Text>)
}

async function drawDock($: Engine, e: RenderInput<'AbovePrompt'>) {
  const { Box, Text, Button } = $.ui.resolve(e)
  const width = Math.max(30, e.props.bodyColumns)
  const inner = width - 4
  const [current, selected, confirm, preview] = await Promise.all([
    editing($),
    read($, selectedAtom),
    read($, confirmAtom),
    read($, previewAtom),
  ])

  const close = <Button key="sl-close" plain role="dismiss" label="✕" onPress={() => closeDock($)} />
  const header = (meta: RenderNode) => (
    <Box flexDirection="row" justifyContent="space-between">
      <Text color={CORAL} bold>
        {`◆  ${spaced('STATUS LINE DOCK')}`}
      </Text>
      <Box flexDirection="row" gap={2}>
        {meta}
        {close}
      </Box>
    </Box>
  )
  if (current === null) {
    return (
      <Box width={width} flexDirection="column" borderStyle="round" borderColor={HAIRLINE} paddingX={1}>
        {header(<Text color={MUTED}>reading your settings…</Text>)}
      </Box>
    )
  }

  const { setup, scope, layout, hasChanges } = current
  const state = setup[scope]
  const isBlocked = setup.isLocked || state.problem !== null
  const meta = [SCOPE_NAMES[scope], state.isInstalled ? 'installed' : 'not installed'].join(' · ')

  const chip = (key: string, label: string, isOn: boolean, onPress: () => unknown) =>
    isOn ? (
      <Text backgroundColor={CORAL} color={INK} bold>
        {label}
      </Text>
    ) : (
      <Button key={key} plain label={label} onPress={onPress} />
    )
  const rule = (title: string, tail = '') => {
    const label = spaced(title)
    const rest = Math.max(0, inner - label.length - tail.length - 5)
    return (
      <Text>
        <Text color={HAIRLINE}>{'── '}</Text>
        <Text color={MUTED}>{label}</Text>
        <Text color={HAIRLINE}>{` ${'─'.repeat(rest)} `}</Text>
        <Text color={MUTED}>{tail}</Text>
      </Text>
    )
  }

  const modes = [
    chip('sl-mode-replace', ' Replace ', layout.mode === 'replace', () => edit($, now => ({ ...now, mode: 'replace' }))),
    ...(layout.base === null
      ? []
      : [chip('sl-mode-extend', ' Extend ', layout.mode === 'extend', () => edit($, now => ({ ...now, mode: 'extend' })))]),
  ]
  const scopes = (['global', 'project'] as const).map(name =>
    chip(`sl-scope-${name}`, ` ${SCOPE_NAMES[name]} `, scope === name, () => chooseScope($, name)),
  )
  const icons = ICON_STYLES.map(style =>
    chip(`sl-icons-${style}`, ` ${ICON_NAMES[style]} `, layout.icons === style, () => edit($, now => ({ ...now, icons: style }))),
  )
  const settingsRow = (
    <Box flexDirection="row" flexWrap="wrap" gap={3}>
      <Box flexDirection="row">
        <Box width={LABEL_WIDTH}>
          <Text bold>Mode</Text>
        </Box>
        {modes}
      </Box>
      <Box flexDirection="row">
        <Text bold>{'Scope  '}</Text>
        {scopes}
      </Box>
      <Box flexDirection="row">
        <Text bold>{'Icons  '}</Text>
        {icons}
      </Box>
    </Box>
  )

  const blockRows = rows(layout).map((ids, index) => (
    <Box flexDirection="row" flexWrap="wrap">
      <Box width={LABEL_WIDTH}>
        <Text bold={index < 2} color={index < 2 ? undefined : MUTED}>
          {ROW_LABELS[index] ?? ''}
        </Text>
      </Box>
      {ids.length === 0 ? <Text color={MUTED}>{index < 2 ? 'empty' : 'every block is on'}</Text> : null}
      {ids.map(id =>
        // Inverse, apart from the coral of a chosen Mode or Scope.
        id === selected ? (
          <Button key={`sl-block-${id}`} plain onPress={() => pick($, id)}>
            <Text inverse bold>{` ${blockName(id)} `}</Text>
          </Button>
        ) : (
          <Button key={`sl-block-${id}`} plain dimColor={index === 2} label={` ${blockName(id)} `} onPress={() => pick($, id)} />
        ),
      )}
    </Box>
  ))

  const keptBase =
    layout.mode !== 'extend' || layout.base === null ? null : (
      <Text color={MUTED} wrap="truncate-end">
        {layout.base.kind === 'command' ? `Keeps  ${layout.base.command}` : `Keeps  the status line ${layout.base.path} sets`}
      </Text>
    )

  const notices = [
    setup.isLocked ? "Your organization sets the status line, so it can't be changed here." : null,
    state.problem,
    scope === 'global' && setup.inForce !== null && setup.inForce.source !== 'user'
      ? `This project's ${setup.inForce.source === 'local' ? '.claude/settings.local.json' : '.claude/settings.json'} sets its own status line, so the global one doesn't show here.`
      : null,
  ].filter((notice): notice is string => notice !== null)

  const confirmBox =
    confirm === null ? null : (
      <Box borderStyle="round" borderColor={GOLD} paddingX={1} flexDirection="column">
        {confirm === 'install' ? (
          <Box flexDirection="column">
            <Text color={GOLD}>{`Set the status line in ${state.file}?`}</Text>
            <Text color={MUTED} wrap="truncate-end">
              {`now  ${setup.inForce === null ? 'none' : setup.inForce.command}`}
            </Text>
            <Text color={MUTED} wrap="truncate-end">
              {`new  ${state.command}`}
            </Text>
          </Box>
        ) : (
          <Box flexDirection="column">
            <Text color={GOLD}>
              {state.isRecorded ? `Put back the status line ${state.file} had before the Dock?` : `Take the Dock's status line out of ${state.file}?`}
            </Text>
            {state.restores === null ? null : (
              <Text color={MUTED} wrap="truncate-end">
                {`back to  ${state.restores}`}
              </Text>
            )}
          </Box>
        )}
        <Box flexDirection="row" gap={2}>
          <Button
            key="sl-confirm"
            variant="primary"
            autoFocus
            label="Continue"
            onPress={() => (confirm === 'install' ? install($) : uninstall($))}
          />
          <Button key="sl-cancel" label="Cancel" onPress={() => update($, confirmAtom, () => null)} />
        </Box>
      </Box>
    )

  const dropped = preview === null || preview.dropped.length === 0 ? 'nothing drops' : `drops: ${preview.dropped.map(blockName).join(', ')}`
  const previewTail = preview === null ? '' : `at ${preview.columns} columns · ${dropped}`
  const previewRows =
    preview === null ? (
      <Text color={MUTED}>drawing…</Text>
    ) : preview.error !== null ? (
      <Text color={MUTED}>{preview.error}</Text>
    ) : (
      <Box flexDirection="column">
        {(layout.mode === 'extend' ? preview.base : []).map(line => (
          <Text wrap="truncate-end">{runs(Text, line)}</Text>
        ))}
        {preview.lines.length === 0 ? <Text color={MUTED}>Turn a block on to see it here.</Text> : null}
        {preview.lines.map(line => (
          <Text wrap="truncate-end">{runs(Text, line)}</Text>
        ))}
        {preview.samples.length === 0 ? null : (
          <Text color={MUTED} wrap="truncate-end">{`◌ sample figures until Claude Code has them: ${preview.samples.map(blockName).join(', ')}`}</Text>
        )}
      </Box>
    )

  const key = (name: string, hotkey: string, label: string, onPress: () => unknown) => (
    <Button key={name} plain hotkey={hotkey} label={label} onPress={onPress} />
  )
  const toolbar = (
    <Box flexDirection="row" justifyContent="space-between" flexWrap="wrap">
      <Box flexDirection="row" gap={2}>
        {key('sl-left', 'h', '←', () => edit($, (now, id) => moveAlong(now, id, -1)))}
        {key('sl-right', 'l', '→', () => edit($, (now, id) => moveAlong(now, id, 1)))}
        {key('sl-up', 'k', '↑', () => edit($, (now, id) => moveAcross(now, id, -1)))}
        {key('sl-down', 'j', '↓', () => edit($, (now, id) => moveAcross(now, id, 1)))}
        {key('sl-toggle', 'o', 'on/off', () => edit($, (now, id) => toggleBlock(now, id)))}
        {key('sl-icons', 'i', 'icons', () => edit($, now => nextIcons(now)))}
        {isBlocked ? null : key('sl-apply', 'a', state.isInstalled ? 'Apply' : 'Install', () => apply($))}
        {hasChanges ? key('sl-revert', 'r', 'Revert', () => revert($)) : null}
        {state.isInstalled && !setup.isLocked ? key('sl-uninstall', 'u', 'Uninstall', () => update($, confirmAtom, () => 'uninstall')) : null}
      </Box>
      <Text color={MUTED}>{KEYS_HINT}</Text>
    </Box>
  )

  return (
    <Box width={width} flexDirection="column" borderStyle="round" borderColor={HAIRLINE} paddingX={1}>
      {header(
        <Text color={hasChanges ? GOLD : MUTED}>{hasChanges ? `${meta} · unapplied changes` : `${meta} · ${layoutSummary(layout)}`}</Text>,
      )}
      {settingsRow}
      {keptBase}
      {rule('BLOCKS')}
      {blockRows}
      {rule('PREVIEW', previewTail)}
      {previewRows}
      {notices.map(notice => (
        <Text color={GOLD}>{notice}</Text>
      ))}
      {confirmBox}
      {toolbar}
    </Box>
  )
}
