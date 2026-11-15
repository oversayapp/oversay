// Following an oversay:// link in the manager (ADR 0032): open or show a deck. Links to a
// note or quick talk open the deck it became; a quick talk's `ready` shows it. Showing and Get ready ask first unless Settings says
// otherwise; during a session a link that would show something is refused.
import { get, writable } from 'svelte/store'
import { findDeckFor, parseLink, takeLinks, type Link } from '../lib/links'
import { logAction, logProblem } from '../lib/log'
import { quickName, readQuickFile } from '../lib/notes/files'
import { decks, loadDecks } from '../lib/decks/store'
import { parseNoteDoc } from '../lib/notes/format'
import { showBlockedBy } from '../lib/notes/show'
import { session } from '../lib/session/store'
import { linkPermission, markOpened, setLinkPermission } from '../lib/settings/store'
import { attempt, notice } from './errors'
import { goDeck, goDecks } from './route'
import { showDeckOnScreen } from '../lib/decks/show'

/** The question the link dialog asks, while it is open. */
export interface LinkQuestion {
  /** "Show “Standup” on screen?" */
  title: string
  /** What happens instead when the answer is no. */
  instead: string
  answer: (yes: boolean, remember: boolean) => void
}

export const linkQuestion = writable<LinkQuestion | null>(null)

/** Whether a link may show something: Settings, or the person's answer. */
async function mayShow(title: string, instead: string): Promise<boolean> {
  const permission = get(linkPermission)
  if (permission !== 'ask') return permission === 'allow'
  const { yes, remember } = await new Promise<{ yes: boolean; remember: boolean }>((resolve) =>
    linkQuestion.set({ title, instead, answer: (yes, remember) => resolve({ yes, remember }) }),
  )
  linkQuestion.set(null)
  logAction('link question', yes ? 'show' : 'open only')
  if (remember) await setLinkPermission(yes ? 'allow' : 'never')
  return yes
}

async function follow(url: string): Promise<void> {
  const asked = parseLink(url)
  if ('problem' in asked) {
    logProblem('link refused', asked.problem)
    notice.set(`Oversay can't follow that link: ${asked.problem}.`)
    return
  }
  // Notes and quick talks became decks: their links open the deck of that name.
  const link: Extract<Link, { kind: 'decks' | 'deck' }> =
    asked.kind === 'notes'
      ? { kind: 'decks' }
      : asked.kind === 'note'
        ? { kind: 'deck', name: asked.name, show: asked.show }
        : asked.kind === 'talk'
          ? { kind: 'deck', name: asked.name, show: asked.ready }
          : asked
  logAction('link', link.kind === 'deck' ? `${link.show ? 'show' : 'open'} deck` : 'decks')
  if (link.kind === 'decks') return goDecks()

  // A deck by its id (oversay://decks/d_k3x9a2bq/show) or by its name.
  await loadDecks()
  const file = findDeckFor((get(decks) ?? []).map((d) => ({ ...d, folder: quickName(d.path) })), link.name)
  if (!file) {
    notice.set(`There is no deck “${link.name}” in Decks.`)
    return
  }
  const blocked = link.show ? showBlockedBy(get(session)) : null
  if (blocked) {
    notice.set(`Not shown: ${blocked}.`)
    return
  }
  if (link.show && (await mayShow(`Show “${file.name}” on screen?`, 'Just open it'))) {
    await markOpened('deck', file.path, file.id || undefined)
    await showDeckOnScreen(parseNoteDoc(await readQuickFile('decks', file.path)), file.name, file.path)
  } else {
    goDeck(file.path)
  }
}

let following: Promise<void> = Promise.resolve()

/** Follows every link waiting, one after another (at start, and when links.rs says one arrived). */
export function followLinks(): Promise<void> {
  following = following.then(() =>
    attempt(async () => {
      for (const url of await takeLinks()) await follow(url)
    }),
  )
  return following
}
