// Prompt fixtures for the Oversay skill: each case in skills/fixtures/prompts has a request
// (prompt.md), the files there before it (before/), what a real model run made (golden/) and what
// must be true of it (case.json). make check runs these assertions on the committed goldens; with
// SKILL_OUTPUT=<dir> (scripts/skill-try.sh, `make skill-try`) they check a fresh run instead, from
// <dir>/<case>/. Model runs are manual: they cost money and their wording changes run to run.

/// <reference types="node" />

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { frontValue, parseNoteDoc, pointsOf, shownTopics } from './format'
import { lintNote } from './lint'
import { deckAudience, deckCards, deckTitle } from '../decks/deck'
import { WORKSPACE_FORMAT } from '../workspaces/workspaces'
import SESSION_FORMAT from '../sessions/session-format.json'

const PROMPTS = fileURLToPath(new URL('../../../../skills/fixtures/prompts/', import.meta.url))

interface Case {
  /**
   * The file the request should make or change, relative to the Oversay folder. A `*` matches
   * anything, for a name the person left to the AI ("Platform team stand-up" or "Platform
   * stand-up"); exactly one file must match.
   */
  creates?: string
  /**
   * The request must not make anything yet: the skill asks first (a taken title: add to it or
   * make a new one?, ADR 0037). Its reply contains each of these, ignoring case.
   */
  asks?: string[]
  /** A file in before/ whose every line must still be there, unchanged and in order. */
  keeps?: string
  /** Who the deck is for (front matter `audience`). */
  audience?: string
  /** The note's topics, in order: each name contains its entry, ignoring case ("promotion" for "Sam's promotion case"). */
  topics?: string[]
  /** At most this many points: more means points the person never gave, made up to fill a topic. */
  maxPoints?: number
  /** Text the file must contain, ignoring case: what the person asked for. */
  mentions?: string[]
  /** A deck: each card's time in seconds, in order. */
  deck?: { times: number[] }
  /**
   * A workspace's `workspace.json` (ADR 0040): its name, tags, its deck ids in order, and when
   * and where (`where` contains this, ignoring case). It has no id: Oversay gives it one.
   */
  workspace?: { name: string; tags?: string[]; decks: string[]; when?: string; where?: string }
  /**
   * A session's review (ADR 0041): the session it is of (`startedAt`), sections it must have,
   * and words it must mention, ignoring case. Its sections are the format's, in its order.
   */
  review?: { session: string; sections: string[]; mentions?: string[] }
}

/** Every file under `dir`, relative to it. */
function filesIn(dir: string, prefix = ''): string[] {
  if (!existsSync(dir)) return []
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    return statSync(path).isDirectory() ? filesIn(path, `${prefix}${name}/`) : [`${prefix}${name}`]
  })
}

const cases = readdirSync(PROMPTS).filter((name) => existsSync(join(PROMPTS, name, 'case.json')))

/** A deck the skill made (ADR 0037): `Decks/<name> <YYYY-MM-DD>[ (n)]/deck.md`. */
const NEW_DECK = /^Decks\/.+ \d{4}-\d{2}-\d{2}(?: \(\d+\))?\/deck\.md$/

describe.each(cases)('the skill asked: %s', (name) => {
  const dir = join(PROMPTS, name)
  const spec = JSON.parse(readFileSync(join(dir, 'case.json'), 'utf8')) as Case
  const output = process.env.SKILL_OUTPUT ? join(process.env.SKILL_OUTPUT, name) : join(dir, 'golden')
  // What the AI said: the run's log, or the reply saved with the golden.
  const reply = process.env.SKILL_OUTPUT ? join(process.env.SKILL_OUTPUT, `${name}.log`) : join(dir, 'reply.md')
  const ran = existsSync(output) && (!spec.asks || existsSync(reply))

  it.runIf(ran && !!spec.asks)('asks before making anything', () => {
    expect(filesIn(output).sort(), 'files').toEqual(filesIn(join(dir, 'before')).sort())
    const said = readFileSync(reply, 'utf8').toLowerCase()
    for (const word of spec.asks!) expect(said, word).toContain(word.toLowerCase())
  })
  if (!spec.creates) return

  const pattern = new RegExp(`^${spec.creates.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*')}$`)
  const made = () => {
    const found = filesIn(output).filter((f) => pattern.test(f))
    expect(found, `files matching ${spec.creates}`).toHaveLength(1)
    return found[0]
  }

  // A case added without a golden yet is skipped until `make skill-try` makes one.
  it.runIf(ran)('makes or changes only the file asked for', () => {
    const file = made()
    const before = filesIn(join(dir, 'before'))
    expect(filesIn(output).filter((f) => f !== file).sort()).toEqual(before.filter((f) => f !== file).sort())
  })

  it.runIf(ran && !!spec.workspace)('makes the workspace asked for', () => {
    const want = spec.workspace!
    const c = JSON.parse(readFileSync(join(output, made()), 'utf8')) as Record<string, unknown>
    expect(c.version, 'version').toBe(WORKSPACE_FORMAT.version)
    expect(c.id, 'no id').toBeUndefined()
    expect(c.name).toBe(want.name)
    expect(c.decks).toEqual(want.decks)
    if (want.tags) expect((c.tags as string[]).map((t) => t.toLowerCase())).toEqual(want.tags.map((t) => t.toLowerCase()))
    if (want.when) expect(c.when).toBe(want.when)
    if (want.where) expect(String(c.where).toLowerCase()).toContain(want.where.toLowerCase())
    for (const key of Object.keys(c)) expect(WORKSPACE_FORMAT.keys, `key ${key}`).toContain(key)
  })

  it.runIf(ran && !!spec.review)('writes the review asked for, in the review format', () => {
    const want = spec.review!
    const text = readFileSync(join(output, made()), 'utf8')
    const doc = parseNoteDoc(text)
    expect(frontValue(doc, 'session'), 'session').toBe(want.session)
    expect(frontValue(doc, 'made-with'), 'made-with').toMatch(/^Oversay skill \d+\.\d+\.\d+$/)
    const headings = [...text.matchAll(/^## (.+)$/gm)].map((m) => m[1].trim())
    const order = SESSION_FORMAT.review.sections
    for (const h of headings) expect(order, `section ${h}`).toContain(h)
    expect(headings, 'in the format\'s order').toEqual([...headings].sort((a, b) => order.indexOf(a) - order.indexOf(b)))
    for (const s of want.sections) expect(headings, s).toContain(s)
    for (const m of want.mentions ?? []) expect(text.toLowerCase(), m).toContain(m.toLowerCase())
  })

  it.runIf(ran && !spec.workspace && !spec.review)('makes what was asked for', () => {
    const file = made()
    const text = readFileSync(join(output, file), 'utf8')
    for (const m of spec.mentions ?? []) expect(text.toLowerCase(), m).toContain(m.toLowerCase())
    // What `Oversay --check` would list (task 210): nothing, or the skill didn't fix what it found.
    expect(lintNote(text, true).map((p) => `line ${p.line}: ${p.message}`)).toEqual([])
    const doc = parseNoteDoc(text)
    if (spec.deck) {
      expect(deckCards(doc, file).map((c) => c.seconds), 'card times').toEqual(spec.deck.times)
    }
    // A note the skill made says which skill made it (ADR 0035), and is a deck of its own:
    // a dated folder and its name as its title, with no id: Oversay gives it one (ADR 0037).
    if (!spec.keeps) {
      expect(frontValue(doc, 'made-with'), 'made-with').toMatch(/^Oversay skill \d+\.\d+\.\d+$/)
      expect(file, 'a dated deck folder').toMatch(NEW_DECK)
      expect(frontValue(doc, 'id'), 'no id').toBe('')
      expect(deckTitle(doc), 'title').not.toBe('')
    }
    const topics = shownTopics(doc)
    if (spec.topics) {
      expect(topics.map((t) => t.name), 'topics').toHaveLength(spec.topics.length)
      spec.topics.forEach((want, i) => expect(topics[i].name.toLowerCase(), 'topic').toContain(want.toLowerCase()))
    }
    if (spec.maxPoints !== undefined) expect(topics.flatMap(pointsOf).length, 'points').toBeLessThanOrEqual(spec.maxPoints)
    if (spec.audience) expect(deckAudience(doc)).toBe(spec.audience)
  })

  it.runIf(ran && !!spec.keeps)('keeps every line the file had', () => {
    const before = readFileSync(join(dir, 'before', spec.keeps!), 'utf8').split('\n')
    const after = readFileSync(join(output, spec.keeps!), 'utf8').split('\n')
    let at = 0
    for (const line of after) if (line === before[at]) at++
    expect(at, `line ${at + 1} of the file before is missing or changed`).toBe(before.length)
  })
})
