// The sections of the Settings page, in page order, and the rule for which one the list shows as
// current while the page scrolls (013/02).

export const SETTINGS_SECTIONS = [
  { id: 'appearance', label: 'Appearance' },
  { id: 'overlays', label: 'Overlays' },
  { id: 'screen-sharing', label: 'Screen sharing' },
  { id: 'links', label: 'Links from other apps' },
  { id: 'recordings', label: 'Recordings' },
  { id: 'shortcuts', label: 'Shortcuts' },
  { id: 'templates', label: 'Templates' },
  { id: 'example-decks', label: 'Example deck' },
  { id: 'updates', label: 'Updates' },
  { id: 'developer-tools', label: 'Developer tools' },
  { id: 'about', label: 'About' },
] as const

export type SettingsSectionId = (typeof SETTINGS_SECTIONS)[number]['id']

/** Whether the page is scrolled as far as it goes. A page that fits without scrolling is never "at the end". */
export function atScrollEnd(scrollTop: number, clientHeight: number, scrollHeight: number): boolean {
  return scrollHeight > clientHeight + 1 && scrollTop + clientHeight >= scrollHeight - 2
}

/**
 * The index of the current section. `tops` are the sections' tops relative to the top of the
 * scrolling area, in page order; `offset` is how far down a section counts as reached (the
 * sticky bar, when the list is across the top). The current section is the last one reached; at
 * the end of the page it is the last section, which can't scroll as far as the top of a short page.
 */
export function currentSection(tops: readonly number[], offset: number, atEnd: boolean): number {
  if (tops.length === 0) return 0
  if (atEnd) return tops.length - 1
  let current = 0
  tops.forEach((top, i) => {
    if (top <= offset) current = i
  })
  return current
}

/** The sections to show: Updates only in a build that has a feed (ADR 0030). */
export function visibleSections(buildChecksForUpdates: boolean) {
  return SETTINGS_SECTIONS.filter((s) => s.id !== 'updates' || buildChecksForUpdates)
}
