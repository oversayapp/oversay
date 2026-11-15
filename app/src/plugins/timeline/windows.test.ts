import { describe, expect, it } from 'vitest'
import { DEFAULT_OVERLAY_SETTINGS, TIMELINE_STYLE_OPTIONS } from '../../lib/settings/overlays'
import { TIMELINE_WINDOWS, timelineWindow } from './windows'
import { timeline } from './index'

describe('Timeline windows', () => {
  it('has a window for every style, named for it', () => {
    for (const { id } of TIMELINE_STYLE_OPTIONS) {
      expect(TIMELINE_WINDOWS[id].layout).toBe(id)
      expect(TIMELINE_WINDOWS[id].width).toBeGreaterThanOrEqual(TIMELINE_WINDOWS[id].minWidth ?? 0)
      expect(TIMELINE_WINDOWS[id].height).toBeGreaterThanOrEqual(TIMELINE_WINDOWS[id].minHeight ?? 0)
    }
  })

  it('gives each shape its own place along the bottom', () => {
    // Clear of Talking Points and the flashcard widget, both at the top left.
    expect(timelineWindow('waveform')).toMatchObject({ width: 1100, height: 200, minWidth: 640, minHeight: 200, place: 'bottom-centre' })
    expect(timelineWindow('strip').place).toBe('bottom-strip')
  })

  it('is what the plugin asks for, by the saved style', () => {
    expect(timeline.windowFor?.({ ...DEFAULT_OVERLAY_SETTINGS, timelineStyle: 'strip' })).toEqual(timelineWindow('strip'))
    expect(timeline.window).toEqual(timelineWindow('waveform'))
  })
})

describe('the strip against the screen or the dock', () => {
  it('keeps to the screen edge by default and above the dock when asked', () => {
    expect(timelineWindow('strip').against).toBe('screen')
    expect(timelineWindow('strip', 'dock').against).toBe('work-area')
    expect(timelineWindow('waveform', 'dock').against).toBeUndefined()
  })
})
