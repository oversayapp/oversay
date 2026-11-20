import type { Readable } from 'svelte/store'
import type { SessionState } from '../lib/session/clock'
import type { Talk } from '../lib/project/types'
import type { OverlaySettings } from '../lib/settings/overlays'
import type { OverlayWindowSize } from '../lib/windows'

/**
 * A built-in overlay module (spec §6). Each plugin gets its own overlay window
 * and renders into it; the session state it shows is owned elsewhere.
 */
export interface OverlayPlugin {
  /** Lowercase words joined by hyphens, e.g. `talking-points`. Also the window label suffix. */
  id: string
  name: string
  /** One line for the Start session dialog: what the overlay shows. */
  description: string
  /** Initial window size; users can resize, and the size is remembered. The minimum (if any) is what the plugin needs to fit. */
  window: OverlayWindowSize
  /** The window for the current look, when it depends on it (the deck widget's view, ADR 0042); `window` otherwise. */
  windowFor?(look: OverlaySettings): OverlayWindowSize
  /** Render into `target`; returns a function that tears it down. */
  mount(target: HTMLElement, ctx: PluginContext): () => void
}

/** What a plugin can see and do (spec §6). Plugins read the session through here, never by importing stores directly. */
export interface PluginContext {
  /** The talk being presented, or null when no session is open. */
  talk: Readable<Talk | null>
  /** Milliseconds since the epoch, ticking about 10 times a second. */
  now: Readable<number>
  /** The open session, or null; `sessionClock` (lib/session/clock.ts) turns it into times. */
  session: Readable<SessionState | null>
  /** Drive the session, like the hotkeys. */
  commands: {
    next(): void
    previous(): void
    togglePause(): void
    end(): void
    /** A deck's card `from` has run its time: the next card, if it is still showing (Auto-advance). */
    advance(from: number): void
  }
  /** How overlays look (Settings › Overlays, 007/02): changing one updates an open overlay without reopening it. */
  settings: Readable<OverlaySettings>
}
