// Which Oversay skill made a note: the skill writes `made-with: Oversay skill <version>`
// into every note it makes. A skill in a Claude, Gemini or ChatGPT account can't be updated or
// even seen from here, so a note from an older one is how Oversay finds out.

import { getVersion } from '@tauri-apps/api/app'
import { compareVersions } from '../skill/targets'
import { madeWithVersion, type NoteDoc } from './format'

let version: Promise<string> | null = null
/** This Oversay's version, which is the version of the skill it carries. */
export const appVersion = () => (version ??= getVersion().catch(() => ''))

/** The older skill version that made the note, or null when it is current or doesn't say. */
export function staleSkill(doc: NoteDoc, bundledVersion: string): string | null {
  const made = madeWithVersion(doc)
  return made && bundledVersion && compareVersions(made, bundledVersion) < 0 ? made : null
}
