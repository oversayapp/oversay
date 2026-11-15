// What the flashcard widget shows (ADR 0036):
// the current card's title, kind, position and points, the deck bar, and the next card.
import type { SessionState } from '../../lib/session/clock'
import type { SegmentKind } from '../../lib/project/types'
import { DECK_DEFAULTS, type DeckOptions } from '../../lib/decks/deck'

export interface FlashcardModel {
  status: 'none' | 'ready' | 'running' | 'finished'
  deckName: string
  options: DeckOptions
  card: { name: string; kind: SegmentKind; seconds: number | null; points: string[] } | null
  /** 0-based index of `card`, and how many cards the deck has. */
  index: number
  count: number
  paused: boolean
  /** One per card, as wide as its time (untimed cards a share of their own): done, current or to come. */
  bar: { kind: SegmentKind; weight: number; state: 'done' | 'current' | 'ahead' }[]
  next: { name: string; seconds: number | null } | null
}

/** The smallest share of the deck bar a card gets, so a short or untimed card can still be seen. */
const MIN_WEIGHT = 20

/** The deck's options, as `showDeck` put them on the talk it sent. */
export function deckOptionsOf(session: SessionState | null): DeckOptions {
  const sent = (session?.talk as { deck?: Partial<DeckOptions> } | null)?.deck
  return { ...DECK_DEFAULTS, ...sent }
}

export function flashcardModel(session: SessionState | null): FlashcardModel {
  const options = deckOptionsOf(session)
  const empty = { deckName: '', options, card: null, index: 0, count: 0, paused: false, bar: [], next: null }
  if (!session) return { status: 'none', ...empty }
  const segments = session.talk?.segments ?? []
  const index = Math.min(session.index, Math.max(0, segments.length - 1))
  const toCard = (i: number) => {
    const s = segments[i]
    return s && { name: s.name, kind: s.kind, seconds: s.openEnded ? null : s.plannedSeconds, points: s.points }
  }
  const timed = segments.some((s) => !s.openEnded)
  return {
    status: session.status,
    deckName: session.talk?.name ?? '',
    options,
    card: toCard(index) ?? null,
    index,
    count: segments.length,
    paused: session.paused,
    bar: segments.map((s, i) => ({
      kind: s.kind,
      weight: timed ? Math.max(s.openEnded ? 0 : s.plannedSeconds, MIN_WEIGHT) : 1,
      state: session.status === 'ready' ? (i === 0 ? 'current' : 'ahead') : i < index ? 'done' : i === index ? 'current' : 'ahead',
    })),
    next: toCard(index + 1) ? { name: toCard(index + 1)!.name, seconds: toCard(index + 1)!.seconds } : null,
  }
}
