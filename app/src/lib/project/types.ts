// Domain types for the project file, spec §2 and §3.

export const SCHEMA_VERSION = 1

export const SEGMENT_KINDS = ['intro', 'topic', 'demo', 'outro', 'break'] as const
export type SegmentKind = (typeof SEGMENT_KINDS)[number]

export const SESSION_EVENT_TYPES = ['start', 'next', 'previous', 'pause', 'resume', 'end'] as const
export type SessionEventType = (typeof SESSION_EVENT_TYPES)[number]

export interface Segment {
  id: string
  name: string
  kind: SegmentKind
  /** Whole seconds. For an open-ended segment this is only the estimate used for totals. */
  plannedSeconds: number
  openEnded: boolean
  points: string[]
  hints: string[]
}

export interface SessionEvent {
  /** ISO 8601 UTC. */
  at: string
  type: SessionEventType
}

/** Snapshot of one segment as it was when the session started. */
export interface PlannedSegment {
  segmentId: string
  name: string
  plannedSeconds: number
  openEnded: boolean
}

export interface Session {
  id: string
  startedAt: string
  endedAt?: string
  plan: PlannedSegment[]
  /** Source of truth for what happened; actuals are derived from it. */
  events: SessionEvent[]
}

export interface Talk {
  id: string
  name: string
  /** What the talk is, who it's for: a sentence or a paragraph (011/04). Shown in place of `audience`. */
  description?: string
  /** Older files: who the talk is for. Read as the description until the description is edited. */
  audience?: string
  targetSeconds?: number
  segments: Segment[]
  sessions: Session[]
}

export interface Project {
  schemaVersion: number
  /**
   * `quickTalk`: a talk outside any project, the only talk in its file in Documents/Oversay/Quick
   * talks (ADR 0027). Missing for a project. Additive: no schemaVersion change, and an
   * older Oversay opens the file as a one-talk project.
   */
  kind?: string
  id: string
  name: string
  /** What the project is for, in the person's own words; a few lines of plain text. Also context for an AI agent later. */
  description?: string
  talks: Talk[]
}
