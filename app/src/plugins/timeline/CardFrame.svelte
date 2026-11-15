<script lang="ts">
  // The Timeline's card, in the Waveform look (ADR 0029): the panel is a frame of one
  // colour on its opposite, and the buttons sit in a white-outlined capsule just off it, with the
  // talk's name first in it; with the buttons hidden the capsule keeps the name alone. The tabs on
  // a chosen edge that the other card styles had went with them (ADR 0036).
  import type { Snippet } from 'svelte'
  import OverlayControls from '../OverlayControls.svelte'
  import type { PluginContext } from '../types'

  // `light`: the Light panel. `waveform` is kept for the one caller that says so.
  let { ctx, children, light = false }: { ctx: PluginContext; children: Snippet; waveform?: boolean; light?: boolean } = $props()
  const session = $derived(ctx.session)
  const look = $derived(ctx.settings)
  const name = $derived($session?.talk?.name)
  const buttons = $derived(!!$session && $session.status !== 'finished' && $look.buttons !== 'hidden')
  // The buttons' capsule hangs below the panel, so the window's close button (the host's, in the
  // corner) needs no room above it (overlay.css `--edge-top`).
  $effect(() => {
    document.documentElement.style.setProperty('--edge-top', '0px')
    return () => document.documentElement.style.removeProperty('--edge-top')
  })
</script>

<div class="frame waveform" class:ink-light={light}>
  <div class="overlay-panel card waveform-panel">
    {@render children()}
  </div>
  {#if buttons || name}
    <div class="capsule" class:hover={buttons && $look.buttons === 'hover'}>
      {#if name}<span class="talk-name" title={name}>{name}</span>{/if}
      {#if buttons}<OverlayControls {ctx} small waveform />{/if}
    </div>
  {/if}
</div>

<style>
  .frame {
    display: flex;
    flex-direction: column;
    align-items: center;
    height: 100%;
    transition: opacity 0.2s;
  }

  .card {
    position: relative;
    display: flex;
    flex-direction: column;
    gap: 7px;
    flex: 1;
    width: 100%;
    min-height: 0;
    height: auto;
    padding: var(--card-padding, 10px 16px 8px);
    /* Never spill over the slide, whatever size the window is. */
    overflow: hidden;
  }

  /* Buttons on hover: the whole tab comes and goes with them, like the buttons' own fade. */
  /* The talk's name: a small tab on the top edge (the bottom one when the buttons are on top). */
  /* Blocks with the Light panel: Talking Points' light panel, with the app's
     light-theme colours for the kinds and signals so they read on it. */
  /* ---- Waveform (ADR 0029) ---- */
  /* One colour on its opposite (white on black, or black on white with the Light panel), solid by
     default, in a 4 px frame with 20 px corners; a keyline of the panel's colour outside the frame
     keeps its edge on any slide, so the frame sits 1 px inside the window. */
  .waveform {
    box-sizing: border-box;
    padding: 1px;
  }

  .waveform-panel {
    --panel-bg: rgba(var(--paper), var(--panel-alpha));
    --panel-border: rgba(var(--ink), 0.2);
    --text: rgb(var(--ink));
    --text-muted: rgba(var(--ink), 0.62);
    --text-faint: rgba(var(--ink), 0.42);
    border: 4px solid rgb(var(--ink));
    border-radius: 20px;
    box-shadow: 0 0 0 1px rgba(var(--paper), 0.45);
    --card-padding: 10px 18px 8px;
    color: var(--text);
  }

  /* The buttons' capsule, 6 px off the panel: the talk's name, then the buttons. */
  .capsule {
    flex: none;
    display: flex;
    align-items: center;
    gap: 3px;
    max-width: 90%;
    margin-top: 6px;
    padding: 2px 4px;
    border: 2px solid rgb(var(--ink));
    border-radius: 99px;
    background: rgba(var(--paper), var(--panel-alpha));
    box-shadow: 0 0 0 1px rgba(var(--paper), 0.45);
  }

  .talk-name {
    min-width: 0;
    padding: 1px 10px;
    font-size: 11.5px;
    font-weight: 600;
    color: rgba(var(--ink), 0.62);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .talk-name:not(:last-child) {
    margin-right: 2px;
    border-right: 1px solid rgba(var(--ink), 0.3);
  }

  .capsule.hover {
    opacity: 0;
    transition: opacity 0.15s;
  }

  :global(body:hover) .capsule.hover,
  .capsule.hover:focus-within {
    opacity: 1;
  }
</style>
