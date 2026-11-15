import type { OverlayPlugin } from '../types'
import { mountSvelte } from '../mount'
import Timeline from './Timeline.svelte'
import { DEFAULT_OVERLAY_SETTINGS } from '../../lib/settings/overlays'
import { timelineWindow } from './windows'

/** The main overlay (spec §7, epic 007): where you are against the plan. */
export const timeline: OverlayPlugin = {
  id: 'timeline',
  name: 'Timeline',
  description: 'Where you are against the plan: the segment’s time, how far into the talk you are, and whether you’re running late or early.',
  window: timelineWindow(DEFAULT_OVERLAY_SETTINGS.timelineStyle, DEFAULT_OVERLAY_SETTINGS.stripEdge),
  // The window follows the chosen style (007/10).
  windowFor: (look) => timelineWindow(look.timelineStyle, look.stripEdge),
  mount: mountSvelte(Timeline),
}
