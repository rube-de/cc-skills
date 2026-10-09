// Shared by Clean View and the Agent Dock, so a percent and a duration read
// the same on every surface.

export function clampPercent(value: unknown): number {
  const percent = Number(value)

  return Number.isFinite(percent) ? Math.round(Math.min(100, Math.max(0, percent))) : 0
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
