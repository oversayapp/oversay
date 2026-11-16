// When Oversay checks for updates, and what a check leaves on screen (epic #16, ADR 0030).
// Rust decides whether a check may happen (src-tauri/src/updates.rs); this decides when to ask.

import type { Settings } from '../settings/settings'

/** Same shapes as `Outcome` and `Release` in src-tauri/src/updates.rs. */
export interface Release {
  version: string
  notes: string
  date: string | null
  /** Where a build that can't install itself sends the person. */
  page: string | null
}
export type InstallKind = 'installer' | 'linkOnly'
export type Outcome =
  | { state: 'upToDate' }
  | { state: 'available'; release: Release; kind: InstallKind }
  | { state: 'unreachable' }
  | { state: 'busy' }
export interface Support {
  enabled: boolean
  kind: InstallKind
}

/** The maintainer's answer (epic #16): check at every start, automatic checking on. `everyHours` can set a least time between checks; 0 is every start. */
export const DEFAULT_AUTO_CHECK = true
export const DEFAULT_CHECK_HOURS = 0

export interface UpdateSettings {
  auto: boolean
  everyHours: number
}

export function updateSettings(s: Settings): UpdateSettings {
  const u = (typeof s.updates === 'object' && s.updates !== null ? s.updates : {}) as Record<string, unknown>
  return {
    auto: typeof u.auto === 'boolean' ? u.auto : DEFAULT_AUTO_CHECK,
    everyHours: typeof u.everyHours === 'number' && u.everyHours >= 0 ? u.everyHours : DEFAULT_CHECK_HOURS,
  }
}

/** Whether Oversay checks as it starts: automatic checking on, a feed in this build, and, when an interval is set, the last check older than it. */
export function startupCheckDue(s: Settings, now: Date, buildChecks: boolean): boolean {
  const { auto, everyHours } = updateSettings(s)
  if (!auto || !buildChecks) return false
  if (everyHours === 0) return true
  const last = typeof s.lastUpdateCheck === 'string' ? Date.parse(s.lastUpdateCheck) : NaN
  if (Number.isNaN(last)) return true
  const age = now.getTime() - last
  return age < 0 || age >= everyHours * 3600e3
}

/** What Settings › Updates and the indicators show. */
export interface View {
  /** The newer release, once one is found. */
  found: { version: string; notes: string; date: string | null; page: string | null; kind: InstallKind } | null
  /** A line for the person, only after a check they asked for. */
  message: string | null
}

export const idleView: View = { found: null, message: null }

/** The view after a check. `manual`: the person asked, so a result with nothing to show is still said. */
export function applyOutcome(view: View, outcome: Outcome, manual: boolean): View {
  switch (outcome.state) {
    case 'available':
      return { found: { ...outcome.release, kind: outcome.kind }, message: null }
    case 'upToDate':
      return { found: null, message: manual ? 'Oversay is up to date.' : null }
    case 'unreachable':
      return { ...view, message: manual ? "Couldn't reach the update server. Check your connection and try again." : null }
    case 'busy':
      return manual ? { ...view, message: 'A session is open. Updates wait until it ends.' } : view
  }
}
