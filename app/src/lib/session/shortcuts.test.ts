import { describe, expect, it } from 'vitest'
import {
  DEFAULT_SHORTCUTS,
  SHORTCUT_ACTIONS,
  acceleratorFromKey,
  effectiveShortcuts,
  shortcutKeys,
  shortcutText,
  unavailableText,
} from './shortcuts'

const key = (code: string, mods: Partial<Record<'ctrlKey' | 'altKey' | 'shiftKey' | 'metaKey', boolean>> = {}) => ({
  ctrlKey: false,
  altKey: false,
  shiftKey: false,
  metaKey: false,
  code,
  ...mods,
})

describe('shortcuts', () => {
  it('has a default for every action on both platforms (same names, in order, as action_names_match_the_frontend in hotkeys.rs)', () => {
    expect(SHORTCUT_ACTIONS).toEqual(['next', 'previous', 'pause', 'end', 'show', 'darker', 'lighter', 'panel'])
    for (const d of [DEFAULT_SHORTCUTS.mac, DEFAULT_SHORTCUTS.other]) {
      expect(Object.keys(d).sort()).toEqual([...SHORTCUT_ACTIONS].sort())
    }
  })

  it('ignores a saved key for Next Timeline style (⌃⌥T), which is gone with the Timeline', () => {
    const keys = effectiveShortcuts({ style: 'Control+Alt+KeyY', end: 'Control+Alt+KeyQ' } as Record<string, string>, true) as Record<string, string>
    expect(keys.style).toBeUndefined()
    expect(keys.end).toBe('Control+Alt+KeyQ')
  })

  it('uses saved choices over the defaults', () => {
    expect(effectiveShortcuts({ end: 'Control+Alt+KeyQ' }, true)).toMatchObject({
      next: 'Control+Alt+ArrowRight',
      end: 'Control+Alt+KeyQ',
    })
    expect(effectiveShortcuts(undefined, false).next).toBe('Control+Alt+Shift+ArrowRight')
  })

  it('shows keys the way each platform writes them', () => {
    expect(shortcutKeys('Control+Alt+ArrowRight', true)).toEqual(['⌃', '⌥', '→'])
    expect(shortcutText('Control+Alt+KeyE', true)).toBe('⌃⌥E')
    expect(shortcutText('Control+Alt+Shift+Space', false)).toBe('Ctrl+Alt+Shift+Space')
    expect(shortcutText('Super+Shift+Digit5', true)).toBe('⌘⇧5')
  })

  it('turns a key press into a shortcut, but only with Control, Alt or Command held', () => {
    expect(acceleratorFromKey(key('ArrowRight', { ctrlKey: true, altKey: true }))).toBe('Control+Alt+ArrowRight')
    expect(acceleratorFromKey(key('KeyN', { metaKey: true, shiftKey: true }))).toBe('Shift+Super+KeyN')
    expect(acceleratorFromKey(key('KeyN', { shiftKey: true }))).toBeNull()
    expect(acceleratorFromKey(key('KeyN'))).toBeNull()
    expect(acceleratorFromKey(key('AltLeft', { altKey: true }))).toBeNull()
  })
})

describe('effectiveShortcuts', () => {
  it('leaves out a saved key for an action that no longer exists', () => {
    const saved = { end: 'Control+Alt+KeyQ', record: 'Control+Alt+KeyC' } as never
    const keys = effectiveShortcuts(saved, true)
    expect(keys.end).toBe('Control+Alt+KeyQ')
    expect(Object.keys(keys).sort()).toEqual([...SHORTCUT_ACTIONS].sort())
  })
})

describe('unavailableText', () => {
  it('names each clashing hotkey with its keys, or is null when none clash', () => {
    const keys = DEFAULT_SHORTCUTS.mac
    expect(unavailableText([], keys, true)).toBeNull()
    expect(unavailableText(['end'], keys, true)).toMatch(/^Stop deck \(⌃⌥E\) isn't available: .* uses it\./)
    expect(unavailableText(['end', 'pause'], keys, true)).toMatch(/^Stop deck \(⌃⌥E\), Pause \/ Resume \(⌃⌥Space\) aren't available/)
  })
})
