import type { ChatEffort } from '../types'

// What the Toolbox's model config rows need with no `$`: which model families
// to offer, how to name the one running, and what /model and /effort take.

export const FAMILIES = ['haiku', 'sonnet', 'opus', 'fable'] as const
export type Family = (typeof FAMILIES)[number]

export const EFFORTS: readonly ChatEffort[] = ['low', 'medium', 'high', 'xhigh', 'max']
type Effort = ChatEffort

const LONG_CONTEXT = '[1m]'

export function isEffort(value: unknown): value is Effort {
  return typeof value === 'string' && (EFFORTS as readonly string[]).includes(value)
}

/** The families the `/config` model row offers, in the Toolbox's order; none when there is no row. */
export function offeredFamilies(options: readonly string[] | undefined): Family[] {
  if (options === undefined) {
    return []
  }

  return FAMILIES.filter(family => options.includes(family))
}

/** "claude-opus-5-5[1m]" → opus; null for a model outside the four families. */
export function familyOf(modelId: string): Family | null {
  const match = /^claude-([a-z]+)-/.exec(modelId)
  const family = match?.[1]

  return FAMILIES.find(known => known === family) ?? null
}

/** "claude-opus-5-5[1m]" → "Opus 5.5 · 1M"; the id itself when it reads otherwise. */
export function modelLabel(modelId: string): string {
  const match = /^claude-([a-z]+)-(\d+)(?:-(\d+))?/.exec(modelId)
  if (match === null) {
    return modelId
  }
  const [, family = '', major, minor] = match
  const name = `${family.charAt(0).toUpperCase()}${family.slice(1)} ${minor === undefined ? major : `${major}.${minor}`}`

  return modelId.endsWith(LONG_CONTEXT) ? `${name} · 1M` : name
}

/** What /model takes for a family: the 1M-context alias when the chat runs on one and the row offers it. */
export function modelArgs(family: Family, currentModelId: string, options: readonly string[]): string {
  const longAlias = `${family}${LONG_CONTEXT}`

  return currentModelId.endsWith(LONG_CONTEXT) && options.includes(longAlias) ? longAlias : family
}

const TOAST_MAX = 80

/** A command's refusal as a toast: its first line with words, clipped; the fallback when it said nothing. */
export function refusal(text: string | undefined, fallback: string): string {
  const line = (text ?? '').split('\n').map(part => part.trim()).find(part => part !== '') ?? ''
  if (line === '') {
    return fallback
  }

  return line.length > TOAST_MAX ? `${line.slice(0, TOAST_MAX - 1)}…` : line
}

/**
 * Whether /effort took the level, judged by what its run answered. An
 * interactive run hands back no text, its line goes to the chat, so only
 * words that are not the confirmation count as a refusal.
 */
export function effortTaken(text: string | undefined): boolean {
  return text === undefined || text.trim() === '' || /effort level to/i.test(text)
}

/** `/effort ultracode [on|off]` as asked: true for on (bare turns it on), false for off, null for any other /effort. */
export function ultracodeAsked(args: string): boolean | null {
  const [first, second] = args.trim().toLowerCase().split(/\s+/)
  if (first !== 'ultracode') {
    return null
  }

  return second !== 'off'
}

/** Whether `/effort ultracode` took, judged as effortTaken is. */
export function ultracodeTaken(text: string | undefined): boolean {
  return text === undefined || text.trim() === '' || /ultracode (on|off)/i.test(text)
}

/** The effort settings.json gives this model before any turn says otherwise. */
export function effortFromSettings(settings: Readonly<Record<string, unknown>>, modelId: string): Effort | null {
  const base = modelId.replace(LONG_CONTEXT, '')
  const perModel = settings.modelSettings
  const own =
    typeof perModel === 'object' && perModel !== null
      ? (perModel as Record<string, { effortLevel?: unknown } | undefined>)[base]?.effortLevel
      : undefined
  if (isEffort(own)) {
    return own
  }

  return isEffort(settings.effortLevel) ? settings.effortLevel : null
}
