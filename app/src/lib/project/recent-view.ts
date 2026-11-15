import type { RecentProject } from './recent'

export interface RecentGroup<T extends RecentProject> {
  label: 'Pinned' | 'Today' | 'Earlier'
  items: T[]
}

const sameDay = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()

/**
 * Pinned projects first, newest pin first (`pinned` is their paths in that order); then
 * today, then everything older, each in the order given (newest first). Empty groups are left out.
 */
export function groupRecent<T extends RecentProject>(list: T[], now = new Date(), pinned: readonly string[] = []): RecentGroup<T>[] {
  const pins = list.filter((e) => pinned.includes(e.path)).sort((a, b) => pinned.indexOf(a.path) - pinned.indexOf(b.path))
  const rest = list.filter((e) => !pinned.includes(e.path))
  const today = rest.filter((e) => sameDay(new Date(e.openedAt), now))
  const earlier = rest.filter((e) => !sameDay(new Date(e.openedAt), now))
  return [
    { label: 'Pinned' as const, items: pins },
    { label: 'Today' as const, items: today },
    { label: 'Earlier' as const, items: earlier },
  ].filter((g) => g.items.length > 0)
}

/** A time for something opened today, a date for anything older. */
export function whenLabel(openedAt: string, now = new Date()): string {
  const d = new Date(openedAt)
  return sameDay(d, now)
    ? d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
    : d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
}

/** The folder part of a file path, for either kind of separator. */
export function folderOf(path: string): string {
  const cut = Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\'))
  if (cut < 0) return ''
  return cut === 0 ? path.slice(0, 1) : path.slice(0, cut)
}

/**
 * The folder a project is in, the way the New project panel shows it: starting from your home
 * folder and joined with ›, e.g. "Documents › Oversay › Projects › Spring keynote". Folders
 * outside your home folder are shown in full, the same way.
 */
export function folderLabel(path: string): string {
  const folder = folderOf(path)
  const fromHome = folder.replace(/^(\/Users\/[^/]+|\/home\/[^/]+|[A-Za-z]:\\Users\\[^\\]+)(?=[\\/]|$)/, '')
  return fromHome.split(/[\\/]/).filter(Boolean).join(' › ') || (fromHome === folder ? folder : 'Home folder')
}
