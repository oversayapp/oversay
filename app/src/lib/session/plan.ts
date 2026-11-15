import type { PlannedSegment, Talk } from '../project/types'

/** The snapshot of a talk's segments a session runs against (and records). */
export function planFromTalk(talk: Talk): PlannedSegment[] {
  return talk.segments.map((s) => ({
    segmentId: s.id,
    name: s.name,
    plannedSeconds: s.plannedSeconds,
    openEnded: s.openEnded,
  }))
}
