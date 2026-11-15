export interface RecentProject {
  path: string
  name: string
  /** ISO 8601 UTC. */
  openedAt: string
  /** Number of talks when last opened or saved; absent in lists written before this was recorded. */
  talks?: number
}

export const MAX_RECENT = 10

/** Newest first. Re-opening a path moves it to the top and refreshes its name and time. */
export function addRecent(list: RecentProject[], entry: RecentProject): RecentProject[] {
  return [entry, ...list.filter((e) => e.path !== entry.path)].slice(0, MAX_RECENT)
}

export function removeRecent(list: RecentProject[], path: string): RecentProject[] {
  return list.filter((e) => e.path !== path)
}

const isEntry = (v: unknown): v is RecentProject =>
  typeof v === 'object' &&
  v !== null &&
  typeof (v as RecentProject).path === 'string' &&
  typeof (v as RecentProject).name === 'string' &&
  typeof (v as RecentProject).openedAt === 'string' &&
  ['undefined', 'number'].includes(typeof (v as RecentProject).talks)

export function serializeRecent(list: RecentProject[]): string {
  return JSON.stringify({ version: 1, recent: list }, null, 2) + '\n'
}

/** A missing, broken or unexpected file just means an empty list: it is only a convenience. */
export function parseRecent(text: string): RecentProject[] {
  try {
    const data = JSON.parse(text)
    return Array.isArray(data?.recent) ? data.recent.filter(isEntry).slice(0, MAX_RECENT) : []
  } catch {
    return []
  }
}
