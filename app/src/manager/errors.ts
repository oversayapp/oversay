import { writable } from 'svelte/store'
import { logProblem } from '../lib/log'

/** The message shown at the top of the manager, or '' for none. May span several lines. */
export const notice = writable('')

/** Runs an action and shows its failure in the notice instead of throwing. */
export async function attempt(action: () => Promise<unknown> | unknown): Promise<void> {
  notice.set('')
  try {
    await action()
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    logProblem('shown to the user', message)
    notice.set(message)
  }
}
