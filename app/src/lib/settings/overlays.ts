// How the overlays look, chosen in Settings › Overlays (007/02) and saved in settings.json under
// `overlays`. Overlays are separate windows, so the manager sends the parsed choices to them over
// the `overlay-settings` state channel (src-tauri/src/overlay.rs) and they read it through
// `PluginContext.settings`.

/** The state channel carrying `OverlaySettings`. Same name as `SETTINGS_CHANNEL` in overlay.rs. */
export const OVERLAY_SETTINGS_CHANNEL = 'overlay-settings'

/** Sent to the manager by the hotkey and menu item for the next style. Same name as `CYCLE_STYLE_EVENT` in overlay.rs. */
export const CYCLE_TIMELINE_STYLE_EVENT = 'cycle-timeline-style'


// Each choice is listed once, with the label Settings shows; the types and the parser come from it.

// Waveform (ADR 0029) is the default: a white line on black, or black on white with the
// Light panel. Decks replaced the other styles (ADR 0036): Blocks, Clock card, Side rail and
// One card are gone, and a saved one reads as the Waveform.
export const TIMELINE_STYLE_OPTIONS = [
  { id: 'waveform', label: 'Waveform' },
  { id: 'strip', label: 'Edge strip' },
] as const
export type TimelineStyle = (typeof TIMELINE_STYLE_OPTIONS)[number]['id']

export const BUTTON_OPTIONS = [
  { id: 'always', label: 'Always shown' },
  { id: 'hover', label: 'On hover' },
  { id: 'hidden', label: 'Hidden' },
] as const
export type ButtonVisibility = (typeof BUTTON_OPTIONS)[number]['id']


export const STRIP_EDGE_OPTIONS = [
  { id: 'screen', label: 'The edge of the screen' },
  { id: 'dock', label: 'Above the Dock or taskbar' },
] as const
export type StripEdge = (typeof STRIP_EDGE_OPTIONS)[number]['id']


// How the panels look (the Get ready page and the control panel): one look for every talk
// and every note. Talking Points, Waveform and Blocks each have a dark and a light version.
export const PANEL_OPTIONS = [
  { id: 'dark', label: 'Dark' },
  { id: 'light', label: 'Light' },
] as const
export type PanelColour = (typeof PANEL_OPTIONS)[number]['id']

export const TEXT_SIZE_OPTIONS = [
  { id: 's', label: 'S' },
  { id: 'm', label: 'M' },
  { id: 'l', label: 'L' },
] as const
export type TextSize = (typeof TEXT_SIZE_OPTIONS)[number]['id']

export const LAYOUT_OPTIONS = [
  { id: 'topic', label: 'This part' },
  { id: 'all', label: 'Every part' },
] as const
/** What Talking Points shows: the current part, or every part with the current one open. */
export type PointsLayout = (typeof LAYOUT_OPTIONS)[number]['id']

// The deck widget's two views (ADR 0042): the current card, or every card's bar along the bottom.
// Which one shows now: a deck always starts in the Card view (John, 7 Nov), and the switch changes it.
export const DECK_VIEW_OPTIONS = [
  { id: 'card', label: 'Card view' },
  { id: 'agenda', label: 'Agenda view' },
] as const
export type DeckView = (typeof DECK_VIEW_OPTIONS)[number]['id']


export interface OverlaySettings {
  timelineStyle: TimelineStyle
  buttons: ButtonVisibility
  /** Where the edge strip sits: against the screen's edge or above the Dock. */
  stripEdge: StripEdge
  /** How solid the overlay panels are, in percent (task 145): only their fill fades, never the text. */
  opacity: number
  /** Made solid (now from the control panel); `opacity` is kept for going back to see-through. */
  solid: boolean
  /** Dark, or light for a dark slide: Talking Points, Waveform and Blocks follow it. */
  panel: PanelColour
  /** Talking Points' text: small, medium or large. */
  textSize: TextSize
  /** Talking Points shows this part, or every part with this one open. */
  layout: PointsLayout
  /** The deck widget's view now; Show sets it back to the Card view (ADR 0042). */
  deckView: DeckView
}

export const DEFAULT_OVERLAY_SETTINGS: OverlaySettings = {
  timelineStyle: 'waveform',
  buttons: 'always',
  stripEdge: 'screen',
  // The deck widget starts see-through at 75% (ADR 0042); Solid is a choice.
  opacity: 75,
  solid: false,
  panel: 'dark',
  textSize: 'm',
  layout: 'topic',
  deckView: 'card',
}

/** The lowest overlay opacity: below it the muted text is poor over a bright slide. */
export const MIN_OVERLAY_OPACITY = 40

/** The lowest with the Waveform style: its one colour needs at least half its opposite behind it. */
export const MIN_WAVEFORM_OPACITY = 50

/** The lowest opacity for this look: Waveform stops at half, the other styles at 40%. */
export const minOpacity = (look: Pick<OverlaySettings, 'timelineStyle'>): number => (look.timelineStyle === 'waveform' ? MIN_WAVEFORM_OPACITY : MIN_OVERLAY_OPACITY)

/** The opacity the slider shows: a saved value under this look's lowest is drawn at the lowest. */
export const shownOpacity = (look: Pick<OverlaySettings, 'timelineStyle' | 'opacity'>): number => Math.max(minOpacity(look), look.opacity)


/** The style after `current`, back to the first after the last. */
export function nextTimelineStyle(current: TimelineStyle): TimelineStyle {
  const styles = TIMELINE_STYLE_OPTIONS.map((o) => o.id)
  return styles[(styles.indexOf(current) + 1) % styles.length]
}


/** How solid the panels are drawn, 0 to 1: `--panel-alpha` in overlay.css. */
export const panelAlpha = (look: OverlaySettings): number => (look.solid ? 1 : shownOpacity(look) / 100)

/**
 * Sent to the manager, which owns the saved settings, by an overlay's ⋯ menu and by the darker
 * and lighter hotkeys. Same name as `OPACITY_EVENT` in overlay.rs.
 */
export const OVERLAY_OPACITY_EVENT = 'overlay-opacity'

/**
 * Sent to the manager by the control panel (ADR 0028) when it changes one setting of the look:
 * `{ key, value }`. Same name as `LOOK_EVENT` in src-tauri/src/control_panel.rs.
 */
export const CONTROL_PANEL_LOOK_EVENT = 'control-panel-look'

/** Sent to the manager, which owns the saved settings, by the deck widget's switch: the view it went to (ADR 0042). */
export const DECK_VIEW_EVENT = 'deck-view'

/** The view the switch asked for, or null when the event isn't one (it is checked, not trusted). */
export const checkDeckView = (value: unknown): DeckView | null => DECK_VIEW_OPTIONS.find((o) => o.id === value)?.id ?? null

/** One change to the look: a setting and its value; `opacityPreview` while the slider moves, `opacity` when it is let go. */
export type LookChange = { key: keyof OverlaySettings | 'opacityPreview'; value: unknown }

/** A change as it can be applied, or null when it isn't one (the panel's event is checked, not trusted). */
export function checkLookChange(change: unknown): LookChange | null {
  if (typeof change !== 'object' || change === null) return null
  const { key, value } = change as { key?: unknown; value?: unknown }
  if (key === 'opacityPreview' || key === 'opacity') return typeof value === 'number' && Number.isFinite(value) ? { key, value } : null
  if (key === 'solid') return typeof value === 'boolean' ? { key, value } : null
  if (typeof key !== 'string' || !(key in DEFAULT_OVERLAY_SETTINGS)) return null
  // A value the parser keeps is a valid one.
  const parsed = parseOverlaySettings({ [key]: value }) as unknown as Record<string, unknown>
  return parsed[key] === value ? { key: key as keyof OverlaySettings, value } : null
}
export const OPACITY_CHANGES = ['darker', 'lighter', 'solid', 'see-through'] as const
export type OpacityChange = (typeof OPACITY_CHANGES)[number]

/** What one change does: darker and lighter step by 5 from what is shown, and leave solid. */
export function changeOpacity(look: OverlaySettings, change: OpacityChange): Pick<OverlaySettings, 'opacity' | 'solid'> {
  if (change === 'solid') return { opacity: look.opacity, solid: true }
  if (change === 'see-through') return { opacity: look.opacity, solid: false }
  const shown = look.solid ? 100 : shownOpacity(look)
  const opacity = Math.min(100, Math.max(minOpacity(look), shown + (change === 'darker' ? 5 : -5)))
  return { opacity, solid: false }
}

type Option<T extends string> = { readonly id: T }

const pick = <T extends string>(options: readonly Option<T>[], value: unknown, fallback: T): T =>
  options.find((o) => o.id === value)?.id ?? fallback

const asObject = (value: unknown): Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : {}

/** Missing or unexpected values fall back to the defaults, field by field. */
export function parseOverlaySettings(value: unknown): OverlaySettings {
  const o = asObject(value)
  const d = DEFAULT_OVERLAY_SETTINGS
  return {
    // A removed style (Blocks, Clock card, Side rail, One card) reads as the default.
    timelineStyle: pick(TIMELINE_STYLE_OPTIONS, o.timelineStyle, d.timelineStyle),
    buttons: pick(BUTTON_OPTIONS, o.buttons, d.buttons),
    stripEdge: pick(STRIP_EDGE_OPTIONS, o.stripEdge, d.stripEdge),
    // Missing or unusable: the default, see-through since the deck widget (ADR 0042).
    solid: typeof o.solid === 'boolean' ? o.solid : d.solid,
    panel: pick(PANEL_OPTIONS, o.panel, d.panel),
    textSize: pick(TEXT_SIZE_OPTIONS, o.textSize, d.textSize),
    layout: pick(LAYOUT_OPTIONS, o.layout, d.layout),
    deckView: pick(DECK_VIEW_OPTIONS, o.deckView, d.deckView),
    opacity: typeof o.opacity === 'number' && Number.isFinite(o.opacity) ? Math.round(Math.min(100, Math.max(MIN_OVERLAY_OPACITY, o.opacity))) : d.opacity,
  }
}

/**
 * The saved choices that are valid, as they will be written back: what Settings shows is then
 * what the file says, and a value that isn't usable (an unbuilt style) is dropped, not kept.
 */
export function cleanOverlays(value: unknown): Partial<OverlaySettings> {
  const o = asObject(value)
  const parsed = parseOverlaySettings(o)
  const clean: Partial<OverlaySettings> = {}
  for (const key of Object.keys(parsed) as (keyof OverlaySettings)[]) {
    // A number out of range (a hand-edited opacity) is kept as Settings shows it, not dropped.
    const kept = o[key] === parsed[key] || (typeof o[key] === 'number' && Number.isFinite(o[key]) && typeof parsed[key] === 'number')
    if (kept) (clean as Record<string, unknown>)[key] = parsed[key]
  }
  return clean
}
