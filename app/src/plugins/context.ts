import { derived } from 'svelte/store'
import { channel } from '../lib/channel'
import { OVERLAY_SETTINGS_CHANNEL, parseOverlaySettings } from '../lib/settings/overlays'
import { ticking } from '../lib/session/clock'
import { session, sessionCommands } from '../lib/session/store'
import { logProblem } from '../lib/log'
import type { PluginContext } from './types'

const TICK_MS = 100

// Overlays have no error banner: a failed command is recorded in the debug log.
const run = (command: Exclude<keyof typeof sessionCommands, 'advance'>) =>
  void sessionCommands[command]().catch((e) => logProblem(`session ${command}`, String(e)))

/** How long a new overlay waits for the saved look before showing the defaults (the manager hasn't sent one). */
export const SETTINGS_WAIT_MS = 300

/**
 * Builds the context handed to a plugin. `ready` settles once the overlay's look is known, so the
 * host mounts the plugin with its saved settings and doesn't flash the defaults first.
 */
export function createPluginContext(): PluginContext & { ready: Promise<void> } {
  // `undefined` until Rust answers; `parseOverlaySettings` turns that into the defaults.
  const look = channel<unknown>(OVERLAY_SETTINGS_CHANNEL, undefined)
  const ready = new Promise<void>((resolve) => {
    let stop = () => {}
    const done = () => {
      clearTimeout(timer)
      stop()
      resolve()
    }
    const timer = setTimeout(done, SETTINGS_WAIT_MS)
    stop = look.subscribe((v) => {
      if (v !== undefined) queueMicrotask(done)
    })
  })
  return {
    ready,
    now: ticking(TICK_MS),
    // Sent by the manager (store.ts) over Rust; parsed again here, as it crosses a window boundary.
    settings: derived(look, parseOverlaySettings),
    session,
    talk: derived(session, (s) => s?.talk ?? null),
    commands: {
      next: () => run('next'),
      previous: () => run('previous'),
      togglePause: () => run('togglePause'),
      end: () => run('end'),
      advance: (from) => void sessionCommands.advance(from).catch((e) => logProblem('session advance', String(e))),
    },
  }
}
