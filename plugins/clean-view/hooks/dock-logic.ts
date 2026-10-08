import type { DockCard, DockCardStatus, DockHelperModel, DockMission } from '../types'
import { cleanName } from './clean-name'

export const SIZES = [1, 3, 5, 10, 20, 50, 100] as const
export const MAX_SIZE = 100
export const BIG_TEAM = 20
export const MAX_SEATS = 25
export const TILES_AFTER = 12

// What Claude Code runs at once when nothing in settings says otherwise.
export const DEFAULT_SUBAGENT_LIMIT = 20
export const DEFAULT_TOOL_LIMIT = 10

export const SIZE_HELP = 'Team Size is a whole number from 1 to 100, e.g. /dock 10.'
export const BAD_CUSTOM = 'Type a whole number from 1 to 100'
export const STOPPED = 'Stopped before this helper started.'
export const HELPERS_SKIP_PLAN = 'Helpers skip the plan. Just call report_progress as you work.'
export const TOO_NARROW = 'The window is too narrow to show the Agent Dock. Widen it or watch the status bar.'

export const CORAL = '#FF7A66'
export const GOLD = '#F2C14E'
export const GREEN = '#4ADE80'
export const GREEN_LIGHT = '#BBF7D0'
export const RED = '#F87171'
export const MUTED = '#8B90A0'
export const HAIRLINE = '#3A3F4B'
export const INK = '#16181D'

// Muted, not a rainbow: each helper's badge cycles through these.
export const BADGE_COLORS = ['#E07A5F', '#F2CC8F', '#81B29A', '#7FA7C9', '#B5A1D6', '#E5989B', '#9CC5A1', '#D4A373']

export function parseSize(text: string): number | null {
  const trimmed = text.trim()
  if (!/^\d+$/.test(trimmed)) {
    return null
  }
  const size = Number(trimmed)

  return size >= 1 && size <= MAX_SIZE ? size : null
}

// A big team never carries over: a new session starts it at 1.
export function restoreSize(saved: unknown): number {
  return typeof saved === 'number' && Number.isInteger(saved) && saved >= 1 && saved <= BIG_TEAM ? saved : 1
}

export function isBigTeam(size: number): boolean {
  return size > BIG_TEAM
}

export function restoreHelperModel(saved: unknown): DockHelperModel {
  return saved === 'same' ? 'same' : 'fast'
}

export function parseLimit(raw: string | undefined, fallback: number): number {
  const limit = Number(raw)

  return Number.isInteger(limit) && limit > 0 ? limit : fallback
}

// Helpers running at once: Claude Code refuses an Agent call past either limit.
export function atATime(subagentLimit: string | undefined, toolLimit: string | undefined): number {
  return Math.min(parseLimit(subagentLimit, DEFAULT_SUBAGENT_LIMIT), parseLimit(toolLimit, DEFAULT_TOOL_LIMIT))
}

export function jobName(request: string): string {
  const firstLine = request.trim().split('\n')[0] ?? ''
  const clause = firstLine.split(/[.;!?](?:\s|$)|,\s|\s[–—-]\s/)[0] ?? firstLine

  return cleanName(clause)
}

export function taskName(description: string): string {
  return cleanName(description)
}

// "Price check: Panera" → PA, "Read the docs" → RT.
export function initials(task: string): string {
  const subject = task.includes(':') ? task.slice(task.indexOf(':') + 1) : task
  const words = subject.match(/[\p{L}\p{N}]+/gu) ?? task.match(/[\p{L}\p{N}]+/gu) ?? []
  const [first, second] = words
  if (first === undefined) {
    return '··'
  }
  if (second === undefined) {
    return first.slice(0, 2).toUpperCase().padEnd(2, '·')
  }

  return (first[0]! + second[0]!).toUpperCase()
}

export function helperNote(progressTool: string, planTool: string): string {
  return (
    `As you work, call ${progressTool} with your task name and a percent at about 25, 50, 75 and 100. ` +
    `Do not call ${planTool}.`
  )
}

export function teamInstruction(size: number, progressTool: string, planTool: string): string {
  return [
    `Agent Dock: Team Size is ${size}.`,
    `- Split this request into exactly ${size} independent pieces and launch one helper (the Agent tool) per piece, all ${size} in one message so they run in parallel.`,
    '- Find a real split, one helper per item (per store, per task, per file, per section). Never argue that it can\'t be split and never pad with useless work.',
    '- Give each helper a short plain-English description of 3 to 5 words, e.g. "Price check: Panera".',
    `- In each helper's prompt add: "${helperNote(progressTool, planTool)}"`,
    '- When they finish, combine their results into one answer.',
  ].join('\n')
}

export function nudgeText(used: number, size: number): string {
  return (
    `You used ${used} of ${size} helpers. Split the remaining work across the other ${size - used}, ` +
    'one helper per piece, all in parallel.'
  )
}

export function capMessage(size: number): string {
  return `Team Size is ${size}: this request already has ${size} helpers. Finish with the helpers you have.`
}

export function confirmMessage(size: number): string {
  return `Confirm the team of ${size} in the Agent Dock.`
}

export function infoLine(size: number, atOnce: number, model: DockHelperModel): string {
  const split = size === 1 ? 'Claude decides how many helpers' : `Splits each request across ${size} helpers`
  const running = `${size === 1 ? atOnce : Math.min(size, atOnce)} at a time`
  const helpers = size > 1 && model === 'fast' ? 'Fast & Cheap' : 'Same model as you'

  return [split, running, helpers].join('  ·  ')
}

export type DockCounts = { working: number; queued: number; done: number; stuck: number; total: number }

export function counts(cards: readonly DockCard[]): DockCounts {
  const tally: DockCounts = { working: 0, queued: 0, done: 0, stuck: 0, total: cards.length }
  for (const card of cards) {
    tally[card.status] += 1
  }

  return tally
}

export function isFinished(status: DockCardStatus): boolean {
  return status === 'done' || status === 'stuck'
}

// A stuck helper is over too, so it counts as a full share of the bar.
export function missionPercent(cards: readonly DockCard[]): number {
  if (cards.length === 0) {
    return 0
  }
  const sum = cards.reduce((total, card) => total + (isFinished(card.status) ? 100 : card.percent), 0)

  return Math.round(sum / cards.length)
}

export function isLive(mission: DockMission | null): mission is DockMission {
  return mission !== null && mission.finishedAt === null
}

export function badgeText(mission: DockMission | null, size: number): string {
  if (mission === null || mission.cards.length === 0) {
    return `◆ Dock · team of ${size}`
  }
  const tally = counts(mission.cards)
  const parts = [`${tally.working} working`, `${tally.queued} queued`, `${tally.done} done`]
  if (tally.stuck > 0) {
    parts.push(`${tally.stuck} stuck`)
  }

  return parts.join(' · ')
}

export type CountFile = { working: number; queued: number; done: number; stuck: number; job: string; updatedAt: number }

// What the status line reads for this session; null while no helper runs.
export function countFile(mission: DockMission | null, now: number): CountFile | null {
  if (mission === null) {
    return null
  }
  const tally = counts(mission.cards)
  if (tally.working + tally.queued === 0) {
    return null
  }

  return { working: tally.working, queued: tally.queued, done: tally.done, stuck: tally.stuck, job: mission.job, updatedAt: now }
}

// The global folder the status line reads, beside Claude Code's own settings.
export function countDir(configDir: string | undefined, home: string | undefined): string | null {
  const base = configDir !== undefined && configDir !== '' ? configDir : home !== undefined && home !== '' ? `${home}/.claude` : null

  return base === null ? null : `${base.replace(/\/+$/, '')}/agent-dock/agents-now`
}

export function countPath(dir: string, sessionId: string): string {
  return `${dir}/${sessionId.replace(/[^A-Za-z0-9._-]/g, '_')}.json`
}

// 72_000 → "1:12"
export function formatClock(ms: number): string {
  const seconds = Math.max(0, Math.floor(ms / 1000))
  const minutes = Math.floor(seconds / 60)

  return `${minutes}:${String(seconds % 60).padStart(2, '0')}`
}

// 134_000 → "2m 14s"
export function formatDuration(ms: number): string {
  const seconds = Math.max(0, Math.floor(ms / 1000))
  if (seconds < 60) {
    return `${seconds}s`
  }
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) {
    return `${minutes}m ${seconds % 60}s`
  }

  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`
}

export function summary(mission: DockMission): string {
  const total = mission.cards.length
  const stuck = counts(mission.cards).stuck
  const took = formatDuration((mission.finishedAt ?? mission.startedAt) - mission.startedAt)
  const line = `${total} ${total === 1 ? 'agent' : 'agents'} finished ${mission.job} in ${took}`

  return stuck > 0 ? `${line} (${stuck} got stuck)` : line
}

export function cardTime(card: DockCard, now: number): string {
  if (card.startedAt === null) {
    return '0:00'
  }

  return formatClock((card.finishedAt ?? now) - card.startedAt)
}

export function newMission(id: string, job: string, size: number, now: number): DockMission {
  return { id, job, size, cards: [], hasNudged: false, startedAt: now, finishedAt: null }
}

export function newCard(id: string, description: string, index: number): DockCard {
  const task = taskName(description)

  return {
    id,
    task,
    initials: initials(task),
    colorIndex: index % BADGE_COLORS.length,
    status: 'queued',
    percent: 0,
    hasReported: false,
    agentId: null,
    isBackground: null,
    startedAt: null,
    finishedAt: null,
  }
}

// At a team size above 1 no card is drawn past the size: those calls are refused.
export function withQueued(
  mission: DockMission,
  calls: ReadonlyArray<{ id: string; description: string }>,
  cap: number | null,
): DockMission {
  const cards = [...mission.cards]
  for (const call of calls) {
    if (cards.some(card => card.id === call.id) || (cap !== null && cards.length >= cap)) {
      continue
    }
    cards.push(newCard(call.id, call.description, cards.length))
  }

  return { ...mission, cards }
}

export function withCard(mission: DockMission, id: string, change: (card: DockCard) => DockCard): DockMission {
  return { ...mission, cards: mission.cards.map(card => (card.id === id ? change(card) : card)) }
}

export function withAgent(mission: DockMission, agentId: string, change: (card: DockCard) => DockCard): DockMission {
  return { ...mission, cards: mission.cards.map(card => (card.agentId === agentId ? change(card) : card)) }
}

// Helpers the engine reports finished whose own turn.complete never reached the dock.
export function reconciled(mission: DockMission, statuses: ReadonlyMap<string, string>, now: number): DockMission {
  const cards = mission.cards.map(card => {
    const status = card.status === 'working' && card.agentId !== null ? statuses.get(card.agentId) : undefined
    if (status === 'completed') {
      return ended(card, 'done', now)
    }

    return status === 'failed' || status === 'killed' ? ended(card, 'stuck', now) : card
  })

  return { ...mission, cards }
}

// The agent statuses that hold one of Claude Code's subagent slots.
export const ACTIVE_STATUSES = new Set(['running', 'pending', 'waiting'])

export function hasActiveHelper(mission: DockMission, statuses: ReadonlyMap<string, string>): boolean {
  return mission.cards.some(card => !isFinished(card.status) && card.agentId !== null && ACTIVE_STATUSES.has(statuses.get(card.agentId) ?? ''))
}

// Closes a mission the engine has no helper running for, so a missed finish
// never leaves the next request unsplit. A helper that started and is gone
// counts as done; one that never started counts as stuck.
export function closedOut(mission: DockMission, statuses: ReadonlyMap<string, string>, now: number): DockMission | null {
  const settled = reconciled(mission, statuses, now)
  const cards = settled.cards.map(card =>
    isFinished(card.status) ? card : ended(card, card.status === 'working' && card.agentId !== null ? 'done' : 'stuck', now),
  )

  return cards.length === 0 ? null : { ...settled, cards, finishedAt: now }
}

export function withoutCard(mission: DockMission, id: string): DockMission {
  return { ...mission, cards: mission.cards.filter(card => card.id !== id) }
}

export function started(card: DockCard, now: number): DockCard {
  return card.status === 'queued' ? { ...card, status: 'working', startedAt: now } : card
}

export function ended(card: DockCard, status: 'done' | 'stuck', now: number): DockCard {
  if (isFinished(card.status)) {
    return card
  }

  return { ...card, status, percent: status === 'done' ? 100 : card.percent, startedAt: card.startedAt ?? now, finishedAt: now }
}

export function reported(card: DockCard, percent: number): DockCard {
  return isFinished(card.status) ? card : { ...card, percent, hasReported: true }
}

export function clampPercent(value: unknown): number {
  const percent = Number(value)

  return Number.isFinite(percent) ? Math.round(Math.min(100, Math.max(0, percent))) : 0
}

// The main turn ended: a mission whose helpers have all finished is complete,
// and one that never launched a helper goes back to standing by.
export function afterMainTurn(mission: DockMission, isAborted: boolean, now: number): DockMission | null {
  const cards = isAborted ? mission.cards.map(card => (card.status === 'queued' ? ended(card, 'stuck', now) : card)) : mission.cards
  if (cards.length === 0) {
    return null
  }

  return cards.every(card => isFinished(card.status)) ? { ...mission, cards, finishedAt: now } : { ...mission, cards }
}

export function spaced(text: string): string {
  return text
    .split(' ')
    .map(word => [...word].join(' '))
    .join('   ')
}

// A color run along a gradient: `cells` cells split into up to `steps` runs.
export function gradientRuns(cells: number, from: string, to: string, steps = 8): Array<{ cells: number; color: string }> {
  if (cells <= 0) {
    return []
  }
  const runs = Math.min(steps, cells)
  const out: Array<{ cells: number; color: string }> = []
  let used = 0
  for (let run = 0; run < runs; run++) {
    const end = Math.round(((run + 1) * cells) / runs)
    out.push({ cells: end - used, color: mix(from, to, runs === 1 ? 0 : run / (runs - 1)) })
    used = end
  }

  return out
}

export function mix(from: string, to: string, at: number): string {
  const a = rgb(from)
  const b = rgb(to)
  const channel = (index: number) =>
    Math.round(a[index]! + (b[index]! - a[index]!) * at)
      .toString(16)
      .padStart(2, '0')

  return `#${channel(0)}${channel(1)}${channel(2)}`
}

function rgb(hex: string): [number, number, number] {
  const value = parseInt(hex.slice(1), 16)

  return [(value >> 16) & 255, (value >> 8) & 255, value & 255]
}

export type MeterPart = { text: string; color: string }

// Cells of one meter: done in coral to gold, a reported percent in green, a
// three-cell sweep while a helper has not reported yet, a hairline queued.
export function meter(card: DockCard, cells: number, frame: number): MeterPart[] {
  if (cells <= 0) {
    return []
  }
  if (card.status === 'queued') {
    return [{ text: '─'.repeat(cells), color: HAIRLINE }]
  }
  if (card.status === 'done') {
    return gradientRuns(cells, CORAL, GOLD, 4).map(run => ({ text: '━'.repeat(run.cells), color: run.color }))
  }
  if (card.status === 'stuck') {
    const filled = Math.max(1, Math.round((card.percent / 100) * cells))
    return [
      { text: '━'.repeat(filled), color: RED },
      { text: '─'.repeat(cells - filled), color: HAIRLINE },
    ]
  }
  if (!card.hasReported) {
    const width = Math.min(3, cells)
    const start = (frame % (cells + width)) - width
    const parts: MeterPart[] = []
    for (let cell = 0; cell < cells; cell++) {
      const isLit = cell >= start && cell < start + width
      parts.push({ text: isLit ? '━' : '─', color: isLit ? GREEN : HAIRLINE })
    }
    return merge(parts)
  }
  const filled = Math.round((card.percent / 100) * cells)

  return merge([
    { text: '━'.repeat(filled), color: GREEN },
    { text: '─'.repeat(cells - filled), color: HAIRLINE },
  ])
}

// The mission bar: finished helpers sweep coral to gold, working ones
// shimmer green, the rest is a hairline.
export function missionBar(cards: readonly DockCard[], cells: number, frame: number): MeterPart[] {
  if (cells <= 0) {
    return []
  }
  const tally = counts(cards)
  const total = Math.max(1, tally.total)
  const finished = Math.round(((tally.done + tally.stuck) / total) * cells)
  const working = Math.min(cells - finished, Math.round((tally.working / total) * cells))
  const parts: MeterPart[] = gradientRuns(finished, CORAL, GOLD).map(run => ({ text: '━'.repeat(run.cells), color: run.color }))
  const glint = working > 0 ? frame % working : -1
  for (let cell = 0; cell < working; cell++) {
    parts.push({ text: '━', color: cell === glint ? GREEN_LIGHT : GREEN })
  }
  parts.push({ text: '─'.repeat(cells - finished - working), color: HAIRLINE })

  return merge(parts.filter(part => part.text !== ''))
}

function merge(parts: MeterPart[]): MeterPart[] {
  const out: MeterPart[] = []
  for (const part of parts) {
    const last = out[out.length - 1]
    if (last !== undefined && last.color === part.color) {
      last.text += part.text
    } else if (part.text !== '') {
      out.push({ ...part })
    }
  }

  return out
}

export function cardsPerRow(columns: number): number {
  return columns >= 98 ? 3 : columns >= 64 ? 2 : 1
}

export function tilesPerRow(columns: number, tileWidth: number): number {
  return Math.max(1, Math.floor((columns + 1) / (tileWidth + 1)))
}

export function rows<T>(items: readonly T[], perRow: number): T[][] {
  const out: T[][] = []
  for (let at = 0; at < items.length; at += perRow) {
    out.push(items.slice(at, at + perRow))
  }

  return out
}

// The idle row: one seat per team member, up to 25, in a fixed shimmer of
// bright and soft seats (no clock runs while idle).
export function seats(size: number): Array<{ color: string; isSoft: boolean }> {
  return Array.from({ length: Math.min(size, MAX_SEATS) }, (_, index) => ({
    color: BADGE_COLORS[index % BADGE_COLORS.length]!,
    isSoft: (index * 7) % 5 < 2,
  }))
}

export function standingBy(size: number): [string, string] {
  return [
    `Your team of ${size} is standing by`,
    size === 1 ? 'Send a request and Claude decides how many helpers to use.' : `Send a request and it splits across ${size} helpers.`,
  ]
}
