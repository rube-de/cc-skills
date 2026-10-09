import { atom, read, update } from 'claude-code'
import type { EngineInterface, On, RenderInput, RenderNode } from 'claude-code'

import { checklistView, isAnimated } from './checklist-view'
import {
  BIG_TEAM_QUESTION,
  CORAL,
  CUSTOM_PLACEHOLDER,
  CUSTOM_QUESTION,
  GOLD,
  GREEN,
  HAIRLINE,
  INK,
  MUTED,
  SIZES,
  spaced,
} from './dock-logic'
import { BAND_GAP, bandLayout } from './toolbox-logic'
import type { BandLayout } from './toolbox-logic'

type Engine = EngineInterface

const toolboxOpenAtom = atom({ plugin: 'mods-toolbox', key: 'toolboxIsOpen' } as const, false)
// Clean View's and the dock's values, read on the same keys their files write.
const cleanViewAtom = atom({ plugin: 'mods-toolbox', key: 'cleanViewEnabled' } as const, true)
const checklistAtom = atom({ plugin: 'mods-toolbox', key: 'checklist' } as const, null)
const tickAtom = atom({ plugin: 'mods-toolbox', key: 'tick' } as const, 0)
const sizeAtom = atom({ plugin: 'mods-toolbox', key: 'dockTeamSize' } as const, 1)
const modelAtom = atom({ plugin: 'mods-toolbox', key: 'dockHelperModel' } as const, 'fast')
const pendingAtom = atom({ plugin: 'mods-toolbox', key: 'dockPendingSize' } as const, null)
const customAtom = atom({ plugin: 'mods-toolbox', key: 'dockIsCustomOpen' } as const, false)

const NAME_WIDTH = 14

type Option = { label: string; node: RenderNode }

// The engine follows `$` only into this file, so the popup draws the controls
// and Clean View and the dock answer their own keys in their `ui.press` and
// `ui.input` hooks; by the time a press would reach this closure it is answered.
const answeredByOwner = () => undefined

export function registerToolbox(on: On) {
  // Clean View holds the bare session.start and the dock its cwd matcher.
  on('session.start', { surface: /^/ }, async ($, e, next) => {
    try {
      await $.command.register({
        name: 'toolbox',
        description: 'Open or close the Toolbox: Clean View, Team Size, helper model and the Agent Dock',
        immediate: true,
      })
    } catch {
      // The footer button still opens it.
    }

    return next(e)
  })

  on('command.run', { command: 'toolbox' }, async $ => {
    const isOpen = await update($, toolboxOpenAtom, current => !current)

    return { text: isOpen ? 'Toolbox open above the prompt.' : 'Toolbox closed.' }
  })

  on('ui.render', { component: 'SessionMode' }, async ($, e, next) => {
    const below = await next(e)
    const { Box, Button, Text } = $.ui.resolve(e)
    const isOpen = await read($, toolboxOpenAtom)

    return (
      <Box flexDirection="row" gap={1}>
        {below}
        <Button key="toolbox-button" plain onPress={() => update($, toolboxOpenAtom, current => !current)}>
          <Text color={CORAL}>◆</Text>
          {` Toolbox ${isOpen ? '▴' : '▾'}`}
        </Button>
      </Box>
    )
  })

  // While the popup is open the band is laid out here: Clean View steps aside
  // and the checklist is drawn beside the popup, or folded above it. `next` then
  // brings only other mods' rows and the engine's own, which the engine refuses
  // under a sized Box, so they go below, never in the row. The popup always sits
  // at the right edge, with or without a checklist beside it.
  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey || !(await read($, toolboxOpenAtom))) {
      return next(e)
    }
    const { Box } = $.ui.resolve(e)
    const layout = bandLayout(e.props.bodyColumns, true)
    const [checklist, popup, below] = await Promise.all([
      drawChecklist($, e, layout),
      drawPopup($, e, layout.popupWidth),
      next(e),
    ])
    const pinned = (
      <Box flexDirection="row" justifyContent="flex-end">
        {popup}
      </Box>
    )
    const top =
      checklist === null ? (
        pinned
      ) : layout.isSideBySide ? (
        <Box flexDirection="row" justifyContent="flex-end" alignItems="flex-end" gap={BAND_GAP}>
          <Box width={layout.checklistColumns}>{checklist}</Box>
          {popup}
        </Box>
      ) : (
        <Box flexDirection="column">
          {checklist}
          {pinned}
        </Box>
      )

    return (
      <Box flexDirection="column">
        {top}
        {below}
      </Box>
    )
  })
}

async function drawChecklist($: Engine, e: RenderInput<'AbovePrompt'>, layout: BandLayout) {
  const job = (await read($, cleanViewAtom)) ? await read($, checklistAtom) : null
  if (job === null) {
    return null
  }
  const { Box, Text } = $.ui.resolve(e)
  const frame = isAnimated(job.phase) ? await read($, tickAtom) : 0

  return checklistView(Box, Text, job, {
    columns: layout.checklistColumns,
    isFolded: !layout.isSideBySide,
    now: await $.clock.now(),
    frame,
  })
}

async function drawPopup($: Engine, e: RenderInput<'AbovePrompt'>, width: number) {
  const { Box, Text, Button } = $.ui.resolve(e)
  const inner = Math.max(1, width - 4)
  const [isCleanView, size, model, pending, isCustomOpen] = await Promise.all([
    read($, cleanViewAtom),
    read($, sizeAtom),
    read($, modelAtom),
    read($, pendingAtom),
    read($, customAtom),
  ])

  const chip = (label: string, background: string, color?: string): Option => ({
    label,
    node: (
      <Text backgroundColor={background} color={color} bold>
        {label}
      </Text>
    ),
  })
  const pick = (key: string, label: string): Option => ({
    label,
    node: <Button key={key} plain label={label} onPress={answeredByOwner} />,
  })

  const rule = (title: string) => {
    const label = spaced(title)

    return (
      <Text>
        <Text color={HAIRLINE}>{'── '}</Text>
        <Text color={MUTED}>{label}</Text>
        <Text color={HAIRLINE}>{` ${'─'.repeat(Math.max(0, inner - label.length - 4))}`}</Text>
      </Text>
    )
  }

  // The hint shows only where it fits whole; the options keep their room.
  const row = (mark: RenderNode, name: string, hint: string, options: Option[]) => {
    const optionsWidth = options.reduce((sum, option) => sum + option.label.length, 0)
    const hasHint = inner - 2 - NAME_WIDTH - optionsWidth - 1 >= hint.length

    return (
      <Box flexDirection="row" justifyContent="space-between">
        <Box flexDirection="row">
          <Box width={2}>{mark}</Box>
          <Box width={NAME_WIDTH}>
            <Text bold>{name}</Text>
          </Box>
          {hasHint ? <Text color={MUTED}>{hint}</Text> : null}
        </Box>
        <Box flexDirection="row" flexWrap="wrap">
          {options.map(option => option.node)}
        </Box>
      </Box>
    )
  }

  // The filled dot follows the chosen side, as on a radio button.
  const cleanView = [
    isCleanView ? chip(' ● On ', GREEN, INK) : pick('cv-on', ' ○ On '),
    isCleanView ? pick('cv-off', ' ○ Off ') : chip(' ● Off ', HAIRLINE),
  ]
  const isPreset = (SIZES as readonly number[]).includes(size)
  const sizes = [
    ...SIZES.map(option => (option === size ? chip(` ${option} `, CORAL, INK) : pick(`size-${option}`, ` ${option} `))),
    ...(isPreset ? [] : [chip(` ${size} `, CORAL, INK)]),
    pick('size-custom', ' Custom '),
  ]
  const helpers = [
    model === 'fast' ? chip(' Fast & Cheap ', CORAL, INK) : pick('model-fast', ' Fast & Cheap '),
    model === 'same' ? chip(' Same as me ', CORAL, INK) : pick('model-same', ' Same as me '),
  ]

  // The engine raises AbovePrompt on the terminal and desktop alone, so the
  // popup never shows on mobile or VS Code; the surface check only narrows the
  // element table to one that has Input.
  let customBox: RenderNode | null = null
  if (isCustomOpen && e.surface !== 'mobile' && e.surface !== 'vscode') {
    const { Input } = $.ui.resolve(e)
    customBox = (
      <Box borderStyle="round" borderColor={CORAL} paddingX={1} flexDirection="row" gap={2}>
        <Input
          key="custom-size"
          label={CUSTOM_QUESTION}
          placeholder={CUSTOM_PLACEHOLDER}
          submitLabel="set"
          autoFocus
          onSubmit={answeredByOwner}
        />
        <Button key="custom-cancel" plain label="Cancel" onPress={answeredByOwner} />
      </Box>
    )
  }

  const confirmBox =
    pending === null ? null : (
      <Box borderStyle="round" borderColor={GOLD} paddingX={1} flexDirection="column">
        <Text color={GOLD}>{BIG_TEAM_QUESTION}</Text>
        <Box flexDirection="row" gap={2}>
          <Button key="big-continue" variant="primary" autoFocus label={`Continue with ${pending}`} onPress={answeredByOwner} />
          <Button key="big-cancel" label="Cancel" onPress={answeredByOwner} />
        </Box>
      </Box>
    )

  return (
    <Box width={width} flexDirection="column" borderStyle="round" borderColor={HAIRLINE} paddingX={1}>
      <Box flexDirection="row" justifyContent="space-between">
        <Text color={CORAL} bold>
          {`◆  ${spaced('TOOLBOX')}`}
        </Text>
        <Button key="toolbox-close" plain role="dismiss" label="✕" onPress={() => update($, toolboxOpenAtom, () => false)} />
      </Box>
      {rule('SETTINGS')}
      {row(<Text color={isCleanView ? GREEN : MUTED}>{isCleanView ? '●' : '○'}</Text>, 'Clean View', 'simple checklist', cleanView)}
      {row(<Text color={MUTED}>◇</Text>, 'Team size', 'per request', sizes)}
      {customBox}
      {confirmBox}
      {row(<Text color={MUTED}>◇</Text>, 'Helpers', 'model they use', helpers)}
      {rule('LAUNCH')}
      <Box flexDirection="row">
        {/* The dock opens itself, then lets the press through to close the popup. */}
        <Button key="toolbox-dock" plain onPress={() => update($, toolboxOpenAtom, () => false)}>
          <Text color={CORAL}>◆</Text>
          {' Agent Dock  '}
          <Text color={MUTED}>{`team of ${size}`}</Text>
        </Button>
      </Box>
    </Box>
  )
}
