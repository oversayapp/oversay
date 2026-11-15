import { describe, expect, it } from 'vitest'
import { DEFAULT_SETTINGS, isReadable, parseSettings, serializeSettings } from './settings'

describe('parseSettings', () => {
  it('uses the defaults when there is no file', () => {
    expect(parseSettings(null)).toEqual(DEFAULT_SETTINGS)
  })

  it('falls back to System for broken or unknown values', () => {
    expect(parseSettings('not json').appearance).toBe('system')
    expect(parseSettings('[]').appearance).toBe('system')
    expect(parseSettings('{"appearance":"purple"}').appearance).toBe('system')
  })

  it('reads a saved appearance', () => {
    expect(parseSettings('{"version":1,"appearance":"dark"}').appearance).toBe('dark')
  })

  it('keeps fields it does not know about through a save', () => {
    const settings = parseSettings('{"version":1,"appearance":"light","futureThing":[1,2]}')
    expect(JSON.parse(serializeSettings({ ...settings, appearance: 'dark' }))).toEqual({
      version: 1,
      appearance: 'dark',
      futureThing: [1, 2],
      overlays: { timelineStyle: 'waveform', panel: 'dark', opacity: 75, solid: false },
      waveformMoved: true,
      seeThroughMoved: true,
    })
  })
})

describe('moving everyone to the waveform once', () => {
  const read = (overlays: object, extra = {}) => parseSettings(JSON.stringify({ version: 1, appearance: 'system', overlays, seeThroughMoved: true, ...extra }))

  it('moves a saved style to the waveform, made solid, keeps the panel, and marks the move', () => {
    const s = read({ timelineStyle: 'clock', panel: 'dark', opacity: 60, solid: false, textSize: 'l' })
    expect(s.overlays).toEqual({ timelineStyle: 'waveform', panel: 'dark', opacity: 60, solid: true, textSize: 'l' })
    expect(s.waveformMoved).toBe(true)
    expect(read({ panel: 'light', solid: false }).overlays).toEqual({ timelineStyle: 'waveform', panel: 'light', solid: true })
  })

  it('reads a panel saved as Minimal, the first try at this look, as Dark and drops its mark', () => {
    const s = read({ timelineStyle: 'wave', panel: 'minimal', solid: true }, { minimalMoved: true })
    expect(s.overlays).toEqual({ timelineStyle: 'waveform', panel: 'dark', solid: true })
    expect(s.minimalMoved).toBeUndefined()
  })

  it('keeps a style chosen after the move', () => {
    expect(read({ timelineStyle: 'wave', solid: false }, { waveformMoved: true }).overlays).toEqual({ timelineStyle: 'wave', solid: false })
  })

  it('needs no move for a new settings file', () => {
    expect(parseSettings(null).waveformMoved).toBe(true)
    expect(parseSettings(null).overlays).toBeUndefined()
  })
})

describe('making everyone see-through at 75% once (ADR 0042)', () => {
  const read = (overlays: object, extra = {}) => parseSettings(JSON.stringify({ version: 1, appearance: 'system', waveformMoved: true, overlays, ...extra }))

  it('makes a solid or other opacity see-through at 75%, keeps the rest, and marks the move', () => {
    const s = read({ timelineStyle: 'waveform', panel: 'light', opacity: 70, solid: true, textSize: 'l' })
    expect(s.overlays).toEqual({ timelineStyle: 'waveform', panel: 'light', opacity: 75, solid: false, textSize: 'l' })
    expect(s.seeThroughMoved).toBe(true)
  })

  it('keeps a choice made after the move', () => {
    expect(read({ opacity: 60, solid: true }, { seeThroughMoved: true }).overlays).toEqual({ opacity: 60, solid: true })
  })

  it('needs no move for a new settings file', () => {
    expect(parseSettings(null).seeThroughMoved).toBe(true)
  })
})

describe('isReadable', () => {
  it('is true for no file or a settings object, false for anything else', () => {
    expect(isReadable(null)).toBe(true)
    expect(isReadable('{"version":1,"appearance":"dark"}')).toBe(true)
    expect(isReadable('{"version":1,')).toBe(false)
    expect(isReadable('[1,2]')).toBe(false)
    expect(isReadable('"dark"')).toBe(false)
  })
})
