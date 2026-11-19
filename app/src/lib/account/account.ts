// The optional account (ADR 0050), as Settings › Account shows it. Rust keeps every token and code
// (src-tauri/src/account): the manager only ever sees whether it is signed in, and the email.

import { invoke } from '@tauri-apps/api/core'
import { writable } from 'svelte/store'
import { logAction } from '../log'

/** Same name as `ACCOUNT_EVENT` in account/commands.rs: the account changed, ask for its status. */
export const ACCOUNT_EVENT = 'oversay-account'

export type AccountStatus =
  | { state: 'unavailable' }
  | { state: 'signedOut'; problem: string | null }
  | { state: 'signingIn' }
  | { state: 'signedIn'; email: string }

/** Which form the hosted page opens on. */
export type Screen = 'signIn' | 'signUp'

/** Null until Rust has been asked. */
export const account = writable<AccountStatus | null>(null)

const set = async (status: Promise<AccountStatus>) => account.set(await status)

export const loadAccount = () => set(invoke<AccountStatus>('account_status'))

/** Sign in or Create account: the browser opens on the hosted page; the link back signs in. */
export function signIn(screen: Screen) {
  logAction('account', screen === 'signUp' ? 'create account' : 'sign in')
  return set(invoke<AccountStatus>('account_sign_in', { screen }))
}

export function cancelSignIn() {
  logAction('account', 'cancel sign-in')
  return set(invoke<AccountStatus>('account_cancel_sign_in'))
}

/** Signs out; every deck stays in the folder. */
export function signOut() {
  logAction('account', 'sign out')
  return set(invoke<AccountStatus>('account_sign_out'))
}

/** Developer tools: `GET /decks` with the account's token, to see that the token works. */
export function checkApi() {
  logAction('account', 'check the API')
  return invoke<string>('account_check_api')
}
