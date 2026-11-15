import { describe, expect, it } from 'vitest'
import { isValidPluginId, openOverlayArgs, overlayIdFromLabel } from './windows'

describe('overlayIdFromLabel', () => {
  it('returns the plugin id for overlay windows', () => {
    expect(overlayIdFromLabel('overlay-timeline')).toBe('timeline')
    expect(overlayIdFromLabel('overlay-talking-points')).toBe('talking-points')
  })

  it('returns null for other windows', () => {
    expect(overlayIdFromLabel('manager')).toBeNull()
    expect(overlayIdFromLabel('overlay-')).toBeNull()
  })
})

// Same cases as `validates_plugin_ids` in src-tauri/src/overlay.rs.
describe('isValidPluginId', () => {
  it.each(['timeline', 'talking-points', 'clock2'])('accepts %s', (id) => {
    expect(isValidPluginId(id)).toBe(true)
  })

  it.each(['', 'Timeline', '-timeline', 'time line', '../manager', 'timeline-', 'talking--points'])(
    'rejects %j',
    (id) => {
      expect(isValidPluginId(id)).toBe(false)
    },
  )
})

describe('open_overlay', () => {
  it('sends the window size in the shape Rust reads', () => {
    // Same JSON as window_size_reads_the_frontend_shape in overlay.rs.
    expect(JSON.stringify(openOverlayArgs('timeline', 'Timeline', { width: 1100, height: 160, minWidth: 640, minHeight: 160 }).size)).toBe(
      '{"width":1100,"height":160,"minWidth":640,"minHeight":160}',
    )
  })

  it('names a Timeline style’s place and layout in the shape Rust reads', () => {
    // Same JSON as the styled case in window_size_reads_the_frontend_shape in overlay.rs.
    expect(JSON.stringify({ width: 250, height: 400, place: 'right-rail', layout: 'rail' })).toBe(
      '{"width":250,"height":400,"place":"right-rail","layout":"rail"}',
    )
  })
})

describe('control panel names', () => {
  it('match control_panel.rs (names_match_the_frontend)', async () => {
    const { CONTROL_PANEL_LABEL, CONTROL_PANEL_OPEN_EVENT } = await import('./windows')
    const { CONTROL_PANEL_LOOK_EVENT } = await import('./settings/overlays')
    expect([CONTROL_PANEL_LABEL, CONTROL_PANEL_LOOK_EVENT, CONTROL_PANEL_OPEN_EVENT]).toEqual(['control-panel', 'control-panel-look', 'control-panel-open'])
    expect(overlayIdFromLabel(CONTROL_PANEL_LABEL)).toBeNull()
  })
})
