// Short random ids (spec §3). The Rust core makes deck and workspace ids the same way (src-tauri/src/ids.rs);
// both test against ids.json.

export const ID_PREFIXES = {
  project: 'p_',
  talk: 't_',
  segment: 's_',
  session: 'r_',
  deck: 'd_',
  workspace: 'w_',
} as const

export type IdKind = keyof typeof ID_PREFIXES

export const ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789'
const ID_BODY = /^[a-z0-9]{1,16}$/
export const BODY_LENGTH = 8

/**
 * The largest multiple of the alphabet's length a byte can hold (252): a byte at or above it is
 * drawn again, so every character comes up as often as any other (a byte modulo 36 favoured a–d).
 */
const LIMIT = Math.floor(256 / ALPHABET.length) * ALPHABET.length

/** The id body from `bytes`, taking each byte below `LIMIT`; null until there are enough. */
export function bodyFrom(bytes: Iterable<number>): string | null {
  let body = ''
  for (const b of bytes) {
    if (b >= LIMIT) continue
    body += ALPHABET[b % ALPHABET.length]
    if (body.length === BODY_LENGTH) return body
  }
  return null
}

/** A short random id such as `s_k3x9a2bq`. */
export function newId(kind: IdKind): string {
  const drawn: number[] = []
  for (;;) {
    drawn.push(...crypto.getRandomValues(new Uint8Array(BODY_LENGTH * 2)))
    const body = bodyFrom(drawn)
    if (body) return ID_PREFIXES[kind] + body
  }
}

export function isValidId(kind: IdKind, id: string): boolean {
  const prefix = ID_PREFIXES[kind]
  return id.startsWith(prefix) && ID_BODY.test(id.slice(prefix.length))
}
