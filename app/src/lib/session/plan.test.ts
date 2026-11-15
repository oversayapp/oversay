import { describe, expect, it } from 'vitest'
import { specExample } from '../project/example'
import { planFromTalk } from './plan'

describe('planFromTalk', () => {
  it('snapshots each segment: id, name, planned length, open-ended', () => {
    const talk = specExample.talks[0]
    expect(planFromTalk(talk)).toEqual(
      talk.segments.map((s) => ({ segmentId: s.id, name: s.name, plannedSeconds: s.plannedSeconds, openEnded: s.openEnded })),
    )
  })
})
