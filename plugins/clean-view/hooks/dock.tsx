import { atom, read, update } from 'claude-code'
import type { EngineInterface, On, RenderInput, Timer, ToolCallResult } from 'claude-code'

import type { DockCard, DockHelperModel, DockMission } from '../types'
import { cleanViewTools } from './clean-view'
import {
  ACTIVE_STATUSES,
  BADGE_COLORS,
  BAD_CUSTOM,
  CORAL,
  GOLD,
  GREEN,
  HAIRLINE,
  HELPERS_SKIP_PLAN,
  INK,
  MUTED,
  RED,
  SIZES,
  SIZE_HELP,
  STOPPED,
  TILES_AFTER,
  TOO_NARROW,
  afterMainTurn,
  atATime,
  badgeText,
  capMessage,
  cardTime,
  cardsPerRow,
  clampPercent,
  closedOut,
  confirmMessage,
  countDir,
  countFile,
  countPath,
  counts,
  ended,
  formatClock,
  hasActiveHelper,
  helperNote,
  infoLine,
  isBigTeam,
  isFinished,
  isLive,
  jobName,
  meter,
  missionBar,
  missionPercent,
  mix,
  newMission,
  nudgeText,
  parseSize,
  reconciled,
  reported,
  restoreHelperModel,
  restoreSize,
  rows,
  seats,
  spaced,
  standingBy,
  started,
  summary,
  teamInstruction,
  tilesPerRow,
  withAgent,
  withCard,
  withQueued,
  withoutCard,
} from './dock-logic'
import type { MeterPart } from './dock-logic'

type Engine = EngineInterface

const PANE = 'agent-dock'
const DOCK_COLUMNS = 78
const FRAME_MS = 200
const TILE_WIDTH = 17
const SIZE_KEY = 'dock.teamSize'
const MODEL_KEY = 'dock.helperModel'
const FALLBACK_JOB = 'Helpers at work'
// Prompts a person sent; a background task's notification is not a new request.
const PERSON_ORIGINS = new Set(['composer', 'bridge', 'sdk'])

const sizeRef = { plugin: 'clean-view', key: 'dockTeamSize' } as const
const sizeAtom = atom(sizeRef, 1)
const modelAtom = atom({ plugin: 'clean-view', key: 'dockHelperModel' } as const, 'fast')
const pendingAtom = atom({ plugin: 'clean-view', key: 'dockPendingSize' } as const, null)
const customAtom = atom({ plugin: 'clean-view', key: 'dockIsCustomOpen' } as const, false)
const foldedAtom = atom({ plugin: 'clean-view', key: 'dockIsFolded' } as const, false)
const missionAtom = atom({ plugin: 'clean-view', key: 'dockMission' } as const, null)
const tickAtom = atom({ plugin: 'clean-view', key: 'dockTick' } as const, 0)

// Module state a reload may drop: session.start puts the clock and limits back.
let ticker: Timer | null = null
let atOnce = atATime(undefined, undefined)
let lastJob: string | null = null
let shownStatus: string | undefined | null = null
let missionCount = 0
// Agent calls let out of the hold whose subagent the engine has not listed yet.
const launching = new Set<string>()
// The live count the status line reads: where it goes, what was last written, in order.
let countFolder: string | null = null
let writtenPath: string | null = null
let writtenKey: string | null = null
let countQueue: Promise<void> = Promise.resolve()

export function registerDock(on: On) {
  on('session.start', { cwd: /^/ }, async ($, e, next) => {
    try {
      // A reload keeps this session's size; only a new session reads the store.
      const { value: current } = await $.state.get(sizeRef)
      if (current === undefined) {
        const [savedSize, savedModel] = await Promise.all([$.store.get(SIZE_KEY), $.store.get(MODEL_KEY)])
        await update($, sizeAtom, () => restoreSize(savedSize))
        await update($, modelAtom, () => restoreHelperModel(savedModel))
      }
      atOnce = await readLimits($)
      countFolder = await readCountFolder($)
      await sweepCountFiles($)
      syncTicker($, await read($, missionAtom))
      await $.command.register({
        name: 'dock',
        description: 'Show or fold the Agent Dock, or set its Team Size (1 to 100)',
        argumentHint: '[team size]',
        immediate: true,
      })
    } catch {
      // The dock stays at its defaults; Clean View carries on either way.
    }

    return next(e)
  })

  // No awaits here: the answer goes back at once and the pane opens after.
  on('command.run', { command: 'dock' }, ($, e) => {
    try {
      const wanted = e.args.trim()
      if (wanted === '') {
        void toggleDock($)
        return { text: 'Agent Dock toggled. Type /dock again to switch back.' }
      }
      const size = parseSize(wanted)
      if (size === null) {
        return { text: SIZE_HELP }
      }
      void (async () => {
        try {
          await chooseSize($, size)
          await showDock($)
        } catch {
          $.ui.toast('The Agent Dock could not open. Try /dock again.')
        }
      })()

      return { text: isBigTeam(size) ? confirmMessage(size) : `Team Size is ${size}.` }
    } catch {
      return { text: 'The Agent Dock could not answer. Try /dock again.' }
    }
  })

  on('prompt.submit', async ($, e, next) => {
    let context: string | null = null
    try {
      const text = e.text.trim()
      const isRequest = PERSON_ORIGINS.has(e.origin.kind) && text !== '' && !text.startsWith('/')
      let current = isRequest ? await read($, missionAtom) : null
      // Idle with a mission still open and no helper of it running: its finish
      // was missed, so close it rather than leave this request unsplit.
      if (isLive(current) && e.turnId === undefined) {
        const statuses = await agentStatuses($)
        if (statuses !== null && !hasActiveHelper(current, statuses)) {
          const now = await $.clock.now()
          current = await change($, mission => (isLive(mission) ? closedOut(mission, statuses, now) : mission))
        }
      }
      if (isRequest && !isLive(current)) {
        const job = jobName(text)
        lastJob = job
        const size = await read($, sizeAtom)
        const now = await $.clock.now()
        // At size 1 Claude decides: a mission starts with its first helper.
        const mission = size > 1 ? newMission(`mission-${now}-${++missionCount}`, job, size, now) : null
        await change($, () => mission)
        if (size > 1) {
          const { progress, plan } = cleanViewTools()
          context = teamInstruction(size, progress, plan)
        }
      }
    } catch {
      context = null
    }

    return context === null ? next(e) : next({ ...e, context: [...(e.context ?? []), context] })
  })

  // Cards show queued as soon as Claude writes the Agent calls.
  on('session.append', { door: 'response' }, async ($, e, next) => {
    if (e.agentId === undefined) {
      try {
        const calls = agentCalls(e.message.content)
        if (calls.length > 0) {
          const fresh = await missionFor($)
          await change($, current => {
            const mission = isLive(current) ? current : fresh
            return withQueued(mission, calls, mission.size > 1 ? mission.size : null)
          })
        }
      } catch {
        // Cards still appear once the calls start.
      }
    }

    return next(e)
  })

  on('tool.call', { tool: 'Agent' }, async ($, e, next) => {
    if (e.agentId !== undefined) {
      return next(e)
    }
    const id = e.tool_use_id
    const admitted = await admit($, id, e.description).catch(() => ({ size: 1, deny: null }))
    if (admitted.deny !== null) {
      return { deny: admitted.deny }
    }
    if (admitted.size > 1) {
      const isStopped = await waitForSlot($, id, next.signal).catch(() => false)
      if (isStopped) {
        await finish($, id, 'stuck').catch(() => undefined)
        return { deny: STOPPED }
      }
    }
    await startCard($, id).catch(() => undefined)

    let ran: ToolCallResult
    try {
      ran = await next(e)
    } finally {
      launching.delete(id)
    }
    await afterCall($, id, ran).catch(() => undefined)

    return ran
  })

  // Helpers report on their own card; Clean View's checklist follows the main agent.
  on('tool.call', { tool: /__(report_progress|plan_steps)$/ }, async ($, e, next) => {
    const agentId = e.agentId
    const tools = cleanViewTools()
    if (agentId === undefined || (e.tool !== tools.progress && e.tool !== tools.plan)) {
      return next(e)
    }
    if (e.tool === tools.plan) {
      return { result: HELPERS_SKIP_PLAN }
    }
    const percent = clampPercent((e as unknown as { percent?: unknown }).percent)
    await change($, mission => (mission === null ? mission : withAgent(mission, agentId, card => reported(card, percent)))).catch(
      () => undefined,
    )

    return { result: `Progress noted: ${percent}%.` }
  })

  on('agent.spawn', async ($, e, next) => {
    if (e.parentAgentId !== undefined || e.workflow !== undefined) {
      return next(e)
    }
    let input = e
    try {
      const mission = await read($, missionAtom)
      const isHelper = mission !== null && mission.size > 1 && mission.cards.some(card => card.id === e.tool_use_id)
      if (isHelper) {
        const model = await read($, modelAtom)
        const { progress, plan } = cleanViewTools()
        input = {
          ...e,
          ...(model === 'fast' && e.model === undefined && !e.fork ? { model: 'haiku' } : {}),
          ...(e.prompt.includes(progress) ? {} : { prompt: `${e.prompt}\n\n${helperNote(progress, plan)}` }),
        }
      }
    } catch {
      input = e
    }

    const spawned = await next(input)
    launching.delete(e.tool_use_id)
    const agentId = 'agentId' in spawned ? spawned.agentId : undefined
    if (agentId !== undefined) {
      await change($, mission =>
        mission === null ? mission : withCard(mission, e.tool_use_id, card => ({ ...card, agentId, isBackground: e.background })),
      ).catch(() => undefined)
    }

    return spawned
  })

  on('turn.complete', { turnId: /^/ }, async ($, e, next) => {
    try {
      const now = await $.clock.now()
      const agentId = e.agentId
      if (agentId !== undefined) {
        const status = e.reason === 'answer' ? 'done' : 'stuck'
        await change($, mission => (mission === null ? mission : withAgent(mission, agentId, card => ended(card, status, now))))
      } else {
        const statuses = (await agentStatuses($)) ?? new Map<string, string>()
        await change($, mission =>
          isLive(mission) ? afterMainTurn(reconciled(mission, statuses, now), e.reason === 'aborted', now) : mission,
        )
      }
    } catch {
      // A missed finish is picked up at the next main turn's end.
    }

    return next(e)
  })

  // One follow-up per request when Claude used fewer helpers than the team size.
  on('classic.Stop', async ($, e, next) => {
    const answered = await next(e)
    if (answered.block !== undefined) {
      return answered
    }
    try {
      const nudge: { text: string | null } = { text: null }
      await change($, mission => {
        nudge.text = null
        if (!isLive(mission) || mission.size <= 1 || mission.hasNudged || mission.cards.length >= mission.size) {
          return mission
        }
        nudge.text = nudgeText(mission.cards.length, mission.size)
        return { ...mission, hasNudged: true }
      })
      if (nudge.text !== null) {
        return { ...answered, block: nudge.text }
      }
    } catch {
      // No nudge this time.
    }

    return answered
  })

  on('session.end', async ($, e, next) => {
    if (writtenPath !== null) {
      await removeFile($, writtenPath)
      writtenPath = null
      writtenKey = null
    }

    return next(e)
  })

  on('ui.close', { id: PANE }, async ($, e, next) => {
    const closed = await next(e)
    await fold($, true).catch(() => undefined)

    return closed
  })

  on('ui.render', { component: 'SessionMode' }, async ($, e, next) => {
    const below = await next(e)
    const { Box, Button } = $.ui.resolve(e)

    return (
      <Box flexDirection="row" gap={1}>
        {below}
        <Button key="dock-button" plain dimColor label="◆ Dock" onPress={() => toggleDock($)} />
      </Box>
    )
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, ($, e) => drawDock($, e))
}

async function readCountFolder($: Engine): Promise<string | null> {
  try {
    return countDir(await $.env.get('CLAUDE_CONFIG_DIR'), await $.env.get('HOME'))
  } catch {
    return null
  }
}

// Count files a crashed session left behind; a live one is rewritten as it changes.
async function sweepCountFiles($: Engine) {
  try {
    if (countFolder !== null && (await $.fs.exists(countFolder))) {
      await $.process.run(['find', countFolder, '-type', 'f', '-name', '*.json', '-mmin', '+1440', '-delete'])
    }
  } catch {
    // Leftovers are harmless: each status line reads its own session's file.
  }
}

async function removeFile($: Engine, path: string) {
  try {
    await $.process.run(['rm', '-f', path])
  } catch {
    // Its session is over, so no status line reads it again.
  }
}

// Writes are chained so an older count never lands after a newer one.
function publishCount($: Engine): Promise<void> {
  countQueue = countQueue.then(() => writeCount($)).catch(() => undefined)

  return countQueue
}

async function writeCount($: Engine) {
  if (countFolder === null) {
    return
  }
  const file = countFile(await read($, missionAtom), await $.clock.now())
  if (file === null) {
    if (writtenPath !== null) {
      const stale = writtenPath
      writtenPath = null
      writtenKey = null
      await removeFile($, stale)
    }
    return
  }
  // A /clear goes on under a new session id, so the path can move mid-mission.
  const path = countPath(countFolder, await $.session.id())
  const key = `${path}|${file.working}|${file.queued}|${file.done}|${file.stuck}`
  if (key === writtenKey) {
    return
  }
  if (writtenPath !== null && writtenPath !== path) {
    await removeFile($, writtenPath)
  }
  writtenPath = path
  writtenKey = key
  await $.fs.write(path, JSON.stringify(file))
}

async function readLimits($: Engine): Promise<number> {
  try {
    const subagents = await $.env.get('CLAUDE_CODE_MAX_CONCURRENT_SUBAGENTS')
    const tools = await $.env.get('CLAUDE_CODE_MAX_TOOL_USE_CONCURRENCY')

    return atATime(subagents, tools)
  } catch {
    return atATime(undefined, undefined)
  }
}

function agentCalls(content: readonly unknown[]): Array<{ id: string; description: string }> {
  const calls: Array<{ id: string; description: string }> = []
  for (const block of content as ReadonlyArray<{ type?: unknown; id?: unknown; name?: unknown; input?: unknown }>) {
    if (block.type === 'tool_use' && block.name === 'Agent' && typeof block.id === 'string') {
      const description = (block.input as { description?: unknown } | undefined)?.description
      calls.push({ id: block.id, description: typeof description === 'string' ? description : 'Helper' })
    }
  }

  return calls
}

// Helpers no person's request asked the dock to split (a slash command's, a
// skill's, a later notification turn's) are drawn but never capped, held,
// moved to Haiku or nudged: such a mission runs at size 1.
async function missionFor($: Engine): Promise<DockMission> {
  const now = await $.clock.now()

  return newMission(`mission-${now}-${++missionCount}`, lastJob ?? FALLBACK_JOB, 1, now)
}

// Gives the call a card, or refuses it once the request has its team.
async function admit($: Engine, id: string, description: string): Promise<{ size: number; deny: string | null }> {
  const fresh = await missionFor($)
  const verdict: { size: number; deny: string | null } = { size: 1, deny: null }
  await change($, current => {
    const mission = isLive(current) ? current : fresh
    verdict.size = mission.size
    verdict.deny = null
    if (mission.cards.some(card => card.id === id)) {
      return mission
    }
    if (mission.size > 1 && mission.cards.length >= mission.size) {
      verdict.deny = capMessage(mission.size)
      return current
    }

    return withQueued(mission, [{ id, description }], null)
  })

  return verdict
}

// Claude Code refuses an Agent call past its limit instead of queueing it, so
// the dock holds the call here. A process sleep is a `$` call, which the
// hook's ten-second budget does not count; `$.clock.sleep` would.
async function waitForSlot($: Engine, id: string, signal: AbortSignal): Promise<boolean> {
  for (;;) {
    if (signal.aborted) {
      return true
    }
    const listed = await activeAgents($)
    const mission = await read($, missionAtom)
    const working = mission?.cards.filter(card => card.status === 'working' && !launching.has(card.id)).length ?? 0
    // Checked and taken in one step, so two held calls never take one slot.
    if ((listed ?? working) + launching.size < atOnce) {
      launching.add(id)
      return false
    }
    await $.process.run(['/bin/sleep', '1'])
  }
}

async function activeAgents($: Engine): Promise<number | null> {
  try {
    return (await $.agent.list()).filter(agent => ACTIVE_STATUSES.has(agent.status)).length
  } catch {
    return null
  }
}

async function agentStatuses($: Engine): Promise<Map<string, string> | null> {
  try {
    return new Map((await $.agent.list()).map(agent => [agent.id, agent.status]))
  } catch {
    return null
  }
}

async function startCard($: Engine, id: string) {
  const now = await $.clock.now()
  await change($, mission => (mission === null ? mission : withCard(mission, id, card => started(card, now))))
}

async function finish($: Engine, id: string, status: 'done' | 'stuck') {
  const now = await $.clock.now()
  await change($, mission => (mission === null ? mission : withCard(mission, id, card => ended(card, status, now))))
}

// A background helper finishes with its own turn.complete; a foreground one,
// or one whose spawn the dock never saw, finishes when its call returns.
async function afterCall($: Engine, id: string, ran: ToolCallResult) {
  if (ran.deny !== undefined) {
    await change($, mission => (mission === null ? mission : withoutCard(mission, id)))
    return
  }
  if (ran.isError === true) {
    await finish($, id, 'stuck')
    return
  }
  const card = (await read($, missionAtom))?.cards.find(one => one.id === id)
  if (card?.isBackground !== true || card.agentId === null) {
    await finish($, id, 'done')
  }
}

async function change($: Engine, fn: (mission: DockMission | null) => DockMission | null): Promise<DockMission | null> {
  const mission = await update($, missionAtom, fn)
  syncTicker($, mission)
  await refreshBadge($, mission)
  await publishCount($)

  return mission
}

// One clock, and only while a mission is live.
function syncTicker($: Engine, mission: DockMission | null) {
  const shouldTick = isLive(mission)
  if (shouldTick && ticker === null) {
    ticker = $.clock.every(FRAME_MS, () => {
      void update($, tickAtom, frame => frame + 1)
    })
  } else if (!shouldTick && ticker !== null) {
    ticker.cancel()
    ticker = null
  }
}

async function refreshBadge($: Engine, known?: DockMission | null) {
  const isFolded = await read($, foldedAtom)
  const mission = known === undefined ? await read($, missionAtom) : known
  const text = isFolded ? badgeText(mission, await read($, sizeAtom)) : undefined
  if (text !== shownStatus) {
    shownStatus = text
    $.ui.status(text)
  }
}

async function fold($: Engine, isFolded: boolean) {
  await update($, foldedAtom, () => isFolded)
  await refreshBadge($)
}

async function isDockOpen($: Engine): Promise<boolean> {
  return (await $.ui.panes()).some(pane => pane.id === PANE)
}

async function toggleDock($: Engine) {
  try {
    if (await isDockOpen($)) {
      await $.ui.close({ id: PANE })
      await fold($, true)
    } else {
      await showDock($)
    }
  } catch {
    $.ui.toast('The Agent Dock could not open. Try /dock again.')
  }
}

// Opened from a command or a press, so it seats at any width; `columns` docks
// it beside the transcript in fullscreen.
async function showDock($: Engine) {
  const opened = await $.ui.open({ id: PANE, title: 'Agent Dock', columns: DOCK_COLUMNS })
  if (opened.isPlaced) {
    await fold($, false)
  } else {
    $.ui.toast(TOO_NARROW)
    await fold($, true)
  }
}

async function chooseSize($: Engine, size: number) {
  await update($, customAtom, () => false)
  if (isBigTeam(size)) {
    await update($, pendingAtom, () => size)
    return
  }
  await commitSize($, size)
}

async function commitSize($: Engine, size: number) {
  await update($, pendingAtom, () => null)
  await update($, sizeAtom, () => size)
  await $.store.set(SIZE_KEY, size)
  await refreshBadge($)
}

async function confirmBigTeam($: Engine) {
  const pending = await read($, pendingAtom)
  if (pending !== null) {
    await commitSize($, pending)
  }
}

async function submitCustom($: Engine, text: string) {
  const size = parseSize(text)
  if (size === null) {
    $.ui.toast(BAD_CUSTOM)
    return
  }
  await chooseSize($, size)
}

async function pickModel($: Engine, model: DockHelperModel) {
  await update($, modelAtom, () => model)
  await $.store.set(MODEL_KEY, model)
}

type Elements = ReturnType<Engine['ui']['resolve']>
type TextElement = Elements['Text']

async function drawDock($: Engine, e: RenderInput<'Pane'>) {
  const { Box, Text, Button } = $.ui.resolve(e)
  const columns = Math.max(24, e.props.bodyColumns)
  const [size, model, pending, isCustomOpen, mission] = await Promise.all([
    read($, sizeAtom),
    read($, modelAtom),
    read($, pendingAtom),
    read($, customAtom),
    read($, missionAtom),
  ])
  const now = await $.clock.now()
  // Only a live mission reads the clock, so nothing redraws while idle.
  const frame = isLive(mission) ? await read($, tickAtom) : 0

  const chip = (label: string) => (
    <Text backgroundColor={CORAL} color={INK} bold>
      {label}
    </Text>
  )
  const isPreset = (SIZES as readonly number[]).includes(size)

  const customBox = isCustomOpen ? (
    <Box borderStyle="round" borderColor={CORAL} paddingX={1} flexDirection="row" gap={2}>
      {e.surface === 'mobile' ? (
        <Text>Type /dock and a number from 1 to 100</Text>
      ) : (
        (() => {
          const { Input } = $.ui.resolve(e)
          return (
            <Input
              key="custom-size"
              label="How many helpers? "
              placeholder="1 to 100"
              submitLabel="set"
              autoFocus
              onSubmit={value => submitCustom($, value)}
            />
          )
        })()
      )}
      <Button key="custom-cancel" plain label="Cancel" onPress={() => update($, customAtom, () => false)} />
    </Box>
  ) : null

  return (
    <Box flexDirection="column">
      <Box flexDirection="row" justifyContent="space-between">
        <Text>
          <Text color={CORAL}>{'◆  '}</Text>
          {wordmark(Text)}
        </Text>
        {liveMark(Text, mission, frame)}
      </Box>
      <Text color={HAIRLINE}>{'─'.repeat(columns)}</Text>

      <Box flexDirection="row" flexWrap="wrap">
        <Text color={MUTED}>{`${spaced('TEAM SIZE')}   `}</Text>
        <Text color={HAIRLINE}>{'╭ '}</Text>
        {SIZES.map(option =>
          option === size ? (
            chip(` ${option} `)
          ) : (
            <Button key={`size-${option}`} plain label={` ${option} `} onPress={() => chooseSize($, option)} />
          ),
        )}
        <Text color={HAIRLINE}>{' │ '}</Text>
        {isPreset ? null : chip(` ${size} `)}
        <Button key="size-custom" plain label=" Custom " onPress={() => update($, customAtom, () => true)} />
        <Text color={HAIRLINE}>{' ╮'}</Text>
      </Box>
      <Text color={MUTED} wrap="truncate-end">
        {infoLine(size, atOnce, model)}
      </Text>
      <Box flexDirection="row">
        <Text color={MUTED}>{'Helper agents   '}</Text>
        {model === 'fast' ? chip(' Fast & Cheap ') : <Button key="model-fast" plain label=" Fast & Cheap " onPress={() => pickModel($, 'fast')} />}
        <Text> </Text>
        {model === 'same' ? chip(' Same as me ') : <Button key="model-same" plain label=" Same as me " onPress={() => pickModel($, 'same')} />}
      </Box>
      {customBox}
      {pending === null ? null : (
        <Box borderStyle="round" borderColor={GOLD} paddingX={1} flexDirection="column">
          <Text color={GOLD}>Big team: this uses your plan quickly. Continue?</Text>
          <Box flexDirection="row" gap={2}>
            <Button key="big-continue" variant="primary" autoFocus label={`Continue with ${pending}`} onPress={() => confirmBigTeam($)} />
            <Button key="big-cancel" label="Cancel" onPress={() => update($, pendingAtom, () => null)} />
          </Box>
        </Box>
      )}
      <Text> </Text>
      {mission === null ? idle(Box, Text, size) : drawMission($, e, mission, columns, now, frame)}
    </Box>
  )
}

function wordmark(Text: TextElement) {
  const letters = [...spaced('AGENT DOCK')]
  const last = Math.max(1, letters.length - 1)

  return letters.map((letter, index) => (
    <Text color={mix(CORAL, GOLD, index / last)} bold>
      {letter}
    </Text>
  ))
}

function liveMark(Text: TextElement, mission: DockMission | null, frame: number) {
  if (mission === null) {
    return <Text color={MUTED}>{spaced('STANDING BY')}</Text>
  }
  if (mission.finishedAt !== null) {
    return <Text color={GREEN}>{spaced('COMPLETE')}</Text>
  }

  // A slow blink: bright for three frames, soft for two.
  return (
    <Text color={frame % 5 < 3 ? GREEN : '#1F7A45'} bold>
      {`● ${spaced('LIVE')}`}
    </Text>
  )
}

function idle(Box: Elements['Box'], Text: TextElement, size: number) {
  const [standing, hint] = standingBy(size)

  return (
    <Box flexDirection="column">
      <Text>
        {seats(size).map((seat, index) => (
          <Text color={seat.color} dimColor={seat.isSoft}>
            {index === 0 ? '●' : ' ●'}
          </Text>
        ))}
      </Text>
      <Text bold>{standing}</Text>
      <Text color={MUTED}>{hint}</Text>
    </Box>
  )
}

function drawMission($: Engine, e: RenderInput<'Pane'>, mission: DockMission, columns: number, now: number, frame: number) {
  const { Box, Text } = $.ui.resolve(e)
  const tally = counts(mission.cards)
  const elapsed = `${missionPercent(mission.cards)}%   ${formatClock((mission.finishedAt ?? now) - mission.startedAt)}`
  const isAllBack = mission.cards.length > 0 && mission.cards.every(card => isFinished(card.status))
  const useTiles = mission.cards.length > TILES_AFTER

  return (
    <Box flexDirection="column">
      <Box flexDirection="row" justifyContent="space-between">
        <Box width={Math.max(8, columns - elapsed.length - 2)}>
          <Text wrap="truncate-end">
            <Text color={MUTED}>{`${spaced('MISSION')}   `}</Text>
            <Text bold>{mission.job}</Text>
          </Text>
        </Box>
        <Text bold>{elapsed}</Text>
      </Box>
      <Text>{parts(Text, missionBar(mission.cards, columns, frame))}</Text>
      <Box flexDirection="row" gap={4}>
        <Text color={GREEN}>{`● ${tally.working} working`}</Text>
        <Text color={MUTED}>{`○ ${tally.queued} queued`}</Text>
        <Text color={GOLD}>{`✓ ${tally.done} done`}</Text>
        <Text color={tally.stuck > 0 ? RED : MUTED}>{`✕ ${tally.stuck} stuck`}</Text>
      </Box>
      {mission.finishedAt !== null ? (
        <Box borderStyle="round" borderColor={GREEN} paddingX={1}>
          <Text>
            <Text color={GREEN}>{'✓ '}</Text>
            {summary(mission)}
          </Text>
        </Box>
      ) : mission.cards.length === 0 ? (
        <Text color={MUTED}>{`Claude is splitting the work across ${mission.size} helpers…`}</Text>
      ) : isAllBack ? (
        <Text color={MUTED}>Every helper is back. Claude is combining their work…</Text>
      ) : null}
      <Text> </Text>
      {useTiles ? tiles($, e, mission.cards, columns, frame) : cards($, e, mission.cards, columns, now, frame)}
    </Box>
  )
}

function cards($: Engine, e: RenderInput<'Pane'>, list: readonly DockCard[], columns: number, now: number, frame: number) {
  const { Box, Text } = $.ui.resolve(e)
  const perRow = cardsPerRow(columns)
  const width = Math.floor((columns - (perRow - 1)) / perRow)
  const inner = width - 4

  return (
    <Box flexDirection="column">
      {rows(list, perRow).map(row => (
        <Box flexDirection="row" gap={1}>
          {row.map(card => {
            const isQueued = card.status === 'queued'
            const time = cardTime(card, now)
            const label = percentLabel(card).padStart(5)
            return (
              <Box
                key={`card-${card.id}`}
                width={width}
                flexDirection="column"
                borderStyle="round"
                borderColor={card.status === 'stuck' ? RED : HAIRLINE}
                hover={{ borderColor: CORAL }}
                paddingX={1}
              >
                <Box flexDirection="row">
                  {face(Text, card)}
                  <Text> </Text>
                  <Box width={Math.max(4, inner - 6 - time.length)}>
                    <Text wrap="truncate-end" bold={card.status === 'working'} dimColor={isQueued}>
                      {card.task}
                    </Text>
                  </Box>
                  <Text> </Text>
                  <Text color={MUTED} dimColor={isQueued}>
                    {time}
                  </Text>
                </Box>
                <Text>
                  {'     '}
                  {parts(Text, meter(card, Math.max(1, inner - 10), frame))}
                  <Text dimColor={isQueued} color={card.status === 'stuck' ? RED : undefined}>
                    {label}
                  </Text>
                </Text>
              </Box>
            )
          })}
        </Box>
      ))}
    </Box>
  )
}

// Past twelve helpers each one is a one-line tile, so 50 or 100 still fit.
function tiles($: Engine, e: RenderInput<'Pane'>, list: readonly DockCard[], columns: number, frame: number) {
  const { Box, Text } = $.ui.resolve(e)
  const perRow = tilesPerRow(columns, TILE_WIDTH)

  return (
    <Box flexDirection="column">
      {rows(list, perRow).map(row => (
        <Box flexDirection="row" gap={1}>
          {row.map(card => (
            <Box key={`tile-${card.id}`} width={TILE_WIDTH} flexDirection="row">
              {face(Text, card)}
              <Text> </Text>
              <Text>{parts(Text, meter(card, TILE_WIDTH - 10, frame))}</Text>
              <Text dimColor={card.status === 'queued'} color={card.status === 'stuck' ? RED : undefined}>
                {percentLabel(card).padStart(5)}
              </Text>
            </Box>
          ))}
        </Box>
      ))}
    </Box>
  )
}

// The terminal draws no headshots here, so every face is a two-letter badge.
function face(Text: TextElement, card: DockCard) {
  return (
    <Text
      backgroundColor={BADGE_COLORS[card.colorIndex] ?? CORAL}
      color={INK}
      bold
      dimColor={card.status === 'queued'}
      hover={{ backgroundColor: CORAL }}
    >
      {` ${card.initials} `}
    </Text>
  )
}

function percentLabel(card: DockCard): string {
  switch (card.status) {
    case 'queued':
      return '—'
    case 'stuck':
      return '✕'
    case 'done':
      return '100%'
    case 'working':
      return card.hasReported ? `${card.percent}%` : '…'
  }
}

function parts(Text: TextElement, list: MeterPart[]) {
  return list.map(part => <Text color={part.color}>{part.text}</Text>)
}
