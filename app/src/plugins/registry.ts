import type { OverlaySettings } from '../lib/settings/overlays'
import type { OverlayWindowSize } from '../lib/windows'
import type { OverlayPlugin } from './types'
import { talkingPoints } from './talking-points'
import { flashcard } from './flashcard'

/** All built-in plugins. Adding one means adding its module and one entry here. */
export const plugins: readonly OverlayPlugin[] = [talkingPoints, flashcard]

export function getPlugin(id: string): OverlayPlugin | undefined {
  return plugins.find((plugin) => plugin.id === id)
}

/** The window an overlay opens in for the saved look (the deck widget's depends on its view). */
export function overlayWindow(plugin: OverlayPlugin, look: OverlaySettings): OverlayWindowSize {
  return plugin.windowFor?.(look) ?? plugin.window
}
