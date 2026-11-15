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
    // Saved before the waveform, so moved to it, then made see-through at 75% (ADR 0042).
    expect(sent()).toEqual([{ timelineStyle: 'waveform', buttons: 'hidden', stripEdge: 'screen', opacity: 75, solid: false, panel: 'dark', textSize: 'm', layout: 'topic', deckView: 'card' }])
  })

  it('saves a change to settings.json and sends it to the overlays', async () => {
    await loadSettings()
    await setOverlaySetting('stripEdge', 'dock')
    const write = calls.find((c) => c.cmd === 'write_config_file')
    expect(JSON.parse(write!.args.contents as string).overlays).toEqual({ stripEdge: 'dock' })
    expect(get(settings).overlays).toEqual({ stripEdge: 'dock' })
    expect(sent().at(-1)).toMatchObject({ stripEdge: 'dock', buttons: 'always' })
  })

  it('still sends the change when the file can’t be written', async () => {
    await loadSettings()
    writeFails = true
    await expect(setOverlaySetting('buttons', 'hover')).rejects.toThrow('disk full')
    expect(sent().at(-1)).toMatchObject({ buttons: 'hover' })
  })

  it('keeps two quick changes, each built on the one before', async () => {
    await loadSettings()
    await Promise.all([setOverlaySetting('buttons', 'hover'), setOverlaySetting('stripEdge', 'dock')])
    expect(get(settings).overlays).toEqual({ buttons: 'hover', stripEdge: 'dock' })
  })

  it('drops an unknown style from a hand-edited file on the next change', async () => {
    file = '{"version":1,"appearance":"dark","waveformMoved":true,"seeThroughMoved":true,"overlays":{"timelineStyle":"nonsense","buttons":"hidden"}}'
    await loadSettings()
    await setOverlaySetting('stripEdge', 'dock')
    expect(get(settings).overlays).toEqual({ buttons: 'hidden', stripEdge: 'dock' })
  })

  it('makes the panels solid when the waveform is chosen, and not for another style', async () => {
    file = '{"version":1,"appearance":"dark","waveformMoved":true,"seeThroughMoved":true,"overlays":{"timelineStyle":"strip","opacity":60,"solid":false}}'
    await loadSettings()
    await setOverlaySetting('buttons', 'hover')
    expect(get(settings).overlays).toMatchObject({ timelineStyle: 'strip', solid: false })
    await setOverlaySetting('timelineStyle', 'waveform')
    expect(get(settings).overlays).toMatchObject({ timelineStyle: 'waveform', opacity: 60, solid: true })
    expect(JSON.parse(calls.filter((c) => c.cmd === 'write_config_file').at(-1)!.args.contents as string).waveformMoved).toBe(true)
  })
})
