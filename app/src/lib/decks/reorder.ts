// Reordering in the deck editor, of cards and of their points: what a drag and the keys mean.

/** How close to the top or bottom of the scrolling view a dragged card makes it scroll. */
const EDGE = 60
const STEP = 12

/** How far to scroll, per frame, while the pointer is at `y` in a view from `top` to `bottom`. */
export function edgeScrollStep(y: number, top: number, bottom: number): number {
  const edge = Math.min(EDGE, (bottom - top) / 4)
  if (y < top + edge) return -STEP
  if (y > bottom - edge) return STEP
  return 0
}

/** The places a key press moves what has focus (a card’s grip, a point): Alt+↑ or Alt+↓ alone, else null. */
export function moveStep(e: Pick<KeyboardEvent, 'key' | 'altKey' | 'ctrlKey' | 'metaKey' | 'shiftKey'>): -1 | 1 | null {
  if (!e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return null
  return e.key === 'ArrowUp' ? -1 : e.key === 'ArrowDown' ? 1 : null
}
