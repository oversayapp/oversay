import { describe, expect, it } from 'vitest'
import { windowTitle } from './title'

describe('windowTitle', () => {
  it('is just Oversay with no project open', () => {
    expect(windowTitle(null, null, false)).toBe('Oversay')
  })

  it('names the project, and the talk when one is open', () => {
    expect(windowTitle('Launch', null, false)).toBe('Launch – Oversay')
    expect(windowTitle('Launch', 'Customer webinar', false)).toBe('Launch — Customer webinar – Oversay')
  })

  it('says when there are unsaved changes', () => {
    expect(windowTitle('Launch', 'Webinar', true)).toBe('Launch — Webinar (unsaved) – Oversay')
  })
})
