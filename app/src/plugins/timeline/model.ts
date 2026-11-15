// What every Timeline style shows, worked out once from the session and the time (007/03-06):
// the segment's time and its words, how late or early the talk
// is against its plan, and the points and next segment for the styles that carry them. Styles
// differ in how they draw this, never in what it says.
import { presentedSegment, sessionClock, segmentKind, shownHints, segmentReadout, wholeSeconds, type SegmentReadout, type SessionClock, type SessionState } from '../../lib/session/clock'
import { isWrapUp, talkStatus, timelineLayout, type TalkStatus, type TimelineLayout } from '../../lib/session/timeline'
import type { SegmentKind } from '../../lib/project/types'

export interface TimelineModel {
  status: 'none' | 'ready' | 'running' | 'finished'
  talkName: string | null
  clock: SessionClock | null
  readout: SegmentReadout | null
  layout: TimelineLayout | null
  standing: TalkStatus | null
  paused: boolean
  /** The segment being presented (the first, in Ready); null before a session and once finished. */
  segment: { name: string; kind: SegmentKind; openEnded: boolean; plannedSeconds: number; points: string[]; hint: string | null } | null
  /** 1-based position of `segment` in the plan, and the plan's length. */
  position: number
  count: number
  next: { name: string; plannedSeconds: number; openEnded: boolean } | null
  /** How far through its plan the current segment is, 0 to 1 (full once over). */
  segmentShare: number
  /** The talk's planned time has all gone. */
  talkOver: boolean
  /** How much of the plan's time has gone, 0 to 1. */
  talkShare: number
  /** What the segment's number means in a word: `left`, `wrap up`, `over`, `so far · plan paused`. */
  word: string
}

export function timelineModel(session: SessionState | null, now: number): TimelineModel {
  if (!session) {
    return { status: 'none', talkName: null, clock: null, readout: null, layout: null, standing: null, paused: false, segment: null, position: 0, count: 0, next: null, segmentShare: 0, talkOver: false, talkShare: 0, word: '' }
  }
  const clock = sessionClock(session, now)
  const readout = segmentReadout(clock)
  const plan = session.plan
  const { index, planned, notes: talkSegment } = presentedSegment(session)
  const nextPlanned = index >= 0 ? plan[index + 1] : undefined
  const word = !readout ? '' : readout.mode === 'so-far' ? 'so far · plan paused' : readout.mode === 'over' ? 'over' : isWrapUp(readout) ? 'wrap up' : 'left'
  return {
    status: session.status,
    talkName: session.talk?.name || null,
    clock,
    readout,
    layout: timelineLayout(session, now),
    standing: talkStatus(clock),
    paused: session.status === 'running' && session.paused,
    segment: planned
      ? {
          name: planned.name,
          kind: segmentKind(session, planned.segmentId),
          openEnded: planned.openEnded,
          plannedSeconds: planned.plannedSeconds,
          points: talkSegment?.points ?? [],
          hint: shownHints(talkSegment?.hints ?? [])[0] ?? null,
        }
      : null,
    position: index >= 0 ? index + 1 : plan.length,
    count: plan.length,
    next: nextPlanned ? { name: nextPlanned.name, plannedSeconds: nextPlanned.plannedSeconds, openEnded: nextPlanned.openEnded } : null,
    segmentShare: clock.current ? Math.min(1, clock.inSegment / Math.max(1, clock.current.plannedSeconds)) : 0,
    talkOver: wholeSeconds(clock.inTalk) > clock.plannedLength,
    talkShare: clock.plannedLength > 0 ? Math.min(1, clock.inTalk / clock.plannedLength) : 0,
    word,
  }
}
