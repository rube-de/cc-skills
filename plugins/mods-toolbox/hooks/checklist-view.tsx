import type { EngineInterface, RenderNode } from 'claude-code'

import type { CleanViewChecklist, CleanViewPhase, CleanViewTask } from '../types'
import { MAX_NAME_LENGTH } from './clean-name'
import { formatDuration } from './progress'

// The checklist as drawn, with no `$`: Clean View draws it in the band, and the
// Toolbox draws it beside its popup while that is open.

type Elements = ReturnType<EngineInterface['ui']['resolve']>
type TextElement = Elements['Text']

const METER_CELLS = 10

export const WAITING_FOR_REPLY = 'Claude is waiting for your reply'
export const API_TROUBLE = 'something went wrong talking to Claude, try again'

export type ChecklistFrame = {
  columns: number
  // Above the Toolbox popup only the header shows, with the step it is on.
  isFolded: boolean
  now: number
  frame: number
}

export function isAnimated(phase: CleanViewPhase): boolean {
  return phase === 'working' || phase === 'needsYou'
}

export function checklistView(
  Box: Elements['Box'],
  Text: TextElement,
  job: CleanViewChecklist,
  { columns, isFolded, now, frame }: ChecklistFrame,
) {
  const header = (
    <Box width={Math.max(1, columns)}>
      <Text wrap="truncate-end">
        {headline(Text, job, now)}
        {isFolded ? stepOf(job) : null}
      </Text>
    </Box>
  )
  if (job.isCollapsed || isFolded) {
    return header
  }

  // mark (2) + name + gap (1) + meter (10) + gap (2) + label (7)
  const nameWidth = Math.min(MAX_NAME_LENGTH + 1, Math.max(6, columns - 22))
  const firstUpcoming = job.tasks.findIndex(task => task.status === 'upcoming')

  return (
    <Box flexDirection="column">
      {header}
      {job.tasks.map((task, index) => (
        <Box key={`row-${task.id}`} flexDirection="row">
          <Box width={2}>{mark(Text, task, job.phase)}</Box>
          <Box width={nameWidth}>
            <Text wrap="truncate-end" bold={task.status === 'active'} dimColor={task.status !== 'active'}>
              {task.name}
            </Text>
          </Box>
          <Text> </Text>
          {meter(Text, task, job.phase, frame)}
          <Text>  </Text>
          <Text dimColor={task.status !== 'active'}>{statusLabel(task, index === firstUpcoming)}</Text>
        </Box>
      ))}
    </Box>
  )
}

function headline(Text: TextElement, job: CleanViewChecklist, now: number): RenderNode[] {
  switch (job.phase) {
    case 'working':
      return [<Text bold>{job.title}</Text>, ` · ${formatDuration(now - job.startedAt)}`]
    case 'needsYou':
      return [
        <Text backgroundColor="warning" color="inverseText" bold>
          {' Needs you '}
        </Text>,
        ` ${job.needsYouReason ?? WAITING_FOR_REPLY}`,
      ]
    case 'stuck':
      return [<Text color="warning">⚠ Stuck:</Text>, ` ${job.stuckReason ?? API_TROUBLE}`]
    case 'stopped':
      return [<Text color="warning">■ Stopped</Text>, ` · ${job.title} · you pressed Esc`]
    case 'done':
      return [
        <Text color="success">✓ All done</Text>,
        ` · ${job.title} · took ${formatDuration((job.finishedAt ?? now) - job.startedAt)}`,
      ]
  }
}

function mark(Text: TextElement, task: CleanViewTask, phase: CleanViewPhase) {
  if (task.status === 'done') {
    return <Text color="success">✓</Text>
  }
  if (task.status === 'upcoming') {
    return <Text dimColor>○</Text>
  }

  return <Text bold>{phase === 'needsYou' ? '‖' : '▶'}</Text>
}

function meter(Text: TextElement, task: CleanViewTask, phase: CleanViewPhase, frame: number) {
  if (task.status === 'done') {
    return <Text color="success">{'█'.repeat(METER_CELLS)}</Text>
  }
  if (task.status === 'upcoming') {
    return <Text dimColor>{'░'.repeat(METER_CELLS)}</Text>
  }
  if (task.hasReported || !isAnimated(phase)) {
    const filled = Math.round(task.percent / 10)

    return <Text>{'█'.repeat(filled) + '░'.repeat(METER_CELLS - filled)}</Text>
  }
  // No percent yet: a three-cell block sweeps across the meter.
  const start = (frame % (METER_CELLS + 3)) - 3
  let cells = ''
  for (let cell = 0; cell < METER_CELLS; cell++) {
    cells += cell >= start && cell < start + 3 ? '█' : '░'
  }

  return <Text>{cells}</Text>
}

// " · step 2 of 3", while a real plan is under way.
function stepOf(job: CleanViewChecklist): string | null {
  const active = job.tasks.findIndex(task => task.status === 'active')
  if (job.planSource === null || job.phase === 'done' || active < 0) {
    return null
  }

  return ` · step ${active + 1} of ${job.tasks.length}`
}

function statusLabel(task: CleanViewTask, isNext: boolean): string {
  if (task.status === 'done') {
    return 'Done'
  }
  if (task.status === 'active') {
    return task.hasReported ? `${task.percent}%` : 'Working'
  }

  return isNext ? 'Next' : 'Up next'
}
