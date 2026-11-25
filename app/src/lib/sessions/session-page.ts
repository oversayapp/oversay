// What a session's page shows (spec §11, epic 044 (#100)): which state the top of the run is
// in, and what was said beside each card. Pure but for the debug log, so the page and its tests
// agree. The log carries states and numbers only, never what was said or written.

import { logAction } from '../log'
import type { DeckSessionCard } from '../decks/sessions'
import { oneLine, type TranscriptLine, type readTranscript } from './transcript'
import { VOICE_SOURCE } from './whisper'
import type { Review } from './review'

type Transcript = ReturnType<typeof readTranscript>

/** What the top of the run shows: the saved transcript, or why there is none to read yet. */
export type TopState = 'import' | 'transcript' | 'silent' | 'loading' | 'downloading' | 'transcribing' | 'ask' | 'waiting' | 'none'

export interface TopInput {
  /** A transcript file is being lined up, to check before it is saved. */
  checking: boolean
  /** The saved transcript, once read. */
  transcript: Transcript | null
  /** A saved transcript is being read. */
  reading: boolean
  /** The session has a recording. */
  recording: boolean
  /** How far the speech model's download is, in percent, or null when none is under way. */
  download: number | null
  /** How far this recording's transcription is, in percent, or null. */
  work: number | null
  /** The speech model is not here and the person hasn't said Not now. */
  askForModel: boolean
}

export function topState(i: TopInput): TopState {
  if (i.checking) return 'import'
  if (i.transcript) return i.transcript.cards.some((c) => c.lines.length > 0) ? 'transcript' : 'silent'
  if (i.reading) return 'loading'
  if (!i.recording) return 'none'
  if (i.download !== null) return 'downloading'
  if (i.work !== null) return 'transcribing'
  return i.askForModel ? 'ask' : 'waiting'
}

/**
 * Each card's lines from a transcript, matched by the card's name, in order. When there is a
 * heading per card, one that names no card goes to the card in its place, if that card has none.
 * Any other heading (an edited file) is kept, to show after the cards.
 */
export function wordsByCard(cards: readonly DeckSessionCard[], transcript: Transcript): { byCard: TranscriptLine[][]; extra: Transcript['cards'] } {
  const byCard: TranscriptLine[][] = cards.map(() => [])
  const unnamed: number[] = []
  const taken = new Set<number>()
  const give = (card: number, section: number) => {
    taken.add(card)
    byCard[card] = transcript.cards[section].lines
  }
  transcript.cards.forEach((section, at) => {
    const i = cards.findIndex((c, card) => !taken.has(card) && oneLine(c.name) === section.title)
    if (i < 0) unnamed.push(at)
    else give(i, at)
  })
  const extra: Transcript['cards'] = []
  for (const at of unnamed) {
    if (transcript.cards.length === cards.length && !taken.has(at)) give(at, at)
    else extra.push(transcript.cards[at])
  }
  return { byCard, extra }
}

export const logTopState = (state: TopState) => logAction('session.transcript_state', `state=${state} check=epic-044/V5`)
export const logCardWords = (card: number, open: boolean) => logAction('session.card_words', `card=${card} open=${open} check=epic-044/V2`)
export const logArrived = (from: string | undefined) => logAction('session.arrived', `from=${from ?? 'other'} check=epic-044/V6`)
export const logPageOpened = (layout: 'wide' | 'narrow') => logAction('session.page_opened', `layout=${layout} check=epic-044/V1`)

/** A part's state in a few words, and how it reads: done or coming, waiting on the person, refused, or not there. */
export interface Label {
  text: string
  tone: 'good' | 'todo' | 'bad' | 'none' | 'plain'
}

const label = (text: string, tone: Label['tone']): Label => ({ text, tone })

/** Where the transcript stands. `percent` is the download's or the transcription's. */
export function runLabelFor({ state, percent, refused }: { state: TopState; percent: number; refused: boolean }): Label | null {
  switch (state) {
    case 'transcript':
      return label('Ready', 'good')
    case 'silent':
      return label('Nothing heard', 'plain')
    case 'import':
      return label('Check and save', 'todo')
    case 'downloading':
      return label(`Downloading ${percent}%`, 'good')
    case 'transcribing':
      return label(`Transcribing ${percent}%`, 'good')
    case 'ask':
      return label('Needs your OK', 'todo')
    case 'waiting':
      return label('Recording waits', 'todo')
    case 'none':
      return refused ? label('File refused', 'bad') : label('None · add one', 'none')
    case 'loading':
      return null
  }
}

export const noteLabel = (note: string): Label => (note.trim() ? label('Written', 'plain') : label('Not written', 'none'))

/** The review's section that lists what to change in the deck, as the review format names it. */
export const CHANGES = 'What to change in the deck'

export function reviewLabel(there: boolean, review: Review | null): Label {
  if (!there) return label('Not yet', 'none')
  const n = review?.sections.find((s) => s.title === CHANGES)?.points.length ?? 0
  return label(n ? `Ready · ${n} ${n === 1 ? 'change' : 'changes'}` : 'Ready', 'good')
}

/** The three parts a narrow window shows one at a time. */
export type Pane = 'run' | 'note' | 'review'

export const logPaneShown = (pane: Pane) => logAction('session.pane_shown', `pane=${pane} check=epic-044/V3`)
export const logLabels = (run: TopState, note: string, review: string) => logAction('session.state_labels', `run=${run} note=${note} review=${review} check=epic-044/V4`)

/**
 * Whether to say the audio is in the Trash: Oversay made the transcript from the person's voice,
 * and the recording is no longer beside it. It can't tell whether the Trash was emptied since.
 */
export const audioInTrash = (source: string, recording: boolean): boolean => source === VOICE_SOURCE && !recording

/** A review asked for now would miss the transcript still to come from the recording. */
export const reviewEarly = (has: { review: boolean; recording: boolean; transcript: boolean }): boolean => !has.review && has.recording && !has.transcript

export const logAudioNote = () => logAction('session.audio_note', 'check=epic-044/V7')
export const logReviewEarly = () => logAction('session.review_early', 'check=epic-044/V8')
export const logOpenDeck = () => logAction('session.open_deck', 'check=epic-044/V9')
