import type { OverlaySettings } from '../lib/settings/overlays'
import type { OverlayWindowSize } from '../lib/windows'
import type { OverlayPlugin } from './types'
import { timeline } from './timeline'
import { talkingPoints } from './talking-points'
import { flashcard } from './flashcard'

/** All built-in plugins. Adding one means adding its module and one entry here. */
export const plugins: readonly OverlayPlugin[] = [timeline, talkingPoints, flashcard]

export function getPlugin(id: string): OverlayPlugin | undefined {
  return plugins.find((plugin) => plugin.id === id)
}

/** The window an overlay opens in for the saved look (the Timeline's depends on its style). */
export function overlayWindow(plugin: OverlayPlugin, look: OverlaySettings): OverlayWindowSize {
  return plugin.windowFor?.(look) ?? plugin.window
}

/** The overlays that open for this look: Ready to start opens these, and the Get ready page lists them. */
export function overlaysFor(look: OverlaySettings): OverlayPlugin[] {
  return plugins.filter((plugin) => plugin.opensWith?.(look) ?? true)
}

/** Where a plugin shows for this look, or null when its name says enough. */
export function whereShown(plugin: OverlayPlugin, look: OverlaySettings): string | null {
  return plugin.shownAs?.(look) || null
}

/** The overlays to show or hide when the look changes during a session: only those whose answer changed. */
export function overlayChanges(before: OverlaySettings, after: OverlaySettings): { id: string; show: boolean }[] {
  const was = new Set(overlaysFor(before).map((p) => p.id))
  const now = new Set(overlaysFor(after).map((p) => p.id))
  return plugins.filter((p) => was.has(p.id) !== now.has(p.id)).map((p) => ({ id: p.id, show: now.has(p.id) }))
}
