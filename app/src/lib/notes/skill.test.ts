// The Oversay skill (skills/oversay, ADR 0031) against the app's own code. With UPDATE_SKILL=1
// (`make skills`) the first test writes the generated parts instead of checking them, so this
// test reads and writes files with Node's own modules.
/// <reference types="node" />

import { readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { frontValue, parseNoteDoc, shownTopics, talkingPoints, type TopicTime } from './format'
import { describeTopicTime, generatedSessionReference, generatedWorkspaceReference, generatedDeckReference, generatedReference, noteRulesJson, quickTalkSchemaJson, withGenerated, withMadeWith, withVersion, type FolderCase } from './skill'
import { lintNote } from './lint'
import { deckAudience, deckCards, deckId, deckTitle } from '../decks/deck'
import { deckFolderName } from './files'

const root = (path: string) => fileURLToPath(new URL(`../../../../${path}`, import.meta.url))
const read = (path: string) => readFileSync(root(path), 'utf8')
const readOrNothing = (path: string) => {
  try {
    return read(path)
  } catch {
    return ''
  }
}

const SKILL = 'skills/oversay/SKILL.md'
const REFERENCE = 'skills/oversay/references/note-format.md'
const SCHEMA = 'app/src-tauri/project.schema.json'
const RULES = 'skills/oversay/references/note-rules.json'
const DECK_REFERENCE = 'skills/oversay/references/deck-format.md'
const WORKSPACE_REFERENCE = 'skills/oversay/references/workspace-format.md'
const SESSION_REFERENCE = 'skills/oversay/references/session-format.md'
const DECK_EXAMPLES = 'skills/oversay/examples/decks'
const ADDING = `${DECK_EXAMPLES}/adding`
/** Each example deck: a dated folder with its deck.md (ADR 0037), by folder name. */
const exampleDecks = (): string[] => readdirSync(root(DECK_EXAMPLES)).filter((f: string) => f !== 'adding' && !f.startsWith('.'))
const exampleDeck = (folder: string) => read(`${DECK_EXAMPLES}/${folder}/deck.md`)

interface Shown {
  name: string
  time: TopicTime | null
  kind?: string
  points: string[]
}

/** What each example deck puts on screen, by folder. Every example in the folder must be here. */
const EXPECTED: Record<string, { audience?: string; topics: Shown[] }> = {
  'Catch-up with Sam 2026-10-22': {
    audience: 'Sam Ortiz',
    topics: [
      {
        name: 'Q4 hiring plan',
        time: null,
        points: ['Two backend roles: open now or January?\n- Priya has the budget numbers', 'Who interviews in November'],
      },
      { name: 'Promotion case', time: null, points: ['Evidence: the billing migration', 'Gaps she sees herself'] },
      { name: 'Offsite', time: null, points: ['Dates: 12 or 19 Nov', 'Who books the venue'] },
    ],
  },
  'Product demo dry run 2026-10-23': {
    topics: [
      { name: 'Welcome', time: { seconds: 120, open: false }, kind: 'intro', points: ['Who is in the room', 'What we want back from them'] },
      {
        name: 'Checkout flow',
        time: { seconds: 480, open: false },
        kind: 'demo',
        points: ['Start from the empty cart', 'Show the saved card\n- Use the test card ending 4242'],
      },
      { name: 'Questions', time: { seconds: 0, open: true }, points: ['Pricing comes up: hand to Ana'] },
    ],
  },
}

function onScreen(text: string): Shown[] {
  return shownTopics(parseNoteDoc(text)).map((t) => ({
    name: t.name,
    time: t.time,
    ...(t.segmentKind ? { kind: t.segmentKind } : {}),
    points: talkingPoints(t),
  }))
}

describe('the Oversay skill', () => {
  it('has its generated reference and version up to date (make skills)', () => {
    const folders = (JSON.parse(read('app/src/lib/decks/deck-folders.json')) as { made: FolderCase[] }).made
    const version = (JSON.parse(read('app/package.json')) as { version: string }).version
    const files: Record<string, string> = {
      [REFERENCE]: withGenerated(read(REFERENCE), generatedReference(folders)),
      [SKILL]: withVersion(read(SKILL), version),
      [SCHEMA]: quickTalkSchemaJson(),
      [RULES]: noteRulesJson(),
      [DECK_REFERENCE]: withGenerated(read(DECK_REFERENCE), generatedDeckReference()),
      [WORKSPACE_REFERENCE]: withGenerated(read(WORKSPACE_REFERENCE), generatedWorkspaceReference()),
      [SESSION_REFERENCE]: withGenerated(read(SESSION_REFERENCE), generatedSessionReference()),
    }
    for (const folder of exampleDecks()) {
      files[`${DECK_EXAMPLES}/${folder}/deck.md`] = withMadeWith(exampleDeck(folder), version)
    }
    for (const [path, want] of Object.entries(files)) {
      if (process.env.UPDATE_SKILL) writeFileSync(root(path), want)
      else expect(readOrNothing(path), `${path} is stale: run make skills`).toBe(want)
    }
  })

  it('describes topic times as the note reader reads them', () => {
    expect(describeTopicTime('5m')).toBe('5 min')
    expect(describeTopicTime('1:30')).toBe('1 min 30 s')
    expect(describeTopicTime('~5m')).toBe('about 5 min')
    expect(describeTopicTime('open')).toBe('open: no time')
    expect(describeTopicTime('5m, demo')).toBe('5 min, kind demo')
    expect(describeTopicTime('soon')).toMatch(/^not a time/)
  })

  it('has example notes that show the topics and points they are meant to', () => {
    const files = exampleDecks().filter((f) => f in EXPECTED)
    expect(files.sort()).toEqual(Object.keys(EXPECTED).sort())
    for (const file of files) {
      const text = exampleDeck(file)
      expect(onScreen(text), file).toEqual(EXPECTED[file].topics)
      expect(deckAudience(parseNoteDoc(text)), file).toBe(EXPECTED[file].audience ?? '')
      expect(lintNote(text, true), file).toEqual([])
      expect(frontValue(parseNoteDoc(text), 'made-with'), `${file} says which skill made it`).toMatch(/^Oversay skill /)
    }
  })

  it('adds to a note in its example without changing a line that was there', () => {
    const before = read(`${ADDING}/before.md`).split('\n')
    const after = read(`${ADDING}/after.md`).split('\n')
    // Every line of before, unchanged and in order, among the lines of after.
    let at = 0
    for (const line of after) if (line === before[at]) at++
    expect(at, `before.md line ${at + 1} is missing or changed in after.md`).toBe(before.length)

    const topics = onScreen(after.join('\n'))
    expect(topics.map((t) => t.name)).toEqual(['Yesterday', 'Blockers', 'Release on Friday'])
    expect(topics[0].points.at(-1)).toBe('Paired with Ana on the rollout plan')
    expect(topics[2]).toEqual({
      name: 'Release on Friday',
      time: { seconds: 300, open: false },
      points: ['Freeze at noon', 'Ana runs the checklist\n- Rollback script tested on staging'],
    })
  })

  it('has example decks that check clean as decks, the stand-up timed as asked', () => {
    const files = exampleDecks()
    expect(files.length).toBeGreaterThan(0)
    for (const file of files) {
      const text = exampleDeck(file)
      const doc = parseNoteDoc(text)
      expect(lintNote(text, true), file).toEqual([])
      expect(frontValue(doc, 'made-with'), file).toMatch(/^Oversay skill /)
      if (file === 'Stand-up 23 Oct 2026-10-23') expect(deckCards(doc, file).map((c) => c.seconds)).toEqual([60, 180, 240, 300])
    }
  })

  it('has example decks made as the skill makes them: a dated folder, its name as the title, and no id (ADR 0037)', () => {
    for (const folder of exampleDecks()) {
      const doc = parseNoteDoc(exampleDeck(folder))
      expect(folder, 'a dated folder').toMatch(/^.+ \d{4}-\d{2}-\d{2}$/)
      expect(deckId(doc), `${folder} leaves its id to Oversay`).toBe('')
      expect(deckTitle(doc), `${folder} is titled as its folder`).toBe(deckFolderName(folder))
    }
  })
})
