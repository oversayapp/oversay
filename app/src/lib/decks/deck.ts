// A deck (ADR 0036) is a quick note with times: a Markdown file in Documents/Oversay/Decks
// read by the note reader (ADR 0026), each `## ` topic one flashcard. A card's time comes from its
// heading (`[3m]`, `[~3m]` still moves on), with no time or `[open]` it is untimed. The deck's
// options are its front matter; nothing in Settings overrides them. It is known by the `id` in its
// front matter and named by its `title` (ADR 0037).

import type { SegmentKind, Talk } from '../project/types'
import { isValidId, newId } from '../project/ids'
import { frontValue, parseNoteDoc, setFrontValue, shownTopics, talkingPoints, writeNoteDoc, type NoteDoc } from '../notes/format'

/** What a card can leave off: its position (2/4), the deck bar, the next card, the time left in the deck and when it ends. */
export const DECK_PARTS = ['position', 'bar', 'next', 'left', 'ends'] as const
export type DeckPart = (typeof DECK_PARTS)[number]

export interface DeckOptions {
  /**
   * Off, the deck runs as if no card were timed: each counts up and waits for Next, with no
   * countdown, warning or Auto-advance, though the times stay in the file (John, 23 Oct).
   */
  timing: boolean
  /** At 0:00 a timed card gives way to the next by itself; off, it stays and waits for Next. */
  autoAdvance: boolean
  /** By kind (the app's segment colours) or one colour (the waveform's ink). */
  colour: 'kinds' | 'one'
  /** What the card leaves off, in `DECK_PARTS` order; none by default. */
  hide: DeckPart[]
  /**
   * Record on start (ADR 0047): `on` or `off` overrides Settings › Recordings' Auto record for this
   * deck; `global`, the default, follows it. `record-on-start` in the front matter; never the retired `record`.
   */
  recordOnStart: RecordOnStart
}

export type RecordOnStart = 'global' | 'on' | 'off'

export const DECK_DEFAULTS: DeckOptions = { timing: true, autoAdvance: true, colour: 'kinds', hide: [], recordOnStart: 'global' }

/** The front matter keys a deck adds to a note's. */
export const DECK_FRONT_KEYS = ['timing', 'auto-advance', 'colour', 'hide', 'record-on-start'] as const

/**
 * Keys a deck once read and no longer does: `timeline` chose a timeline window, and every deck now
 * has the deck widget's Agenda view (ADR 0042); `deck-bar` put the card's deck bar at the top, and it
 * is now always at the bottom (John, 7 Nov); `record` recorded the deck, and every deck now can,
 * from Settings › Recordings' Auto record or the deck widget's record button. A deck that has one keeps it as written; nothing
 * flags it, lists it or checks its value.
 */
export const DECK_RETIRED_KEYS = ['timeline', 'deck-bar', 'record'] as const

/** Every key a deck reads: what it is, who and what it is for, then its options; `with` as decks first wrote it. */
export const DECK_KEYS = ['id', 'title', 'audience', 'with', 'project', 'tags', ...DECK_FRONT_KEYS] as const

/** The values each option takes, for checking a deck the skill wrote (`hide` takes a list of these parts). */
export const DECK_VALUES: Record<string, readonly string[]> = {
  timing: ['on', 'off'],
  'auto-advance': ['on', 'off'],
  colour: ['kinds', 'one'],
  hide: DECK_PARTS,
  'record-on-start': ['on', 'off'],
}

const one = <T extends string>(value: string, allowed: readonly T[], fallback: T): T => {
  const v = value.trim().toLowerCase()
  return (allowed as readonly string[]).includes(v) ? (v as T) : fallback
}

/** `hide: next, ends`: the parts named, in order; anything else is ignored. */
function hiddenParts(value: string): DeckPart[] {
  const named = value.split(',').map((p) => p.trim().toLowerCase())
  return DECK_PARTS.filter((part) => named.includes(part))
}

/** The deck's options, its defaults where the front matter doesn't say or says something else. */
export function deckOptions(doc: NoteDoc): DeckOptions {
  return {
    timing: one(frontValue(doc, 'timing'), ['on', 'off'], 'on') === 'on',
    autoAdvance: one(frontValue(doc, 'auto-advance'), ['on', 'off'], 'on') === 'on',
    colour: one(frontValue(doc, 'colour'), ['kinds', 'one'], DECK_DEFAULTS.colour),
    hide: hiddenParts(frontValue(doc, 'hide')),
    recordOnStart: one(frontValue(doc, 'record-on-start'), ['on', 'off'], 'global' as RecordOnStart) as RecordOnStart,
  }
}

/** Sets one of the deck's options in its front matter, as the deck editor does; every other line stays. */
export function setDeckOption<K extends keyof DeckOptions>(doc: NoteDoc, option: K, value: DeckOptions[K]): NoteDoc {
  switch (option) {
    case 'timing':
      return setFrontValue(doc, 'timing', value ? 'on' : 'off')
    case 'autoAdvance':
      return setFrontValue(doc, 'auto-advance', value ? 'on' : 'off')
    case 'recordOnStart':
      // `global` removes the line, so the deck follows Auto record again.
      return setFrontValue(doc, 'record-on-start', value === 'global' ? '' : (value as string))
    case 'hide':
      return setFrontValue(doc, 'hide', DECK_PARTS.filter((p) => (value as DeckPart[]).includes(p)).join(', '))
    default:
      return setFrontValue(doc, 'colour', value as DeckOptions['colour'])
  }
}

/** The deck's id (`id: d_k3x9a2bq`, ADR 0037), or '' when it has no valid one. */
export function deckId(doc: NoteDoc): string {
  const id = frontValue(doc, 'id')
  return isValidId('deck', id) ? id : ''
}

/** The deck's name as its front matter gives it (`title`), or '' when it gives none. */
export const deckTitle = (doc: NoteDoc): string => frontValue(doc, 'title')

export const setDeckTitle = (doc: NoteDoc, title: string): NoteDoc => setFrontValue(doc, 'title', title)

/** `text` as a new deck: a new id, whatever id it had (a copy is a deck of its own), and `title`. */
export const asNewDeck = (text: string, title: string): string =>
  writeNoteDoc(setDeckTitle(setFrontValue(parseNoteDoc(text), 'id', newId('deck')), title))

/** Who the deck is for: `audience`, or `with` as decks first wrote it; '' when neither says. */
export const deckAudience = (doc: NoteDoc): string => frontValue(doc, 'audience') || frontValue(doc, 'with')

/** Sets who the deck is for, as `audience`; an older `with` line goes, so there is one answer. */
export const setDeckAudience = (doc: NoteDoc, value: string): NoteDoc => setFrontValue(setFrontValue(doc, 'with', ''), 'audience', value)

/** The project the deck belongs to (`project: Atlas`): a name for grouping, not a project file. */
export const deckProject = (doc: NoteDoc): string => frontValue(doc, 'project')

export const setDeckProject = (doc: NoteDoc, value: string): NoteDoc => setFrontValue(doc, 'project', value)

/** The deck's tags (`tags: weekly, platform`), in order, without repeats or blanks. */
export function deckTags(doc: NoteDoc): string[] {
  const tags = frontValue(doc, 'tags')
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean)
  return tags.filter((t, i) => tags.findIndex((u) => u.toLowerCase() === t.toLowerCase()) === i)
}

/** Writes the deck's tags; none removes the line. */
export const setDeckTags = (doc: NoteDoc, tags: readonly string[]): NoteDoc =>
  setFrontValue(doc, 'tags', tags.map((t) => t.replace(/,/g, ' ').trim()).filter(Boolean).join(', '))

/** The timed cards' time added up, in seconds; 0 when no card is timed. */
export const deckSeconds = (cards: readonly Card[]): number => cards.reduce((sum, c) => sum + (c.seconds ?? 0), 0)

export interface Card {
  name: string
  /** Its time in seconds, or null when it is untimed. */
  seconds: number | null
  kind: SegmentKind
  points: string[]
}

export const isUntimed = (card: Pick<Card, 'seconds'>): boolean => card.seconds === null

/** The deck's flashcards, in order. */
export function deckCards(doc: NoteDoc, name: string): Card[] {
  return shownTopics(doc).map((topic) => ({
    name: topic.name || name,
    seconds: topic.time && topic.time.seconds > 0 ? topic.time.seconds : null,
    kind: topic.segmentKind ?? 'topic',
    points: talkingPoints(topic),
  }))
}

/** The card (0-based) that topic `t` of the file is, or the nearest card before it; 0 when none. */
export function cardAt(doc: NoteDoc, t: number): number {
  const shown = shownTopics(doc)
  return Math.max(0, shown.findLastIndex((topic) => doc.topics.indexOf(topic) <= t))
}

/** The topic of the file that card `index` is, or -1 when there is no such card. */
export const topicOfCard = (doc: NoteDoc, index: number): number => {
  const topic = shownTopics(doc)[index]
  return topic ? doc.topics.indexOf(topic) : -1
}

/** The id a shown deck's talk has: never a project talk's (`t_…`) or a note's. */
export const DECK_TALK_ID = 'deck'

/** The deck as the talk its session runs: a segment per card, untimed cards open-ended. */
export function deckTalk(doc: NoteDoc, name: string): Talk {
  return {
    id: DECK_TALK_ID,
    name,
    segments: deckCards(doc, name).map((card, i) => ({
      id: `s_deck${i}`,
      name: card.name,
      kind: card.kind,
      plannedSeconds: card.seconds ?? 0,
      openEnded: isUntimed(card),
      points: card.points,
      hints: [],
    })),
    sessions: [],
  }
}
