// A quick note (ADR 0026) is a Markdown file read as topics and points. The note is
// kept as its lines: every edit rewrites only the lines it touches, so a file written by hand is
// saved back byte for byte where it wasn't edited, and lines the editor doesn't show (quotes,
// tables, code, deeper headings) stay where they were.

import { formatDuration, parseDuration } from '../project/duration'
import { SEGMENT_KINDS, type SegmentKind } from '../project/types'

/** A topic's time from its heading: `[5m]`, `[~5m]` (about five minutes), `[open]`. */
export interface TopicTime {
  seconds: number
  /** No fixed end: `[open]`, or `[~5m]` where the five minutes is only an estimate. */
  open: boolean
}

/** A point, or a sub-point (`depth` 1) under the point before it. */
export interface PointItem {
  kind: 'point'
  depth: 0 | 1
  text: string
  /** Its lines as they are in the file, endings included (a long point may run over several). */
  lines: string[]
  /** What comes before the text on its first line: indent, list marker and space, or nothing for a plain line. */
  prefix: string
}

/** A line kept as written and not shown: a blank, a quote, a table row, code, a `###` heading. */
export interface KeptItem {
  kind: 'kept'
  line: string
}

export type Item = PointItem | KeptItem

export interface Topic {
  /** The `## ` line as it is in the file; null for the lines before the first topic. */
  heading: string | null
  name: string
  time: TopicTime | null
  /** A segment kind written in the heading (`[5m, demo]`), used when the note becomes a talk. */
  segmentKind: SegmentKind | null
  items: Item[]
}

export interface NoteDoc {
  /** The line ending new lines get: the file's own, or `\n` for a new note. */
  eol: string
  /** The front matter's lines, `---` included, or empty when there is none. */
  front: string[]
  /** `topics[0]` holds what comes before the first `## ` heading; it has no heading. */
  topics: Topic[]
}

/** The front matter keys a note uses: who it is with, when it meets, how long it runs. */
export const FRONT_KEYS = ['with', 'when', 'length'] as const
export type FrontKey = (typeof FRONT_KEYS)[number]

/**
 * The key the Oversay skill sets on a note it makes: `made-with: Oversay skill 0.2.0`. It
 * isn't shown or edited here, and is kept like any other line; it tells Oversay which version of
 * the skill wrote the note, so a skill in a chat app's account can be found out of date.
 */
export const MADE_WITH_KEY = 'made-with'
export const MADE_WITH_VALUE = /^Oversay skill (\d+\.\d+\.\d+)$/

/** The version of the skill that made the note, or null when it doesn't say. */
export function madeWithVersion(doc: NoteDoc): string | null {
  return MADE_WITH_VALUE.exec(frontValue(doc, MADE_WITH_KEY))?.[1] ?? null
}

const LINE = /[^\r\n]*(?:\r\n|\n|\r)|[^\r\n]+$/g
const ENDING = /(\r\n|\n|\r)$/
const body = (line: string) => line.replace(ENDING, '')
const indentWidth = (s: string) => s.replace(/\t/g, '    ').length

const HEADING = /^##[ \t]+(.*?)[ \t]*$/
const TIMED = /^(.*?)[ \t]*\[([^\]]*)\]$/
const ITEM = /^([ \t]*)([-*+]|\d+[.)])([ \t]+|$)(.*)$/
const FENCE = /^[ \t]*(```|~~~)/
const FRONT_FIELD = /^([A-Za-z][\w-]*):[ \t]*(.*?)[ \t]*$/

/** A line shown as written, never as a point. */
function isKept(text: string): boolean {
  if (text.trim() === '') return true
  if (/^[ \t]*[>|<]/.test(text)) return true
  // Headings other than a topic's `## `: the title and deeper headings.
  if (/^[ \t]*#{1,6}([ \t]|$)/.test(text)) return true
  // A rule: three or more of the same mark.
  return /^[ \t]*([-*_])([ \t]*\1){2,}[ \t]*$/.test(text)
}

/** `[5m]`, `[~5m]`, `[open]`, `[1:30, demo]`; null when the brackets hold something else. */
export function parseTopicTime(text: string): { time: TopicTime | null; segmentKind: SegmentKind | null } | null {
  let time: TopicTime | null = null
  let segmentKind: SegmentKind | null = null
  for (const raw of text.split(',')) {
    const part = raw.trim().toLowerCase()
    if ((SEGMENT_KINDS as readonly string[]).includes(part) && !segmentKind) {
      segmentKind = part as SegmentKind
      continue
    }
    if (time) return null
    if (part === 'open') {
      time = { seconds: 0, open: true }
      continue
    }
    const about = part.startsWith('~')
    const seconds = parseDuration(part.replace(/^~\s*/, '').replace(/\s*min$/, 'm'))
    if (seconds === null || seconds <= 0) return null
    time = { seconds, open: about }
  }
  return time || segmentKind ? { time, segmentKind } : null
}

/** A topic's time as its heading writes it, or '' for none. */
export function topicTimeText(time: TopicTime | null, segmentKind: SegmentKind | null = null): string {
  const bits: string[] = []
  if (time) {
    if (time.open && time.seconds === 0) bits.push('open')
    else bits.push((time.open ? '~' : '') + (time.seconds % 60 === 0 ? `${time.seconds / 60}m` : formatDuration(time.seconds)))
  }
  if (segmentKind) bits.push(segmentKind)
  return bits.length ? ` [${bits.join(', ')}]` : ''
}

function readHeading(line: string): Pick<Topic, 'name' | 'time' | 'segmentKind'> | null {
  const heading = HEADING.exec(body(line))
  if (!heading) return null
  const timed = TIMED.exec(heading[1])
  const parsed = timed ? parseTopicTime(timed[2]) : null
  if (timed && parsed) return { name: timed[1], ...parsed }
  return { name: heading[1], time: null, segmentKind: null }
}

export function parseNoteDoc(text: string): NoteDoc {
  const lines = text.match(LINE) ?? []
  const eol = ENDING.exec(lines.find((l) => ENDING.test(l)) ?? '')?.[1] ?? '\n'
  let i = 0
  const front: string[] = []
  if (lines.length > 1 && body(lines[0] ?? '') === '---') {
    const end = lines.findIndex((l, n) => n > 0 && body(l) === '---')
    if (end > 0) {
      front.push(...lines.slice(0, end + 1))
      i = end + 1
    }
  }
  let topic: Topic = { heading: null, name: '', time: null, segmentKind: null, items: [] }
  const topics = [topic]
  let fenced = false
  // The point the next indented line may continue, or the next sub-point may belong to.
  let last: PointItem | null = null
  let parent: PointItem | null = null
  for (; i < lines.length; i++) {
    const line = lines[i]
    const text = body(line)
    if (fenced || FENCE.test(text)) {
      if (FENCE.test(text)) fenced = !fenced
      topic.items.push({ kind: 'kept', line })
      last = null
      continue
    }
    const heading = readHeading(line)
    if (heading) {
      topic = { heading: line, ...heading, items: [] }
      topics.push(topic)
      last = parent = null
      continue
    }
    if (isKept(text)) {
      topic.items.push({ kind: 'kept', line })
      last = null
      continue
    }
    const item = ITEM.exec(text)
    if (!item && last && /^[ \t]{2,}\S/.test(text)) {
      last.lines.push(line)
      last.text += ' ' + text.trim()
      continue
    }
    const sub = item !== null && indentWidth(item[1]) >= 2 && parent !== null
    const point: PointItem = item
      ? { kind: 'point', depth: sub ? 1 : 0, text: item[4], lines: [line], prefix: item[1] + item[2] + (item[3] || ' ') }
      : { kind: 'point', depth: 0, text: text.replace(/^[ \t]+/, ''), lines: [line], prefix: text.match(/^[ \t]*/)![0] }
    // A marker with nothing after it and no space ("-") gets its space back when edited.
    if (item && !item[3]) point.prefix = item[1] + item[2] + ' '
    topic.items.push(point)
    last = point
    if (point.depth === 0) parent = point
  }
  return { eol, front, topics }
}

/** The note as text. A note that was only read comes back exactly as it was. */
export function writeNoteDoc(doc: NoteDoc): string {
  const lines = [...doc.front]
  for (const topic of doc.topics) {
    if (topic.heading !== null) lines.push(topic.heading)
    for (const item of topic.items) {
      if (item.kind === 'kept') lines.push(item.line)
      else lines.push(...item.lines)
    }
  }
  // Every line but the last ends a line: one added after the old last line gives it an ending.
  return lines.map((l, n) => (n < lines.length - 1 && !ENDING.test(l) ? l + doc.eol : l)).join('')
}

// ---- reading what the note says

/** The value of a front matter key, or '' when it isn't set. */
export function frontValue(doc: NoteDoc, key: string): string {
  for (const line of doc.front) {
    const field = FRONT_FIELD.exec(body(line))
    if (field && field[1].toLowerCase() === key) return field[2]
  }
  return ''
}

/** The topics that show: the lines before the first heading count only when they hold points. */
export function shownTopics(doc: NoteDoc): Topic[] {
  return doc.topics.filter((t, n) => n > 0 || t.items.some((i) => i.kind === 'point'))
}

export const pointsOf = (topic: Topic): PointItem[] => topic.items.filter((i): i is PointItem => i.kind === 'point')

/**
 * A topic's points as talking points: each point with its sub-points as a Markdown sub-list,
 * which the Talking Points overlay shows under it (ADR 0025).
 */
export function talkingPoints(topic: Topic): string[] {
  const out: string[] = []
  for (const p of pointsOf(topic)) {
    const text = p.text.trim()
    if (p.depth === 1 && out.length > 0) out[out.length - 1] += `\n- ${text}`
    else out.push(text)
  }
  return out
}

// ---- editing: each returns a new note, read again from its text so it stays what a reader sees

const reread = (doc: NoteDoc): NoteDoc => parseNoteDoc(writeNoteDoc(doc))

function withTopic(doc: NoteDoc, t: number, change: (topic: Topic) => Topic): NoteDoc {
  return reread({ ...doc, topics: doc.topics.map((topic, n) => (n === t ? change(topic) : topic)) })
}

/** A plain line that would read as something else (a list, a quote) gets a marker. */
function safePrefix(prefix: string, text: string): string {
  if (prefix.trim() !== '') return prefix
  return isKept(prefix + text) || ITEM.test(prefix + text) || HEADING.test(prefix + text) || /^[ \t]/.test(text) ? '- ' : prefix
}

function subPrefix(topic: Topic, before: number): string {
  for (let n = before; n >= 0; n--) {
    const item = topic.items[n]
    if (item?.kind === 'point' && item.depth === 1) return item.prefix
  }
  return '  - '
}

function pointPrefix(topic: Topic, before: number, depth: 0 | 1): string {
  if (depth === 1) return subPrefix(topic, before)
  for (let n = before; n >= 0; n--) {
    const item = topic.items[n]
    if (item?.kind === 'point' && item.depth === 0) {
      const numbered = /^([ \t]*)(\d+)([.)][ \t]*)$/.exec(item.prefix)
      if (numbered) return `${numbered[1]}${Number(numbered[2]) + 1}${numbered[3]}`
      return item.prefix === '' ? '- ' : item.prefix
    }
  }
  return '- '
}

function pointLine(doc: NoteDoc, prefix: string, text: string): string {
  return safePrefix(prefix, text) + text.replace(/[\r\n]+/g, ' ') + doc.eol
}

/** Changes a point's text; its marker and indent stay as written. */
export function setPointText(doc: NoteDoc, t: number, i: number, text: string): NoteDoc {
  return withTopic(doc, t, (topic) => ({
    ...topic,
    items: topic.items.map((item, n) =>
      n === i && item.kind === 'point' ? { ...item, text, lines: [pointLine(doc, item.prefix, text)] } : item,
    ),
  }))
}

/** Where a new point goes at the end of a topic: after its last line that isn't blank. */
export function endOfTopic(topic: Topic): number {
  for (let n = topic.items.length - 1; n >= 0; n--) {
    const item = topic.items[n]
    if (item.kind === 'point' || item.line.trim() !== '') return n
  }
  return -1
}

/**
 * Adds a point after item `after` (-1: first in the topic). Returns the note and the new point's
 * index among the topic's items.
 */
export function insertPoint(doc: NoteDoc, t: number, after: number, depth: 0 | 1, text = ''): { doc: NoteDoc; index: number } {
  const topic = doc.topics[t]
  const prefix = pointPrefix(topic, after, depth)
  const line = (depth === 1 ? prefix : safePrefix(prefix, text)) + text + doc.eol
  const point: PointItem = { kind: 'point', depth, text, lines: [line], prefix }
  const items = [...topic.items.slice(0, after + 1), point, ...topic.items.slice(after + 1)]
  // Right under a heading, or after a blank line at the very start, the line is the topic's first.
  const next = reread({ ...doc, topics: doc.topics.map((x, n) => (n === t ? { ...topic, items } : x)) })
  return { doc: next, index: after + 1 }
}

/** Removes a point; its sub-points then belong to the point before it. */
export function removePoint(doc: NoteDoc, t: number, i: number): NoteDoc {
  return withTopic(doc, t, (topic) => ({ ...topic, items: topic.items.filter((_, n) => n !== i) }))
}

/** Makes a point a sub-point of the point before it (1), or a point again (0). */
export function setPointDepth(doc: NoteDoc, t: number, i: number, depth: 0 | 1): NoteDoc {
  const topic = doc.topics[t]
  const item = topic.items[i]
  if (item?.kind !== 'point' || item.depth === depth) return doc
  if (depth === 1 && !topic.items.slice(0, i).some((x) => x.kind === 'point')) return doc
  const prefix = pointPrefix(topic, i - 1, depth)
  return withTopic(doc, t, (x) => ({
    ...x,
    items: x.items.map((it, n) => (n === i ? { ...item, depth, prefix, lines: [pointLine(doc, prefix, item.text)] } : it)),
  }))
}

/** Renames a topic, or changes its time; the heading is rewritten only when something changed. */
export function setTopic(doc: NoteDoc, t: number, change: Partial<Pick<Topic, 'name' | 'time' | 'segmentKind'>>): NoteDoc {
  const topic = doc.topics[t]
  if (!topic || topic.heading === null) return doc
  const next = { ...topic, ...change }
  const name = next.name.replace(/[\r\n]+/g, ' ')
  const heading = `## ${name}${topicTimeText(next.time, next.segmentKind)}${ENDING.exec(topic.heading)?.[1] ?? doc.eol}`
  return withTopic(doc, t, () => ({ ...next, heading }))
}

/** Adds a topic after topic `after` (at the end when it is the last), with a blank line before it. */
export function addTopic(doc: NoteDoc, after: number, name: string): { doc: NoteDoc; index: number } {
  const topics = [...doc.topics]
  const before = topics[after]
  const lastItem = before.items.at(-1)
  const lastLine = lastItem ? (lastItem.kind === 'kept' ? lastItem.line : lastItem.lines.at(-1)!) : (before.heading ?? doc.front.at(-1))
  const items: Item[] = []
  if (lastLine !== undefined && body(lastLine).trim() !== '') topics[after] = { ...before, items: [...before.items, { kind: 'kept', line: doc.eol }] }
  const heading = `## ${name.replace(/[\r\n]+/g, ' ')}${doc.eol}`
  topics.splice(after + 1, 0, { heading, name, time: null, segmentKind: null, items })
  return { doc: reread({ ...doc, topics }), index: after + 1 }
}

/** Removes a topic with its heading and everything under it. The lines before the first topic stay. */
export function removeTopic(doc: NoteDoc, t: number): NoteDoc {
  if (t === 0) return doc
  return reread({ ...doc, topics: doc.topics.filter((_, n) => n !== t) })
}

/** Sets a front matter key, or removes it when `value` is empty; adds the front matter if needed. */
export function setFrontValue(doc: NoteDoc, key: string, value: string): NoteDoc {
  const clean = value.replace(/[\r\n]+/g, ' ').trim()
  const front = [...doc.front]
  const at = front.findIndex((l) => FRONT_FIELD.exec(body(l))?.[1].toLowerCase() === key)
  const line = `${key}: ${clean}${doc.eol}`
  if (at >= 0) {
    if (clean === '') front.splice(at, 1)
    else front[at] = line
  } else if (clean !== '') {
    if (front.length === 0) front.push(`---${doc.eol}`, `---${doc.eol}`)
    front.splice(front.length - 1, 0, line)
  }
  // A front matter with nothing left in it goes.
  const empty = front.length === 2
  return reread({ ...doc, front: empty ? [] : front })
}

// ---- where each topic is in the text, for keeping the place when switching between tabs

const lineCount = (item: Item) => (item.kind === 'kept' ? 1 : item.lines.length)

/** The first line (0-based) of topic `t`: its heading, or the first line after the front matter. */
export function topicLine(doc: NoteDoc, t: number): number {
  let line = doc.front.length
  for (let n = 0; n < t && n < doc.topics.length; n++) {
    const topic = doc.topics[n]
    line += (topic.heading === null ? 0 : 1) + topic.items.reduce((sum, item) => sum + lineCount(item), 0)
  }
  return line
}

/** The topic that line `line` (0-based) belongs to; the front matter belongs to the first. */
export function topicAtLine(doc: NoteDoc, line: number): number {
  let t = 0
  for (let n = 1; n < doc.topics.length; n++) if (topicLine(doc, n) <= line) t = n
  return t
}
