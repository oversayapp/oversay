import { describe, expect, it } from 'vitest'
import type { AccountStatus } from './account'
import type { SyncStatus } from './sync'
import { initialOf, railAccount, syncLine } from './summary'

const on: SyncStatus = { on: true, working: false, last: null, problem: null, activity: 'saved', conflicts: [] }
const signedIn: AccountStatus = { state: 'signedIn', email: 'john@example.com' }

describe('the sync line on the Account card', () => {
  it('is nothing while saving to the cloud is off', () => {
    expect(syncLine({ ...on, on: false })).toBeNull()
  })

  it('says Saved in green once the decks are up', () => {
    expect(syncLine(on)).toMatchObject({ tone: 'ok', title: 'Saved', short: 'Account' })
  })

  it('says Saving in blue while an edit goes up, and the first upload too', () => {
    expect(syncLine({ ...on, activity: 'saving' })).toMatchObject({ tone: 'busy', title: 'Saving…', short: 'Saving…' })
    expect(syncLine({ ...on, working: true })).toMatchObject({ tone: 'busy', title: 'Saving…' })
  })

  it('says Offline in amber, and that decks are safe here', () => {
    const line = syncLine({ ...on, activity: 'offline' })
    expect(line).toMatchObject({ tone: 'warn', title: 'Offline', short: 'Offline' })
    expect(line?.detail).toMatch(/safe here.*back online/)
  })

  it('names a deck changed on two computers, and the copy that keeps the other version', () => {
    const line = syncLine({ ...on, conflicts: ['Standup (conflict copy)'] })
    expect(line).toMatchObject({ tone: 'warn', title: '1 deck needs a look', short: 'Check' })
    expect(line?.detail).toContain('“Standup” was changed on two computers')
    expect(line?.detail).toContain('“Standup (conflict copy)”')
  })

  it('counts more than one conflict', () => {
    expect(syncLine({ ...on, conflicts: ['A (conflict copy)', 'B (conflict copy)'] })?.title).toBe('2 decks need a look')
  })

  it('shows a problem Rust reports, before anything else', () => {
    expect(syncLine({ ...on, problem: 'Could not reach the cloud.', conflicts: ['A (conflict copy)'] })).toMatchObject({
      tone: 'warn',
      title: 'Not saved',
      detail: 'Could not reach the cloud.',
    })
  })

  it('shows what turning it on did as the detail of Saved', () => {
    const line = syncLine({ ...on, last: { uploaded: 5, downloaded: 0, leftAlone: 0, failed: 0 } })
    expect(line?.detail).toBe('Saved 5 decks to the cloud and brought down 0 decks.')
  })
})

describe('the account item in the rail', () => {
  it('is hidden in a build with no account', () => {
    expect(railAccount({ state: 'unavailable' }, null)).toBeNull()
    expect(railAccount(null, null)).toBeNull()
  })

  it('offers Sign in while signed out, and says it is waiting while signing in', () => {
    expect(railAccount({ state: 'signedOut', problem: null }, null)).toEqual({ label: 'Sign in', tone: null, initial: null })
    expect(railAccount({ state: 'signingIn' }, null)).toEqual({ label: 'Signing in…', tone: 'busy', initial: null })
  })

  it('shows the initial, labelled Account, with a green dot when saved', () => {
    expect(railAccount(signedIn, on)).toEqual({ label: 'Account', tone: 'ok', initial: 'J' })
  })

  it('has no dot when saving to the cloud is off', () => {
    expect(railAccount(signedIn, { ...on, on: false })).toEqual({ label: 'Account', tone: null, initial: 'J' })
    expect(railAccount(signedIn, null)).toEqual({ label: 'Account', tone: null, initial: 'J' })
  })

  it('says Saving, Offline or Check so the state is known at a glance', () => {
    expect(railAccount(signedIn, { ...on, activity: 'saving' })).toMatchObject({ label: 'Saving…', tone: 'busy' })
    expect(railAccount(signedIn, { ...on, activity: 'offline' })).toMatchObject({ label: 'Offline', tone: 'warn' })
    expect(railAccount(signedIn, { ...on, conflicts: ['A (conflict copy)'] })).toMatchObject({ label: 'Check', tone: 'warn' })
  })
})

describe('initialOf', () => {
  it('is the first letter of the email, upper case', () => {
    expect(initialOf('john@example.com')).toBe('J')
    expect(initialOf('élodie@example.com')).toBe('É')
  })
  it('falls back to a dot for an empty email', () => {
    expect(initialOf('')).toBe('•')
  })
})
