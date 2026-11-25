import { describe, expect, it, vi } from 'vitest'
import { logCardWords, logTopState, topState, wordsByCard, type TopInput } from './session-page'
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
