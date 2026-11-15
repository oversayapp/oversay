import { describe, expect, it } from 'vitest'
import type { DeckSession } from '../decks/sessions'
import { alignTranscript, parseCaptions, readTranscript } from './transcript'

const START = Date.parse('2026-10-28T09:00:00.000Z')
const iso = (s: number) => new Date(START + s * 1000).toISOString()
/** How the heading names the run: its start in local time. */
const d = new Date(START)
const heading = `${d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`

// Intro 0–60 s, Atlas 60–200 s with a pause 120–150 s, Questions (untimed) 200–300 s.
const session: DeckSession = {
  startedAt: iso(0),
  endedAt: iso(300),
  cards: [
    { name: 'Intro', kind: 'intro', plannedSeconds: 60, seconds: 60 },
    { name: 'Atlas', kind: 'topic', plannedSeconds: 180, seconds: 110 },
    { name: 'Questions', kind: 'outro', plannedSeconds: null, seconds: 100 },
  ],
  visits: [
    { card: 0, from: iso(0), to: iso(60) },
    { card: 1, from: iso(60), to: iso(120) },
    { card: 1, from: iso(150), to: iso(200) },
    { card: 2, from: iso(200), to: iso(300) },
  ],
  pausedSeconds: 30,
}

const ZOOM = `WEBVTT

1
00:00:02.120 --> 00:00:05.000
Alex Rivera: Morning all, three things today.

2
00:01:16.000 --> 00:01:20.500
Alex Rivera: Atlas shipped on Monday.

3
00:02:10.000 --> 00:02:12.000
Priya: Said while paused.

4
00:03:25.000 --> 00:03:30.000
Priya: Any questions?
`

const TEAMS = `WEBVTT

0a1b-2c3d/12-0
00:00:03.000 --> 00:00:04.000
<v Aoife Byrne>Welcome everyone.</v>

0a1b-2c3d/13-0
00:01:05.000 --> 00:01:08.000
<v Mark Doyle>Let me share my screen.</v>
`

describe('reading a call transcript', () => {
  it('reads a Zoom .vtt, with the clock time in its name, and its speakers', () => {
    const c = parseCaptions('GMT20261028-085958_Recording.transcript.vtt', ZOOM)
    if ('error' in c) throw new Error(c.error)
    expect(c.source).toBe('Zoom')
    expect(c.clockStartMs).toBe(Date.parse('2026-10-28T08:59:58Z'))
    expect(c.cues[0]).toEqual({ at: 2120, speaker: 'Alex Rivera', text: 'Morning all, three things today.' })
    expect(c.cues).toHaveLength(4)
  })

  it("reads a Teams .vtt's <v Speaker> lines", () => {
    const c = parseCaptions('Weekly stand-up.vtt', TEAMS)
    if ('error' in c) throw new Error(c.error)
    expect(c.source).toBe('Teams')
    expect(c.clockStartMs).toBeNull()
    expect(c.cues.map((q) => [q.at, q.speaker, q.text])).toEqual([
      [3000, 'Aoife Byrne', 'Welcome everyone.'],
      [65000, 'Mark Doyle', 'Let me share my screen.'],
    ])
  })

  it('reads an .srt and a .txt with a time on each line', () => {
    const srt = parseCaptions('call.srt', '1\n00:00:01,500 --> 00:00:03,000\nHello there\n\n2\n00:00:04,000 --> 00:00:05,000\nSecond line\n')
    if ('error' in srt) throw new Error(srt.error)
    expect(srt.cues.map((q) => [q.at, q.text])).toEqual([
      [1500, 'Hello there'],
      [4000, 'Second line'],
    ])
    const txt = parseCaptions('meet.txt', 'Meeting notes\n[00:00:07] Sam: First\n1:02:03 Second, with no speaker\n')
    if ('error' in txt) throw new Error(txt.error)
    expect(txt.cues).toEqual([
      { at: 7000, speaker: 'Sam', text: 'First' },
      { at: 3723000, speaker: '', text: 'Second, with no speaker' },
    ])
  })

  it('refuses a file that has no timed lines, saying what it took it for', () => {
    expect(parseCaptions('notes.txt', 'Just some notes\nwith no times')).toEqual({ error: 'notes.txt has no timed lines: it doesn’t look like a call transcript.' })
    expect(parseCaptions('slides.pdf', '%PDF')).toEqual({ error: 'slides.pdf isn’t a transcript: Oversay reads .vtt, .srt and .txt files.' })
  })
})

describe('lining a transcript up with the cards', () => {
  it('puts each line under the card that was up then, by clock time, leaving out pauses and lines outside the run', () => {
    const c = parseCaptions('GMT20261028-085958_Recording.transcript.vtt', ZOOM)
    if ('error' in c) throw new Error(c.error)
    const a = alignTranscript(c, 'GMT20261028-085958_Recording.transcript.vtt', session, 'Stand-up', 0)
    // The file starts 2 s before Start: its 0:02.1 is the run's 0:00.1, its 1:16 the run's 1:14.
    expect(a.kept).toBe(3)
    expect(a.leftOut).toBe(1)
    expect(a.offsetSeconds).toBe(-2)
    expect(a.markdown).toBe(`---
session: ${iso(0)}
source: Zoom (GMT20261028-085958_Recording.transcript.vtt)
---

# Stand-up · ${heading}

## Intro · 1:00 planned, 1:00 actual
- 0:00 **Alex Rivera:** Morning all, three things today.

## Atlas · 3:00 planned, 1:50 actual
- 1:14 **Alex Rivera:** Atlas shipped on Monday.

## Questions · untimed, 1:40 actual
- 3:23 **Priya:** Any questions?
`)
  })

  it('without a clock time, starts the file at Start, and can be moved by a few seconds', () => {
    const c = parseCaptions('Weekly stand-up.vtt', TEAMS)
    if ('error' in c) throw new Error(c.error)
    expect(readTranscript(alignTranscript(c, 'Weekly stand-up.vtt', session, 'Stand-up', 0).markdown).cards.map((k) => k.lines.length)).toEqual([1, 1, 0])
    // 5 s earlier: Mark's 1:05 becomes 1:00, the first moment of Atlas; Aoife's 0:03 is before Start.
    const moved = alignTranscript(c, 'Weekly stand-up.vtt', session, 'Stand-up', -5)
    expect(moved.kept).toBe(1)
    expect(readTranscript(moved.markdown).cards[1].lines[0]).toEqual({ time: '1:00', speaker: 'Mark Doyle', text: 'Let me share my screen.' })
  })

  it("lines up a session kept before visits by each card's time in order", () => {
    const old: DeckSession = { ...session, visits: undefined, pausedSeconds: undefined }
    const c = parseCaptions('x.srt', '1\n00:01:55,000 --> 00:01:56,000\nlate in Atlas\n\n2\n00:04:30,000 --> 00:04:31,000\nafter the end\n')
    if ('error' in c) throw new Error(c.error)
    const a = alignTranscript(c, 'x.srt', old, 'Stand-up', 0)
    expect(a.kept).toBe(1)
    expect(readTranscript(a.markdown).cards[1].lines.map((l) => l.text)).toEqual(['late in Atlas'])
  })
})

describe('reading a saved transcript back', () => {
  it('gives its source and each card with its lines', () => {
    const t = readTranscript(`---
session: x
source: Zoom (a.vtt)
---

# Stand-up

## Intro · 1:00 planned, 1:14 actual
- 0:02 **John:** Morning.
- 0:09 No speaker here.

## Atlas · 3:00 planned, 0:00 actual
`)
    expect(t.source).toBe('Zoom (a.vtt)')
    expect(t.cards).toEqual([
      {
        title: 'Intro',
        times: '1:00 planned, 1:14 actual',
        lines: [
          { time: '0:02', speaker: 'John', text: 'Morning.' },
          { time: '0:09', speaker: '', text: 'No speaker here.' },
        ],
      },
      { title: 'Atlas', times: '3:00 planned, 0:00 actual', lines: [] },
    ])
  })
})
