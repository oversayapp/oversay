// Session hotkeys (spec §5, 006/03): which keys drive the session while another app has focus.
// Chosen keys live in settings.json; the Rust side registers them while a session is open
// (src-tauri/src/hotkeys.rs). Accelerators use the browser's key codes, e.g. `Control+Alt+KeyE`.

/** Same names as `ACTIONS` in hotkeys.rs (tested there). */
export const SHORTCUT_ACTIONS = ['next', 'previous', 'pause', 'end', 'show', 'darker', 'lighter', 'panel'] as const
export type ShortcutAction = (typeof SHORTCUT_ACTIONS)[number]
export type Shortcuts = Record<ShortcutAction, string>

export const SHORTCUT_LABELS: Record<ShortcutAction, string> = {
  next: 'Start / Next',
  previous: 'Previous',
  pause: 'Pause / Resume',
  end: 'Stop deck',
  show: 'Open Oversay window',
  darker: 'More solid',
  lighter: 'More see-through',
  panel: 'Control panel',
}

/** Actions not wired up yet, so their keys aren't taken from other apps until they are. */
export const NOT_YET: Partial<Record<ShortcutAction, string>> = {}

/**
 * Spec §5 defaults. Windows adds Shift: some graphics drivers rotate the screen on
 * Ctrl+Alt+arrow. Same strings as the default test in hotkeys.rs.
 */
export const DEFAULT_SHORTCUTS: { mac: Shortcuts; other: Shortcuts } = {
  mac: {
    next: 'Control+Alt+ArrowRight',
    previous: 'Control+Alt+ArrowLeft',
    pause: 'Control+Alt+Space',
    end: 'Control+Alt+KeyE',
    show: 'Control+Alt+KeyO',
    // ↑ and ↓: ← and → are Previous and Next.
    darker: 'Control+Alt+ArrowUp',
    lighter: 'Control+Alt+ArrowDown',
    // The Look card (ADR 0051).
    panel: 'Control+Alt+KeyP',
  },
  other: {
    next: 'Control+Alt+Shift+ArrowRight',
    previous: 'Control+Alt+Shift+ArrowLeft',
    pause: 'Control+Alt+Shift+Space',
    end: 'Control+Alt+Shift+KeyE',
    show: 'Control+Alt+Shift+KeyO',
    darker: 'Control+Alt+Shift+ArrowUp',
    lighter: 'Control+Alt+Shift+ArrowDown',
    panel: 'Control+Alt+Shift+KeyP',
  },
}

export const isMac = (): boolean => typeof navigator !== 'undefined' && /Mac/.test(navigator.userAgent)

/**
 * The keys in use: the saved choices over this platform's defaults. A saved key for an action
 * that no longer exists (Next Timeline style, ⌃⌥T, removed with the Timeline in epic 030) is left out.
 */
export function effectiveShortcuts(saved: Partial<Shortcuts> | undefined, mac: boolean): Shortcuts {
  const keys = { ...(mac ? DEFAULT_SHORTCUTS.mac : DEFAULT_SHORTCUTS.other) }
  for (const action of SHORTCUT_ACTIONS) {
    const chosen = saved?.[action]
    if (chosen) keys[action] = chosen
  }
  return keys
}

const MAC_MODIFIERS: Record<string, string> = { Control: '⌃', Alt: '⌥', Shift: '⇧', Super: '⌘' }
const OTHER_MODIFIERS: Record<string, string> = { Control: 'Ctrl', Alt: 'Alt', Shift: 'Shift', Super: 'Win' }
const KEY_NAMES: Record<string, string> = {
  ArrowRight: '→',
  ArrowLeft: '←',
  ArrowUp: '↑',
  ArrowDown: '↓',
  Space: 'Space',
  Enter: 'Return',
  Escape: 'Esc',
  Backspace: '⌫',
  Tab: 'Tab',
}

/** The keys of a shortcut as shown to people, one per key cap: ['⌃', '⌥', '→'] or ['Ctrl', 'Alt', 'Shift', '→']. */
export function shortcutKeys(accelerator: string, mac: boolean): string[] {
  const modifiers = mac ? MAC_MODIFIERS : OTHER_MODIFIERS
  return accelerator.split('+').map((part) => {
    if (modifiers[part]) return modifiers[part]
    if (KEY_NAMES[part]) return KEY_NAMES[part]
    if (/^Key[A-Z]$/.test(part)) return part.slice(3)
    if (/^Digit\d$/.test(part)) return part.slice(5)
    return part
  })
}

/** The same keys as one piece of text: ⌃⌥→ on a Mac, Ctrl+Alt+Shift+→ elsewhere. */
export const shortcutText = (accelerator: string, mac: boolean): string =>
  shortcutKeys(accelerator, mac).join(mac ? '' : '+')

/**
 * Which of a session's hotkeys couldn't be registered, as a sentence (the live view), or null
 * when they all were.
 */
export function unavailableText(unavailable: string[], shortcuts: Record<string, string>, mac: boolean): string | null {
  if (unavailable.length === 0) return null
  const keys = unavailable
    .map((a) => `${SHORTCUT_LABELS[a as ShortcutAction] ?? a} (${shortcutText(shortcuts[a] ?? '', mac)})`)
    .join(', ')
  const one = unavailable.length === 1
  return `${keys} ${one ? "isn't" : "aren't"} available: another app or the system already uses ${one ? 'it' : 'them'}. The button still works; choose different keys in Settings.`
}

/**
 * The shortcut for a key press, or null while only modifiers are held, or when there is no
 * Control, Alt or Command/Windows: a global shortcut without one would take ordinary typing.
 */
export function acceleratorFromKey(e: {
  ctrlKey: boolean
  altKey: boolean
  shiftKey: boolean
  metaKey: boolean
  code: string
}): string | null {
  if (/^(Control|Alt|Shift|Meta|OS)(Left|Right)?$/.test(e.code) || e.code === '') return null
  if (!e.ctrlKey && !e.altKey && !e.metaKey) return null
  const parts = [e.ctrlKey && 'Control', e.altKey && 'Alt', e.shiftKey && 'Shift', e.metaKey && 'Super']
  return [...parts.filter(Boolean), e.code].join('+')
}
