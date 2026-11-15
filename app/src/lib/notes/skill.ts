// The Oversay skill (skills/oversay, ADR 0031) describes the quick note format to an AI. The parts
// of its reference that the app's code decides are written from that code, here, so the skill and
// the app can't disagree: `make skills` writes them and `make check` fails when they are stale
// (skill.test.ts).

import { WORKSPACE_FORMAT } from '../workspaces/workspaces'
import SESSION_FORMAT from '../sessions/session-format.json'
import { FRONT_KEYS, MADE_WITH_KEY, parseTopicTime } from './format'
import { LINT_MESSAGES } from './lint'
import { DECK_KEYS, DECK_RETIRED_KEYS, DECK_VALUES } from '../decks/deck'
import { SEGMENT_KINDS } from '../project/types'
import { projectSchema } from '../project/schema'

/** A case of the deck folder rule (ADR 0037), from src/lib/decks/deck-folders.json (also read by quick.rs's tests). */
export interface FolderCase {
  title: string
  today: string
  existing: string[]
  folder: string
}

/** Heading brackets shown in the reference, with what the app reads from each. */
export const TIME_EXAMPLES = ['5m', '10', '1:30', '90s', '~5m', 'open', '5m, demo', 'demo', 'soon']

const BEGIN = '<!-- generated: make skills writes everything below this line from Oversay\'s code; don\'t edit it -->'
const END = '<!-- end generated -->'

function minutes(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return [m ? `${m} min` : '', s ? `${s} s` : ''].filter(Boolean).join(' ')
}

/** What the app reads from `## Topic [text]`, in words. */
export function describeTopicTime(text: string): string {
  const read = parseTopicTime(text)
  if (!read) return 'not a time: the brackets stay in the card’s name'
  const bits: string[] = []
  if (read.time) {
    if (read.time.open && read.time.seconds === 0) bits.push('open: no time')
    else bits.push(read.time.open ? `about ${minutes(read.time.seconds)}` : minutes(read.time.seconds))
  }
  if (read.segmentKind) bits.push(`kind ${read.segmentKind}`)
  return bits.join(', ')
}

// A name with a backtick needs a longer fence, and `|` would end a table cell.
const code = (s: string) => (s.includes('`') ? '`` ' + s + ' ``' : '`' + s + '`')
const shown = (s: string) => code(s.replace(/ /g, '·').replace(/\|/g, '\\|'))

/** The reference's generated part, between its markers. */
export function generatedReference(folders: FolderCase[]): string {
  const lines = [
    '',
    '## Generated from Oversay’s code',
    '',
    '**Card times:** what Oversay reads from the brackets at the end of a `## ` heading.',
    '',
    '| Heading ends with | Oversay reads |',
    '| - | - |',
    ...TIME_EXAMPLES.map((t) => `| ${code(`[${t}]`)} | ${describeTopicTime(t)} |`),
    '',
    `**Kinds**, after the time or alone (${code('[5m, demo]')}), which give the card its colour: ${SEGMENT_KINDS.map(code).join(', ')}.`,
    '',
    '**Folder names:** the app’s own tests check these same cases. A `·` is a space.',
    '',
    '| Deck name | Today | Already in Decks | Folder |',
    '| - | - | - | - |',
    ...folders.map((c) => `| ${shown(c.title)} | ${c.today} | ${c.existing.map(code).join(', ') || '–'} | ${code(c.folder + '/')} |`),
    '',
  ]
  return lines.join('\n')
}

/** The deck reference's generated part: the keys a deck reads and the values each option takes. */
export function generatedDeckReference(): string {
  return [
    '',
    '## Generated from Oversay’s code',
    '',
    `**Front matter keys:** ${DECK_KEYS.map(code).join(', ')}, and ${code(MADE_WITH_KEY)} from the skill (\`with\` is read as \`audience\`, for decks written before it).`,
    '',
    '| Option | Values |',
    '| - | - |',
    ...Object.entries(DECK_VALUES).map(([key, values]) => `| ${code(key)} | ${values.map(code).join(', ')}${key === 'hide' ? ', comma-separated' : ''} |`),
    '',
  ].join('\n')
}

/** The generated part of references/workspace-format.md: `workspace.json` as Oversay reads it (ADR 0040). */
export function generatedWorkspaceReference(): string {
  return [
    '',
    '## Generated from Oversay’s code',
    '',
    `**File:** ${code(WORKSPACE_FORMAT.file)}, \`"version": ${WORKSPACE_FORMAT.version}\`.`,
    '',
    `**Keys, in the order Oversay writes them:** ${WORKSPACE_FORMAT.keys.map(code).join(', ')}. Any other key is kept as it is.`,
    '',
  ].join('\n')
}

/** The generated part of references/session-format.md: the files and keys Oversay reads (ADR 0041). */
export function generatedSessionReference(): string {
  const f = SESSION_FORMAT
  return [
    '',
    '## Generated from Oversay’s code',
    '',
    `**${code(f.sessions.file)}:** \`"version": ${f.sessions.version}\`; each session's keys: ${f.sessions.keys.map(code).join(', ')}.`,
    '',
    `**A session's name:** ${code(f.name)}, local time; \` -2\`, \` -3\` for later Starts that minute.`,
    '',
    `**Transcript:** ${code(`${f.transcript.folder}/<name>.md`)}; front matter ${f.transcript.keys.map(code).join(', ')}.`,
    '',
    `**Review:** ${code(`${f.review.folder}/<name>.md`)}; front matter ${f.review.keys.map(code).join(', ')}; its sections, in order: ${f.review.sections.map((s) => code(`## ${s}`)).join(', ')}.`,
    '',
  ].join('\n')
}

/** `reference` with its generated part replaced by `generated`. */
export function withGenerated(reference: string, generated: string): string {
  const begin = reference.indexOf(BEGIN)
  const end = reference.indexOf(END)
  if (begin < 0 || end < begin) throw new Error('The reference has lost its generated-part markers.')
  return reference.slice(0, begin + BEGIN.length) + '\n' + generated + reference.slice(end)
}

/** SKILL.md with the app's version as its `metadata.version`. */
export function withVersion(skill: string, version: string): string {
  if (!/^ {2}version: .*$/m.test(skill)) throw new Error('SKILL.md has no metadata version line.')
  return skill.replace(/^ {2}version: .*$/m, `  version: ${version}`)
}

/**
 * The quick talk schema the skill and `Oversay --check` read (references/quick-talk.schema.json):
 * the app's own project schema, written out, so a check outside the app applies the same rules
 * (ADR 0007: the frontend owns the format; this is that definition, not a second one).
 */
export const quickTalkSchemaJson = (): string => JSON.stringify(projectSchema, null, 2) + '\n'

/** A note with its `made-with` line saying this version of the skill, for the skill's examples. */
export function withMadeWith(note: string, version: string): string {
  return note.replace(/^made-with: Oversay skill .*$/m, `made-with: Oversay skill ${version}`)
}

/**
 * The note rules `Oversay --check` applies (references/note-rules.json, check.rs): the keys, kinds
 * and messages from the app's code, so the checker and lint.ts can't word or count them differently.
 */
export const noteRulesJson = (): string =>
  JSON.stringify(
    { frontKeys: FRONT_KEYS, deckKeys: DECK_KEYS, retiredDeckKeys: DECK_RETIRED_KEYS, deckValues: DECK_VALUES, madeWithKey: MADE_WITH_KEY, segmentKinds: SEGMENT_KINDS, messages: LINT_MESSAGES },
    null,
    2,
  ) + '\n'
