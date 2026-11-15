import { describe, expect, it } from 'vitest'
import { FRONT_KEYS, parseNoteDoc, parseTopicTime, shownTopics, talkingPoints } from '../notes/format'
import { chatInstructions } from './chatgpt'
import { lintNote } from '../notes/lint'

const CHAT_INSTRUCTIONS = chatInstructions('0.2.0')

describe('the instructions for a chat without skills', () => {
  it('name every front matter key the app reads', () => {
    for (const key of FRONT_KEYS) expect(CHAT_INSTRUCTIONS).toMatch(new RegExp(`\\b${key}\\b`))
  })

  it('say which skill made the note, as the app reads it', () => {
    const line = /"(made-with: [^"]+)"/.exec(CHAT_INSTRUCTIONS)![1]
    expect(lintNote(`---\n${line}\n---\n## A\n- b\n`)).toEqual([])
    expect(line).toBe('made-with: Oversay skill 0.2.0')
  })

  it('show only topic times the app reads', () => {
    for (const time of CHAT_INSTRUCTIONS.match(/\[[^\]]+\]/g) ?? []) expect(parseTopicTime(time.slice(1, -1)), time).not.toBeNull()
  })

  it('describe a note the app reads as they say', () => {
    const note = '---\nwith: Sam\nlength: 30m\n---\n## Hiring [10m]\n- Two roles\n  - Budget from Priya\n## Offsite [open]\n- Dates\n'
    const topics = shownTopics(parseNoteDoc(note))
    expect(lintNote(note)).toEqual([])
    expect(topics.map((t) => t.name)).toEqual(['Hiring', 'Offsite'])
    expect(talkingPoints(topics[0])).toEqual(['Two roles\n- Budget from Priya'])
  })
})
