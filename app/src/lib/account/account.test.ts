import { get } from 'svelte/store'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const calls: { cmd: string; args?: unknown }[] = []
let status: unknown = { state: 'signedOut', problem: null }
vi.mock('@tauri-apps/api/core', () => ({
  invoke: async (cmd: string, args?: unknown) => {
    calls.push({ cmd, args })
    if (cmd === 'account_check_api') return 'GET /decks: 200, 2 decks'
    return status
  },
}))
vi.mock('../log', () => ({ logAction: () => {}, logProblem: () => {} }))

const { account, loadAccount, signIn, cancelSignIn, signOut, checkApi, ACCOUNT_EVENT } = await import('./account')

beforeEach(() => {
  calls.length = 0
  status = { state: 'signedOut', problem: null }
})

describe('the account in Settings', () => {
  it('has the event name the Rust side sends', () => {
    expect(ACCOUNT_EVENT).toBe('oversay-account')
  })

  it('shows what Rust says, and only asks for the status when loaded', async () => {
    status = { state: 'signedIn', email: 'john@example.com' }
    await loadAccount()
    expect(get(account)).toEqual({ state: 'signedIn', email: 'john@example.com' })
    expect(calls.map((c) => c.cmd)).toEqual(['account_status'])
  })

  it('opens the hosted page on its sign-in or sign-up form', async () => {
    status = { state: 'signingIn' }
    await signIn('signIn')
    await signIn('signUp')
    expect(calls).toEqual([
      { cmd: 'account_sign_in', args: { screen: 'signIn' } },
      { cmd: 'account_sign_in', args: { screen: 'signUp' } },
    ])
    expect(get(account)).toEqual({ state: 'signingIn' })
  })

  it('cancels and signs out through Rust and shows the result', async () => {
    await cancelSignIn()
    await signOut()
    expect(calls.map((c) => c.cmd)).toEqual(['account_cancel_sign_in', 'account_sign_out'])
    expect(get(account)).toEqual({ state: 'signedOut', problem: null })
  })

  it('gives the API check’s summary', async () => {
    expect(await checkApi()).toBe('GET /decks: 200, 2 decks')
  })
})
