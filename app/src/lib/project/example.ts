import type { Project } from './types'

// The example file from spec §3, kept verbatim as the shared test fixture.
export const specExample: Project = {
  schemaVersion: 1,
  id: 'p_7k2m',
  name: 'Oversay launch',
  description:
    'Launch talks for Oversay, a presenter timer for Mac and Windows. Keep every version under time and leave room for questions.',
  talks: [
    {
      id: 't_a91c',
      name: 'DevConf 20 min',
      audience: 'Conference',
      targetSeconds: 1200,
      segments: [
        {
          id: 's_01',
          name: 'Intro',
          kind: 'intro',
          plannedSeconds: 120,
          openEnded: false,
          points: ['Who I am', 'Why timing matters'],
          hints: ['Smile, slow down'],
        },
        {
          id: 's_02',
          name: 'Live demo',
          kind: 'demo',
          plannedSeconds: 300,
          openEnded: true,
          points: ['Create a talk from a template', 'Run it with the overlay'],
          hints: [],
        },
      ],
      sessions: [
        {
          id: 'r_5d0e',
          startedAt: '2026-10-20T14:00:03Z',
          endedAt: '2026-10-20T14:21:40Z',
          plan: [{ segmentId: 's_01', name: 'Intro', plannedSeconds: 120, openEnded: false }],
          events: [
            { at: '2026-10-20T14:00:03Z', type: 'start' },
            { at: '2026-10-20T14:02:31Z', type: 'next' },
            { at: '2026-10-20T14:02:35Z', type: 'previous' },
            { at: '2026-10-20T14:02:50Z', type: 'next' },
            { at: '2026-10-20T14:21:40Z', type: 'end' },
          ],
        },
      ],
    },
  ],
}
