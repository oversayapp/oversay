import { describe, expect, it } from 'vitest'
import {
  DEFAULT_OVERLAY_SETTINGS,
  checkLookChange,
  autoRecordOf,
  MIN_OVERLAY_OPACITY,
  OVERLAY_SETTINGS_CHANNEL,
  cleanOverlays,
  panelAlpha,
  PANEL_OPTIONS,
  changeOpacity,
  OVERLAY_OPACITY_EVENT,
  OPACITY_CHANGES,
  type OverlaySettings,
  parseOverlaySettings,
} from './overlays'
import { parseSettings, serializeSettings } from './settings'

describe('parseOverlaySettings', () => {
  it('defaults to a dark deck widget, see-through at 75%, in the Card view', () => {
    expect(parseOverlaySettings(undefined)).toEqual({ opacity: 75, solid: false, panel: 'dark', deckView: 'card', oneColour: false })
    expect(parseOverlaySettings(null)).toEqual(DEFAULT_OVERLAY_SETTINGS)
    expect(parseOverlaySettings([1])).toEqual(DEFAULT_OVERLAY_SETTINGS)
    expect(parseOverlaySettings('wave')).toEqual(DEFAULT_OVERLAY_SETTINGS)
  })

  it('reads the deck widget\'s view last used, and falls back to the Card view', () => {
    expect(parseOverlaySettings({ deckView: 'agenda' }).deckView).toBe('agenda')
    expect(parseOverlaySettings({ deckView: 'wave' }).deckView).toBe('card')
  })

  it('reads Auto record from what the manager sends with the look', () => {
    expect(autoRecordOf({ opacity: 60, autoRecord: true })).toBe(true)
    expect(autoRecordOf({ autoRecord: 1 })).toBe(false)
    expect(autoRecordOf(null)).toBe(false)
  })

  it('reads the single-colour choice, off unless saved on', () => {
    expect(parseOverlaySettings({ oneColour: true }).oneColour).toBe(true)
    expect(parseOverlaySettings({ oneColour: 'yes' }).oneColour).toBe(false)
    expect(checkLookChange({ key: 'oneColour', value: true })).toEqual({ key: 'oneColour', value: true })
    expect(checkLookChange({ key: 'oneColour', value: 1 })).toBeNull()
  })

  it('reads the panel, and falls back for unknown values', () => {
    expect(parseOverlaySettings({ panel: 'light' }).panel).toBe('light')
    expect(parseOverlaySettings({ panel: 'blue' }).panel).toBe('dark')
    // A panel saved as Minimal, the first try at the waveform's look, reads as Dark.
    expect(parseOverlaySettings({ panel: 'minimal' }).panel).toBe('dark')
  })

  it('ignores what was saved for the Timeline and for Talking Points (Control Panel v2, epic 030)', () => {
    const old = { timelineStyle: 'strip', buttons: 'hover', stripEdge: 'dock', textSize: 'l', layout: 'all', talkIndicator: 'ring', panel: 'light', opacity: 60 }
    expect(parseOverlaySettings(old)).toEqual({ opacity: 60, solid: false, panel: 'light', deckView: 'card', oneColour: false })
  })

  it('is kept through the settings file', () => {
    const saved = serializeSettings({ version: 1, appearance: 'dark', overlays: { panel: 'light' } })
    expect(parseOverlaySettings(parseSettings(saved).overlays).panel).toBe('light')
  })
})

describe('cleanOverlays', () => {
  it('keeps only the valid, usable choices', () => {
    expect(cleanOverlays({ panel: 'light', deckView: 'nope', extra: 1 })).toEqual({ panel: 'light' })
    expect(cleanOverlays(undefined)).toEqual({})
  })

  it('drops the Timeline\'s and Talking Points\' old choices when the look is next written', () => {
    const old = { timelineStyle: 'waveform', buttons: 'always', stripEdge: 'screen', textSize: 'm', layout: 'topic', panel: 'dark', opacity: 50, solid: true }
    expect(cleanOverlays(old)).toEqual({ panel: 'dark', opacity: 50, solid: true })
  })
})

describe('OVERLAY_SETTINGS_CHANNEL', () => {
  it('names the channel as Rust does', () => {
    // Same value as settings_channel_matches_the_frontend in src-tauri/src/overlay.rs.
    expect(OVERLAY_SETTINGS_CHANNEL).toBe('overlay-settings')
  })
})

describe('overlay opacity', () => {
  it('is 75% unless saved, where the deck widget starts (ADR 0042)', () => {
    expect(DEFAULT_OVERLAY_SETTINGS.opacity).toBe(75)
    expect(parseOverlaySettings({ opacity: 55 }).opacity).toBe(55)
  })

  it('reads an unknown value as 75% and keeps a saved one between 40% and 100%', () => {
    expect(MIN_OVERLAY_OPACITY).toBe(40)
    expect(parseOverlaySettings({ opacity: 'dim' }).opacity).toBe(75)
    expect(parseOverlaySettings({ opacity: Number.NaN }).opacity).toBe(75)
    expect(parseOverlaySettings({ opacity: 10 }).opacity).toBe(40)
    expect(parseOverlaySettings({ opacity: 140 }).opacity).toBe(100)
    expect(parseOverlaySettings({ opacity: 62.6 }).opacity).toBe(63)
  })

  it('draws a saved 40% at 40%: the Waveform\'s 50% floor went with the Waveform', () => {
    // A look saved while the Waveform was the style (its timelineStyle is ignored now).
    const look = parseOverlaySettings({ timelineStyle: 'waveform', opacity: 40 })
    expect(panelAlpha(look)).toBe(0.4)
    expect(changeOpacity(look, 'lighter')).toEqual({ opacity: 40, solid: false })
  })
})

describe('changing the opacity from the Look card, the menu or a hotkey', () => {
  const at = (opacity: number, solid = false): OverlaySettings => ({ ...DEFAULT_OVERLAY_SETTINGS, opacity, solid })

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

  it('has a Dark and a Light panel, Dark first and the default', () => {
    expect(PANEL_OPTIONS.map((o) => o.id)).toEqual(['dark', 'light'])
    expect(DEFAULT_OVERLAY_SETTINGS.panel).toBe('dark')
  })
})

describe('checkLookChange', () => {
  it('accepts valid changes and refuses anything else', async () => {
    const { checkLookChange } = await import('./overlays')
    expect(checkLookChange({ key: 'panel', value: 'light' })).toEqual({ key: 'panel', value: 'light' })
    // The Timeline's style and Talking Points' text size are gone (Control Panel v2).
    expect(checkLookChange({ key: 'timelineStyle', value: 'strip' })).toBeNull()
    expect(checkLookChange({ key: 'textSize', value: 'l' })).toBeNull()
    expect(checkLookChange({ key: 'opacity', value: 60 })).toEqual({ key: 'opacity', value: 60 })
    expect(checkLookChange({ key: 'solid', value: true })).toEqual({ key: 'solid', value: true })
    expect(checkLookChange({ key: 'panel', value: 'blue' })).toBeNull()
    // The card's Auto record switch.
    expect(checkLookChange({ key: 'autoRecord', value: true })).toEqual({ key: 'autoRecord', value: true })
    expect(checkLookChange({ key: 'autoRecord', value: 'yes' })).toBeNull()
    // The menu's Card view / Agenda view.
    expect(checkLookChange({ key: 'deckView', value: 'agenda' })).toEqual({ key: 'deckView', value: 'agenda' })
    expect(checkLookChange({ key: 'deckView', value: 'wave' })).toBeNull()
    expect(checkLookChange({ key: 'nope', value: 1 })).toBeNull()
    expect(checkLookChange({ key: 'opacity', value: 'x' })).toBeNull()
    expect(checkLookChange(null)).toBeNull()
  })
})
