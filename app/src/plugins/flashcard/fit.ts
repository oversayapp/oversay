// The flashcard widget sizes its window to the card (design "No jumps"): the height the card
// asks for, and how it eases there.

/** The room under the deck widget's panel for its tab of buttons, which slides out from there. */
export const TAB_HEIGHT = 54

/** How long the window takes to grow or shrink to a new card. */
export const SIZE_MS = 320

export const easeOut = (t: number): number => 1 - Math.pow(1 - t, 3)

/**
 * The window height the card asks for: the frame as it is now, less the room its body has, plus what
 * the body's content needs; and the 1 px the frame keeps from the window's edge on each side.
 */
export function wantedHeight(now: { frame: number; body: number; content: number }): number {
  return Math.ceil(now.frame - now.body + now.content + 2)
}
