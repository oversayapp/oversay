// App-wide settings, saved as settings.json in the config folder (epic 009). Rust reads
// `appearance` at startup (src-tauri/src/settings.rs) so the first window has the right theme.

import type { FavouriteTalk } from './favourites'
import type { LastRun } from './last-run'
import { DEFAULT_OVERLAY_SETTINGS, type OverlaySettings } from './overlays'

export const APPEARANCES = ['system', 'light', 'dark'] as const
export type Appearance = (typeof APPEARANCES)[number]

export interface Settings {
  version: 1
  appearance: Appearance
  /** The demo project has been put in the Projects folder once (010); it isn't added again. */
  demoInstalled?: boolean
  /** The example decks have been put in Decks once; they aren't added again. */
  exampleDecksInstalled?: boolean
  /** Session hotkeys changed from the defaults, by action (006/03; see lib/session/shortcuts.ts). */
  shortcuts?: Partial<Record<string, string>>
  /** Favourite talks, newest first (011/02; lib/settings/favourites.ts). */
  favourites?: FavouriteTalk[]
  /** The talk started last, for Home's Continue card (012/02; lib/settings/last-run.ts). */
  lastRun?: LastRun
  /** How the overlays look, as chosen in Settings › Overlays (007/02; lib/settings/overlays.ts). */
  overlays?: Partial<OverlaySettings>
  /** Pinned notes, quick talks and projects, newest pin first (lib/settings/quick.ts). */
  pins?: unknown
  /** Starred notes and quick talks, newest first (lib/settings/quick.ts). */
  quickFavourites?: unknown
  /** Notes, quick talks and projects opened, newest first, for Recent (lib/settings/quick.ts). */
  opened?: unknown
  /** The files Oversay has listed in Quick notes and Quick talks, and the New ones (lib/settings/quick.ts). */
  quickSeen?: unknown
  /** Whether oversay:// links may show a note or open Get ready without asking (ADR 0032; lib/links.ts). */
  links?: unknown
  /** The AI page was opened once, so the rail's AI item loses its New. */
  aiPageSeen?: boolean
  /** Home's card about the Oversay skill was closed for good. */
  aiCardHidden?: boolean
  /** Chat apps the person said they added the skill to, so the AI page shows them Ready (lib/skill/page.ts). */
  aiAdded?: unknown
  /** The Workspaces page's pins, Recent, tag colours and place in its sidebar (lib/workspaces/navigation.ts). */
  workspaceNav?: unknown
  /** Keep a session's recording once it is transcribed (Settings › Recordings, ADR 0041); off, it goes to the Trash. */
  keepRecordings?: boolean
  /** Every deck records the person's voice from Start (Settings › Recordings); off (the default), the deck widget's record button starts it. */
  autoRecord?: boolean
  /** Decks' `project:` lines have been moved into workspaces once. */
  projectLinesMoved?: boolean
  /** The overlays have been moved to the Waveform style once. */
  waveformMoved?: boolean
  /** The overlays have been made see-through at 75% once, for the deck widget (ADR 0042). */
  seeThroughMoved?: boolean
  /** Updates (epic #16; lib/updates/policy.ts): `auto` checks as Oversay starts, `everyHours` is the least time between checks. */
  updates?: { auto?: boolean; everyHours?: number }
  /** When Oversay last asked for updates, as an ISO time. */
  lastUpdateCheck?: string
  /** Fields this version doesn't know about, kept as they were when saving. */
  [other: string]: unknown
}

export const DEFAULT_SETTINGS: Settings = { version: 1, appearance: 'system', waveformMoved: true, seeThroughMoved: true }

/** False when a settings file exists but isn't a settings object (damaged, or edited by hand). */
export function isReadable(text: string | null): boolean {
  if (text === null) return true
  try {
    const data = JSON.parse(text)
    return typeof data === 'object' && data !== null && !Array.isArray(data)
  } catch {
    return false
  }
}

/** Missing, broken or unexpected settings fall back to the defaults, field by field. */
export function parseSettings(text: string | null): Settings {
  if (text === null) return { ...DEFAULT_SETTINGS }
  try {
    const data = JSON.parse(text)
    if (typeof data !== 'object' || data === null || Array.isArray(data)) return { ...DEFAULT_SETTINGS }
    const appearance = APPEARANCES.includes(data.appearance) ? data.appearance : DEFAULT_SETTINGS.appearance
    return movedToSeeThrough(movedToWaveform({ ...data, version: 1, appearance }))
  } catch {
    return { ...DEFAULT_SETTINGS }
  }
}

/**
 * Waveform became the first and default Timeline style (ADR 0029). Oversay isn't
 * released, so everyone moves to it once and is made solid, as choosing it does; the panel stays
 * Dark or Light. A panel saved as Minimal (this epic's first try, when Minimal was a panel) is read
 * as Dark, and its mark is dropped. The new mark is saved with the next change, so a style chosen
 * after this stays chosen.
 */
export function movedToWaveform(settings: Settings): Settings {
  if (settings.waveformMoved === true) return settings
  const overlays = settings.overlays ?? {}
  const panel = overlays.panel === 'light' ? 'light' : 'dark'
  const moved: Settings = { ...settings, overlays: { ...overlays, timelineStyle: 'waveform', panel, solid: true }, waveformMoved: true }
  delete moved.minimalMoved
  return moved
}

/**
 * The deck widget starts at 75% (ADR 0042, John, 7 Nov): everyone's overlays are made see-through
 * at 75% once, as the default now is; a choice made after this stays chosen.
 */
export function movedToSeeThrough(settings: Settings): Settings {
  if (settings.seeThroughMoved === true) return settings
  return { ...settings, overlays: { ...(settings.overlays ?? {}), opacity: DEFAULT_OVERLAY_SETTINGS.opacity, solid: false }, seeThroughMoved: true }
}

export function serializeSettings(settings: Settings): string {
  return JSON.stringify(settings, null, 2) + '\n'
}
