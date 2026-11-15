import { describe, expect, it } from 'vitest'
import { formatDuration, formatDifference, stepLength } from './duration'

describe('formatDuration', () => {
  it.each([
    [0, '0:00'],
    [5, '0:05'],
    [90, '1:30'],
    [600, '10:00'],
    [3725, '62:05'],
  ])('%i seconds is %s', (s, text) => expect(formatDuration(s)).toBe(text))

  it('rounds fractional seconds', () => expect(formatDuration(59.6)).toBe('1:00'))
})

describe('formatDifference', () => {
  it('signs the difference and says nothing when on target', () => {
    expect(formatDifference(100)).toBe('+1:40 over')
    expect(formatDifference(-90)).toBe('1:30 under')
    expect(formatDifference(0)).toBe('on target')
  })
})

import { parseDuration } from './duration'

describe('parseDuration', () => {
  it.each([
    ['3', 180], // a bare number is minutes
    ['90', 5400],
    ['0', 0],
    ['1:30', 90],
    ['01:05', 65],
    ['0:45', 45],
    ['62:05', 3725],
    ['1:02:03', 3723],
    ['1m30s', 90],
    ['2m', 120],
    ['45s', 45],
    ['1m 30s', 90],
    ['  1M30S ', 90],
  ])('%j is %i seconds', (text, seconds) => expect(parseDuration(text)).toBe(seconds))

  it.each(['', '  ', 'abc', '-5', '1:60', '1:5', '1.5', '1:30:', ':30', '1m30', '30s1m', '1h', '1:2:3:4', '1e3'])(
    '%j is not a duration',
    (text) => expect(parseDuration(text)).toBeNull(),
  )
})

describe('stepLength', () => {
  it('snaps a dragged or nudged length to 30 seconds, never below 30', () => {
    expect(stepLength(180, 40)).toBe(210) // 3:40 → the nearest step, 3:30
    expect(stepLength(180, 50)).toBe(240) // 3:50 → 4:00
    expect(stepLength(180, 10)).toBe(180)
    expect(stepLength(180, -30)).toBe(150)
    expect(stepLength(45, 0)).toBe(60) // an unsnapped length snaps on the first move
    expect(stepLength(60, -500)).toBe(30)
  })
})
