import type { OverlayPlugin } from '../types'
import { mountSvelte } from '../mount'
import TalkingPoints from './TalkingPoints.svelte'

/** The notes you mean to say (spec §8): the current segment's points and hints. */
export const talkingPoints: OverlayPlugin = {
  id: 'talking-points',
  name: 'Talking Points',
  description: 'The current segment’s points and hints, to glance at while you speak.',
  window: { width: 360, height: 290, minWidth: 260, minHeight: 160, place: 'top-left' },
  mount: mountSvelte(TalkingPoints),
}
