// Showing and hiding overlays during a session, from the live view.
// Overlays are hidden rather than closed (ADR 0002), so "open" means visible.
import { getAllWindows } from '@tauri-apps/api/window'
import { get } from 'svelte/store'
import { logAction } from '../log'
import { OVERLAY_LABEL_PREFIX, closeOverlay, openOverlay } from '../windows'
import { overlayChanges, overlayWindow, plugins } from '../../plugins/registry'
import { overlaySettings } from '../settings/store'
import type { OverlaySettings } from '../settings/overlays'
import { logProblem } from '../log'
import { session } from './store'

/** The plugin ids of the overlays showing now. */
export async function visibleOverlays(): Promise<Set<string>> {
  const overlays = (await getAllWindows()).filter((w) => w.label.startsWith(OVERLAY_LABEL_PREFIX))
  const visible = await Promise.all(overlays.map((w) => w.isVisible()))
  return new Set(overlays.filter((_, i) => visible[i]).map((w) => w.label.slice(OVERLAY_LABEL_PREFIX.length)))
}

export async function setOverlay(id: string, show: boolean, look: OverlaySettings = get(overlaySettings)): Promise<void> {
  const plugin = plugins.find((p) => p.id === id)
  if (!plugin) return
  logAction(show ? 'show overlay' : 'hide overlay', id)
  if (show) await openOverlay(id, plugin.name, overlayWindow(plugin, look))
  else await closeOverlay(id)
}

/**
 * While a session is open, an overlay that opens only for some looks follows a change of look
 * straight away: choosing style F hides Talking Points and leaving it shows it again, where it was
 * (ADR 0024). Returns the unsubscribe.
 */
export function followLook(): () => void {
  let before = get(overlaySettings)
  return overlaySettings.subscribe((look) => {
    const changes = overlayChanges(before, look)
    before = look
    // A shown note has only its Talking Points, and a deck its flashcard widget, whatever the look.
    if (!get(session) || get(session)?.note || get(session)?.deck) return
    for (const { id, show } of changes) setOverlay(id, show).catch((e) => logProblem('overlay follows look', String(e)))
  })
}
