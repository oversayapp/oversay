// The live session, as every window sees it, and the commands that drive it (006/01).
import { invoke } from '@tauri-apps/api/core'
import { channel } from '../channel'
import { logAction } from '../log'
import type { Talk } from '../project/types'
import { planFromTalk } from './plan'
import { get } from 'svelte/store'
import { settings } from '../settings/store'
import { effectiveShortcuts, isMac } from './shortcuts'
import type { SessionState } from './clock'

/** The open session, or null when there is none. Broadcast by the Rust engine. */
export const session = channel<SessionState | null>('session', null)

/**
 * Opens a session for `talk`, ready to start on the first Next. A note or a preview
 * starts at once and is never recorded; a deck waits for Start like a talk.
 */
export async function openSession(talk: Talk, { mode = 'talk' }: { mode?: SessionMode } = {}): Promise<void> {
  logAction(mode === 'talk' ? 'session open' : `${mode} session open`, talk.id)
  const shortcuts = effectiveShortcuts(get(settings).shortcuts, isMac())
  await invoke('session_open', { plan: planFromTalk(talk), talk, shortcuts, mode })
}

/**
 * What a session is: a talk, a quick note shown on screen, a deck on the flashcard widget, the control panel's preview with
 * nothing running (ADR 0028), or the deck editor's preview of a deck on screen. Same names as `session_open` in
 * src-tauri/src/session.rs.
 */
export type SessionMode = 'talk' | 'note' | 'deck' | 'preview' | 'deck-preview'

/** The deck editor's preview shows `talk` (a deck's) on card `index`, as it is now. */
export async function previewDeck(talk: Talk, index: number): Promise<void> {
  await invoke('session_preview_deck', { plan: planFromTalk(talk), talk, index })
}

/** Closes a session that hasn't started or has finished. */
export async function closeSession(): Promise<void> {
  logAction('session close')
  await invoke('session_close')
}

/** The session controls spec §6 gives every plugin, also used by the manager. */
export const sessionCommands = {
  async next(): Promise<void> {
    logAction('session next')
    await invoke('session_next')
  },
  async previous(): Promise<void> {
    logAction('session previous')
    await invoke('session_previous')
  },
  /** A deck's card `from` has run its time (Auto-advance): the next card, if `from` is still showing. */
  async advance(from: number): Promise<void> {
    logAction('session advance')
    await invoke('session_advance', { from })
  },
  /** Pauses for an interruption, or resumes; paused time doesn't count. */
  async togglePause(): Promise<void> {
    logAction('session pause/resume')
    await invoke('session_toggle_pause')
  },
  async end(): Promise<void> {
    logAction('session end')
    await invoke('session_end')
  },
}
