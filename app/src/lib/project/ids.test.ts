import { describe, expect, it } from 'vitest'
import spec from './ids.json'
import { ALPHABET, BODY_LENGTH, ID_PREFIXES, bodyFrom, isValidId, newId } from './ids'

describe('ids (ADR 0037)', () => {
  it('are made as the Rust core makes them', () => {
    expect(ALPHABET).toBe(spec.alphabet)
    expect(BODY_LENGTH).toBe(spec.length)
    expect(ID_PREFIXES).toEqual(spec.prefixes)
  })

  it('have their prefix and length', () => {
    const id = newId('deck')
    expect(id).toMatch(/^d_[a-z0-9]{8}$/)
    expect(isValidId('deck', id)).toBe(true)
    expect(isValidId('project', id)).toBe(false)
    expect(newId('deck')).not.toBe(id)
  })

  it('draw again a byte that would favour a character', () => {
    // 252 to 255 would be a to d a second time.
    expect(bodyFrom([252, 253, 254, 255, 0, 1, 2, 3, 4, 5, 6, 35])).toBe('abcdefg9')
    expect(bodyFrom([255, 0, 1])).toBeNull()
  })

  it('bring up every character evenly', () => {
    const counts = new Map<string, number>()
    const ids = 20_000
    for (let i = 0; i < ids; i++) for (const c of newId('deck').slice(2)) counts.set(c, (counts.get(c) ?? 0) + 1)
    // Expected 4444 each; a byte modulo 36 gave a–d 5000. Within 10%, about 6.7 standard deviations.
    const expected = (ids * BODY_LENGTH) / ALPHABET.length
    expect(counts.size).toBe(ALPHABET.length)
    for (const [c, n] of counts) expect(Math.abs(n - expected), `${c} came up ${n} times`).toBeLessThan(expected / 10)
  })

  it('are checked as the Rust core checks them', () => {
    expect(isValidId('deck', 'd_k3x9a2bq')).toBe(true)
    expect(isValidId('deck', 'p_k3x9a2bq')).toBe(false)
    expect(isValidId('deck', 'd_')).toBe(false)
    expect(isValidId('deck', 'd_K3X9')).toBe(false)
    expect(isValidId('deck', 'd_k3x9-2bq')).toBe(false)
    expect(isValidId('deck', `d_${'a'.repeat(17)}`)).toBe(false)
  })
})
