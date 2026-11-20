import { get } from 'svelte/store'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const calls: { cmd: string; args: Record<string, unknown> }[] = []
let file: string | null = null
let writeFails = false
vi.mock('@tauri-apps/api/core', () => ({
  invoke: async (cmd: string, args: Record<string, unknown>) => {
    calls.push({ cmd, args })
    if (cmd === 'read_config_file') return file
    if (cmd === 'write_config_file' && writeFails) throw new Error('disk full')
    return null
  },
}))
vi.mock('@tauri-apps/api/app', () => ({ setTheme: async () => {} }))
vi.mock('../log', () => ({ logAction: () => {}, logProblem: () => {} }))

const { loadSettings, setOverlaySetting, settings } = await import('./store')

const sent = () => calls.filter((c) => c.cmd === 'set_overlay_settings').map((c) => c.args.settings)

beforeEach(() => {
  calls.length = 0
  file = null
  writeFails = false
})

describe('overlay settings in the store', () => {
  it('sends the saved look to the overlays when settings load', async () => {
    file = '{"version":1,"appearance":"dark","overlays":{"buttons":"hidden","buttonEdge":"top"}}'
    await loadSettings()
    // Made see-through at 75% (ADR 0042); the Timeline's buttons are not sent (epic 030).
    expect(sent()).toEqual([{ opacity: 75, solid: false, panel: 'dark', deckView: 'card', oneColour: false }])
  })

  it('saves a change to settings.json and sends it to the overlays', async () => {
    await loadSettings()
    await setOverlaySetting('panel', 'light')
    const write = calls.find((c) => c.cmd === 'write_config_file')
    expect(JSON.parse(write!.args.contents as string).overlays).toEqual({ panel: 'light' })
    expect(get(settings).overlays).toEqual({ panel: 'light' })
    expect(sent().at(-1)).toMatchObject({ panel: 'light', opacity: 75 })
  })

  it('still sends the change when the file can’t be written', async () => {
    await loadSettings()
    writeFails = true
    await expect(setOverlaySetting('panel', 'light')).rejects.toThrow('disk full')
    expect(sent().at(-1)).toMatchObject({ panel: 'light' })
  })

  it('keeps two quick changes, each built on the one before', async () => {
    await loadSettings()
    await Promise.all([setOverlaySetting('panel', 'light'), setOverlaySetting('deckView', 'agenda')])
    expect(get(settings).overlays).toEqual({ panel: 'light', deckView: 'agenda' })
  })

  it('drops the Timeline\'s and Talking Points\' old choices from the file on the next change (epic 030)', async () => {
    file =
      '{"version":1,"appearance":"dark","waveformMoved":true,"seeThroughMoved":true,"overlays":{"timelineStyle":"strip","buttons":"hidden","stripEdge":"dock","textSize":"l","layout":"all","opacity":50}}'
    await loadSettings()
    await setOverlaySetting('panel', 'light')
    expect(get(settings).overlays).toEqual({ opacity: 50, panel: 'light' })
    expect(JSON.parse(calls.filter((c) => c.cmd === 'write_config_file').at(-1)!.args.contents as string).overlays).toEqual({ opacity: 50, panel: 'light' })
  })
})
