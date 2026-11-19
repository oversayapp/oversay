// What the Talking Points overlay shows (spec §8): the current segment's name, its
// points and its hints. Before the start that is the first segment; once finished, none.
import { presentedSegment, shownHints, type SessionState } from '../../lib/session/clock'

export interface TalkingPointsModel {
  status: 'none' | 'ready' | 'running' | 'finished'
  talkName: string | null
  segment: { name: string; points: string[]; hints: string[] } | null
  /** 1-based position of `segment` in the plan, and the plan's length. */
  position: number
  count: number
}

export function talkingPointsModel(session: SessionState | null): TalkingPointsModel {
  if (!session) return { status: 'none', talkName: null, segment: null, position: 0, count: 0 }
  const { index, planned, notes } = presentedSegment(session)
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
  }
}
