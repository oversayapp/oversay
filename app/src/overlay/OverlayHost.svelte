<script lang="ts">
  import { onMount } from 'svelte'
  import { getCurrentWindow } from '@tauri-apps/api/window'
  import { getPlugin } from '../plugins/registry'
  import { createPluginContext } from '../plugins/context'
  import { setOverlayLayout } from '../lib/windows'
  import { logProblem } from '../lib/log'
  import { panelAlpha } from '../lib/settings/overlays'
  import { session } from '../lib/session/store'

  let { pluginId }: { pluginId: string } = $props()

  const appWindow = getCurrentWindow()
  const plugin = $derived(getPlugin(pluginId))
  let target: HTMLElement | undefined = $state()

  // Mounted once the saved look has arrived (or a moment has passed), so a new overlay doesn't
  // flash the default style before its own.
  onMount(() => {
    if (!plugin || !target) return
    const ctx = createPluginContext()
    const host = target
    // Every overlay's panels follow Settings › Overlays › Overlay opacity, as it moves.
    const stopOpacity = ctx.settings.subscribe((saved) => {
      document.documentElement.style.setProperty('--panel-alpha', String(panelAlpha(saved)))
    })
    let unmount: (() => void) | undefined
    let stopLayout: (() => void) | undefined
    let gone = false
    void ctx.ready.then(() => {
      if (gone) return
      unmount = plugin.mount(host, ctx)
      // The window follows the look (the Timeline's style, 007/10): the native side leaves it
      // alone when it already has that layout, so the first value costs nothing.
      // Only when the window it asks for changes (the style, say): not for every setting, which
      // would settle a window the person has just placed.
      if (plugin.windowFor) {
        let asked = ''
        stopLayout = ctx.settings.subscribe((look) => {
          const size = plugin.windowFor!(look)
          const key = JSON.stringify(size)
          if (key === asked) return
          asked = key
          setOverlayLayout(plugin.id, size).catch((e) => logProblem('overlay layout', String(e)))
        })
      }
    })
    return () => {
      gone = true
      stopOpacity()
      stopLayout?.()
      unmount?.()
    }
  })

  // The ⋯ menu that was here is now the control panel's How it looks (ADR 0028); the darker /
  // lighter hotkeys still work. Only ✕ is left in the corner.

  // A window too short for the corner over its panel (the edge strip): the ✕ gets a backing.
  let short = $state(false)
  const measure = () => (short = window.innerHeight < 80)
  onMount(() => {
    measure()
    window.addEventListener('resize', measure)
    return () => window.removeEventListener('resize', measure)
  })

  // Frameless window: dragging anywhere except on a button moves it.
  // A part marked `data-hold` keeps its press too: the waveform is held to look back,
  // and the window moves by the rest of the overlay.
  function startDrag(event: MouseEvent) {
    if (event.button !== 0 || (event.target as Element).closest('button, [data-hold]')) return
    appWindow.startDragging()
  }
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="host" onmousedown={startDrag}>
  {#if plugin}
    <div class="plugin" bind:this={target}></div>
  {:else}
    <div class="overlay-panel">
      <p class="error">Unknown plugin “{pluginId}”</p>
    </div>
  {/if}
  {#if $session?.preview}<span class="pvtag" title="The control panel's preview: nothing is running">Preview</span>{/if}
  <div class="corner" class:short>
    <button class="close" type="button" aria-label="Close overlay" onclick={() => appWindow.close()}>×</button>
  </div>
</div>

<style>
  .host,
  .plugin {
    position: relative;
    height: 100%;
  }

  .pvtag {
    position: absolute;
    left: 8px;
    bottom: 6px;
    font-size: 10.5px;
    font-weight: 700;
    letter-spacing: 0.05em;
    text-transform: uppercase;
    color: #1a2130;
    background: rgba(255, 255, 255, 0.85);
    border-radius: 99px;
    padding: 1px 7px;
    pointer-events: none;
  }

  /* The close button, top right; shown while the pointer is over the overlay. */
  .corner {
    position: absolute;
    /* An overlay with a tab on its top edge says how far down its panel starts (`--edge-top`). */
    top: calc(6px + var(--edge-top, 0px));
    right: 8px;
    display: flex;
    align-items: center;
    gap: 2px;
    opacity: 0;
    transition: opacity 0.15s;
    text-shadow: none;
  }

  .host:hover .corner {
    opacity: 1;
  }

  /* Over the slide rather than a panel (the edge strip): a backing so it reads on a light slide. */
  .corner.short {
    padding: 1px 2px;
    border-radius: 8px;
    background: var(--panel-bg);
    box-shadow: 0 0 0 1px var(--panel-border);
  }

  .close {
    border: 0;
    border-radius: 5px;
    background: transparent;
    color: var(--text-muted);
    font-size: 18px;
    line-height: 1;
    padding: 2px 4px;
    cursor: pointer;
  }

  .close:hover {
    color: var(--text);
    background: rgba(255, 255, 255, 0.14);
  }

  .error {
    margin: 0;
    color: #ffb4a8;
  }
</style>
