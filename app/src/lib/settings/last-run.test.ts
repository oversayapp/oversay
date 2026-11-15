import { describe, expect, it } from 'vitest'
import { parseLastRun } from './last-run'

describe('parseLastRun', () => {
  const ok = { path: '/p/a.oversay', talkId: 't_1', talkName: 'Webinar', projectName: 'Launch', at: '2026-10-11T09:00:00Z' }

  it('reads a complete last run, dropping unknown fields', () => {
    expect(parseLastRun({ ...ok, extra: 1 })).toEqual(ok)
  })

  it('is null for nothing, or for anything that is not a complete one', () => {
    expect(parseLastRun(undefined)).toBeNull()
    expect(parseLastRun(null)).toBeNull()
    expect(parseLastRun('x')).toBeNull()
    expect(parseLastRun({ ...ok, talkId: 3 })).toBeNull()
    expect(parseLastRun({ path: ok.path })).toBeNull()
  })
})
