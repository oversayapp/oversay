import { describe, expect, it } from 'vitest'
import {
  addTopic,
  frontValue,
  insertPoint,
  parseNoteDoc,
  parseTopicTime,
  pointsOf,
  removePoint,
  removeTopic,
  setFrontValue,
  setPointDepth,
  setPointText,
  setTopic,
  shownTopics,
  talkingPoints,
  topicTimeText,
  writeNoteDoc,
  endOfTopic,
} from './format'

const PRIYA = `---
with: Priya Shah
when: Tuesdays 10:00
length: 30m
---

## Promotion case [10m]
- Where the write-up stands
  - Two peer reviews still to come
- Is Atlas slipping a week?
> Ask about the on-call week

## Hiring [~5m]
1. Two candidates on Friday
2. Need a reviewer for the \`sync\` change

| Who | When |
| --- | --- |
| Sam | Fri |

## Anything else [open]
Plain line point
  that runs on
\`\`\`
- not a point
\`\`\`
### Kept heading
`

const SAMPLES: Record<string, string> = {
  priya: PRIYA,
  crlf: PRIYA.replace(/\n/g, '\r\n'),
  noFinalNewline: PRIYA.trimEnd(),
  noFront: '# Standup\n\n- Yesterday\n- Today\n\n## Blockers\n* none\n',
  empty: '',
  onlyText: 'just a line',
  odd: '---\nwith: x\n\n## [5m]\n-\n- \n  - orphan?\n## Weird [later]\n+ plus\n***\n',
  unterminatedFront: '---\nwith: x\n- a point\n',
  mixed: '## A\r\n- one\n- two\r\n',
}

describe('round trip', () => {
  for (const [name, text] of Object.entries(SAMPLES)) {
    it(`gives back ${name} byte for byte`, () => {
      expect(writeNoteDoc(parseNoteDoc(text))).toBe(text)
    })
  }
})

describe('reading', () => {
  const doc = parseNoteDoc(PRIYA)

  it('reads the front matter', () => {
    expect(frontValue(doc, 'with')).toBe('Priya Shah')
    expect(frontValue(doc, 'length')).toBe('30m')
    expect(frontValue(doc, 'missing')).toBe('')
  })

  it('reads topics with their times', () => {
    const topics = shownTopics(doc)
    expect(topics.map((t) => t.name)).toEqual(['Promotion case', 'Hiring', 'Anything else'])
    expect(topics.map((t) => t.time)).toEqual([
      { seconds: 600, open: false },
      { seconds: 300, open: true },
      { seconds: 0, open: true },
    ])
  })

  it('reads points and sub-points; quotes, tables and code are kept, not shown', () => {
    const [promo, hiring, other] = shownTopics(doc)
    expect(pointsOf(promo).map((p) => [p.depth, p.text])).toEqual([
      [0, 'Where the write-up stands'],
      [1, 'Two peer reviews still to come'],
      [0, 'Is Atlas slipping a week?'],
    ])
    expect(pointsOf(hiring).map((p) => p.text)).toEqual(['Two candidates on Friday', 'Need a reviewer for the `sync` change'])
    expect(pointsOf(other).map((p) => p.text)).toEqual(['Plain line point that runs on'])
  })

  it('gives talking points with sub-points as a sub-list', () => {
    expect(talkingPoints(shownTopics(doc)[0])).toEqual([
      'Where the write-up stands\n- Two peer reviews still to come',
      'Is Atlas slipping a week?',
    ])
  })

  it('shows the lines before the first topic only when they hold points', () => {
    expect(shownTopics(parseNoteDoc('# Title\n\n## A\n- x\n')).map((t) => t.name)).toEqual(['A'])
    expect(shownTopics(parseNoteDoc('- first\n## A\n- x\n')).map((t) => t.name)).toEqual(['', 'A'])
  })

  it('reads a heading whose brackets are not a time as the name', () => {
    const odd = parseNoteDoc(SAMPLES.odd)
    expect(odd.topics.map((t) => t.name)).toEqual(['', '', 'Weird [later]'])
    expect(odd.topics[1].time).toEqual({ seconds: 300, open: false })
  })

  it('takes a sub-point with no point before it as a point', () => {
    const odd = parseNoteDoc(SAMPLES.odd)
    expect(pointsOf(odd.topics[1]).map((p) => [p.depth, p.text])).toEqual([
      [0, ''],
      [0, ''],
      [1, 'orphan?'],
    ])
  })
})

describe('topic times', () => {
  it('reads the forms a heading may use', () => {
    expect(parseTopicTime('5m')).toEqual({ time: { seconds: 300, open: false }, segmentKind: null })
    expect(parseTopicTime('~5 min')).toEqual({ time: { seconds: 300, open: true }, segmentKind: null })
    expect(parseTopicTime('1:30, demo')).toEqual({ time: { seconds: 90, open: false }, segmentKind: 'demo' })
    expect(parseTopicTime('demo')).toEqual({ time: null, segmentKind: 'demo' })
    expect(parseTopicTime('OPEN')).toEqual({ time: { seconds: 0, open: true }, segmentKind: null })
    expect(parseTopicTime('later')).toBeNull()
    expect(parseTopicTime('5m, 6m')).toBeNull()
    expect(parseTopicTime('')).toBeNull()
  })

  it('writes them back', () => {
    expect(topicTimeText({ seconds: 300, open: false })).toBe(' [5m]')
    expect(topicTimeText({ seconds: 90, open: true }, 'demo')).toBe(' [~1:30, demo]')
    expect(topicTimeText({ seconds: 0, open: true })).toBe(' [open]')
    expect(topicTimeText(null)).toBe('')
  })
})

describe('editing', () => {
  const doc = parseNoteDoc(PRIYA)

  it('changes only the edited line, keeping its marker', () => {
    const next = setPointText(doc, 2, 1, 'Need a reviewer this week')
    expect(writeNoteDoc(next)).toBe(PRIYA.replace('2. Need a reviewer for the `sync` change', '2. Need a reviewer this week'))
  })

  it('joins a point that ran over several lines into one when edited', () => {
    const next = setPointText(doc, 3, 0, 'One line now')
    expect(writeNoteDoc(next)).toBe(PRIYA.replace('Plain line point\n  that runs on\n', 'One line now\n'))
  })

  it('gives a plain line a marker when its new text would read as something else', () => {
    const next = setPointText(doc, 3, 0, '> not a quote')
    expect(writeNoteDoc(next)).toContain('\n- > not a quote\n')
  })

  it('adds a point after another, numbering on from a numbered one', () => {
    const { doc: next, index } = insertPoint(doc, 2, 1, 0, 'Third')
    expect(writeNoteDoc(next)).toContain('2. Need a reviewer for the `sync` change\n3. Third\n\n| Who')
    expect(next.topics[2].items[index]).toMatchObject({ kind: 'point', text: 'Third' })
  })

  it('adds a sub-point under a point', () => {
    const { doc: next } = insertPoint(doc, 1, 2, 1, 'Due Friday')
    expect(writeNoteDoc(next)).toContain('- Is Atlas slipping a week?\n  - Due Friday\n> Ask')
  })

  it('adds a point to a topic that ends in a blank line before that blank line', () => {
    const plain = parseNoteDoc('## A\n- one\n\n## B\n')
    const { doc: next } = insertPoint(plain, 1, endOfTopic(plain.topics[1]), 0, 'two')
    expect(writeNoteDoc(next)).toBe('## A\n- one\n- two\n\n## B\n')
  })

  it('adds a point to a file whose last line has no ending', () => {
    const plain = parseNoteDoc('## A\n- one')
    expect(writeNoteDoc(insertPoint(plain, 1, 0, 0, 'two').doc)).toBe('## A\n- one\n- two\n')
  })

  it('uses the file’s line endings for new lines', () => {
    const crlf = parseNoteDoc(SAMPLES.crlf)
    expect(writeNoteDoc(insertPoint(crlf, 1, 0, 0, 'New').doc)).toContain('- Where the write-up stands\r\n- New\r\n')
  })

  it('keeps a space typed at the end of a point, so typing is not undone', () => {
    const typed = setPointText(doc, 1, 0, 'Where the ')
    expect(pointsOf(typed.topics[1])[0].text).toBe('Where the ')
    expect(talkingPoints(typed.topics[1])[0]).toBe('Where the\n- Two peer reviews still to come')
  })

  it('removes a point', () => {
    expect(writeNoteDoc(removePoint(doc, 1, 2))).not.toContain('Atlas')
  })

  it('makes a point a sub-point and back', () => {
    const sub = setPointDepth(doc, 1, 2, 1)
    expect(writeNoteDoc(sub)).toContain('  - Two peer reviews still to come\n  - Is Atlas slipping a week?\n')
    expect(writeNoteDoc(setPointDepth(sub, 1, 2, 0))).toContain('  - Two peer reviews still to come\n- Is Atlas slipping a week?\n')
  })

  it('does not make the first point a sub-point', () => {
    expect(setPointDepth(doc, 1, 0, 1)).toBe(doc)
  })

  it('renames a topic and changes its time', () => {
    const next = setTopic(doc, 1, { name: 'Promotion', time: { seconds: 480, open: false } })
    expect(writeNoteDoc(next)).toBe(PRIYA.replace('## Promotion case [10m]', '## Promotion [8m]'))
    expect(writeNoteDoc(setTopic(doc, 1, { time: null }))).toContain('\n## Promotion case\n')
  })

  it('adds a topic at the end with a blank line before it', () => {
    const plain = parseNoteDoc('## A\n- one')
    const { doc: next, index } = addTopic(plain, 1, 'B')
    expect(writeNoteDoc(next)).toBe('## A\n- one\n\n## B\n')
    expect(index).toBe(2)
    expect(writeNoteDoc(addTopic(parseNoteDoc(''), 0, 'First').doc)).toBe('## First\n')
  })

  it('removes a topic and what is under it', () => {
    expect(writeNoteDoc(removeTopic(parseNoteDoc('## A\n- one\n\n## B\n- two\n'), 1))).toBe('## B\n- two\n')
  })

  it('sets, changes and removes front matter values', () => {
    expect(writeNoteDoc(setFrontValue(doc, 'with', 'Priya'))).toBe(PRIYA.replace('with: Priya Shah', 'with: Priya'))
    const plain = parseNoteDoc('## A\n')
    const added = setFrontValue(plain, 'with', 'Sam')
    expect(writeNoteDoc(added)).toBe('---\nwith: Sam\n---\n## A\n')
    expect(writeNoteDoc(setFrontValue(added, 'with', ''))).toBe('## A\n')
  })
})

describe('where topics are', () => {
  it('finds a topic’s first line and the topic of a line', async () => {
    const { topicLine, topicAtLine } = await import('./format')
    const doc = parseNoteDoc(PRIYA)
    const lines = PRIYA.split('\n')
    expect(lines[topicLine(doc, 1)]).toBe('## Promotion case [10m]')
    expect(lines[topicLine(doc, 3)]).toBe('## Anything else [open]')
    expect(topicAtLine(doc, 0)).toBe(0)
    expect(topicAtLine(doc, topicLine(doc, 2) + 1)).toBe(2)
  })
})
