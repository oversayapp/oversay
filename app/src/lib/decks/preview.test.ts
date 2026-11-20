import { describe, expect, it } from 'vitest'
import { isEditorPreview } from './show'

describe("the deck editor's preview on screen", () => {
  it("is a deck preview that isn't the Look card's sample deck (ADR 0051)", () => {
    expect(isEditorPreview({ status: 'running', deck: true, preview: true })).toBe(true)
    expect(isEditorPreview({ status: 'running', deck: true, preview: true, lookPreview: true })).toBe(false)
    expect(isEditorPreview({ status: 'finished', deck: true, preview: true })).toBe(false)
    expect(isEditorPreview({ status: 'running', deck: true, preview: false })).toBe(false)
    expect(isEditorPreview(null)).toBe(false)
  })
})
