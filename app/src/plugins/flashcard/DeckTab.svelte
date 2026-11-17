<script lang="ts">
  // The deck widget's buttons (ADR 0042): a tab
  // that slides out from under the panel's bottom edge while the pointer is over the widget, on both
  // views. The deck's name, then Previous, Start / Pause / Resume (Stop once the last card is over)
  // and Next, big enough to hit during a meeting without looking hard (John, 7 Nov). Next is filled
  // once the deck runs. The buttons do what the hotkeys do; clicking one doesn't take focus from the
  // slideshow (overlays are non-activating panels, ADR 0002).
  import Icon from '../../manager/Icon.svelte'
  import type { DeckRun } from '../../lib/decks/run'
  import type { PluginContext } from '../types'
  import type { FlashcardModel } from './model'

  let { ctx, model, run, preview }: { ctx: PluginContext; model: FlashcardModel; run: DeckRun | null; preview: boolean } = $props()
  const ready = $derived(model.status === 'ready')
  const stop = $derived(run?.mode === 'over' && run.last)
  const going = $derived(!ready && !preview && !stop)

  // Ending the deck (ADR 0020: an End that asks twice): the square at the tab's end turns into
  // "Stop?" for a few seconds, and a second click stops the deck. A preview or a deck not yet
  // started closes at once, since nothing is lost.
  let asking = $state(false)
  let calm: ReturnType<typeof setTimeout> | undefined
  function stopDeck() {
    if (preview || ready || asking) {
      clearTimeout(calm)
      asking = false
      ctx.commands.end()
      return
    }
    asking = true
    calm = setTimeout(() => (asking = false), 3000)
  }
  $effect(() => () => clearTimeout(calm))
  const stopTitle = $derived(preview ? 'Close preview' : ready ? 'Close the deck' : asking ? 'Click again to stop the deck' : 'Stop the deck')
</script>

{#if model.status === 'ready' || model.status === 'running'}
  <div class="drawer">
    <div class="tb" class:warn={run?.mode === 'warn'} class:over={run?.mode === 'over'} role="toolbar" aria-label="Cards">
      <span class="dname" title={model.deckName}>{model.deckName}</span>
      <button class="pn" disabled={ready || model.index === 0} onclick={ctx.commands.previous} title="Previous" aria-label="Previous">
        <Icon name="prev" size={17} />
      </button>
      {#if ready}
        <button onclick={ctx.commands.next} title="Start" aria-label="Start"><Icon name="play" size={17} /></button>
      {:else if stop}
        <button class="stop" onclick={ctx.commands.end} title="Stop the deck" aria-label="Stop the deck"><Icon name="stop" size={15} />Stop</button>
      {:else if preview}
        <button disabled title="Preview: nothing counts" aria-label="Pause"><Icon name="pause" size={17} /></button>
      {:else}
        <button onclick={ctx.commands.togglePause} title={model.paused ? 'Resume' : 'Pause'} aria-label={model.paused ? 'Resume' : 'Pause'}>
          <Icon name={model.paused ? 'play' : 'pause'} size={17} />
        </button>
      {/if}
      <button
        class="pn"
        class:go={going}
        disabled={ready || model.index >= model.count - 1}
        onclick={ctx.commands.next}
        title={run?.waiting ? `Next: ${model.next?.name ?? ''}` : 'Next'}
        aria-label="Next"
      >
        <Icon name="next" size={17} />
      </button>
      {#if !stop}
        <button class="end" class:asking onclick={stopDeck} title={stopTitle} aria-label={stopTitle}>
          <Icon name="stop" size={14} />{#if asking}Stop?{/if}
        </button>
      {/if}
    </div>
  </div>
{/if}

<style>
  /* A drawer pulled out from under the panel's bottom edge, the frame's ink carried round it (the
     007/01 tab, in the waveform's look). Hidden up under the panel until pointed at. */
  .drawer {
    --amber: #f2a516;
    --over: #ff4d4d;
    position: relative;
    display: flex;
    justify-content: center;
    overflow: hidden;
    padding: 0 6px 6px;
    margin-top: -4px;
  }

  /* Never wider than the window: the deck's name gives way first (ellipsis, full name in its
     title), so the tab's ends and the buttons always show, down to the window's minWidth. */
  .tb {
    box-sizing: border-box;
    max-width: 100%;
    min-width: 0;
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 7px 10px;
    color: rgb(var(--ink));
    background: rgba(var(--paper), var(--panel-alpha));
    border: 4px solid rgb(var(--ink));
    border-top: 0;
    border-radius: 0 0 14px 14px;
    box-shadow: 0 0 0 1px rgba(var(--paper), 0.45);
    text-shadow: none;
    transform: translateY(-102%);
    transition: transform 0.22s cubic-bezier(0.2, 0.8, 0.3, 1);
  }

  :global(.host:hover) .tb,
  .tb:focus-within {
    transform: none;
  }

  .tb.warn {
    border-color: var(--amber);
  }

  .tb.over {
    border-color: var(--over);
  }

  .dname {
    font-size: 12.5px;
    font-weight: 600;
    color: rgba(var(--ink), 0.62);
    padding: 1px 12px 1px 8px;
    margin-right: 4px;
    border-right: 1px solid rgba(var(--ink), 0.3);
    white-space: nowrap;
    max-width: 180px;
    min-width: 0;
    flex: 0 1 auto;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  /* Big enough to hit without looking hard during a meeting (John, 7 Nov): Previous and Next widest. */
  button {
    width: 40px;
    height: 34px;
    display: grid;
    place-items: center;
    padding: 0;
    border: 0;
    border-radius: 10px;
    background: transparent;
    color: rgb(var(--ink));
    cursor: pointer;
    flex: none;
  }

  button.pn {
    width: 52px;
  }

  button:hover:not(:disabled) {
    background: rgba(var(--ink), 0.16);
  }

  button:disabled {
    opacity: 0.32;
    cursor: default;
  }

  button.go {
    background: rgb(var(--ink));
    color: rgb(var(--paper));
  }

  button.go:hover:not(:disabled) {
    background: rgba(var(--ink), 0.82);
  }

  /* Stop at the tab's end, apart from the others so it isn't hit for Next; red once it asks. */
  button.end {
    margin-left: 6px;
    position: relative;
    color: rgba(var(--ink), 0.75);
  }

  button.end::before {
    content: '';
    position: absolute;
    left: -6px;
    top: 6px;
    bottom: 6px;
    border-left: 1px solid rgba(var(--ink), 0.3);
  }

  button.end.asking {
    width: auto;
    display: flex;
    gap: 4px;
    padding: 0 12px;
    background: var(--over);
    color: #fff;
    font: inherit;
    font-size: 13px;
    font-weight: 650;
  }

  button.stop {
    width: auto;
    display: flex;
    gap: 4px;
    padding: 0 12px;
    background: var(--over);
    color: #fff;
    font: inherit;
    font-size: 13px;
    font-weight: 650;
  }
</style>
