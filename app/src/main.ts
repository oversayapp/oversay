import { mount } from 'svelte'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { CONTROL_PANEL_LABEL, overlayIdFromLabel } from './lib/windows'

// Every window loads this page; its label decides what it shows.
const target = document.getElementById('app')!
const overlayId = overlayIdFromLabel(getCurrentWindow().label)

if (getCurrentWindow().label === CONTROL_PANEL_LABEL) {
  // The control panel (ADR 0028): the manager's look, in its own window.
  await import('./app.css')
  const { default: ControlPanel } = await import('./panel/ControlPanel.svelte')
  mount(ControlPanel, { target })
} else if (overlayId) {
  await import('./overlay/overlay.css')
  const { default: OverlayHost } = await import('./overlay/OverlayHost.svelte')
  mount(OverlayHost, { target, props: { pluginId: overlayId } })
} else {
  await import('./app.css')
  const { default: Manager } = await import('./manager/Manager.svelte')
  mount(Manager, { target })
}
