// A recording becomes a transcript on this computer (ADR 0041): Whisper (transcriber.rs)
// says what it heard and when, in time into the recording; the recording ran only while the deck
// did, pausing with it, so that time is laid back over the run's visits and split by card as a
// call's transcript is. The model downloads once, after a yes. Once transcribed the recording goes
// to the Trash unless Settings › Recordings keeps it. After a run, a recording is transcribed in the
// background when the model is here; otherwise the session's page asks.

import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import { get, writable } from 'svelte/store'
import { logAction, logProblem } from '../log'
import { readDeckSessions, readSessionFiles, sessionName, type DeckSession } from '../decks/sessions'
import { decks } from '../decks/store'
import { settings } from '../settings/store'
import { reloadDeckSessions } from './store'
import { cardAt, transcriptMarkdown, type Cue } from './transcript'

export interface SpeechModel {
  present: boolean
  bytes: number
  from: string
}

export const readSpeechModel = () => invoke<SpeechModel>('speech_model')
export const removeSpeechModel = () => invoke('remove_speech_model')

/** A word Whisper heard: from and to, in ms into the recording. */
export interface Heard {
  fromMs: number
  toMs: number
  text: string
}

/** Where the transcript of a recording says it came from. */
export const VOICE_SOURCE = 'Your voice, transcribed on this computer with Whisper'

/** The most words on a line, for speech that runs on without a full stop or a pause. */
const LINE_WORDS = 30
/** A pause this long, in ms, ends a line: Whisper sometimes leaves out every full stop. */
const LINE_PAUSE_MS = 800

/**
 * What was heard, as lines in ms since Start: the recording ran through the run's visits in order,
 * pausing between them, so each word's time is laid back over them. A session kept without visits
 * counts from Start. Words make lines, which end at a sentence's end, at a pause, at LINE_WORDS, or
 * where the card on screen changed, so each word is under the card that was up when it was said.
 */
export function heardSinceStart(heard: readonly Heard[], session: DeckSession): Cue[] {
  const start = Date.parse(session.startedAt)
  // The stretches the deck ran, joined where one visit follows straight on from the last.
  const runs: { from: number; to: number }[] = []
  for (const v of session.visits ?? []) {
    const from = Date.parse(v.from) - start
    const to = Date.parse(v.to) - start
    const last = runs.at(-1)
    if (last && last.to === from) last.to = to
    else runs.push({ from, to })
  }
  const at = (ms: number): number => {
    if (runs.length === 0) return ms
    let into = ms
    for (const r of runs) {
      if (into < r.to - r.from) return r.from + into
      into -= r.to - r.from
    }
    return runs.at(-1)!.to + into
  }
  const lines: Cue[] = []
  let card = NaN
  let words = 0
  let saidTo = -Infinity
  for (const h of heard) {
    const when = at(h.fromMs)
    const here = cardAt(session, when)
    const last = lines.at(-1)
    const paused = h.fromMs - saidTo >= LINE_PAUSE_MS
    saidTo = h.toMs
    if (last && here === card && words < LINE_WORDS && !paused && !/[.?!]["')\]]?$/.test(last.text)) {
      last.text += ` ${h.text}`
      words++
    } else {
      lines.push({ at: when, speaker: '', text: h.text })
      card = here
      words = 1
    }
  }
  return lines
}

/** Downloads and transcriptions in progress, by `<deck path>#<session name>`; the model's download is `model`. */
export const voiceWork = writable<Record<string, { stage: 'downloading' | 'transcribing'; percent: number }>>({})

const keyOf = (path: string, name: string) => `${path}#${name}`
const setWork = (key: string, stage: 'downloading' | 'transcribing' | null, percent = 0) =>
  voiceWork.update((w) => {
    const next = { ...w }
    if (stage) next[key] = { stage, percent }
    else delete next[key]
    return next
  })

/** Follows the download's and Whisper's progress for the pages that show it. Returns what stops it. */
export function followVoiceWork(): () => void {
  const model = listen<{ received: number; total: number }>('speech-model', (e) =>
    setWork('model', 'downloading', Math.round((e.payload.received / e.payload.total) * 100)),
  )
  const whisper = listen<{ deck: string; name: string; percent: number }>('transcribing', (e) =>
    setWork(keyOf(e.payload.deck, e.payload.name), 'transcribing', e.payload.percent),
  )
  return () => {
    void model.then((u) => u())
    void whisper.then((u) => u())
  }
}

/** Downloads the speech model, once, after the person said yes. */
export async function downloadSpeechModel(): Promise<void> {
  logAction('speech model', 'download')
  setWork('model', 'downloading', 0)
  try {
    await invoke('download_speech_model')
  } finally {
    setWork('model', null)
  }
}

/** Transcribes the session's recording on this computer, saves it split by card, and lets the recording go. */
export async function transcribeRecording(path: string, startedAt: string): Promise<void> {
  const sessions = await readDeckSessions(path)
  const session = sessions.find((s) => s.startedAt === startedAt)
  if (!session) return
  const name = sessionName(sessions, session)
  const key = keyOf(path, name)
  if (get(voiceWork)[key]) return
  setWork(key, 'transcribing', 0)
  try {
    logAction('transcribe', name)
    const heard = await invoke<Heard[]>('transcribe_recording', { path, name })
    const deckName = get(decks)?.find((d) => d.path === path)?.name ?? 'Deck'
    const { markdown } = transcriptMarkdown(session, deckName, VOICE_SOURCE, heardSinceStart(heard, session))
    await invoke('write_transcript', { path, name, contents: markdown })
    if (!get(settings).keepRecordings) await invoke('discard_recording', { path, name })
  } finally {
    setWork(key, null)
    await reloadDeckSessions(path).catch(() => {})
  }
}

/** After a run is kept: its recording is transcribed in the background when the model is here. */
export async function transcribeAfterRun(path: string): Promise<void> {
  try {
    const sessions = await readDeckSessions(path)
    const latest = sessions.at(-1)
    if (!latest) return
    const files = await readSessionFiles(path)
    if (!files.recordings.includes(sessionName(sessions, latest))) return
    if (!(await readSpeechModel()).present) return
    await transcribeRecording(path, latest.startedAt)
  } catch (e) {
    logProblem('recording not transcribed', String(e))
  }
}
