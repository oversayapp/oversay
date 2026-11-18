import { describe, expect, it } from 'vitest'
import { nameForPasted, pastedDeckText, planDrop } from './drop'

describe('a note file dropped on Oversay', () => {
  it('copies Markdown files in and leaves out what is not a note', () => {
    expect(planDrop(['/d/Catch-up with Sam.md', '/d/Board prep v2.MD', '/d/invoice-0931.pdf'])).toEqual({
      notes: ['/d/Catch-up with Sam.md', '/d/Board prep v2.MD'],
      left: [{ path: '/d/invoice-0931.pdf', why: 'Not a note' }],
    })
  })

  it('leaves a project file out: projects are gone (ADR 0039)', () => {
    expect(planDrop(['C:\\Users\\a\\Spring.oversay.json'])).toEqual({ notes: [], left: [{ path: 'C:\\Users\\a\\Spring.oversay.json', why: 'Projects are gone: make a deck instead' }] })
  })
})

describe('Markdown pasted as a note', () => {
  it('is named from its title, else its first topic', () => {
    expect(nameForPasted('# Catch-up with Sam\n\n## Hiring\n- Two roles\n')).toBe('Catch-up with Sam')
    expect(nameForPasted('---\nwith: Sam\n---\n## Hiring [10m]\n- Two roles\n')).toBe('Hiring')
    expect(nameForPasted('- just a point\n')).toBe('Pasted note')
    expect(nameForPasted('# Release notes ##\n')).toBe('Release notes')
  })
})

describe('the text a pasted deck is made from', () => {
  it('ends in one newline, and is nothing when it is blank', () => {
    expect(pastedDeckText('## A [1m]\n- b')).toBe('## A [1m]\n- b\n')
    expect(pastedDeckText('## A\n\n\n')).toBe('## A\n')
    expect(pastedDeckText('  \n ')).toBeNull()
  })
})
