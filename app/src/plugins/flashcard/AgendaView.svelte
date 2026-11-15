<script lang="ts">
  // The deck widget's Agenda view (ADR 0042): every card
  // as a rounded bar as wide as its time (the editor's plan bar, live), done cards faded, a playhead
  // in the current one, and each card's title and start minute under its bar, never its points. The
  // top row has the card's kind, name and the next card; its clock in a pill that fills as its time
  // goes; and the time into the deck out of the whole. An untimed deck has bars of equal width, no
  // minutes, and its clock counting up with the card's position.
  import { formatDuration } from '../../lib/project/duration'
  import { cardTimes, deckRun } from '../../lib/decks/run'
  import type { PluginContext } from '../types'
  import { flashcardModel } from './model'

  let { ctx }: { ctx: PluginContext } = $props()
  const session = $derived(ctx.session)
  const now = $derived(ctx.now)
  const model = $derived(flashcardModel($session))
  const card = $derived(model.card)
  const ready = $derived(model.status === 'ready')
  const run = $derived($session && model.status !== 'finished' ? deckRun($session, $now, model.options.autoAdvance, model.options.timing) : null)
  const kinds = $derived(model.options.colour === 'kinds')
  // Minutes and a total only mean something when some card is timed and timing is on.
  const timed = $derived(model.options.timing && !!$session?.plan.some((p) => !p.openEnded))
  const clock = $derived(!run ? '' : run.mode === 'over' ? `+${formatDuration(run.seconds)}` : formatDuration(run.seconds))
  // The pill fills as the card's time goes; an untimed card's stays empty.
  const fill = $derived(!run || ready || run.mode === 'up' ? 0 : run.progress)
  // The playhead walks across a timed card; an untimed card's sits at its start.
  const progress = $derived(!run || ready || run.mode === 'up' ? 0 : Math.min(1, run.progress))
  const into = $derived($session && !ready ? cardTimes($session, $now).shown.reduce((a, s) => a + s, 0) : 0)
  const total = $derived($session?.plan.reduce((a, p) => a + (p.openEnded ? 0 : p.plannedSeconds), 0) ?? 0)
  // Where each card starts in the plan, in minutes.
  const starts = $derived.by(() => {
    let at = 0
    return ($session?.plan ?? []).map((p) => {
      const start = at
      at += p.openEnded ? 0 : p.plannedSeconds
      return start
    })
  })
  const minute = (s: number) => (s % 60 === 0 ? `${s / 60}′` : formatDuration(s))
  const titleState = (state: 'done' | 'current' | 'ahead') => (state === 'current' ? 'cur' : state)
</script>

<div class="ag" class:warn={run?.mode === 'warn'} class:over={run?.mode === 'over'}>
  {#if model.status === 'none'}
    <div class="top"><span class="now">No deck on screen</span></div>
  {:else if model.status === 'finished' || !card}
    <div class="top"><span class="now">{model.deckName} <span class="nx">Finished</span></span></div>
  {:else}
    <div class="top">
      <div class="now" title={card.name}>
        <small>{card.kind}</small>{card.name}
        {#if $session?.preview}<span class="tag">Preview</span>{:else if ready}<span class="tag">Ready</span>{:else if model.paused}<span class="tag"
            >Paused</span
          >{/if}
        {#if model.next}<span class="nx">{run?.waiting ? 'Press Next for' : 'Next:'} {model.next.name}</span>{/if}
      </div>
      <div class="pill num" class:up={run?.mode === 'up'} class:warn={run?.mode === 'warn'} class:over={run?.mode === 'over'}>
        <i style:width="{fill * 100}%"></i><span>{clock}</span>
      </div>
      <div class="total num">
        <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"
          ><circle cx="7" cy="7" r="5.6" fill="none" stroke="currentColor" stroke-width="1.5" /><path
            d="M7 4v3.2l2.2 1.4"
            fill="none"
            stroke="currentColor"
            stroke-width="1.5"
            stroke-linecap="round"
          /></svg
        >
        <span>{formatDuration(Math.floor(into))}</span>
        {#if timed}<span class="faint">/ {formatDuration(total)}</span>{:else}<span class="faint">{model.index + 1}/{model.count}</span>{/if}
      </div>
    </div>
    <div class="bars" aria-hidden="true">
      {#each model.bar as part, i (i)}
        <span class={part.state} style:flex={part.weight} style:--c={kinds ? `var(--k-${part.kind})` : 'rgb(var(--ink))'}>
          {#if part.state === 'current'}<b style:left="{progress * 100}%"></b>{/if}
        </span>
      {/each}
    </div>
    <div class="titles">
      {#each model.bar as part, i (i)}
        {@const name = $session?.talk?.segments[i]?.name ?? ''}
        <span class={titleState(part.state)} style:flex={part.weight} title={name}
          >{#if timed}<small>{minute(starts[i] ?? 0)}</small>{/if}{name}</span
        >
      {/each}
    </div>
  {/if}
</div>

<style>
  /* The waveform's look (ADR 0029), as the Card view: one ink on its opposite in a 4 px frame with
     20 px corners, a keyline of the paper outside it. */
  .ag {
    --amber: #f2a516;
    --over: #ff4d4d;
    box-sizing: border-box;
    /* It fills its room exactly, so the tab below meets its bottom edge and never shows through it. */
    height: calc(100% - 2px);
    display: flex;
    flex-direction: column;
    justify-content: center;
    overflow: hidden;
    margin: 1px;
    padding: 10px 18px 10px;
    color: rgb(var(--ink));
    background: rgba(var(--paper), var(--panel-alpha));
    border: 4px solid rgb(var(--ink));
    border-radius: 20px;
    box-shadow: 0 0 0 1px rgba(var(--paper), 0.45);
    text-shadow: none;
  }

  .ag.warn {
    border-color: var(--amber);
  }

  .ag.over {
    border-color: var(--over);
  }

  .num {
    font-variant-numeric: tabular-nums;
  }

  .faint {
    color: rgba(var(--ink), 0.42);
  }

  .top {
    flex: none;
    display: grid;
    grid-template-columns: 1fr auto 1fr;
    align-items: center;
    gap: 12px;
    /* Room for the switch and the host's ✕ in the corner, and the record button when there is one. */
    padding-right: var(--corner, 52px);
    min-height: 32px;
  }

  .now {
    min-width: 0;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    font-size: 19px;
    font-weight: 650;
  }

  .now small {
    font-size: 11px;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    font-weight: 600;
    color: rgba(var(--ink), 0.62);
    margin-right: 8px;
    vertical-align: 2px;
  }

  .nx {
    font-size: 13px;
    font-weight: 500;
    color: rgba(var(--ink), 0.62);
    margin-left: 12px;
  }

  .tag {
    margin-left: 6px;
    padding: 0 6px;
    border: 1.5px solid rgba(var(--ink), 0.62);
    border-radius: 99px;
    font-size: 11px;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    vertical-align: 3px;
    color: rgba(var(--ink), 0.8);
    font-weight: 600;
  }

  /* The card's clock: an outline that fills with the ink as its time goes, the digits always readable. */
  .pill {
    position: relative;
    overflow: hidden;
    min-width: 96px;
    text-align: center;
    border: 2px solid rgb(var(--ink));
    border-radius: 99px;
    padding: 1px 14px;
    font-size: 19px;
    font-weight: 650;
  }

  .pill i {
    position: absolute;
    inset: 0 auto 0 0;
    background: rgb(var(--ink));
  }

  .pill span {
    position: relative;
    mix-blend-mode: difference;
    color: #fff;
  }

  .pill.up {
    border-color: rgba(var(--ink), 0.5);
    color: rgba(var(--ink), 0.62);
    font-weight: 500;
  }

  .pill.up span {
    mix-blend-mode: normal;
    color: inherit;
  }

  .pill.warn {
    border-color: var(--amber);
  }

  .pill.warn i {
    background: var(--amber);
  }

  /* Amber with the difference blend would turn the digits blue: black on it instead. */
  .pill.warn span {
    mix-blend-mode: normal;
    color: #000;
  }

  .pill.over {
    border-color: var(--over);
    background: var(--over);
  }

  .pill.over span {
    mix-blend-mode: normal;
    color: #fff;
  }

  .total {
    justify-self: end;
    font-size: 15px;
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .bars {
    flex: none;
    display: flex;
    gap: 4px;
    height: 24px;
    margin-top: 14px;
  }

  .bars span {
    position: relative;
    min-width: 6px;
    border-radius: 6px;
    background: var(--c);
  }

  .bars span.done {
    opacity: 0.35;
  }

  .bars span.ahead {
    opacity: 0.75;
  }

  /* The playhead: a bar of the ink with the paper round it, so it shows on any colour. */
  .bars b {
    position: absolute;
    top: -4px;
    bottom: -4px;
    width: 4px;
    margin-left: -2px;
    border-radius: 2px;
    background: rgb(var(--ink));
    box-shadow: 0 0 0 2px rgba(var(--paper), 0.7);
    transition: left 0.1s linear;
  }

  .ag.over .bars b {
    animation: blink 1s ease-in-out infinite;
  }

  @keyframes blink {
    50% {
      opacity: 0.3;
    }
  }

  .titles {
    flex: none;
    display: flex;
    gap: 4px;
    margin-top: 6px;
    font-size: 14px;
    line-height: 1.3;
  }

  .titles span {
    min-width: 6px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .titles small {
    display: block;
    font-size: 11px;
    color: rgba(var(--ink), 0.42);
    font-variant-numeric: tabular-nums;
  }

  .titles .done {
    color: rgba(var(--ink), 0.42);
  }

  .titles .ahead {
    color: rgba(var(--ink), 0.72);
  }

  .titles .cur {
    color: rgb(var(--ink));
    font-weight: 650;
  }
</style>
