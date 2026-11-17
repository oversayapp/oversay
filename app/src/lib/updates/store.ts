// The update state the manager shows (epic 015 (#16)): whether this build checks at all, the release
// found, and the actions. Rust refuses to check or install while a session is open
// (src-tauri/src/updates.rs); nothing here retries.

import { invoke } from '@tauri-apps/api/core'
import { derived, get, writable } from 'svelte/store'
import { logAction } from '../log'
import { noteUpdateCheck, settings } from '../settings/store'
import { applyOutcome, idleView, startupCheckDue, type InstallKind, type Outcome, type Support, type View } from './policy'

export interface UpdateState extends View {
  phase: 'idle' | 'checking' | 'installing'
}

export const updates = writable<UpdateState>({ ...idleView, phase: 'idle' })
const support = writable<Support>({ enabled: false, kind: 'linkOnly' })

/** Whether this build has a feed: Settings has no Updates section and nothing is asked without one. */
export const supported = derived(support, (s) => s.enabled)
/** What this install does with an update: replace itself, or point at the release. */
export const installKind = derived(support, (s): InstallKind => s.kind)
/** An update waits to be installed: the rail's item and the header's pill show. */
export const updateAvailable = derived(updates, (u) => u.found !== null)

export async function loadUpdateSupport(): Promise<void> {
  support.set(await invoke<Support>('update_support'))
}

async function check(manual: boolean): Promise<void> {
  if (!get(support).enabled || get(updates).phase !== 'idle') return
  updates.update((u) => ({ ...u, phase: 'checking' }))
  try {
    const outcome = await invoke<Outcome>('check_for_update')
    logAction('update check', `${manual ? 'by hand' : 'at start-up'}: ${outcome.state}`)
    updates.update((u) => ({ ...applyOutcome(u, outcome, manual), phase: 'idle' }))
    // Only a check that reached the feed counts: offline at start-up, the next start tries again.
    if (outcome.state === 'upToDate' || outcome.state === 'available') await noteUpdateCheck(new Date())
  } catch (e) {
    updates.update((u) => ({ ...u, phase: 'idle', message: manual ? String(e) : null }))
  }
}

/** The check as Oversay starts, when automatic checking is on and the last one is old enough. */
export async function checkAtStartup(): Promise<void> {
  if (startupCheckDue(get(settings), new Date(), get(support).enabled)) await check(false)
}

/** Check for updates, asked for by the person: works with automatic checking off. */
export function checkNow(): Promise<void> {
  return check(true)
}

/** Downloads, installs and restarts. Returns only when the install did not go through. */
export async function installUpdate(): Promise<void> {
  if (get(updates).phase !== 'idle') return
  logAction('update install', get(updates).found?.version)
  updates.update((u) => ({ ...u, phase: 'installing', message: null }))
  try {
    await invoke('install_update')
  } catch (e) {
    updates.update((u) => ({ ...u, phase: 'idle', message: String(e) }))
  }
}

/** A build that can't install itself sends the person to the release. */
export async function openReleasePage(): Promise<void> {
  logAction('update release page')
  await invoke('open_release_page')
}
