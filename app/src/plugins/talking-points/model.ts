// What the Talking Points overlay shows (spec §8): the current segment's name, its
// points and its hints. Before the start that is the first segment; once finished, none.
import { presentedSegment, shownHints, type SessionState } from '../../lib/session/clock'
import type { LookBack } from '../../lib/session/look-back'

export interface TalkingPointsModel {
  status: 'none' | 'ready' | 'running' | 'finished'
  talkName: string | null
  segment: { name: string; points: string[]; hints: string[] } | null
  /** 1-based position of `segment` in the plan, and the plan's length. */
  position: number
  count: number
  /** The Timeline's wave is held on an earlier point: `segment` is the one looked at. */
  looking: boolean
}

export function talkingPointsModel(session: SessionState | null, lookBack: LookBack | null = null): TalkingPointsModel {
  if (!session) return { status: 'none', talkName: null, segment: null, position: 0, count: 0, looking: false }
  // While the wave is held on a point already passed, that segment's notes; otherwise the current one.
  const looked = lookBack && session.status !== 'ready' ? session.plan[lookBack.index] : undefined
  const { index, planned, notes } = looked
    ? { index: lookBack!.index, planned: looked, notes: session.talk?.segments.find((s) => s.id === looked.segmentId) }
    : presentedSegment(session)
  return {
    status: session.status,
    talkName: session.talk?.name || null,
    segment: planned
      ? {
          name: planned.name,
          points: notes?.points ?? [],
          hints: shownHints(notes?.hints ?? []),
        }
      : null,
    position: planned ? index + 1 : 0,
    count: session.plan.length,
    looking: !!looked,
  }
}
