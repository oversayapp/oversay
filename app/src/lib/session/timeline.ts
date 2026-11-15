// What every Timeline style draws (epic 007): the talk laid out
// as blocks along one axis with the playhead, and how the talk stands against its target. Worked
// out from the session and the current time, like clock.ts, so every style shows the same thing.
import type { SegmentKind } from '../project/types'
import { segmentActuals } from '../project/derived'
import { formatDuration } from '../project/duration'
import { furthestSegment, segmentKind, wholeSeconds, type SegmentReadout, type SessionClock, type SessionState } from './clock'

/** The last seconds of a fixed segment, when the overlays say "wrap up". */
export const WRAP_UP_SECONDS = 30

export interface TimelineBlock {
  segmentId: string
  name: string
  kind: SegmentKind
  openEnded: boolean
  plannedSeconds: number
  /** Where the block starts, in seconds along the axis. Its length is always `plannedSeconds`. */
  start: number
  /** Presented, being presented, or still to come. */
  state: 'done' | 'current' | 'ahead'
  /** Seconds presented within its plan: the rest of the block is time left (or, once done, time not used). */
  presented: number
  /** Seconds presented beyond its plan: an overrun, or a demo past its estimate (`openEnded`). */
  beyond: number
}

export interface TimelineLayout {
  blocks: TimelineBlock[]
  /** The axis length in seconds: the plan's. It doesn't change as the talk runs. */
  total: number
  /** Seconds along the axis; null outside a running talk. It stops at the end of a segment that runs over. */
  playhead: number | null
}

/**
 * The talk as blocks at their planned lengths, so the picture keeps still while the talk runs
 * (007/01 hands-on): each fills as it is presented and the unfilled part is time left. A segment
 * that runs over stays full with the playhead at its end (time beyond its plan is reported for the
 * styles to mark, never drawn over what follows). Whether the talk will end early or late is text
 * (`talkStatus`), not a marker on the axis.
 */
export function timelineLayout(session: SessionState, now: number): TimelineLayout {
  const plan = session.plan
  const started = session.status !== 'ready' && session.events.length > 0
  const actuals = started ? segmentActuals(plan, session.events, new Date(now).toISOString()) : plan.map(() => 0)
  const finished = session.status === 'finished'
  const reached = furthestSegment(session)

  let start = 0
  const blocks = plan.map((p, i): TimelineBlock => {
    // Once finished, a segment the talk never reached (ended early) stays as still to come.
    const state = !started
      ? 'ahead'
      : finished
        ? i <= reached
          ? 'done'
          : 'ahead'
        : i < session.index
          ? 'done'
          : i === session.index
            ? 'current'
            : 'ahead'
    const block: TimelineBlock = {
      segmentId: p.segmentId,
      name: p.name,
      kind: segmentKind(session, p.segmentId),
      openEnded: p.openEnded,
      plannedSeconds: p.plannedSeconds,
      start,
      state,
      presented: Math.min(actuals[i], p.plannedSeconds),
      beyond: Math.max(0, actuals[i] - p.plannedSeconds),
    }
    start += p.plannedSeconds
    return block
  })

  const current = blocks.find((b) => b.state === 'current')
  const running = started && !finished && current
  return {
    blocks,
    total: Math.max(start, 1),
    playhead: running ? current.start + current.presented : null,
  }
}

/**
 * How late or early the talk is running against its plan (talk your plan, John 007/01): the
 * projected length less the planned one, in whole seconds rounded up. A plan that doesn't fit its
 * target is the editor's business, not something to report mid-talk.
 */
export interface TalkStatus {
  status: 'on-time' | 'late' | 'early'
  /** Positive when late, negative when early. */
  seconds: number
}

export function talkStatus(clock: SessionClock): TalkStatus {
  // The projected length rounded up, like every time shown, so the numbers on screen add up
  // (Welcome 2:13 of 3:00 is 0:47 early, not 0:48).
  const seconds = wholeSeconds(clock.projectedLength) - clock.plannedLength
  return { status: seconds > 0 ? 'late' : seconds < 0 ? 'early' : 'on-time', seconds }
}

/** A difference in whole seconds as `+0:10` or `−0:45`; `0:00` when there is none (never `−0:00`). */
export const formatSigned = (seconds: number): string =>
  seconds === 0 ? '0:00' : `${seconds > 0 ? '+' : '−'}${formatDuration(Math.abs(seconds))}`

/** How the talk stands, in words: `+0:10 late`, `−0:45 early` or `on time`. The same in every window. */
export function formatTalkStatus(status: TalkStatus): string {
  if (status.status === 'on-time') return 'on time'
  return `${formatSigned(status.seconds)} ${status.status}`
}

/** The last seconds of a fixed segment. */
export const isWrapUp = (readout: SegmentReadout | null): boolean =>
  readout?.mode === 'left' && readout.seconds <= WRAP_UP_SECONDS
