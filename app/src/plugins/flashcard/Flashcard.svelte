<script lang="ts">
  // The flashcard widget (ADR 0036): one card of
  // a deck in the waveform's look, a frame of one ink on its opposite (ADR 0029), Dark or Light as
  // the panel is chosen. Title first, with its kind and time; the points; the deck bar at the
  // bottom (always); the next card, the time left and when the deck ends. Previous / Start or
  // Pause / Next show while the pointer is over it. A timed card counts down, amber in its last ten
  // seconds, and gives way to the next by itself (Auto-advance); the last card, or any card when
  // Auto-advance is off, counts on in red. A copy of the Talking Points overlay, changed (John, 23 Oct).
  import Note from '../../lib/markdown-ui/Note.svelte'
  import { formatDuration } from '../../lib/project/duration'
  import { deckRun } from '../../lib/decks/run'
  import { flashcardModel } from './model'
  import type { DeckPart } from '../../lib/decks/deck'
  import type { PluginContext } from '../types'
  import { fade } from 'svelte/transition'
  import { onDestroy } from 'svelte'
  import { invoke } from '@tauri-apps/api/core'
  import { SIZE_MS, easeOut, wantedHeight } from './fit'

  // `fit`: in its own window, the window's height follows the card, with `below` more for
  // what the window holds under it (the deck widget's tab). `buttons`: its own row of buttons, which
  // the deck widget leaves out for its tab.
  let { ctx, fit = false, below = 0, buttons = true }: { ctx: PluginContext; fit?: boolean; below?: number; buttons?: boolean } = $props()
  const session = $derived(ctx.session)
  const look = $derived(ctx.settings)
  const model = $derived(flashcardModel($session))
  const card = $derived(model.card)
  const kinds = $derived(model.options.colour === 'kinds' && !$look.oneColour)
  const ready = $derived(model.status === 'ready')
  const now = $derived(ctx.now)
  const run = $derived($session && model.status !== 'finished' ? deckRun($session, $now, model.options.autoAdvance, model.options.timing) : null)
  const clock = $derived(
    !run || !card ? '' : run.mode === 'over' ? `+${formatDuration(run.seconds)}` : formatDuration(run.seconds),
  )
  // Time left and the end only mean something when some card is timed.
  const timed = $derived(model.options.timing && !!$session?.plan.some((p) => !p.openEnded) && run !== null)
  const endsAt = $derived(run?.endsAt ? new Date(run.endsAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '')

  // Auto-advance is asked for by the deck widget around it (DeckWidget.svelte), whichever view shows.
  // What the deck leaves off its card.
  const shows = $derived((part: DeckPart) => !model.options.hide.includes(part))
  // The window's height follows the card: measured from what the card holds, eased over
  // about a third of a second, at once with reduced motion. The width stays the person's.
  let frame: HTMLElement | undefined = $state()
  let body: HTMLElement | undefined = $state()
  let content: HTMLElement | undefined = $state()
  let raf = 0
  let shown = 0
  const still = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches
  let aiming = 0
  function sizeTo(target: number) {
    // The window growing towards it changes the frame too: a height already on its way is left be.
    if (target === aiming) return
    aiming = target
    cancelAnimationFrame(raf)
    const from = shown || window.innerHeight
    if (Math.abs(target - from) < 1) return
    if (still) {
      shown = target
      void invoke('fit_overlay', { height: target }).catch(() => {})
      return
    }
    const start = performance.now()
    let asking = false
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / SIZE_MS)
      const height = Math.round(from + (target - from) * easeOut(t))
      if (!asking && height !== shown) {
        asking = true
        shown = height
        void invoke('fit_overlay', { height })
          .catch(() => {})
          .finally(() => (asking = false))
      }
      if (t < 1) raf = requestAnimationFrame(step)
      else if (shown !== target) {
        shown = target
        void invoke('fit_overlay', { height: target }).catch(() => {})
      }
    }
    raf = requestAnimationFrame(step)
  }
  // Sized for the deck's longest card, not the one showing, so the widget keeps one size from card to
  // card (John, 7 Nov): every card's points are laid out, unseen, in one cell, which is as tall as the tallest.
  let tallest: HTMLElement | undefined = $state()
  const everyCard = $derived(($session?.talk?.segments ?? []).map((s) => s.points))
  function measure() {
    if (!fit || !frame || !body || !content) return
    const needed = Math.max(content.offsetHeight, tallest?.offsetHeight ?? 0)
    sizeTo(wantedHeight({ frame: frame.offsetHeight, body: body.clientHeight, content: needed }) + below)
  }
  $effect(() => {
    if (!fit || !content || !frame) return
    const watch = new ResizeObserver(measure)
    watch.observe(content)
    watch.observe(frame)
    if (tallest) watch.observe(tallest)
    return () => watch.disconnect()
  })
  onDestroy(() => cancelAnimationFrame(raf))

  const minutes = (s: number) => (s % 60 === 0 ? `${s / 60}m` : formatDuration(s))
</script>

<div
  bind:this={frame}
  class="fc"
  class:ink-light={$look.panel === 'light'}
  class:light={$look.panel === 'light'}
  class:footless={model.options.hide.includes('next') && model.options.hide.includes('left') && model.options.hide.includes('ends')}
  class:warn={run?.mode === 'warn'}
  class:over={run?.mode === 'over'}
>
  {#if model.status === 'none'}
    <div class="head"><span class="title">Flashcards</span></div>
    <p class="quiet">No deck on screen</p>
  {:else if model.status === 'finished' || !card}
    <div class="head"><span class="title">{model.deckName}</span></div>
    <p class="quiet">Finished</p>
  {:else}
    {#snippet bar()}
      <div class="bar" aria-hidden="true">
        {#each model.bar as part, i (i)}
          <span class={part.state} style:flex={part.weight} style:--k={kinds ? `var(--k-${part.kind})` : null}
            ><i style:width={part.state === 'current' ? `${(run?.mode === 'up' && !ready ? 1 : (run?.progress ?? 0)) * 100}%` : null}></i></span
          >
        {/each}
      </div>
    {/snippet}
    <div class="head">
      <span class="title" title={card.name}>
        {#if kinds}<span class="kdot" style:background="var(--k-{card.kind})"></span>{/if}{card.name}
        {#if $session?.preview}<span class="tag">Preview</span>{:else if ready}<span class="tag">Ready</span>{:else if model.paused}<span
            class="tag">Paused</span
          >{/if}
      </span>
      {#if shows('position')}<span class="pos num">{model.index + 1}/{model.count}</span>{/if}
      <span class="clock num {run?.mode}" class:up={run?.mode === 'up'}>{clock}</span>
    </div>
    <div class="body" bind:this={body}>
      <div class="content" bind:this={content}>
        {#key model.index}
          <div in:fade={{ duration: still ? 0 : 260 }}>
            {#if card.points.length > 0}
              <ol>
                {#each card.points as point, i (i)}<li><Note text={point} /></li>{/each}
              </ol>
            {:else}
              <p class="quiet">No points on this card</p>
            {/if}
          </div>
        {/key}
      </div>
      {#if fit}
        <div class="measure" aria-hidden="true"><div class="tallest" bind:this={tallest}>
          {#each everyCard as points, c (c)}
            <div>
              {#if points.length > 0}
                <ol>
                  {#each points as point, i (i)}<li><Note text={point} /></li>{/each}
                </ol>
              {:else}
                <p class="quiet">No points on this card</p>
              {/if}
            </div>
          {/each}
        </div></div>
      {/if}
    </div>
    {#if shows('bar')}{@render bar()}{/if}
    {@const left = timed && run && shows('left')}
    {@const ends = timed && run && shows('ends') && endsAt}
    {#if shows('next') || left || ends}
    <div class="foot">
      <span class="muted"
        >{#if !shows('next')}{:else if model.next}{run?.waiting ? 'Press Next for' : 'Next:'} {model.next.name}{#if model.next.seconds !== null && model.options.timing}{' · '}{minutes(
              model.next.seconds,
            )}{/if}{:else}Last card{/if}</span
      >
      {#if run && (left || ends)}
        <span class="faint num"
          >{#if left}{#if run.mode === 'over' && run.last}<span class="over-t">+{formatDuration(run.seconds)} over</span>{:else}{formatDuration(run.left)} left{/if}{/if}{#if left && ends}{' · '}{/if}{#if ends}ends {endsAt}{/if}</span
        >
      {/if}
    </div>
    {/if}
    {#if buttons}
    <div class="ctl" role="toolbar" aria-label="Cards">
      <button disabled={ready || model.index === 0} onclick={ctx.commands.previous}>Previous</button>
      {#if $session?.preview}
        <button class="main" onclick={ctx.commands.end}>Close preview</button>
      {:else if ready}
        <button class="main" onclick={ctx.commands.next}>Start</button>
      {:else if run?.mode === 'over' && run.last}
        <button class="main" onclick={ctx.commands.end}>Stop</button>
      {:else}
        <button class="main" onclick={ctx.commands.togglePause}>{model.paused ? 'Resume' : 'Pause'}</button>
      {/if}
      <button disabled={ready || model.index >= model.count - 1} onclick={ctx.commands.next}>Next</button>
    </div>
    {/if}
  {/if}
</div>

<style>
  /* The waveform's look (ADR 0029): one ink on its opposite in a 4 px frame with 20 px corners, and
     a keyline of the paper outside it so the frame keeps its edge on a slide of the same colour. */
  .fc {
    --text: rgb(var(--ink));
    --text-muted: rgba(var(--ink), 0.62);
    --text-faint: rgba(var(--ink), 0.42);
    --over: #ff4d4d;
    --amber: #f2a516;
    position: relative;
    display: flex;
    flex-direction: column;
    height: calc(100% - 2px);
    margin: 1px;
    box-sizing: border-box;
    padding: 12px 16px 0;
    overflow: hidden;
    color: var(--text);
    background: rgba(var(--paper), var(--panel-alpha));
    border: 4px solid rgb(var(--ink));
    border-radius: 20px;
    box-shadow: 0 0 0 1px rgba(var(--paper), 0.45);
    text-shadow: none;
  }

  /* On the light panel, the app's light-theme kind colours (as in the editor's plan bar). */
  .fc.light {
    --k-intro: #4a78e8;
    --k-topic: #1f8f83;
    --k-demo: #d97a1c;
    --k-outro: #8062d0;
    --k-break: #7d889b;
    --over: #d32f2f;
    --amber: #c27c00;
  }

  /* Nothing in the foot: the card still has room below its last line. */
  .fc.footless {
    padding-bottom: 8px;
  }

  /* The last ten seconds: amber; past the card's time: red (the frame too). */
  .fc.warn {
    border-color: var(--amber);
  }

  .fc.over {
    border-color: var(--over);
  }

  .clock.warn {
    color: var(--amber);
  }

  .clock.over,
  .over-t {
    color: var(--over);
  }

  .bar span.current i {
    transition: width 0.1s linear;
  }

  .fc.warn .bar span.current i {
    background: var(--amber);
  }

  .head {
    flex: none;
    display: flex;
    align-items: baseline;
    gap: 10px;
    /* Room for the deck widget's corner: the switch and the host's close button, and the record button when there is one. */
    padding-right: var(--corner, 52px);
  }

  .title {
    flex: 1;
    min-width: 0;
    font-size: 15px;
    font-weight: 650;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .kdot {
    display: inline-block;
    width: 9px;
    height: 9px;
    border-radius: 3px;
    margin-right: 7px;
    vertical-align: 1px;
  }

  .tag {
    margin-left: 6px;
    padding: 0 6px;
    border: 1.5px solid var(--text-muted);
    border-radius: 99px;
    font-size: 11px;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    vertical-align: 3px;
    color: rgba(var(--ink), 0.8);
  }

  .pos {
    flex: none;
    font-size: 12px;
    color: var(--text-faint);
  }

  .clock {
    flex: none;
    font-size: 22px;
    font-weight: 650;
    letter-spacing: -0.01em;
  }

  /* Untimed: the clock counts up, so it is drawn quieter than a countdown. */
  .clock.up {
    color: var(--text-muted);
    font-weight: 500;
  }

  .num {
    font-variant-numeric: tabular-nums;
  }

  .body {
    position: relative;
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    scrollbar-width: thin;
  }

  /* Every card's points, unseen, stacked in one cell: as tall as the longest card. Clipped to
     nothing, so it never makes the body scroll. */
  .measure {
    position: absolute;
    left: 0;
    right: 0;
    top: 0;
    height: 0;
    overflow: hidden;
  }

  .tallest {
    display: grid;
    visibility: hidden;
    pointer-events: none;
  }

  .tallest > div {
    grid-area: 1 / 1;
    display: flow-root;
  }

  /* Holds the points' margins, so its height is all the room they need. */
  .content {
    display: flow-root;
  }

  ol {
    margin: 8px 0 6px;
    padding-left: 22px;
    font-size: var(--pt-size, 16px);
  }

  li {
    margin: 3px 0;
    line-height: 1.35;
    overflow-wrap: anywhere;
  }

  li::marker {
    color: var(--text-faint);
    font-variant-numeric: tabular-nums;
  }

  .quiet {
    margin: 10px 0 12px;
    color: var(--text-muted);
  }

  /* The deck bar: one part per card, as wide as its time; done parts full, the current one filling. */
  .bar {
    flex: none;
    display: flex;
    gap: 3px;
    height: 6px;
    margin: 8px 0 6px;
  }

  .bar span {
    --k: rgb(var(--ink));
    position: relative;
    flex: 1;
    overflow: hidden;
    border-radius: 3px;
    background: rgba(var(--ink), 0.22);
  }

  .bar span i {
    position: absolute;
    inset: 0 auto 0 0;
    width: 0;
    border-radius: 3px;
    background: var(--k);
  }

  .bar span.done i {
    width: 100%;
  }

  .foot {
    flex: none;
    display: flex;
    justify-content: space-between;
    gap: 10px;
    flex-wrap: wrap;
    padding: 2px 0 10px;
    font-size: 12.5px;
  }

  .muted {
    color: var(--text-muted);
  }

  .faint {
    color: var(--text-faint);
  }

  /* Previous / Start or Pause / Next: shown while the pointer is over the card. */
  .ctl {
    flex: none;
    display: flex;
    gap: 8px;
    max-height: 0;
    padding: 0;
    opacity: 0;
    overflow: hidden;
    transition:
      max-height 0.15s,
      opacity 0.15s,
      padding 0.15s;
  }

  .fc:hover .ctl {
    max-height: 50px;
    padding: 2px 0 12px;
    opacity: 1;
  }

  .ctl button {
    flex: 1;
    height: 28px;
    border: 2px solid rgb(var(--ink));
    border-radius: 99px;
    background: transparent;
    color: rgb(var(--ink));
    font: inherit;
    font-size: 12.5px;
    font-weight: 600;
    cursor: pointer;
  }

  .ctl button.main {
    background: rgb(var(--ink));
    color: rgb(var(--paper));
  }

  .ctl button:disabled {
    opacity: 0.35;
    cursor: default;
  }

  @media (prefers-reduced-motion: reduce) {
    .ctl {
      transition: none;
    }
  }
</style>
