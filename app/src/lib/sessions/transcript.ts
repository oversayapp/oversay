// A session's transcript (ADR 0041, spec §11): a call app's transcript (Zoom, Teams or Meet,
// as .vtt, .srt or a .txt with a time on each line) read into timed lines, lined up with the cards
// by when each was on screen, and written as Markdown split by card, each card a heading with its
// planned and actual time. Lines from before Start, after Stop or while paused are left out. Pure,
// so the session's page and its tests agree; the recording's transcript is written the same.

import { formatDuration } from '../project/duration'
import type { DeckSession } from '../decks/sessions'

/** One timed line: when it was said, in ms from the file's start, who said it ('' when not known), and what. */
export interface Cue {
  at: number
  speaker: string
  text: string
}

export interface Captions {
  /** The call app, as far as the file says: Zoom or Teams, or '' when it doesn't. */
  source: string
  /** The clock time the file starts at, when it says (Zoom's file names do), else null. */
  clockStartMs: number | null
  cues: Cue[]
}

/** The kinds of file read, by extension. */
export const TRANSCRIPT_EXTENSIONS = ['.vtt', '.srt', '.txt'] as const

const ext = (name: string) => name.slice(name.lastIndexOf('.')).toLowerCase()

/** `HH:MM:SS.mmm`, `MM:SS,mmm` or `H:MM:SS` in ms. */
function stamp(text: string): number {
  const [clock, frac = '0'] = text.split(/[.,]/)
  const parts = clock.split(':').map(Number)
  const [h, m, s] = parts.length === 3 ? parts : [0, ...parts]
  return ((h * 60 + m) * 60 + s) * 1000 + Math.round(Number(`0.${frac}`) * 1000)
}

const CUE_TIME = /^\s*((?:\d{1,2}:)?\d{1,2}:\d{2}[.,]\d{1,3})\s*-->/
const LINE_TIME = /^\s*\[?((?:\d{1,2}:)?\d{1,2}:\d{2})\]?\s+(.*)$/
const VOICE = /^<v(?:\.[^ >]*)?\s+([^>]+)>(.*?)(?:<\/v>)?$/
const SPEAKER = /^([^:<>]{1,40}?):\s+(.+)$/

/** Who said it and what, from a caption's text: Teams' `<v Name>`, or `Name: text`. */
function said(text: string): { speaker: string; text: string } {
  const voice = VOICE.exec(text)
  if (voice) return { speaker: voice[1].trim(), text: voice[2].replace(/<[^>]+>/g, '').trim() }
  const plain = text.replace(/<[^>]+>/g, '').trim()
  const named = SPEAKER.exec(plain)
  return named && !/\d:\d/.test(named[1]) ? { speaker: named[1].trim(), text: named[2].trim() } : { speaker: '', text: plain }
}

/** Reads a transcript file into timed lines, or says why it can't. */
export function parseCaptions(name: string, text: string): Captions | { error: string } {
  const kind = ext(name)
  if (!(TRANSCRIPT_EXTENSIONS as readonly string[]).includes(kind)) return { error: `${name} isn’t a transcript: Oversay reads .vtt, .srt and .txt files.` }
  const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/)
  const cues: Cue[] = []
  let voices = false
  for (let i = 0; i < lines.length; i++) {
    const timed = CUE_TIME.exec(lines[i])
    if (timed) {
      // A caption: its time, then its text up to a blank line.
      const body: string[] = []
      while (i + 1 < lines.length && lines[i + 1].trim() !== '') body.push(lines[++i].trim())
      if (body.some((b) => b.startsWith('<v'))) voices = true
      const s = said(body.join(' '))
      if (s.text) cues.push({ at: stamp(timed[1]), ...s })
      continue
    }
    const line = kind === '.txt' ? LINE_TIME.exec(lines[i]) : null
    if (line) {
      const s = said(line[2])
      if (s.text) cues.push({ at: stamp(line[1]), ...s })
    }
  }
  if (cues.length === 0) return { error: `${name} has no timed lines: it doesn’t look like a call transcript.` }
  // Zoom names its files by when the recording started, in UTC: GMT20261028-090001_Recording…
  const zoom = /GMT(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})(\d{2})/.exec(name)
  const clockStartMs = zoom ? Date.UTC(+zoom[1], +zoom[2] - 1, +zoom[3], +zoom[4], +zoom[5], +zoom[6]) : null
  const source = zoom ? 'Zoom' : voices ? 'Teams' : ''
  return { source, clockStartMs, cues: cues.sort((a, b) => a.at - b.at) }
}

/** The card on screen `ms` after Start, or -1 before Start, after Stop or while paused. */
export function cardAt(session: DeckSession, ms: number): number {
  const start = Date.parse(session.startedAt)
  if (session.visits?.length) {
    const t = start + ms
    return session.visits.find((v) => Date.parse(v.from) <= t && t < Date.parse(v.to))?.card ?? -1
  }
  // Kept before visits: each card's time, in order.
  let from = 0
  for (let i = 0; i < session.cards.length; i++) {
    const to = from + session.cards[i].seconds * 1000
    if (ms >= from && ms < to) return i
    from = to
  }
  return -1
}

/** Text on one line, as a heading or a line of the transcript holds it. */
export const oneLine = (s: string) => s.replace(/\s+/g, ' ').trim()

const pad = (n: number) => String(n).padStart(2, '0')
/** `0:07`, `12:30`, `1:02:03`: when it was said, from Start. */
function since(ms: number): string {
  const s = Math.floor(ms / 1000)
  return s >= 3600 ? `${Math.floor(s / 3600)}:${pad(Math.floor(s / 60) % 60)}:${pad(s % 60)}` : formatDuration(s)
}

/** A card's heading: its name, planned and actual time. */
const cardTimes = (c: DeckSession['cards'][number]) => `${c.plannedSeconds === null ? 'untimed' : `${formatDuration(c.plannedSeconds)} planned`}, ${formatDuration(c.seconds)} actual`

/** The run's start, as the heading names it: `Wed 28 Oct 09:00`, local time. */
export function runLabel(startedAt: string): string {
  const d = new Date(startedAt)
  return `${d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/** Writes timed lines, already in ms from Start, as the session's transcript, split by card. */
export function transcriptMarkdown(session: DeckSession, deckName: string, source: string, lines: readonly Cue[]): { markdown: string; kept: number; leftOut: number } {
  const byCard = session.cards.map((): Cue[] => [])
  let leftOut = 0
  for (const line of lines) {
    const card = line.at >= 0 ? cardAt(session, line.at) : -1
    if (card < 0) leftOut++
    else byCard[card].push(line)
  }
  // A line break or a stray `#` in what was said would start a heading of its own.
  const body = session.cards
    .map((c, i) => {
      const said = byCard[i].map((l) => `- ${since(l.at)} ${l.speaker ? `**${oneLine(l.speaker).replace(/\*/g, '')}:** ` : ''}${oneLine(l.text)}`)
      return [`## ${oneLine(c.name)} · ${cardTimes(c)}`, ...said].join('\n')
    })
    .join('\n\n')
  const markdown = `---\nsession: ${session.startedAt}\nsource: ${oneLine(source)}\n---\n\n# ${oneLine(deckName)} · ${runLabel(session.startedAt)}\n\n${body}\n`
  return { markdown, kept: lines.length - leftOut, leftOut }
}

/**
 * Lines a call's transcript up with the session: by the file's clock time when it has one, else
 * with its start at Start; `nudgeSeconds` moves it (the session's page lets the person adjust it).
 */
export function alignTranscript(
  captions: Captions,
  fileName: string,
  session: DeckSession,
  deckName: string,
  nudgeSeconds: number,
): { markdown: string; kept: number; leftOut: number; offsetSeconds: number } {
  const start = Date.parse(session.startedAt)
  const offset = (captions.clockStartMs === null ? 0 : captions.clockStartMs - start) + nudgeSeconds * 1000
  const lines = captions.cues.map((c) => ({ ...c, at: c.at + offset }))
  const source = captions.source ? `${captions.source} (${fileName})` : fileName
  return { ...transcriptMarkdown(session, deckName, source, lines), offsetSeconds: Math.round(offset / 1000) }
}

export interface TranscriptLine {
  time: string
  speaker: string
  text: string
}

/** A saved transcript read back for the session's page: where it came from, and each card's lines. */
export function readTranscript(markdown: string): { source: string; cards: { title: string; times: string; lines: TranscriptLine[] }[] } {
  const source = /^source:\s*(.*)$/m.exec(markdown)?.[1].trim() ?? ''
  const cards: { title: string; times: string; lines: TranscriptLine[] }[] = []
  for (const line of markdown.split(/\r?\n/)) {
    // The times come after the last " · ": a card's name may have one too.
    const card = /^## (.*?)(?: · ([^·]*))?$/.exec(line)
    if (card) {
      cards.push({ title: card[1], times: card[2] ?? '', lines: [] })
      continue
    }
    const said = /^- (\d+:\d{2}(?::\d{2})?) (?:\*\*(.+?):\*\* )?(.*)$/.exec(line)
    if (said && cards.length) cards.at(-1)!.lines.push({ time: said[1], speaker: said[2] ?? '', text: said[3] })
  }
  return { source, cards }
}
