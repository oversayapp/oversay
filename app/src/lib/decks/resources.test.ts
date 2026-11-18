import { describe, expect, it } from 'vitest'
import { addedMessage, droppedUrl, kindLabel, sizeLabel } from './resources'

describe('a deck’s resources', () => {
  it('shows sizes as Finder does', () => {
    expect(sizeLabel(512)).toBe('512 bytes')
    expect(sizeLabel(820_000)).toBe('820 KB')
    expect(sizeLabel(3_400_000)).toBe('3.4 MB')
    expect(sizeLabel(2_000_000_000)).toBe('2 GB')
  })

  it('names each kind in a word', () => {
    const r = (name: string, kind: 'file' | 'folder' | 'link' | 'alias') => kindLabel({ name, kind, size: null, modifiedMs: 0 })
    expect(r('Q3 numbers.pdf', 'file')).toBe('PDF')
    expect(r('README', 'file')).toBe('File')
    expect(r('example.com q3.webloc', 'link')).toBe('Web link')
    expect(r('Drafts', 'folder')).toBe('Folder')
    expect(r('Old report', 'alias')).toBe('Alias')
  })

  it('takes the first web link from a dragged link, and nothing else', () => {
    expect(droppedUrl('# from Safari\r\nhttps://example.com/q3\r\nhttps://other.com')).toBe('https://example.com/q3')
    expect(droppedUrl('file:///Users/sam/plan.pdf')).toBeNull()
    expect(droppedUrl('')).toBeNull()
  })

  it('says what a drop added', () => {
    expect(addedMessage(['Oversay resource test.pdf'])).toBe('Added Oversay resource test.pdf to this workspace.')
    expect(addedMessage(['a.pdf', 'b.png', 'c.txt'])).toBe('Added 3 files to this workspace.')
    expect(addedMessage([])).toBe('')
  })
})
