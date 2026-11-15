// Operations on an ordered list of short texts (a segment's talking points or hints).
// All return new lists; the moves return the same list when nothing would change.

export function insertItem(list: string[], index: number, text = ''): string[] {
  return [...list.slice(0, index), text, ...list.slice(index)]
}

export function setItem(list: string[], index: number, text: string): string[] {
  return list.map((item, i) => (i === index ? text : item))
}

export function removeItem(list: string[], index: number): string[] {
  return index < 0 || index >= list.length ? list : list.filter((_, i) => i !== index)
}

export function moveItem(list: string[], index: number, delta: -1 | 1): string[] {
  const to = index + delta
  if (index < 0 || index >= list.length || to < 0 || to >= list.length) return list
  const next = [...list]
  ;[next[index], next[to]] = [next[to], next[index]]
  return next
}

/**
 * Moves the item at `from` to an insertion position (0 is before the first, n after the last,
 * counted on the list before the move), as a drag drops it. Same list when it wouldn't move.
 */
export function moveItemTo(list: string[], from: number, position: number): string[] {
  if (from < 0 || from >= list.length) return list
  const at = Math.max(0, Math.min(position, list.length))
  if (at === from || at === from + 1) return list
  const next = [...list]
  const [moved] = next.splice(from, 1)
  next.splice(at > from ? at - 1 : at, 0, moved)
  return next
}

/** Insertion position for a pointer at `y`, given the vertical midpoints of the rows in order. */
export function dropIndex(midpoints: number[], y: number): number {
  return midpoints.filter((m) => m < y).length
}
