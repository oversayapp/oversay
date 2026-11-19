// Showing a deck on screen (ADR 0036): its cards as a talk's segments, run as a deck
// session on the deck widget (ADR 0042), starting in the Card view. It opens Ready on the first card,
// until Start or Space; the widget's ✕ (or the menu-bar menu's End) closes it.

import { getCurrentWindow } from '@tauri-apps/api/window'
import { get } from 'svelte/store'
import { logAction } from '../log'
import { openSession, previewDeck, sessionCommands } from '../session/store'
import { openOverlay } from '../windows'
import { flashcard } from '../../plugins/flashcard'
import { overlayWindow } from '../../plugins/registry'
import { setOverlaySetting, settings } from '../settings/store'
import { parseOverlaySettings } from '../settings/overlays'
import type { NoteDoc } from '../notes/format'
import type { SessionState } from '../session/clock'
import { deckOptions, deckTalk } from './deck'

const talkOf = (doc: NoteDoc, name: string) => ({ ...deckTalk(doc, name), deck: deckOptions(doc) })

/**
 * Opens the deck widget in the Card view, at its place: a deck always starts on its card (John,
 * 7 Nov); the switch then goes to the Agenda view, each view at its own remembered place (ADR 0042).
 */
async function openDeckWidget(): Promise<void> {
  if (parseOverlaySettings(get(settings).overlays).deckView !== 'card') await setOverlaySetting('deckView', 'card')
  await openOverlay(flashcard.id, flashcard.name, overlayWindow(flashcard, parseOverlaySettings(get(settings).overlays)))
}

/** Puts the deck on the deck widget, Ready, and the manager out of the way. */
export async function showDeckOnScreen(doc: NoteDoc, name: string, path: string): Promise<void> {
  // The widget reads the deck's options from the talk the session carries; its path says where
  // the run is kept when it ends.
  const talk = { ...talkOf(doc, name), deckPath: path }
  if (talk.segments.length === 0) throw new Error('Add a card to the deck before showing it.')
  logAction('show deck', name)
  await openSession(talk, { mode: 'deck' })
  try {
    await openDeckWidget()
  } catch (e) {
    await sessionCommands.end().catch(() => {})
    throw e
  }
  // The Rust core brings the manager back when the deck is closed (ADR 0018).
  await getCurrentWindow()
    .minimize()
    .catch(() => {})
}

/**
 * The deck editor's preview: the real deck widget on screen, on card `index`, its clock
 * held at the card's full time. Nothing is recorded and no hotkeys are taken; Show replaces it, and
 * the widget's ✕ or the editor ends it. The manager stays where it is, to go on editing.
 */
export async function previewDeckOnScreen(doc: NoteDoc, name: string, index: number): Promise<void> {
  const talk = talkOf(doc, name)
  if (talk.segments.length === 0) throw new Error('Add a card to the deck before previewing it.')
  logAction('preview deck', name)
  await openSession(talk, { mode: 'deck-preview' })
  await previewDeck(talk, index)
  try {
    await openDeckWidget()
  } catch (e) {
    await sessionCommands.end().catch(() => {})
    throw e
  }
}

/** Whether `session` is the deck editor's preview on screen: a deck preview that isn't the Look card's sample deck. */
export const isEditorPreview = (session: Pick<SessionState, 'status' | 'deck' | 'preview' | 'lookPreview'> | null): boolean =>
  !!session?.preview && !!session.deck && !session.lookPreview && session.status !== 'finished'

/** The preview follows the deck as it is edited, and the card being edited. */
export function updateDeckPreview(doc: NoteDoc, name: string, index: number): Promise<void> {
  const talk = talkOf(doc, name)
  if (talk.segments.length === 0) return Promise.resolve()
  return previewDeck(talk, index)
}
