// Record my voice (ADR 0041): while a deck runs, the Rust recorder (recorder.rs) can
// record this computer's microphone into the deck's recordings/, named as the session will be. With
// Settings › Recordings' Auto record on, the manager starts it at Start; off, the deck widget's
// record button does. Pause and Resume pause it, Stop ends it; the record button stops it and
// records again, adding to the run's recording. Every window hears each change as the `recording` event.

import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import { readable } from 'svelte/store'
import { logAction, logProblem } from '../log'
import { deckPathOf, readDeckSessions, sessionName } from '../decks/sessions'
import type { SessionState } from '../session/clock'
import { session as sessionStore } from '../session/store'

export const RECORDING_EVENT = 'recording'

export interface RecordingState {
  state: 'recording' | 'paused' | 'stopped' | 'refused' | 'failed'
  /** The deck's file and the session's name. */
  deck: string
  name: string
  why: string
}

/** The recording now, as the recorder last said; null when none has started in this window's life. */
export const recording = readable<RecordingState | null>(null, (set) => {
  invoke<RecordingState | null>('recording_state')
    .then((now) => now && set(now))
    .catch(() => {})
  const stop = listen<RecordingState>(RECORDING_EVENT, (e) => set(e.payload))
  return () => void stop.then((unlisten) => unlisten())
})

/** Whether the session can record: a deck's run, kept in its folder, and not a preview. */
export const canRecord = (s: SessionState | null): boolean => !!s?.deck && !s.preview && !!deckPathOf(s)

/** When the run started (its Start), or null before. */
const startOf = (s: SessionState): string | null => s.events.find((e) => e.type === 'start')?.at ?? null

/** What the follower does next for `s`, given the run it last saw, whether it is recording, and Auto record. */
export function nextStep(
  s: SessionState | null,
  seenRun: string | null,
  recordingNow: boolean,
  pausedNow: boolean,
  auto: boolean,
): 'start' | 'pause' | 'resume' | 'stop' | null {
  const run = s ? startOf(s) : null
  if (!s || s.status === 'finished' || !s.deck) return recordingNow ? 'stop' : null
  if (s.status === 'running' && run && run !== seenRun) return auto && canRecord(s) ? 'start' : null
  if (!recordingNow) return null
  if (s.paused && !pausedNow) return 'pause'
  if (!s.paused && pausedNow) return 'resume'
  return null
}

/**
 * Records the run `s` shows, as the session will be named; a recording of this run already there is
 * added to (recorder.rs). Paused at once if the deck is.
 */
export async function recordThisRun(s: SessionState): Promise<void> {
  const path = deckPathOf(s)
  const startedAt = startOf(s)
  if (!path || !startedAt) return
  const sessions = await readDeckSessions(path).catch(() => [])
  const run = { startedAt, endedAt: startedAt, cards: [] }
  const name = sessionName([...sessions, run], run)
  logAction('recording', `start ${name}`)
  await invoke('start_recording', { path, name })
  if (s.paused) await invoke('pause_recording', { paused: true })
}

/** The manager follows each deck's run with the recorder, starting it when `auto()` (Auto record). Returns what stops it following. */
export function followRecording(auto: () => boolean): () => void {
  let seenRun: string | null = null
  let active = false
  let paused = false
  const stopListening = listen<RecordingState>(RECORDING_EVENT, (e) => {
    active = e.payload.state === 'recording' || e.payload.state === 'paused'
    paused = e.payload.state === 'paused'
  })
  const stopFollowing = sessionStore.subscribe((s) => {
    const step = nextStep(s, seenRun, active, paused, auto())
    if (s && startOf(s)) seenRun = startOf(s)
    if (step === 'start' && s) {
      active = true
      recordThisRun(s).catch((e) => {
        active = false
        logProblem('recording not started', String(e))
      })
    } else if (step === 'pause' || step === 'resume') {
      paused = step === 'pause'
      invoke('pause_recording', { paused }).catch((e) => logProblem('recording not paused', String(e)))
    } else if (step === 'stop') {
      active = false
      invoke('stop_recording').catch((e) => logProblem('recording not stopped', String(e)))
    }
  })
  return () => {
    stopFollowing()
    void stopListening.then((unlisten) => unlisten())
  }
}

/** The record button: stops recording; the run carries on without it until it is pressed again. */
export function stopRecordingThisRun(): void {
  logAction('recording', 'stopped from the widget')
  invoke('stop_recording').catch((e) => logProblem('recording not stopped', String(e)))
}

/** The record button when not recording: records this run, added to its recording if it has one. */
export function recordFromWidget(s: SessionState): void {
  logAction('recording', 'started from the widget')
  recordThisRun(s).catch((e) => logProblem('recording not started', String(e)))
}

/**
 * What the record button shows for the run `s`: on every running deck, red while it records
 * (dimmed while paused), grey when it doesn't, struck through when the microphone was refused;
 * nothing before the start or in a preview.
 */
export function recordButton(s: SessionState | null, now: RecordingState | null): 'recording' | 'paused' | 'stopped' | 'refused' | null {
  if (!s || s.status !== 'running' || !canRecord(s)) return null
  if (!now || now.deck !== deckPathOf(s)) return 'stopped'
  if (now.state === 'recording' || now.state === 'paused' || now.state === 'refused') return now.state
  return 'stopped'
}
