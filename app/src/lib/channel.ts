import { readable, type Readable } from 'svelte/store'
import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'

/** Asks a window's channels to fetch their current values. Same name as `RESYNC_EVENT` in state.rs. */
export const RESYNC_EVENT = 'state-resync'

/** A channel value as broadcast by the Rust state hub (src-tauri/src/state.rs). */
interface Versioned<T> {
  version: number
  value: T
}

/**
 * A read-only store for a Rust-owned state channel. On first subscribe it
 * listens for updates, then fetches the current value; whichever is newest
 * (by version) wins, so a late reply never overwrites a newer event.
 *
 * It fetches again whenever the window becomes visible: a hidden window (an overlay between
 * sessions, ADR 0002) can miss broadcasts while macOS suspends its page, and would otherwise
 * show stale state when it reappears (006/04 hands-on).
 */
export function channel<T>(name: string, initial: T): Readable<T> {
  return readable(initial, (set) => {
    let version = 0
    let stopped = false
    let unlisten: (() => void) | undefined

    const apply = (update: Versioned<T> | null | undefined) => {
      if (stopped || !update || update.version <= version) return
      version = update.version
      set(update.value)
    }
    const fetchCurrent = () => invoke<Versioned<T> | null>('state_get', { channel: name })

    listen<Versioned<T>>(`state:${name}`, (event) => apply(event.payload))
      .then((stop) => {
        if (stopped) stop()
        else unlisten = stop
        return fetchCurrent()
      })
      .then(apply)
      .catch((error) => console.error(`channel ${name}:`, error))

    const catchUp = () =>
      fetchCurrent()
        .then(apply)
        .catch((error) => console.error(`channel ${name}:`, error))
    const onVisible = () => {
      if (document.visibilityState === 'visible') void catchUp()
    }
    const page = typeof document === 'undefined' ? null : document
    page?.addEventListener('visibilitychange', onVisible)
    // Rust also says so when it shows a hidden overlay again (state::resync).
    let stopResync: (() => void) | undefined
    listen(RESYNC_EVENT, () => void catchUp())
      .then((stop) => {
        if (stopped) stop()
        else stopResync = stop
      })
      .catch(() => {})

    return () => {
      stopped = true
      unlisten?.()
      stopResync?.()
      page?.removeEventListener('visibilitychange', onVisible)
    }
  })
}
