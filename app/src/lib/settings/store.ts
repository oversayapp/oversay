import { invoke } from '@tauri-apps/api/core'
import { setTheme } from '@tauri-apps/api/app'
import { derived, get, writable } from 'svelte/store'
import { favouriteLabel, parseFavourites, withFavourite, withRefreshedNames, type FavouriteTalk } from './favourites'
import { parseLastRun, type LastRun } from './last-run'
import { logAction } from '../log'
import { changeOpacity, cleanOverlays, nextTimelineStyle, parseOverlaySettings, type LookChange, type OpacityChange, type OverlaySettings } from './overlays'
import {
  parseOpened,
  parsePins,
  parseQuickFavourites,
  parseQuickSeen,
  sameSeen,
  seenRenamed,
  SEEN_KINDS,
  withKnown,
  withListed,
  withoutFresh,
  withOpened,
  withoutPath,
  withPathRenamed,
  withPin,
  withDecksFollowed,
  type ListedDeck,
  withQuickFavourite,
  type QuickFavourite,
  type QuickItemKind,
  type QuickSeen,
  type SeenKind,
  starsAsPins,
} from './quick'
import { effectiveShortcuts, isMac, type Shortcuts } from '../session/shortcuts'
import { parseLinkPermission, type LinkPermission } from '../links'
import { DEFAULT_SETTINGS, isReadable, parseSettings, serializeSettings, type Appearance, type Settings } from './settings'
import { addedVersions, type ChatApp } from '../skill/page'
import { parseWorkspaceNav, type WorkspaceNav } from '../workspaces/navigation'

const FILE = 'settings.json'

export const settings = writable<Settings>({ ...DEFAULT_SETTINGS })

/** False when settings.json exists but couldn't be read; nothing writes over it on its own then. */
export let settingsReadable = true

/** True once settings.json has been read: writes made on their own wait for it. */
let settingsLoaded = false

/** Reads settings.json. Rust has already applied the saved appearance at startup. */
export function loadSettings(): Promise<void> {
  return inTurn(readSettings)
}

async function readSettings(): Promise<void> {
  const text = await invoke<string | null>('read_config_file', { name: FILE })
  settingsReadable = isReadable(text)
  const loaded = parseSettings(text)
  settings.set(loaded)
  settingsLoaded = true
  await sendOverlaySettings(loaded)
  await sendPanelShortcut(loaded)
}

/** Overlays are other windows: they get the look through Rust (overlay.rs), and a new overlay finds it there. */
async function sendOverlaySettings(s: Settings): Promise<void> {
  await invoke('set_overlay_settings', { settings: parseOverlaySettings(s.overlays) })
}

/** The control panel's key is registered all the time, not only in a session (ADR 0028). */
async function sendPanelShortcut(s: Settings): Promise<void> {
  const accelerator = effectiveShortcuts(s.shortcuts as Partial<Shortcuts> | undefined, isMac()).panel
  await invoke('set_panel_shortcut', { accelerator }).catch(() => {})
}

async function save(next: Settings): Promise<void> {
  settings.set(next)
  await invoke('write_config_file', { name: FILE, contents: serializeSettings(next) })
}

/** Changes one session hotkey (006/03); null goes back to the default. */
export async function setShortcut(action: string, accelerator: string | null): Promise<void> {
  logAction('shortcut', `${action}: ${accelerator ?? 'default'}`)
  const current = get(settings)
  const shortcuts = { ...current.shortcuts }
  if (accelerator === null) delete shortcuts[action]
  else shortcuts[action] = accelerator
  await save({ ...current, shortcuts })
  if (action === 'panel') await sendPanelShortcut(get(settings))
}

/** All session hotkeys back to their defaults. */
export async function resetShortcuts(): Promise<void> {
  logAction('shortcuts reset')
  const { shortcuts: _old, ...rest } = get(settings)
  await save(rest as typeof rest & Settings)
  await sendPanelShortcut(get(settings))
}

// Changes to the overlays' look run one after another, each from the settings as the one before
// left them, so two quick clicks, or a click while settings are still loading, don't overwrite each other.
let queue: Promise<unknown> = Promise.resolve()
const inTurn = <T>(task: () => Promise<T>): Promise<T> => {
  const run = queue.then(task)
  queue = run.catch(() => {})
  return run
}

/** Changes how the overlays look (007/02); an open overlay follows straight away. */
export function setOverlaySetting<K extends keyof OverlaySettings>(key: K, value: OverlaySettings[K]): Promise<void> {
  logAction(`overlay ${key}`, String(value))
  return inTurn(() => applyOverlaySetting(key, value))
}

/** The hotkey / menu item: the next Timeline style, from the one chosen when its turn comes. */
export function cycleTimelineStyle(): Promise<void> {
  return inTurn(async () => {
    const next = nextTimelineStyle(parseOverlaySettings(get(settings).overlays).timelineStyle)
    logAction('overlay timelineStyle', next)
    await applyOverlaySetting('timelineStyle', next)
  })
}

/**
 * Settings › Overlays › Overlay opacity: the slider sets how see-through the panels are, so it
 * also leaves solid.
 */
/** While the slider moves: every overlay follows, with nothing written or logged until it is let go. */
export function previewOverlayOpacity(opacity: number): Promise<void> {
  return inTurn(async () => {
    const current = get(settings)
    const next = { ...current, overlays: { ...cleanOverlays(current.overlays), opacity, solid: false } }
    settings.set(next)
    await sendOverlaySettings(next)
  })
}

export function setOverlayOpacity(opacity: number): Promise<void> {
  logAction('overlay opacity', String(opacity))
  return inTurn(() => applyOverlaySettings({ opacity, solid: false }))
}

/** An overlay's ⋯ menu or the darker / lighter hotkeys, from the look when its turn comes. */
export function changeOverlayOpacity(change: OpacityChange): Promise<void> {
  return inTurn(async () => {
    const next = changeOpacity(parseOverlaySettings(get(settings).overlays), change)
    logAction('overlay opacity', `${change}: ${next.solid ? 'solid' : `${next.opacity}%`}`)
    await applyOverlaySettings(next)
  })
}

async function applyOverlaySetting<K extends keyof OverlaySettings>(key: K, value: OverlaySettings[K]): Promise<void> {
  // Choosing Waveform makes the panels solid: its one colour needs its opposite behind it.
  await applyOverlaySettings(key === 'timelineStyle' && value === 'waveform' ? { timelineStyle: 'waveform', solid: true } : { [key]: value })
}

async function applyOverlaySettings(changes: Partial<OverlaySettings>): Promise<void> {
  const current = get(settings)
  // Unusable saved values (a hand-edited unbuilt style) are dropped, so the file says what Settings shows.
  const next = { ...current, overlays: { ...cleanOverlays(current.overlays), ...changes } }
  // The open overlay follows the choice shown in Settings even if the file couldn't be written.
  try {
    await save(next)
  } finally {
    await sendOverlaySettings(next)
  }
}

/** Favourite talks, newest first (011/02). */
export const favourites = derived(settings, (s) => parseFavourites(s.favourites))

/** Adds a talk to Favourites, or takes it off. */
export async function setFavourite(favourite: FavouriteTalk, on: boolean): Promise<void> {
  logAction(on ? 'favourite' : 'unfavourite', favouriteLabel(favourite))
  const current = get(settings)
  await save({ ...current, favourites: withFavourite(parseFavourites(current.favourites), favourite, on) })
}

/** Updates the copied names of a project's favourites, when they have changed. */
export async function refreshFavouriteNames(path: string, projectName: string, talkNames: ReadonlyMap<string, string>): Promise<void> {
  const list = parseFavourites(get(settings).favourites)
  const next = withRefreshedNames(list, path, projectName, talkNames)
  if (next !== list) await save({ ...get(settings), favourites: next })
}

/** The talk started last (012/02), or null. */
export const lastRun = derived(settings, (s) => parseLastRun(s.lastRun))

/** Remembers the talk just started, for Home's Continue card; null forgets it. */
export async function setLastRun(run: LastRun | null): Promise<void> {
  const { lastRun: _old, ...rest } = get(settings)
  await save(run ? { ...rest, version: 1, lastRun: run } : (rest as Settings))
}

/** Remembers that the demo project was added, so a deleted demo isn't added again on start. */
export async function markDemoInstalled(): Promise<void> {
  await save({ ...get(settings), demoInstalled: true })
}

/** Remembers that the example decks were added, so deleted ones aren't added again on start. */
export async function markExampleDecksInstalled(): Promise<void> {
  await save({ ...get(settings), exampleDecksInstalled: true })
}

/** Applies to every window straight away (title bars included) and is remembered. */
export async function setAppearance(appearance: Appearance): Promise<void> {
  logAction('appearance', appearance)
  await setTheme(appearance === 'system' ? null : appearance)
  await save({ ...get(settings), appearance })
}

/** What Settings › Overlays shows: the saved choices, with defaults for any not chosen. */
export const overlaySettings = derived(settings, (s) => parseOverlaySettings(s.overlays))

// ---- Recent, pins and favourites for quick notes and quick talks (lib/settings/quick.ts)

export const pins = derived(settings, (s) => parsePins(s.pins))
export const quickFavourites = derived(settings, (s) => parseQuickFavourites(s.quickFavourites))
export const opened = derived(settings, (s) => parseOpened(s.opened))

/** Pins an item to the top of its list, or unpins it; a deck's pin keeps its `id`. */
export function setPin(kind: QuickItemKind, path: string, on: boolean, id?: string): Promise<void> {
  logAction(on ? 'pin' : 'unpin', `${kind} ${path}`)
  return inTurn(async () => {
    const current = get(settings)
    await save({ ...current, pins: withPin(parsePins(current.pins), kind, path, on, new Date().toISOString(), id) })
  })
}

/**
 * Decks were listed: each deck's pin and Recent entry follows its deck by id, so one renamed in
 * Oversay or in Finder, or moved into a folder, keeps its place. Written only when
 * something changed; not before settings are read.
 */
export function followDecks(decks: readonly ListedDeck[]): Promise<void> {
  return inTurn(async () => {
    if (!settingsLoaded || !settingsReadable) return
    const current = get(settings)
    const before = { pins: parsePins(current.pins), opened: parseOpened(current.opened) }
    const pins = withDecksFollowed(before.pins, decks)
    const opened = withDecksFollowed(before.opened, decks)
    if (pins !== before.pins || opened !== before.opened) await save({ ...current, pins, opened })
  }).catch(() => {})
}

/** Starred decks and notes become pinned decks, once; nothing is written when there are none. */
export function pinStarredDecks(): Promise<void> {
  return inTurn(async () => {
    const current = get(settings)
    const moved = starsAsPins(parsePins(current.pins), parseQuickFavourites(current.quickFavourites), new Date().toISOString())
    if (moved) await save({ ...current, ...moved })
  })
}

/** Stars a note or quick talk for the Favourites page, or takes it off. */
export function setQuickFavourite(favourite: QuickFavourite, on: boolean): Promise<void> {
  logAction(on ? 'favourite' : 'unfavourite', `${favourite.kind} ${favourite.path}`)
  return inTurn(async () => {
    const current = get(settings)
    await save({ ...current, quickFavourites: withQuickFavourite(parseQuickFavourites(current.quickFavourites), favourite, on) })
  })
}

/** Remembers that an item was opened, for Recent; it is no longer New. Not worth an error if it can't be written. */
export function markOpened(kind: QuickItemKind, path: string, id?: string): Promise<void> {
  return inTurn(async () => {
    const current = get(settings)
    const seen = parseQuickSeen(current.quickSeen)
    const folder = kind === 'note' ? 'notes' : kind === 'talk' ? 'talks' : kind === 'deck' ? 'decks' : null
    const quickSeen: QuickSeen = folder ? { ...seen, [folder]: withoutFresh(seen[folder], path) } : seen
    await save({ ...current, opened: withOpened(parseOpened(current.opened), kind, path, new Date().toISOString(), id), quickSeen })
  }).catch(() => {})
}

// ---- New: files that appeared outside Oversay (task 202, ADR 0034)

export const quickSeen = derived(settings, (s) => parseQuickSeen(s.quickSeen))

/** Every New note and quick talk, by path. */
export const freshPaths = derived(quickSeen, (seen) => new Set(SEEN_KINDS.flatMap((k) => seen[k]?.fresh ?? [])))

/** The folder was listed: what appeared since the last listing becomes New. Written only when something changed. */
export function listedQuickFiles(kind: SeenKind, paths: readonly string[]): Promise<void> {
  return inTurn(async () => {
    // Before settings are read there is nothing to compare with, and nothing may write over them.
    if (!settingsLoaded || !settingsReadable) return
    const current = get(settings)
    const seen = parseQuickSeen(current.quickSeen)
    const next = withListed(seen[kind], paths)
    if (!sameSeen(seen[kind], next)) await save({ ...current, quickSeen: { ...seen, [kind]: next } })
  }).catch(() => {})
}

/** Oversay made this file itself, so it is never New. */
export function markKnown(kind: SeenKind, path: string): Promise<void> {
  return inTurn(async () => {
    if (!settingsLoaded || !settingsReadable) return
    const current = get(settings)
    const seen = parseQuickSeen(current.quickSeen)
    const next = withKnown(seen[kind], path)
    if (!sameSeen(seen[kind], next)) await save({ ...current, quickSeen: { ...seen, [kind]: next } })
  }).catch(() => {})
}

const seenEach = (value: unknown, change: (folder: QuickSeen[SeenKind]) => QuickSeen[SeenKind]): QuickSeen => {
  const seen = parseQuickSeen(value)
  return Object.fromEntries(SEEN_KINDS.filter((k) => seen[k]).map((k) => [k, change(seen[k])])) as QuickSeen
}

/** A quick file was renamed: its pin, star and Recent entry follow it. */
export function renameQuickPath(from: string, to: string, name: string): Promise<void> {
  return inTurn(async () => {
    const s = get(settings)
    const next = {
      ...s,
      pins: withPathRenamed(parsePins(s.pins), from, to),
      quickFavourites: withPathRenamed(parseQuickFavourites(s.quickFavourites), from, to, name),
      opened: withPathRenamed(parseOpened(s.opened), from, to),
      quickSeen: seenEach(s.quickSeen, (f) => seenRenamed(f, from, to)),
    }
    await save(next)
  })
}

/** A note or quick talk became a deck: its pin, favourite and Recent entry follow, as a deck's. */
export function moveQuickItemToDeck(from: string, to: string, name: string): Promise<void> {
  const moved = <T extends { path: string; kind: string }>(list: readonly T[]): T[] =>
    list.map((x) => (x.path === from ? { ...x, kind: 'deck', path: to, ...('name' in x ? { name } : {}) } : x))
  return inTurn(async () => {
    const s = get(settings)
    await save({
      ...s,
      pins: moved(parsePins(s.pins)),
      quickFavourites: moved(parseQuickFavourites(s.quickFavourites)),
      opened: moved(parseOpened(s.opened)),
      quickSeen: seenEach(s.quickSeen, (f) => withoutFresh(f, from)),
    })
  })
}

/** A quick file was deleted: it leaves Recent, pins and Favourites. */
export function forgetQuickPath(path: string): Promise<void> {
  return inTurn(async () => {
    const s = get(settings)
    await save({
      ...s,
      pins: withoutPath(parsePins(s.pins), path),
      quickFavourites: withoutPath(parseQuickFavourites(s.quickFavourites), path),
      opened: withoutPath(parseOpened(s.opened), path),
      quickSeen: seenEach(s.quickSeen, (f) => withoutFresh(f, path)),
    })
  })
}

/**
 * A talk moved to another file: its favourite and Home's Continue card follow it, and the
 * file it left loses its pin and Recent entry when it was a quick talk that is now gone.
 */
export function moveTalkReferences(
  from: { path: string; talkId: string },
  to: { path: string; talkId: string; projectName: string },
  fileGone: boolean,
): Promise<void> {
  return inTurn(async () => {
    const s = get(settings)
    const same = (f: { path: string; talkId: string }) => f.path === from.path && f.talkId === from.talkId
    const favs = parseFavourites(s.favourites).map((f) => (same(f) ? { ...f, path: to.path, talkId: to.talkId, projectName: to.projectName } : f))
    const run = parseLastRun(s.lastRun)
    const next: Settings = { ...s, favourites: favs }
    if (run && same(run)) next.lastRun = { ...run, path: to.path, talkId: to.talkId, projectName: to.projectName }
    if (fileGone) {
      next.pins = withoutPath(parsePins(s.pins), from.path)
      next.opened = withoutPath(parseOpened(s.opened), from.path)
    }
    await save(next)
  })
}

/** One change to the look, from the Get ready page or the control panel. */
export function applyLookChange(change: LookChange): Promise<void> {
  if (change.key === 'opacityPreview') return previewOverlayOpacity(change.value as number)
  if (change.key === 'opacity') return setOverlayOpacity(change.value as number)
  if (change.key === 'solid') return changeOverlayOpacity(change.value ? 'solid' : 'see-through')
  return setOverlaySetting(change.key, change.value as never)
}

// ---- oversay:// links (ADR 0032)

export const linkPermission = derived(settings, (s) => parseLinkPermission(s.links))

/** Whether links may show a note or open Get ready without asking. */
export function setLinkPermission(permission: LinkPermission): Promise<void> {
  logAction('link permission', permission)
  return inTurn(async () => {
    await save({ ...get(settings), links: permission })
  })
}

// ---- Updates (epic 015 (#16))

/** Turns automatic update checks on or off, or changes how often they run (lib/updates/policy.ts). */
export function setUpdateSettings(change: { auto?: boolean; everyHours?: number }): Promise<void> {
  logAction('update settings', JSON.stringify(change))
  return inTurn(async () => {
    const current = get(settings)
    await save({ ...current, updates: { ...current.updates, ...change } })
  })
}

/** Remembers when updates were last asked for, so a start-up check waits out the interval. */
export function noteUpdateCheck(at: Date): Promise<void> {
  return inTurn(async () => {
    await save({ ...get(settings), lastUpdateCheck: at.toISOString() })
  })
}

// ---- Recordings (ADR 0041, task 317)

/** Every deck records from Start, or only once the deck widget's record button is pressed (the default). */
export function setAutoRecord(on: boolean): Promise<void> {
  logAction('auto record', String(on))
  return inTurn(async () => {
    await save({ ...get(settings), autoRecord: on })
  })
}

/** Keeps recordings once they are transcribed, or sends them to the Trash (the default). */
export function setKeepRecordings(keep: boolean): Promise<void> {
  logAction('keep recordings', String(keep))
  return inTurn(async () => {
    await save({ ...get(settings), keepRecordings: keep })
  })
}

// ---- the AI page and Home's card (task 156)

/** Remembers that the AI page was opened. Not worth an error if it can't be written. */
export function markAiPageSeen(): Promise<void> {
  if (get(settings).aiPageSeen) return Promise.resolve()
  return inTurn(async () => {
    await save({ ...get(settings), aiPageSeen: true })
  }).catch(() => {})
}

/** Marks a chat app as having the skill (the person said so), or takes that back. */
/** Marks `app` added with `version` of the skill, or not added. */
export function setChatAppAdded(app: ChatApp, added: boolean, version = ''): Promise<void> {
  logAction(added ? 'chat app added' : 'chat app not added', app)
  return inTurn(async () => {
    const rest = Object.fromEntries(Object.entries(addedVersions(get(settings).aiAdded)).filter(([id]) => id !== app))
    await save({ ...get(settings), aiAdded: added ? { ...rest, [app]: version } : rest })
  })
}

export function hideAiCard(): Promise<void> {
  logAction('hide ai card')
  return inTurn(async () => {
    await save({ ...get(settings), aiCardHidden: true })
  })
}

/** Remembers that decks' project lines were moved into workspaces, so it happens once. */
export function markProjectLinesMoved(): Promise<void> {
  return inTurn(async () => {
    await save({ ...get(settings), projectLinesMoved: true })
  })
}

// ---- the Workspaces page's sidebar (lib/workspaces/navigation.ts)

export const workspaceNav = derived(settings, (s) => parseWorkspaceNav(s.workspaceNav))

/** Changes the Workspaces page's pins, Recent, tag colours or place, from them as they are when its turn comes. */
export function changeWorkspaceNav(change: (nav: WorkspaceNav) => WorkspaceNav): Promise<void> {
  return inTurn(async () => {
    const current = get(settings)
    await save({ ...current, workspaceNav: change(parseWorkspaceNav(current.workspaceNav)) })
  })
}
