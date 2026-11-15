import { describe, expect, it } from 'vitest'
import { SETTINGS_SECTIONS, atScrollEnd, currentSection } from './sections'

describe('which Settings section is current', () => {
  // Section tops relative to the top of the scrolling area, in page order.
  it('is the first section at the top of the page', () => {
    expect(currentSection([16, 300, 700], 16, false)).toBe(0)
  })

  it('is the last section whose top has reached the offset', () => {
    expect(currentSection([-420, -100, 240, 600], 16, false)).toBe(1)
    expect(currentSection([-420, -100, 10, 600], 16, false)).toBe(2)
  })

  it('counts a section as reached when its top is exactly at the offset', () => {
    expect(currentSection([-300, 16, 400], 16, false)).toBe(1)
  })

  it('is the first section when none has reached the offset', () => {
    expect(currentSection([100, 400], 16, false)).toBe(0)
  })

  it('is the last section at the end of the page, though it never reaches the top', () => {
    expect(currentSection([-500, -200, 150, 380], 16, true)).toBe(3)
  })

  it('copes with no sections', () => {
    expect(currentSection([], 16, false)).toBe(0)
  })
})

describe('the end of the page', () => {
  it('is reached when the scroll offset plus the view fills the page', () => {
    expect(atScrollEnd(1200, 600, 1800)).toBe(true)
    expect(atScrollEnd(1199, 600, 1800)).toBe(true) // sub-pixel scrolling
    expect(atScrollEnd(800, 600, 1800)).toBe(false)
  })

  it('is not reached on a page that fits without scrolling', () => {
    expect(atScrollEnd(0, 900, 900)).toBe(false)
  })
})

describe('the sections list', () => {
  it('has unique ids and a label for each', () => {
    const ids = SETTINGS_SECTIONS.map((s) => s.id)
    expect(new Set(ids).size).toBe(ids.length)
    expect(SETTINGS_SECTIONS.every((s) => s.label.length > 0)).toBe(true)
  })
})
