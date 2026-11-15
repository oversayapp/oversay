// The control panel's preview (ADR 0028): with nothing running, a sample talk is put on screen
// while the panel is open, so the Timeline style, panel, text size and opacity can be set and
// seen before a meeting. It is never recorded, and ends when the panel closes.

import type { Talk } from '../project/types'

export const PREVIEW_TALK: Talk = {
  id: 'preview',
  name: 'Preview',
  segments: [
    { id: 's_prev1', name: 'Welcome', kind: 'intro', plannedSeconds: 120, openEnded: false, points: ['Who I am', 'What you will see'], hints: [] },
    {
      id: 's_prev2',
      name: 'Traction',
      kind: 'topic',
      plannedSeconds: 300,
      openEnded: false,
      points: ['Signups up **32%** this quarter', 'Two new customers:\n- Acme\n- Globex', 'Retention at 91%'],
      hints: [],
    },
    { id: 's_prev3', name: 'Questions', kind: 'outro', plannedSeconds: 180, openEnded: true, points: ['Anything unclear?'], hints: [] },
  ],
  sessions: [],
}
