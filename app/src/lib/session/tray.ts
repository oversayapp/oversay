// The time beside the session's menu-bar/tray icon (006/08), kept up to date by the manager.
import { invoke } from '@tauri-apps/api/core'
import { formatElapsed, segmentReadout, sessionClock, type SessionState } from './clock'
import type { Readable } from 'svelte/store'
import { session } from './store'

/** Short enough for the menu bar: Ready, Paused, time left, +time over, or time so far (↑). */
export function trayTitle(s: SessionState, now: number): string {
  if (s.status === 'ready') return 'Ready'
  if (s.status === 'finished') return 'Done'
  if (s.paused) return 'Paused'
  const readout = segmentReadout(sessionClock(s, now))
  if (!readout) return ''
  const time = formatElapsed(readout.seconds)
  return readout.mode === 'so-far' ? `${time} ↑` : readout.mode === 'over' ? `+${time}` : time
}

/** Updates the icon's text every second while a session is open; returns a function that stops. */
export function syncTrayTitle(source: Readable<SessionState | null> = session): () => void {
  let latest: SessionState | null = null
  let shown = ''
  const stop = source.subscribe((s) => {
    latest = s
    // The icon goes when the session is over; the next session's icon starts with no text.
    if (!s || s.status === 'finished') shown = ''
  })
  const timer = setInterval(() => {
    // The control panel's preview isn't a run: the icon keeps no time for it.
    if (!latest || latest.status === 'finished' || latest.preview) return
    const title = trayTitle(latest, Date.now())
    if (title === shown) return
    shown = title
    void invoke('set_tray_title', { title }).catch(() => {})
  }, 1000)
  return () => {
    stop()
    clearInterval(timer)
  }
}
