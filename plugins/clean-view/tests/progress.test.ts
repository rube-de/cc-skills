import { describe, expect, test } from 'claude-code/testing'

import { clampPercent, formatDuration } from '../hooks/progress'

describe('progress', () => {
  test('formatDuration reads seconds, then minutes, then hours', () => {
    expect(formatDuration(-5_000)).toBe('0s')
    expect(formatDuration(59_999)).toBe('59s')
    expect(formatDuration(134_000)).toBe('2m 14s')
    expect(formatDuration(3_599_000)).toBe('59m 59s')
    expect(formatDuration(3_725_000)).toBe('1h 2m')
  })

  test('clampPercent rounds into 0 to 100 and reads junk as 0', () => {
    expect(clampPercent(42.6)).toBe(43)
    expect(clampPercent('75')).toBe(75)
    expect(clampPercent(140)).toBe(100)
    expect(clampPercent(-3)).toBe(0)
    for (const junk of [undefined, null, 'lots', Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(clampPercent(junk)).toBe(0)
    }
  })
})
