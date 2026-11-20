// What the Account card and the rail's account item say about the account and saving to the cloud
// (ADR 0050). Pure: both read the same words from here, so they never disagree.

import type { AccountStatus } from './account'
import { outcomeText, type SyncStatus } from './sync'

/** The colour of the dot: green saved, blue saving, amber needs a look. */
export type Tone = 'ok' | 'busy' | 'warn'

export interface SyncLine {
  tone: Tone
  title: string
  detail: string
  /** The rail's label under the avatar: Account while all is well. */
  short: string
}

const decks = (n: number) => `${n} deck${n === 1 ? '' : 's'}`

const conflictText = (title: string) =>
  `“${title.replace(/ \(conflict copy\)$/, '')}” was changed on two computers. Both versions are kept: the other computer's is “${title}”.`

/** The one line that says how saving is going; null while saving to the cloud is off. */
export function syncLine(s: SyncStatus): SyncLine | null {
  if (!s.on) return null
  if (s.working) return { tone: 'busy', title: 'Saving…', detail: 'Saving your decks.', short: 'Saving…' }
  if (s.problem) return { tone: 'warn', title: 'Not saved', detail: s.problem, short: 'Not saved' }
  if (s.conflicts.length > 0) {
    const n = s.conflicts.length
    return {
      tone: 'warn',
      title: `${decks(n)} ${n === 1 ? 'needs' : 'need'} a look`,
      detail: s.conflicts.map(conflictText).join(' '),
      short: 'Check',
    }
  }
  if (s.activity === 'offline')
    return { tone: 'warn', title: 'Offline', detail: 'Your decks are safe here and will be saved when you are back online.', short: 'Offline' }
  if (s.activity === 'saving') return { tone: 'busy', title: 'Saving…', detail: '', short: 'Saving…' }
  return { tone: 'ok', title: 'Saved', detail: s.last ? outcomeText(s.last) : '', short: 'Account' }
}

/** The letter in the avatar. */
export function initialOf(email: string): string {
  const first = [...email.trim()][0]
  return first ? first.toUpperCase() : '•'
}

export interface RailAccount {
  label: string
  /** The dot on the avatar; null for none. */
  tone: Tone | null
  /** The avatar's letter; null while not signed in. */
  initial: string | null
}

/** The rail's account item; null when this build has no account. */
export function railAccount(account: AccountStatus | null, sync: SyncStatus | null): RailAccount | null {
  if (!account || account.state === 'unavailable') return null
  if (account.state === 'signedOut') return { label: 'Sign in', tone: null, initial: null }
  if (account.state === 'signingIn') return { label: 'Signing in…', tone: 'busy', initial: null }
  const line = sync ? syncLine(sync) : null
  return { label: line?.short ?? 'Account', tone: line?.tone ?? null, initial: initialOf(account.email) }
}

/** Said under Sign in and Create account, and on the hosted page (web-api). Placeholder wording until the policy is written. */
export const PRIVACY_LINE = 'We keep only your email and the decks you choose to save.'
