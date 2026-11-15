import { describe, expect, it } from 'vitest'
import { LOOK_BACK_CHANNEL, parseLookBack } from './look-back'

describe('looking back', () => {
  it('names the channel as Rust does', () => {
    // Same value as LOOK_BACK_CHANNEL in overlay.rs.
    expect(LOOK_BACK_CHANNEL).toBe('look-back')
  })

  it('reads a segment and a time, and nothing else', () => {
    expect(parseLookBack({ index: 2, seconds: 173.5 })).toEqual({ index: 2, seconds: 173.5 })
    expect(parseLookBack(null)).toBeNull()
    expect(parseLookBack({ index: -1, seconds: 3 })).toBeNull()
    expect(parseLookBack({ index: 1.5, seconds: 3 })).toBeNull()
    expect(parseLookBack({ index: 1, seconds: 'soon' })).toBeNull()
    expect(parseLookBack({ index: 1 })).toBeNull()
  })
})
