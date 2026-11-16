import { describe, expect, it } from 'vitest'
import { DEFAULT_SETTINGS } from '../settings/settings'
import { applyOutcome, idleView, startupCheckDue, updateSettings, type Outcome } from './policy'

const now = new Date('2026-12-01T12:00:00Z')
const hoursAgo = (h: number) => new Date(now.getTime() - h * 3600e3).toISOString()
const available: Outcome = { state: 'available', kind: 'installer', release: { version: '0.3.0', notes: 'Faster', date: null, page: null } }

describe('the wire shape', () => {
  it('reads what Rust sends (updates.rs has the same literal)', () => {
    const sent = JSON.parse('{"state":"available","release":{"version":"0.3.0","notes":"Faster","date":null,"page":null},"kind":"linkOnly"}') as Outcome
    expect(applyOutcome(idleView, sent, false).found).toEqual({ version: '0.3.0', notes: 'Faster', date: null, page: null, kind: 'linkOnly' })
    expect(applyOutcome(idleView, JSON.parse('{"state":"upToDate"}') as Outcome, true).message).toMatch(/up to date/i)
  })
})

describe('update settings', () => {
  it('check automatically at every start until changed', () => {
    expect(updateSettings(DEFAULT_SETTINGS)).toEqual({ auto: true, everyHours: 0 })
    expect(updateSettings({ ...DEFAULT_SETTINGS, updates: { auto: false, everyHours: 6 } })).toEqual({ auto: false, everyHours: 6 })
  })
  it('ignore values that are not usable', () => {
    expect(updateSettings({ ...DEFAULT_SETTINGS, updates: { auto: 'no', everyHours: -3 } as never })).toEqual({ auto: true, everyHours: 0 })
  })
})

describe('the start-up check', () => {
  const on = true
  const daily = { ...DEFAULT_SETTINGS, updates: { everyHours: 24 } }
  it('runs at every start by default, however recently it last checked', () => {
    expect(startupCheckDue(DEFAULT_SETTINGS, now, on)).toBe(true)
    expect(startupCheckDue({ ...DEFAULT_SETTINGS, lastUpdateCheck: hoursAgo(0.1) }, now, on)).toBe(true)
  })
  it('with an interval set, runs when never checked or the last check is older', () => {
    expect(startupCheckDue(daily, now, on)).toBe(true)
    expect(startupCheckDue({ ...daily, lastUpdateCheck: hoursAgo(25) }, now, on)).toBe(true)
  })
  it('with an interval set, waits when checked within it', () => {
    expect(startupCheckDue({ ...daily, lastUpdateCheck: hoursAgo(3) }, now, on)).toBe(false)
  })
  it('never runs with automatic checking off, or in a build with no feed', () => {
    expect(startupCheckDue({ ...DEFAULT_SETTINGS, updates: { auto: false } }, now, on)).toBe(false)
    expect(startupCheckDue(DEFAULT_SETTINGS, now, false)).toBe(false)
  })
  it('treats a last check in the future as due, so a wrong clock cannot stop checks for good', () => {
    expect(startupCheckDue({ ...DEFAULT_SETTINGS, lastUpdateCheck: hoursAgo(-48) }, now, on)).toBe(true)
  })
})

describe('what a check leaves on screen', () => {
  it('shows an available update', () => {
    const v = applyOutcome(idleView, available, false)
    expect(v.found?.version).toBe('0.3.0')
    expect(v.message).toBeNull()
  })
  it('says nothing at start-up when offline or up to date', () => {
    expect(applyOutcome(idleView, { state: 'unreachable' }, false).message).toBeNull()
    expect(applyOutcome(idleView, { state: 'upToDate' }, false).message).toBeNull()
  })
  it('says so plainly when asked by hand', () => {
    expect(applyOutcome(idleView, { state: 'unreachable' }, true).message).toMatch(/couldn.t reach/i)
    expect(applyOutcome(idleView, { state: 'upToDate' }, true).message).toMatch(/up to date/i)
  })
  it('an unreachable feed keeps an update already found', () => {
    const found = applyOutcome(idleView, available, false)
    expect(applyOutcome(found, { state: 'unreachable' }, false).found?.version).toBe('0.3.0')
  })
  it('a busy check changes nothing at start-up, and says why by hand', () => {
    const found = applyOutcome(idleView, available, false)
    expect(applyOutcome(found, { state: 'busy' }, false)).toEqual(found)
    expect(applyOutcome(found, { state: 'busy' }, true).message).toMatch(/session/i)
    expect(applyOutcome(found, { state: 'busy' }, true).found?.version).toBe('0.3.0')
  })
  it('up to date clears an update that is no longer offered', () => {
    const found = applyOutcome(idleView, available, false)
    expect(applyOutcome(found, { state: 'upToDate' }, false).found).toBeNull()
  })
})
