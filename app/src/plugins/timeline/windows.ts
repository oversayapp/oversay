// The overlay window each Timeline style needs (007/10): a different shape each, so choosing a
// style in Settings › Overlays resizes and moves an open overlay. The styles' sizes include the
// tabs hanging from a card (the buttons, the talk's name), which sit outside the panel.
import type { StripEdge, TimelineStyle } from '../../lib/settings/overlays'
import type { OverlayWindowSize } from '../../lib/windows'

export const TIMELINE_WINDOWS: Record<TimelineStyle, OverlayWindowSize> = {
  // The waveform: wide, along the bottom of a slide, remembering its own frame.
  waveform: { width: 1100, height: 200, minWidth: 640, minHeight: 200, place: 'bottom-centre', layout: 'waveform' },
  // The screen's whole width, along its bottom edge: the strip and the pill above it.
  strip: { width: 1100, height: 76, minWidth: 560, minHeight: 76, place: 'bottom-strip', layout: 'strip' },
}

/** The window for the chosen style; the strip also follows where it is to sit (Dock or screen edge). */
export const timelineWindow = (style: TimelineStyle, stripEdge: StripEdge = 'screen'): OverlayWindowSize => {
  const size = TIMELINE_WINDOWS[style]
  if (style === 'strip') return { ...size, against: stripEdge === 'dock' ? 'work-area' : 'screen' }
  return size
}
