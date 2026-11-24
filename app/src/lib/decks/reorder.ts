// Reordering the cards of a deck in the deck editor: what the drag and the keys mean.

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
