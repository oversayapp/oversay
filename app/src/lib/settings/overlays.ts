// How the overlays look, chosen in Settings › Overlays (007/02) and saved in settings.json under
// `overlays`. Overlays are separate windows, so the manager sends the parsed choices to them over
// the `overlay-settings` state channel (src-tauri/src/overlay.rs) and they read it through
// `PluginContext.settings`.

/** The state channel carrying `OverlaySettings`. Same name as `SETTINGS_CHANNEL` in overlay.rs. */
export const OVERLAY_SETTINGS_CHANNEL = 'overlay-settings'

// How the deck widget's panel looks (the Look card, the menu and Settings): dark, or light for a dark slide.
export const PANEL_OPTIONS = [
  { id: 'dark', label: 'Dark' },
  { id: 'light', label: 'Light' },
] as const
export type PanelColour = (typeof PANEL_OPTIONS)[number]['id']

// The deck widget's two views (ADR 0042): the current card, or every card's bar along the bottom.
// Which one shows now: a deck always starts in the Card view (John, 7 Nov), and the switch changes it.
export const DECK_VIEW_OPTIONS = [
  { id: 'card', label: 'Card view' },
  { id: 'agenda', label: 'Agenda view' },
] as const
export type DeckView = (typeof DECK_VIEW_OPTIONS)[number]['id']


// The Timeline's style, its buttons and edge, and Talking Points' text size and Shows went with
// Control Panel v2 (epic 030): a deck has only the deck widget (ADR 0042), which never read them.
// A saved one is ignored when read, and dropped the next time the look is written (cleanOverlays).
export interface OverlaySettings {
  /** How solid the overlay panels are, in percent (task 145): only their fill fades, never the text. */
  opacity: number
  /** Made solid (the Look card or the menu); `opacity` is kept for going back to see-through. */
  solid: boolean
  /** Dark, or light for a dark slide: the deck widget follows it. */
  panel: PanelColour
  /** The deck widget's view now; Show sets it back to the Card view (ADR 0042). */
  deckView: DeckView
  /** Every card and agenda block in the panel's ink, whatever the deck's own colour choice says. */
  oneColour: boolean
}

export const DEFAULT_OVERLAY_SETTINGS: OverlaySettings = {
  // The deck widget starts see-through at 75% (ADR 0042); Solid is a choice.
  opacity: 75,
  solid: false,
  panel: 'dark',
  deckView: 'card',
  oneColour: false,
}

/** The lowest overlay opacity: below it the muted text is poor over a bright slide. */
export const MIN_OVERLAY_OPACITY = 40

/** How solid the panels are drawn, 0 to 1: `--panel-alpha` in overlay.css. */
export const panelAlpha = (look: OverlaySettings): number => (look.solid ? 1 : look.opacity / 100)

/**
 * Sent to the manager, which owns the saved settings, by an overlay's ⋯ menu and by the darker
 * and lighter hotkeys. Same name as `OPACITY_EVENT` in overlay.rs.
 */
export const OVERLAY_OPACITY_EVENT = 'overlay-opacity'

/**
 * Sent to the manager by the Look card and the menu (ADR 0051) when they change one setting of the look:
 * `{ key, value }`. Same name as `LOOK_EVENT` in src-tauri/src/control_panel.rs.
 */
export const CONTROL_PANEL_LOOK_EVENT = 'control-panel-look'

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
  const shown = look.solid ? 100 : look.opacity
  const opacity = Math.min(100, Math.max(MIN_OVERLAY_OPACITY, shown + (change === 'darker' ? 5 : -5)))
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
    // Missing or unusable: the default, see-through since the deck widget (ADR 0042).
    solid: typeof o.solid === 'boolean' ? o.solid : d.solid,
    panel: pick(PANEL_OPTIONS, o.panel, d.panel),
    deckView: pick(DECK_VIEW_OPTIONS, o.deckView, d.deckView),
    oneColour: typeof o.oneColour === 'boolean' ? o.oneColour : d.oneColour,
    opacity: typeof o.opacity === 'number' && Number.isFinite(o.opacity) ? Math.round(Math.min(100, Math.max(MIN_OVERLAY_OPACITY, o.opacity))) : d.opacity,
  }
}

/**
 * The saved choices that are valid, as they will be written back: what Settings shows is then
 * what the file says, and a value that isn't usable (a removed Timeline style) is dropped, not kept.
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
