// A session's review (ADR 0041): written by the Oversay skill in the person's own agent into
// the deck's reviews/, and shown on the session's page; until there is one, Review with your AI
// copies a request for it. Pure, so the page and its tests agree.

import SESSION_FORMAT from './session-format.json'
import { runLabel } from './transcript'

export interface Review {
  /** Which skill wrote it (`made-with`), or ''. */
  madeWith: string
  /** Its sections in the format's order: each its heading, its points and any other lines. */
  sections: { title: string; points: string[]; lines: string[] }[]
}

/** Reads a review for the page: its sections, each a list of points; anything before the first section is left out. */
export function readReview(markdown: string): Review {
  const madeWith = /^made-with:\s*(.*)$/m.exec(markdown)?.[1].trim() ?? ''
  const body = markdown.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/, '')
  const sections: Review['sections'] = []
  for (const line of body.split(/\r?\n/)) {
    const heading = /^##\s+(.+)$/.exec(line)
    if (heading) {
      sections.push({ title: heading[1].trim(), points: [], lines: [] })
      continue
    }
    const section = sections.at(-1)
    if (!section || !line.trim()) continue
    const point = /^\s*[-*]\s+(.*)$/.exec(line)
    if (point) section.points.push(point[1])
    else section.lines.push(line.trim())
  }
  const order = SESSION_FORMAT.review.sections
  return { madeWith, sections: sections.sort((a, b) => rank(order, a.title) - rank(order, b.title)) }
}

const rank = (order: readonly string[], title: string) => (order.includes(title) ? order.indexOf(title) : order.length)

/** What Review with your AI copies: a request the Oversay skill knows, naming the deck and the run. */
export const reviewRequest = (deckName: string, startedAt: string): string => `Review my ${deckName} session of ${runLabel(startedAt)} in Oversay.`
