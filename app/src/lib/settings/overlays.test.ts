import { describe, expect, it } from 'vitest'
import {
  CYCLE_TIMELINE_STYLE_EVENT,
  DEFAULT_OVERLAY_SETTINGS,
  OVERLAY_SETTINGS_CHANNEL,
  checkDeckView,
  cleanOverlays,
  nextTimelineStyle,
  panelAlpha,
  PANEL_OPTIONS,
  TIMELINE_STYLE_OPTIONS,
  minOpacity,
  shownOpacity,
  changeOpacity,
  OVERLAY_OPACITY_EVENT,
  OPACITY_CHANGES,
  type OverlaySettings,
  parseOverlaySettings,
} from './overlays'
import { parseSettings, serializeSettings } from './settings'

describe('parseOverlaySettings', () => {
  it('defaults to the waveform with its buttons always shown', () => {
    expect(parseOverlaySettings(undefined)).toEqual({
      timelineStyle: 'waveform',
      buttons: 'always',
      stripEdge: 'screen',
      opacity: 75,
      solid: false,
      panel: 'dark',
      textSize: 'm',
      layout: 'topic',
      deckView: 'card',
    })
    expect(parseOverlaySettings(null)).toEqual(DEFAULT_OVERLAY_SETTINGS)
    expect(parseOverlaySettings([1])).toEqual(DEFAULT_OVERLAY_SETTINGS)
    expect(parseOverlaySettings('wave')).toEqual(DEFAULT_OVERLAY_SETTINGS)
  })

  it('reads saved choices', () => {
    expect(parseOverlaySettings({ timelineStyle: 'strip', buttons: 'hover', stripEdge: 'dock' })).toEqual({
      timelineStyle: 'strip',
      buttons: 'hover',
      stripEdge: 'dock',
      opacity: 75,
      solid: false,
      panel: 'dark',
      textSize: 'm',
      layout: 'topic',
      deckView: 'card',
    })
  })

  it('reads the deck widget\'s view last used, and falls back to the Card view', () => {
    expect(parseOverlaySettings({ deckView: 'agenda' }).deckView).toBe('agenda')
    expect(parseOverlaySettings({ deckView: 'wave' }).deckView).toBe('card')
  })

  it('takes only a known view from the switch', () => {
    expect(checkDeckView('agenda')).toBe('agenda')
    expect(checkDeckView('card')).toBe('card')
    expect(checkDeckView('wave')).toBeNull()
    expect(checkDeckView({ view: 'card' })).toBeNull()
  })

  it('falls back field by field for unknown values', () => {
    expect(parseOverlaySettings({ stripEdge: 'left', buttons: 'hidden' })).toEqual({
      ...DEFAULT_OVERLAY_SETTINGS,
      buttons: 'hidden',
    })
  })

  it('reads the Talking Points look, and falls back for unknown values', () => {
    expect(parseOverlaySettings({ panel: 'light', textSize: 'l', layout: 'all' })).toMatchObject({ panel: 'light', textSize: 'l', layout: 'all' })
    expect(parseOverlaySettings({ panel: 'dark' }).panel).toBe('dark')
    expect(parseOverlaySettings({ panel: 'blue', textSize: 'xl', layout: 'some' })).toMatchObject({ panel: 'dark', textSize: 'm', layout: 'topic' })
    // A panel saved as Minimal, the first try at the waveform's look, reads as Dark.
    expect(parseOverlaySettings({ panel: 'minimal' }).panel).toBe('dark')
  })

  it('reads the two styles left, and a removed one as the waveform', () => {
    for (const style of ['waveform', 'strip']) expect(parseOverlaySettings({ timelineStyle: style }).timelineStyle).toBe(style)
    for (const style of ['wave', 'clock', 'rail', 'card']) expect(parseOverlaySettings({ timelineStyle: style }).timelineStyle).toBe('waveform')
  })

  it('drops the options that went with the removed styles, without an error', () => {
    const read = parseOverlaySettings({ talkIndicator: 'ring', buttonEdge: 'top', notes: 'timeline', buttons: 'hover' }) as unknown as Record<string, unknown>
    expect(read.talkIndicator).toBeUndefined()
    expect(read.buttonEdge).toBeUndefined()
    expect(read.notes).toBeUndefined()
    expect(read.buttons).toBe('hover')
  })

  it('shows the waveform for a style that is not known (or not built)', () => {
    expect(parseOverlaySettings({ timelineStyle: 'nonsense' }).timelineStyle).toBe('waveform')
    expect(parseOverlaySettings({ timelineStyle: 3 }).timelineStyle).toBe('waveform')
  })

  it('is kept through the settings file', () => {
    const saved = serializeSettings({ version: 1, appearance: 'dark', overlays: { buttons: 'hidden' } })
    expect(parseOverlaySettings(parseSettings(saved).overlays).buttons).toBe('hidden')
  })
})

describe('cleanOverlays', () => {
  it('keeps only the valid, usable choices', () => {
    expect(cleanOverlays({ timelineStyle: 'strip', talkIndicator: 'ring', buttons: 'nope', extra: 1 })).toEqual({ timelineStyle: 'strip' })
    expect(cleanOverlays({ timelineStyle: 'rail', buttons: 'hover' })).toEqual({ buttons: 'hover' })
    expect(cleanOverlays(undefined)).toEqual({})
  })
})

describe('OVERLAY_SETTINGS_CHANNEL', () => {
  it('names the channel as Rust does', () => {
    // Same value as settings_channel_matches_the_frontend in src-tauri/src/overlay.rs.
    expect(OVERLAY_SETTINGS_CHANNEL).toBe('overlay-settings')
  })
})

describe('nextTimelineStyle', () => {
  it('goes between the waveform and the edge strip', () => {
    expect(nextTimelineStyle('waveform')).toBe('strip')
    expect(nextTimelineStyle('strip')).toBe('waveform')
  })

  it('uses the same event name as overlay.rs', () => {
    expect(CYCLE_TIMELINE_STYLE_EVENT).toBe('cycle-timeline-style')
  })
})

describe('overlay opacity', () => {
  it('is 75% unless saved, where the deck widget starts (ADR 0042)', () => {
    expect(DEFAULT_OVERLAY_SETTINGS.opacity).toBe(75)
    expect(parseOverlaySettings({ opacity: 55 }).opacity).toBe(55)
  })

  it('reads an unknown value as 75% and keeps a saved one between 40% and 100%', () => {
    expect(parseOverlaySettings({ opacity: 'dim' }).opacity).toBe(75)
    expect(parseOverlaySettings({ opacity: Number.NaN }).opacity).toBe(75)
    expect(parseOverlaySettings({ opacity: 10 }).opacity).toBe(40)
    expect(parseOverlaySettings({ opacity: 140 }).opacity).toBe(100)
    expect(parseOverlaySettings({ opacity: 62.6 }).opacity).toBe(63)
  })
})

describe('changing the opacity from an overlay or a hotkey', () => {
  // The edge strip goes down to 40%; the waveform stops at 50% (below).
  const at = (opacity: number, solid = false): OverlaySettings => ({ ...DEFAULT_OVERLAY_SETTINGS, timelineStyle: 'strip', opacity, solid })

  it('is see-through unless made solid; a missing or unusable value is the default, see-through', () => {
    expect(parseOverlaySettings({ panel: 'dark', solid: true }).solid).toBe(true)
    expect(parseOverlaySettings({ panel: 'dark' }).solid).toBe(false)
    expect(parseOverlaySettings({ solid: 'yes' }).solid).toBe(false)
    expect(panelAlpha(at(60))).toBe(0.6)
    expect(panelAlpha(at(60, true))).toBe(1)
  })

  it('makes it solid and back to the saved see-through', () => {
    expect(changeOpacity(at(60), 'solid')).toEqual({ opacity: 60, solid: true })
    expect(changeOpacity(at(60, true), 'see-through')).toEqual({ opacity: 60, solid: false })
  })

  it('steps darker and lighter by 5, between 40% and 100%, leaving solid', () => {
    expect(changeOpacity(at(78), 'darker')).toEqual({ opacity: 83, solid: false })
    expect(changeOpacity(at(78), 'lighter')).toEqual({ opacity: 73, solid: false })
    expect(changeOpacity(at(98), 'darker')).toEqual({ opacity: 100, solid: false })
    expect(changeOpacity(at(42), 'lighter')).toEqual({ opacity: 40, solid: false })
    // From solid, lighter starts at full and thins.
    expect(changeOpacity(at(60, true), 'lighter')).toEqual({ opacity: 95, solid: false })
  })

  it('names the event and its changes as Rust does', () => {
    // Same as OPACITY_EVENT and OPACITY_CHANGES in overlay.rs.
    expect(OVERLAY_OPACITY_EVENT).toBe('overlay-opacity')
    expect(OPACITY_CHANGES).toEqual(['darker', 'lighter', 'solid', 'see-through'])
  })

  it('keeps a hand-edited opacity as Settings shows it, so the next save does not lose it', () => {
    expect(cleanOverlays({ opacity: 30 }).opacity).toBe(40)
    expect(cleanOverlays({ opacity: 62.6 }).opacity).toBe(63)
    expect(cleanOverlays({ opacity: 'dim' }).opacity).toBeUndefined()
  })
})

describe('the waveform style', () => {
  const waveform = (opacity: number, solid = false): OverlaySettings => ({ ...DEFAULT_OVERLAY_SETTINGS, timelineStyle: 'waveform', opacity, solid })

  it('is the first style and the default, before the edge strip; the panel is Dark or Light, see-through at 75% (ADR 0042)', () => {
    expect(TIMELINE_STYLE_OPTIONS.map((o) => o.label)).toEqual(['Waveform', 'Edge strip'])
    expect(DEFAULT_OVERLAY_SETTINGS.timelineStyle).toBe('waveform')
    expect(PANEL_OPTIONS.map((o) => o.id)).toEqual(['dark', 'light'])
    expect(DEFAULT_OVERLAY_SETTINGS.panel).toBe('dark')
    expect(DEFAULT_OVERLAY_SETTINGS.solid).toBe(false)
    expect(panelAlpha(DEFAULT_OVERLAY_SETTINGS)).toBe(0.75)
  })

  it('goes no lower than 50%, where the edge strip goes to 40%', () => {
    expect(minOpacity(waveform(78))).toBe(50)
    expect(minOpacity({ timelineStyle: 'strip' })).toBe(40)
    expect(changeOpacity(waveform(52), 'lighter')).toEqual({ opacity: 50, solid: false })
    expect(changeOpacity(waveform(50), 'lighter')).toEqual({ opacity: 50, solid: false })
  })

  it('draws a saved opacity under 50% at 50%, and keeps it for the edge strip', () => {
    expect(shownOpacity(waveform(40))).toBe(50)
    expect(panelAlpha(waveform(40))).toBe(0.5)
    expect(shownOpacity({ timelineStyle: 'strip', opacity: 40 })).toBe(40)
    expect(changeOpacity(waveform(40), 'darker')).toEqual({ opacity: 55, solid: false })
  })
})

describe('checkLookChange', () => {
  it('accepts valid changes and refuses anything else', async () => {
    const { checkLookChange } = await import('./overlays')
    expect(checkLookChange({ key: 'panel', value: 'light' })).toEqual({ key: 'panel', value: 'light' })
    expect(checkLookChange({ key: 'timelineStyle', value: 'strip' })).toEqual({ key: 'timelineStyle', value: 'strip' })
    expect(checkLookChange({ key: 'timelineStyle', value: 'rail' })).toBeNull()
    expect(checkLookChange({ key: 'opacity', value: 60 })).toEqual({ key: 'opacity', value: 60 })
    expect(checkLookChange({ key: 'solid', value: true })).toEqual({ key: 'solid', value: true })
    expect(checkLookChange({ key: 'panel', value: 'blue' })).toBeNull()
    expect(checkLookChange({ key: 'nope', value: 1 })).toBeNull()
    expect(checkLookChange({ key: 'opacity', value: 'x' })).toBeNull()
    expect(checkLookChange(null)).toBeNull()
  })
})
