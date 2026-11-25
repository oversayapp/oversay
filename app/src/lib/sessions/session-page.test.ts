import { describe, expect, it, vi } from 'vitest'
import { logArrived, logCardWords, logLabels, logPaneShown, logTopState, noteLabel, reviewLabel, runLabelFor, topState, wordsByCard, type TopInput } from './session-page'
import { readReview } from './review'
import { logAction } from '../log'
import { readTranscript, transcriptMarkdown } from './transcript'
import type { DeckSession } from '../decks/sessions'

vi.mock('../log', () => ({ logAction: vi.fn(), logProblem: vi.fn() }))
const logs = (event: string) =>
  vi
    .mocked(logAction)
    .mock.calls.filter(([what]) => what === event)
    .map(([, detail]) => detail)

const nothing: TopInput = {
  checking: false,
  transcript: null,
  reading: false,
  recording: false,
  download: null,
  work: null,
  askForModel: false,
}

const run: DeckSession = {
  startedAt: '2026-10-28T09:00:00.000Z',
  endedAt: '2026-10-28T09:03:00.000Z',
  cards: [
    { name: 'Intro', kind: 'intro', plannedSeconds: 60, seconds: 60 },
    { name: 'Atlas', kind: 'topic', plannedSeconds: 60, seconds: 60 },
    { name: 'Wrap-up', kind: 'outro', plannedSeconds: null, seconds: 60 },
  ],
}
const spoken = readTranscript(
  transcriptMarkdown(run, 'Stand-up', 'zoom', [
    { at: 1000, speaker: 'Ann', text: 'Morning.' },
    { at: 61_000, speaker: '', text: 'Atlas shipped.' },
  ]).markdown,
)
const silent = readTranscript(transcriptMarkdown(run, 'Stand-up', 'zoom', []).markdown)

describe('what the top of the run shows', () => {
  it('a file being checked comes before everything', () => {
    expect(topState({ ...nothing, checking: true, transcript: spoken, recording: true })).toBe('import')
  })

  it('a transcript with lines, or one with nothing heard', () => {
    expect(topState({ ...nothing, transcript: spoken, recording: true })).toBe('transcript')
    expect(topState({ ...nothing, transcript: silent })).toBe('silent')
  })

  it('nothing while a saved transcript is being read', () => {
    expect(topState({ ...nothing, reading: true, recording: true })).toBe('loading')
  })

  it('a recording: downloading, then transcribing, asking for the model, or waiting', () => {
    const recorded = { ...nothing, recording: true }
    expect(topState({ ...recorded, download: 62, work: 40, askForModel: true })).toBe('downloading')
    expect(topState({ ...recorded, work: 40, askForModel: true })).toBe('transcribing')
    expect(topState({ ...recorded, askForModel: true })).toBe('ask')
    expect(topState(recorded)).toBe('waiting')
  })

  it('a download for another session shows nothing here without a recording', () => {
    expect(topState({ ...nothing, download: 62 })).toBe('none')
  })

  it('logs the state', () => {
    logTopState('waiting')
    expect(logs('session.transcript_state')).toEqual(['state=waiting check=epic-044/V5'])
  })
})

describe('what was said, beside each card', () => {
  it('gives each card its own lines', () => {
    const { byCard, extra } = wordsByCard(run.cards, spoken)
    expect(byCard.map((lines) => lines.map((l) => l.text))).toEqual([['Morning.'], ['Atlas shipped.'], []])
    expect(extra).toEqual([])
  })

  it('goes by name when the file leaves cards out, and keeps a heading that is no card’s', () => {
    const edited = readTranscript('## Atlas\n- 1:01 Atlas shipped.\n## Aside\n- 1:30 Not a card.\n## Wrap-up\n- 2:05 Bye.\n')
    const { byCard, extra } = wordsByCard(run.cards, edited)
    expect(byCard.map((lines) => lines.map((l) => l.text))).toEqual([[], ['Atlas shipped.'], ['Bye.']])
    expect(extra.map((c) => c.title)).toEqual(['Aside'])
  })

  it('finds a card whose name has a dot in it', () => {
    const cards = [{ ...run.cards[0], name: 'Q&A · pricing' }]
    const t = readTranscript(transcriptMarkdown({ ...run, cards }, 'Stand-up', 'zoom', [{ at: 1000, speaker: '', text: 'Price.' }]).markdown)
    expect(wordsByCard(cards, t).byCard[0].map((l) => l.text)).toEqual(['Price.'])
  })

  it('logs a card opened or closed, with no words', () => {
    logCardWords(1, true)
    logCardWords(1, false)
    expect(logs('session.card_words')).toEqual(['card=1 open=true check=epic-044/V2', 'card=1 open=false check=epic-044/V2'])
  })
})

describe('the state labels', () => {
  it('say where the transcript stands', () => {
    const label = (state: Parameters<typeof runLabelFor>[0]['state'], percent = 0, refused = false) => runLabelFor({ state, percent, refused })
    expect(label('transcript')).toEqual({ text: 'Ready', tone: 'good' })
    expect(label('silent')).toEqual({ text: 'Nothing heard', tone: 'plain' })
    expect(label('import')).toEqual({ text: 'Check and save', tone: 'todo' })
    expect(label('ask')).toEqual({ text: 'Needs your OK', tone: 'todo' })
    expect(label('downloading', 62)).toEqual({ text: 'Downloading 62%', tone: 'good' })
    expect(label('transcribing', 40)).toEqual({ text: 'Transcribing 40%', tone: 'good' })
    expect(label('waiting')).toEqual({ text: 'Recording waits', tone: 'todo' })
    expect(label('none')).toEqual({ text: 'None · add one', tone: 'none' })
    expect(label('none', 0, true)).toEqual({ text: 'File refused', tone: 'bad' })
    expect(label('loading')).toBeNull()
  })

  it('a refused file doesn’t hide a transcript already there', () => {
    expect(runLabelFor({ state: 'transcript', percent: 0, refused: true })?.text).toBe('Ready')
  })

  it('say whether the note is written, a blank one not', () => {
    expect(noteLabel('Cut the demo.')).toEqual({ text: 'Written', tone: 'plain' })
    expect(noteLabel('  \n ')).toEqual({ text: 'Not written', tone: 'none' })
  })

  it('count the changes a review asks for', () => {
    const review = (points: number) => readReview(`## What ran over\n- Atlas.\n## What to change in the deck\n${'- one\n'.repeat(points)}`)
    expect(reviewLabel(true, review(4))).toEqual({ text: 'Ready · 4 changes', tone: 'good' })
    expect(reviewLabel(true, review(1))?.text).toBe('Ready · 1 change')
    expect(reviewLabel(true, review(0))?.text).toBe('Ready')
    expect(reviewLabel(true, readReview('## What ran over\n- Atlas.\n'))?.text).toBe('Ready')
    // There, and still being read.
    expect(reviewLabel(true, null)?.text).toBe('Ready')
    expect(reviewLabel(false, null)).toEqual({ text: 'Not yet', tone: 'none' })
  })

  it('log the states and the pane, with no words from the note or review', () => {
    logLabels({ run: 'transcript', note: noteLabel('Secret plan'), review: reviewLabel(false, null) })
    logPaneShown('note')
    expect(logs('session.state_labels')).toEqual(['run=transcript note=Written review=Not yet check=epic-044/V4'])
    expect(logs('session.pane_shown')).toEqual(['pane=note check=epic-044/V3'])
  })
})

describe('how a page was arrived at', () => {
  it('is logged', () => {
    logArrived('run')
    logArrived(undefined)
    expect(logs('session.arrived')).toEqual(['from=run check=epic-044/V6', 'from=other check=epic-044/V6'])
  })
})
