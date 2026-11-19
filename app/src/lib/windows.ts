import { invoke } from '@tauri-apps/api/core'
import { channel } from './channel'
import { logAction } from './log'

/** The Look card's window (ADR 0051; it was the Control Panel's, ADR 0028). Same as `LABEL` in src-tauri/src/control_panel.rs. */
export const CONTROL_PANEL_LABEL = 'control-panel'

/** Sent to every window when the Look card opens (true) or closes (false). Same as `OPEN_EVENT` in control_panel.rs. */
export const CONTROL_PANEL_OPEN_EVENT = 'control-panel-open'

/** Opens the Look card, or closes it when it is open. */
export function toggleControlPanel(): Promise<void> {
  logAction('look card')
  return invoke('control_panel_toggle')
}

/** Overlay windows are labelled `overlay-<plugin id>` (see src-tauri/src/overlay.rs). */
export const OVERLAY_LABEL_PREFIX = 'overlay-'

/**
 * Plugin ids are lowercase words joined by single hyphens, e.g. `talking-points`.
 * Same rule as `is_valid_plugin_id` in src-tauri/src/overlay.rs.
 */
export function isValidPluginId(id: string): boolean {
  return /^[a-z0-9]+(-[a-z0-9]+)*$/.test(id)
}

/** The plugin id for an overlay window label, or null for any other window. */
export function overlayIdFromLabel(label: string): string | null {
  if (!label.startsWith(OVERLAY_LABEL_PREFIX)) return null
  const id = label.slice(OVERLAY_LABEL_PREFIX.length)
  return id === '' ? null : id
}

export interface OverlayWindowSize {
  width: number
  height: number
  /** The smallest the window may be; a remembered or reused window smaller than this is enlarged. */
  minWidth?: number
  minHeight?: number
  /** Where it opens when it has no remembered place (`Place` in src-tauri/src/overlay.rs); the middle when missing. */
  place?: 'centre' | 'bottom-centre' | 'bottom-right' | 'top-right' | 'top-left' | 'upper-left'
  /**
   * Names the overlay's layout (a deck widget view, ADR 0042): each layout keeps its own size and place,
   * and `setOverlayLayout` switches an open overlay between them.
   */
  layout?: string
}

/** The arguments of `open_overlay`: `size` is `WindowSize` in src-tauri/src/overlay.rs. */
export function openOverlayArgs(pluginId: string, title: string, size: OverlayWindowSize) {
  return { pluginId, title, size }
}

export function openOverlay(pluginId: string, title: string, size: OverlayWindowSize): Promise<void> {
  return invoke('open_overlay', openOverlayArgs(pluginId, title, size))
}

/** Gives an open overlay another layout's window without reopening it (the deck widget's view changed). */
export function setOverlayLayout(pluginId: string, size: OverlayWindowSize): Promise<void> {
  return invoke('set_overlay_layout', { pluginId, size })
}

/** Moves Talking Points back to its place if it is over or under an overlay with layouts (session start only). */
export function keepOverlaysApart(): Promise<void> {
  return invoke('keep_overlays_apart')
}

export function closeOverlay(pluginId: string): Promise<void> {
  return invoke('close_overlay', { pluginId })
}

/** Whether presenting windows are hidden from screen shares and recordings (default true). */
export const hiddenFromCapture = channel<boolean>('capture-hidden', true)

/** Sets the default for every presenting window (the overlays). */
export function setHiddenFromCapture(hidden: boolean): Promise<void> {
  logAction(hidden ? 'hide from screen sharing' : 'show in screen sharing')
  return invoke('set_hidden_from_capture', { hidden })
}

/** Hides or shows one window in screen shares without changing the default. */
export function setWindowHiddenFromCapture(label: string, hidden: boolean): Promise<void> {
  return invoke('set_window_hidden_from_capture', { label, hidden })
}
