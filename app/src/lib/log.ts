import { error as logError, info } from '@tauri-apps/plugin-log'

/**
 * Records what the person did, for debugging hands-on testing. Debug builds only: the Rust
 * side registers the log plugin only then (it writes to the terminal, `out/dev.log`, and the
 * app's log folder). Never pass project content (talking points, hints) in `detail`.
 */
export function logAction(action: string, detail?: string | string[]): void {
  if (!import.meta.env.DEV) return
  const text = Array.isArray(detail) ? detail.join('; ') : detail
  void info(text ? `action: ${action} — ${text}` : `action: ${action}`).catch(() => {})
}

export function logProblem(what: string, detail: string): void {
  if (!import.meta.env.DEV) return
  void logError(`problem: ${what} — ${detail.replaceAll('\n', ' | ')}`).catch(() => {})
}
