// The talk started last (012/02), kept in this computer's settings so Home can offer to start it
// again. Like a favourite it names its project file and talk, with the names copied for when the
// file can't be read.
import type { FavouriteTalk } from './favourites'

export interface LastRun extends FavouriteTalk {
  /** When it was started, ISO 8601. */
  at: string
}

/** The last run in settings.json, or null when there is none or it isn't one. */
export function parseLastRun(value: unknown): LastRun | null {
  if (typeof value !== 'object' || value === null) return null
  const r = value as Record<string, unknown>
  if (
    typeof r.path !== 'string' ||
    typeof r.talkId !== 'string' ||
    typeof r.talkName !== 'string' ||
    typeof r.projectName !== 'string' ||
    typeof r.at !== 'string'
  ) {
    return null
  }
  return { path: r.path, talkId: r.talkId, talkName: r.talkName, projectName: r.projectName, at: r.at }
}
