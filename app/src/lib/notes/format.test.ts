import { describe, expect, it } from 'vitest'
import {
  addTopic,
  frontValue,
  insertPoint,
  movePoint,
  movePointBy,
  moveTopic,
  moveTopicBy,
  pointSiblings,
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
  type NoteDoc,
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

describe('moveTopic: reordering cards (epic 041)', () => {
  const THREE = '## 1 [1m]\n- one\n\n## 2 [2m, demo]\n- two\n\n## 3\n- three\n'

  it('moves the third card above the first, each card as written (drag-card-order/V1, V3)', () => {
    const { doc, index } = moveTopic(parseNoteDoc(THREE), 3, 1)
    expect(writeNoteDoc(doc)).toBe('## 3\n- three\n\n## 1 [1m]\n- one\n\n## 2 [2m, demo]\n- two\n')
    expect(index).toBe(1)
    expect(parseNoteDoc(writeNoteDoc(doc)).topics.map((t) => t.name)).toEqual(['', '3', '1', '2'])
  })

  it('moves a card down, to the end (drag-card-order/V1)', () => {
    const { doc, index } = moveTopic(parseNoteDoc(THREE), 1, 4)
    expect(writeNoteDoc(doc)).toBe('## 2 [2m, demo]\n- two\n\n## 3\n- three\n\n## 1 [1m]\n- one\n')
    expect(index).toBe(3)
  })

  it('takes everything under a heading with its card and leaves the front matter and preamble', () => {
    const text = '---\nid: d_k3x9a2bq\n---\n\n# Title\n\n## A\n1. first\n   wrapped on\n  - sub\n> quote\n\n```\n## not a card\n```\n\n## B [~5m]\n| a | b |\n\n### deeper\n'
    expect(writeNoteDoc(moveTopic(parseNoteDoc(text), 2, 1).doc)).toBe(
      '---\nid: d_k3x9a2bq\n---\n\n# Title\n\n## B [~5m]\n| a | b |\n\n### deeper\n\n## A\n1. first\n   wrapped on\n  - sub\n> quote\n\n```\n## not a card\n```\n',
    )
  })

  it('keeps the blank lines where they were: a newly added last card moved between two others (drag-card-order/V2)', () => {
    const added = addTopic(parseNoteDoc('## A\n- one\n\n\n## B\n- two\n'), 2, 'New card').doc
    expect(writeNoteDoc(moveTopic(added, 3, 2).doc)).toBe('## A\n- one\n\n\n## New card\n\n## B\n- two\n')
  })

  it.each([
    ['no final newline', '## A\n- one\n\n## B\n- two', '## B\n- two\n\n## A\n- one'],
    ['CRLF', '## A\r\n- one\r\n\r\n## B\r\n- two\r\n', '## B\r\n- two\r\n\r\n## A\r\n- one\r\n'],
    ['CRLF and no final newline', '## A\r\n- one\r\n\r\n## B\r\n- two', '## B\r\n- two\r\n\r\n## A\r\n- one'],
    ['no blank line between cards', '## A\n- one\n## B\n- two\n', '## B\n- two\n## A\n- one\n'],
  ])('keeps the end of the file and its line endings: %s', (_, before, after) => {
    expect(writeNoteDoc(moveTopic(parseNoteDoc(before), 2, 1).doc)).toBe(after)
  })

  it('changes nothing when the card would stay where it is', () => {
    const doc = parseNoteDoc(THREE)
    for (const position of [2, 3]) expect(moveTopic(doc, 2, position)).toEqual({ doc, index: 2 })
    expect(moveTopic(doc, 2, 2).doc).toBe(doc)
  })

  it('never moves the lines before the first heading, or a card above them', () => {
    const doc = parseNoteDoc('- before any heading\n\n## A\n\n## B\n')
    expect(moveTopic(doc, 0, 3).doc).toBe(doc)
    expect(writeNoteDoc(moveTopic(doc, 2, 0).doc)).toBe('- before any heading\n\n## B\n\n## A\n')
  })

  it('has no card for an index outside the note', () => {
    const doc = parseNoteDoc(THREE)
    expect(moveTopic(doc, 9, 1).doc).toBe(doc)
    expect(moveTopic(doc, -1, 1).doc).toBe(doc)
  })

  it('refuses a move that would swallow other cards into an unclosed code fence', () => {
    const doc = parseNoteDoc('## A\n- one\n\n## B\n```\nnever closed\n')
    expect(moveTopic(doc, 2, 1)).toEqual({ doc, index: 2 })
    expect(moveTopic(doc, 2, 1).doc).toBe(doc)
    expect(moveTopic(doc, 1, 3).doc).toBe(doc)
  })

  it('moves a card one place either way, and not past either end (keyboard-move-card/V4)', () => {
    const doc = parseNoteDoc(THREE)
    const names = (d: NoteDoc) => d.topics.slice(1).map((t) => t.name)
    const up = moveTopicBy(doc, 2, -1)
    expect([names(up.doc), up.index]).toEqual([['2', '1', '3'], 1])
    const down = moveTopicBy(doc, 2, 1)
    expect([names(down.doc), down.index]).toEqual([['1', '3', '2'], 3])
    expect(moveTopicBy(doc, 1, -1).doc).toBe(doc)
    expect(moveTopicBy(doc, 3, 1).doc).toBe(doc)
  })
})

describe('movePoint: reordering the points of a card (epic 042)', () => {
  const ABC = '## Card\n- A\n- B\n- C\n'
  const moved = (text: string, t: number, i: number, position: number) => writeNoteDoc(movePoint(parseNoteDoc(text), t, i, position).doc)

  it('moves the third point above the first (epic-042/V2)', () => {
    const { doc, index } = movePoint(parseNoteDoc(ABC), 1, 2, 0)
    expect(writeNoteDoc(doc)).toBe('## Card\n- C\n- A\n- B\n')
    expect(index).toBe(0)
  })

  it('moves one place at a time, and not past the first or last (epic-042/V2)', () => {
    const doc = parseNoteDoc(ABC)
    expect(writeNoteDoc(movePointBy(doc, 1, 1, -1).doc)).toBe('## Card\n- B\n- A\n- C\n')
    expect(writeNoteDoc(movePointBy(doc, 1, 1, 1).doc)).toBe('## Card\n- A\n- C\n- B\n')
    expect(movePointBy(doc, 1, 0, -1).doc).toBe(doc)
    expect(movePointBy(doc, 1, 2, 1).doc).toBe(doc)
  })

  const SUBS = '## Card\n- A\n- B\n  - b1\n  - b2\n- C\n'

  it('takes a point’s sub-points with it (epic-042/V4)', () => {
    const up = movePointBy(parseNoteDoc(SUBS), 1, 1, -1)
    expect(writeNoteDoc(up.doc)).toBe('## Card\n- B\n  - b1\n  - b2\n- A\n- C\n')
    expect(up.index).toBe(0)
    const down = movePointBy(parseNoteDoc(SUBS), 1, 0, 1)
    expect(writeNoteDoc(down.doc)).toBe('## Card\n- B\n  - b1\n  - b2\n- A\n- C\n')
    expect(down.index).toBe(3)
  })

  it('moves a sub-point only among its own point’s sub-points (epic-042/V4)', () => {
    const doc = parseNoteDoc(SUBS)
    expect(writeNoteDoc(movePointBy(doc, 1, 3, -1).doc)).toBe('## Card\n- A\n- B\n  - b2\n  - b1\n- C\n')
    expect(movePointBy(doc, 1, 2, -1).doc).toBe(doc)
    expect(movePointBy(doc, 1, 3, 1).doc).toBe(doc)
    expect(pointSiblings(doc.topics[1], 3)).toEqual([2, 3])
    expect(pointSiblings(doc.topics[1], 1)).toEqual([0, 1, 4])
  })

  it('leaves kept lines and every other card where they are; wrapped lines travel with their point (epic-042/V4)', () => {
    const text = '---\nid: d_k3x9a2bq\n---\n\n## One\n- first\n  wrapped on\n> quote\n\n| a | b |\n- second\n```\n- code\n```\n- third\n\n## Two\n- untouched\n'
    expect(moved(text, 1, 8, 0)).toBe(
      '---\nid: d_k3x9a2bq\n---\n\n## One\n- third\n> quote\n\n| a | b |\n- first\n  wrapped on\n```\n- code\n```\n- second\n\n## Two\n- untouched\n',
    )
  })

  it('keeps a numbered list’s numbers in order, with each point’s own marker (epic-042/V4)', () => {
    expect(moved('## C\n1. one\n2. two\n3. three\n', 1, 2, 0)).toBe('## C\n1. three\n2. one\n3. two\n')
    expect(moved('## C\n- plain\n3) x\n4) y\n', 1, 2, 0)).toBe('## C\n3) y\n- plain\n4) x\n')
    expect(moved('## C\n1. a\n  1. a1\n  2. a2\n2. b\n', 1, 2, 0)).toBe('## C\n1. a\n  1. a2\n  2. a1\n2. b\n')
    expect(moved('## C\n1. a\n  1. a1\n2. b\n  1. b1\n', 1, 2, 0)).toBe('## C\n1. b\n  1. b1\n2. a\n  1. a1\n')
  })

  it.each([
    ['no final newline', '## C\n- A\n- B', '## C\n- B\n- A'],
    ['CRLF', '## C\r\n- A\r\n- B\r\n', '## C\r\n- B\r\n- A\r\n'],
    ['the points above the first heading', '- A\n- B\n\n## Next\n', '- B\n- A\n\n## Next\n'],
  ])('handles %s (epic-042/V4)', (_, before, after) => {
    const t = before.startsWith('##') ? 1 : 0
    expect(moved(before, t, 1, 0)).toBe(after)
  })

  it('keeps a point a point when it showed as one only because nothing was above it', () => {
    // Its parent was deleted: it is still indented in the file, and must not become B’s sub-point.
    expect(moved('## C\n  - left over\n- B\n', 1, 0, 2)).toBe('## C\n- B\n- left over\n')
  })

  it('changes nothing when the move would change how the points read', () => {
    // An indented plain line placed under a point would read as the rest of that point.
    const doc = parseNoteDoc('## C\n> q\n  indented plain\n- B\n')
    expect(movePoint(doc, 1, 2, 0).doc).toBe(doc)
  })

  it('changes nothing when the point would stay where it is, or is not a point', () => {
    const doc = parseNoteDoc(ABC)
    for (const position of [1, 2]) expect(movePoint(doc, 1, 1, position)).toEqual({ doc, index: 1 })
    expect(movePoint(doc, 1, 9, 0).doc).toBe(doc)
  })
})
