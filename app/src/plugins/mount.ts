import { mount, unmount, type Component } from 'svelte'
import type { PluginContext } from './types'

/** Adapts a Svelte component taking `{ ctx }` to `OverlayPlugin.mount`. */
export function mountSvelte(component: Component<{ ctx: PluginContext }>) {
  return (target: HTMLElement, ctx: PluginContext) => {
    const instance = mount(component, { target, props: { ctx } })
    return () => {
      unmount(instance)
    }
  }
}
