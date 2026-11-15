import { describe, expect, it } from 'vitest'
import { getPlugin, overlayChanges, overlaysFor, plugins, whereShown } from './registry'
import { DEFAULT_OVERLAY_SETTINGS, type OverlaySettings, type TimelineStyle } from '../lib/settings/overlays'
import { isValidPluginId } from '../lib/windows'

describe('plugin registry', () => {
  it('finds plugins by id', () => {
    expect(getPlugin('timeline')?.name).toBe('Timeline')
    expect(getPlugin('talking-points')?.name).toBe('Talking Points')
  })

  it('returns undefined for unknown ids', () => {
    expect(getPlugin('does-not-exist')).toBeUndefined()
  })

  it('has unique ids that are valid window label suffixes', () => {
    const ids = plugins.map((p) => p.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const id of ids) expect(isValidPluginId(id)).toBe(true)
  })
})

describe('which overlays open for a look', () => {
  const look = (timelineStyle: TimelineStyle): OverlaySettings => ({ ...DEFAULT_OVERLAY_SETTINGS, timelineStyle })

  it('opens the Timeline and Talking Points for a talk, whichever style', () => {
    expect(overlaysFor(look('waveform')).map((p) => p.id)).toEqual(['timeline', 'talking-points'])
    expect(overlaysFor(look('strip')).map((p) => p.id)).toEqual(['timeline', 'talking-points'])
  })

  it('says where the notes will be', () => {
    expect(whereShown(getPlugin('talking-points')!, look('strip'))).toBe('its own overlay, top left')
    expect(whereShown(getPlugin('timeline')!, look('waveform'))).toBeNull()
  })

  it('shows or hides nothing when the style changes', () => {
    expect(overlayChanges(look('waveform'), look('strip'))).toEqual([])
  })
})
