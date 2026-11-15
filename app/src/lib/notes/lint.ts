// Checks a quick note against its format: where Oversay would show something other than what
// the writer meant. The Oversay skill checks every note it writes with `Oversay --check`
// (check.rs), which applies these same rules with these messages: `make skills` writes them out
// to references/note-rules.json, and skills/fixtures/note-lint.json is checked by both sides. The
// note editor shows them for a note the skill made. None of this stops a note opening: the reader
// never fails (ADR 0026).

import { parseDuration } from '../project/duration'
import { SEGMENT_KINDS } from '../project/types'
import { FRONT_KEYS, MADE_WITH_KEY, MADE_WITH_VALUE, parseNoteDoc, pointsOf, shownTopics, type NoteDoc } from './format'
import { DECK_KEYS, DECK_RETIRED_KEYS, DECK_VALUES } from '../decks/deck'

export const LINT_MESSAGES = {
  'front-open': 'The front matter has no closing `---`, so Oversay reads it as part of the note.',
  'front-line': '`{text}` isn’t a `key: value` line, so Oversay ignores it.',
  'front-key': 'Oversay doesn’t use `{text}`. The keys are {keys}.',
  'front-length': '`{text}` isn’t a length Oversay reads. Write it like `30m` or `1:30:00`.',
  'made-with': '`{text}` should be `Oversay skill` and a version, like `Oversay skill 0.2.0`.',
  'deck-value': '`{text}` isn’t one Oversay reads, so it uses the default. Write one of {values}.',
  'no-topics': 'There are no `## Topic` lines, so Oversay shows nothing.',
  'before-topic': 'This point comes before the first `## Topic` line, so it shows under a topic with no name.',
  'topic-name': 'This topic has no name.',
  'topic-time': 'Oversay doesn’t read `[{text}]` as a time or a kind, so it shows as part of the topic’s name. Times look like `[10m]`, `[1:30]`, `[~5m]` or `[open]`; the kinds are {kinds}.',
  heading: '`{text}` isn’t shown. Use `## Topic` for a topic, or `- point` for a point.',
  'deep-point': 'This is deeper than a sub-point, so Oversay shows it as a sub-point. Notes have one level of sub-points.',
} as const

export type LintCode = keyof typeof LINT_MESSAGES

export interface LintProblem {
  /** 1-based, or null for the note as a whole. */
  line: number | null
  code: LintCode
  message: string
}

const list = (items: readonly string[]) => items.map((k) => '`' + k + '`').join(', ')

function message(code: LintCode, text = '', deck = false, values: readonly string[] = []): string {
  return LINT_MESSAGES[code]
    .replace('{text}', text)
    .replace('{keys}', list([...(deck ? DECK_KEYS : FRONT_KEYS), MADE_WITH_KEY]))
    .replace('{kinds}', list(SEGMENT_KINDS))
    .replace('{values}', list(values))
}

/** A deck option's value Oversay doesn't read: the bad value, or for `hide` the bad parts. */
function badDeckValues(key: string, value: string): string[] {
  const allowed = DECK_VALUES[key]
  if (!allowed || value.trim() === '') return []
  const values = key === 'hide' ? value.split(',').map((v) => v.trim()).filter(Boolean) : [value.trim()]
  return values.filter((v) => !allowed.includes(v.toLowerCase()))
}

const body = (line: string) => line.replace(/(\r\n|\n|\r)$/, '')
const indentWidth = (s: string) => s.replace(/\t/g, '    ').length
const FENCE = /^[ \t]*(```|~~~)/
const FRONT_FIELD = /^([A-Za-z][\w-]*):[ \t]*(.*?)[ \t]*$/
const OTHER_HEADING = /^[ \t]*(#{1,6})([ \t]|$)/

/** "3 topics, 7 points" (or "3 cards" for a deck): what Oversay shows of the note. */
export function noteSummary(doc: NoteDoc, deck = false): string {
  const topics = shownTopics(doc)
  const points = topics.reduce((n, t) => n + pointsOf(t).length, 0)
  const word = deck ? 'card' : 'topic'
  return `${topics.length} ${word}${topics.length === 1 ? '' : 's'}, ${points} point${points === 1 ? '' : 's'}`
}

/** Checks a note, or a deck (a note with times and the deck's own keys). */
export function lintNote(text: string, deck = false): LintProblem[] {
  const doc = parseNoteDoc(text)
  const problems: LintProblem[] = []
  const add = (line: number | null, code: LintCode, text?: string, values?: readonly string[]) =>
    problems.push({ line, code, message: message(code, text, deck, values) })
  const keys: readonly string[] = deck ? DECK_KEYS : FRONT_KEYS

  let n = 1
  if (doc.front.length === 0 && /^---(\r\n|\n|\r)/.test(text)) add(1, 'front-open')
  for (const line of doc.front.slice(1, -1)) {
    n++
    const t = body(line)
    if (t.trim() === '') continue
    const field = FRONT_FIELD.exec(t)
    if (!field) add(n, 'front-line', t.trim())
    else if (field[1].toLowerCase() === MADE_WITH_KEY) {
      if (!MADE_WITH_VALUE.test(field[2])) add(n, 'made-with', field[2])
    } else if (deck && (DECK_RETIRED_KEYS as readonly string[]).includes(field[1].toLowerCase())) {
      // A key decks no longer read (ADR 0042): kept as written, never flagged.
    } else if (!keys.includes(field[1].toLowerCase())) add(n, 'front-key', field[1])
    else if (!deck && field[1].toLowerCase() === 'length' && field[2] !== '' && parseDuration(field[2]) === null) add(n, 'front-length', field[2])
    else if (deck) {
      const key = field[1].toLowerCase()
      for (const bad of badDeckValues(key, field[2])) add(n, 'deck-value', `${key}: ${bad}`, DECK_VALUES[key])
    }
  }
  if (doc.front.length) n += 2

  let fenced = false
  doc.topics.forEach((topic, t) => {
    if (topic.heading !== null) {
      if (topic.name.trim() === '') add(n, 'topic-name')
      const bracket = /\[([^\]]*)\]$/.exec(topic.name)
      if (!topic.time && !topic.segmentKind && bracket && /\d/.test(bracket[1])) add(n, 'topic-time', bracket[1])
      n++
    }
    let subIndent: number | null = null
    let beforeTopic = false
    for (const item of topic.items) {
      if (item.kind === 'kept') {
        const line = body(item.line)
        if (FENCE.test(line)) fenced = !fenced
        const heading = OTHER_HEADING.exec(line)
        // A `# ` title before the first topic is the note's own; anything else is lost on screen.
        if (!fenced && heading && !(t === 0 && heading[1] === '#')) add(n, 'heading', line.trim())
        n++
        continue
      }
      if (t === 0 && !beforeTopic) {
        add(n, 'before-topic')
        beforeTopic = true
      }
      const indent = indentWidth(/^[ \t]*/.exec(item.prefix)![0])
      if (item.depth === 0) subIndent = null
      else if (subIndent === null) subIndent = indent
      else if (indent > subIndent) add(n, 'deep-point')
      n += item.lines.length
    }
  })
  if (shownTopics(doc).length === 0) add(null, 'no-topics')
  return problems
}
