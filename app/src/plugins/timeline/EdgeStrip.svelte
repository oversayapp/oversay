<script lang="ts">
  // Style B, the edge strip (007/06): a thin bar along the very
  // bottom of the screen with the talk's segments in their colours, and a small pill riding above
  // the playhead: the buttons, the segment, its time, and whether the talk is late or early. The
  // lightest style: almost nothing covers the slide. The window is the screen's width and only as
  // tall as the pill and the bar (windows.ts), so what is beside the pill is the slide's. There
  // is no name tab (the pill is too small to carry one) and the buttons follow Settings › Overlays
  // for always, on hover or hidden; the edge setting doesn't apply (no tab).
  import { formatElapsed } from '../../lib/session/clock'
  import { formatDuration } from '../../lib/project/duration'
  import { formatTalkStatus } from '../../lib/session/timeline'
  import OverlayControls from '../OverlayControls.svelte'
  import MiniTimeline from './MiniTimeline.svelte'
  import { timelineModel } from './model'
  import type { PluginContext } from '../types'

  let { ctx }: { ctx: PluginContext } = $props()
  const now = $derived(ctx.now)
  const session = $derived(ctx.session)
  const look = $derived(ctx.settings)
  const model = $derived(timelineModel($session, $now))
  const seg = $derived(model.segment)
  const readout = $derived(model.readout)
  const over = $derived(readout?.mode === 'over')
  const warn = $derived(over || model.word === 'wrap up' || readout?.mode === 'so-far')

  // The pill rides above the playhead, kept inside the window (and clear of the close button).
  let width = $state(0)
  let pillWidth = $state(0)
  const SIDE = 10
  // The host's close button, in the window's top right corner.
  const CLOSE = 34
  const centre = $derived.by(() => {
    const layout = model.layout
    const x = layout && layout.playhead !== null ? (layout.playhead / layout.total) * width : 0
    return Math.min(Math.max(x, pillWidth / 2 + SIDE), Math.max(width - pillWidth / 2 - CLOSE, pillWidth / 2 + SIDE))
  })

  const big = $derived(
    model.status === 'ready' && seg
      ? formatDuration(seg.plannedSeconds)
      : readout
        ? `${over ? '+' : ''}${formatElapsed(readout.seconds)}${readout.mode === 'so-far' ? ' ↑' : ''}`
        : '',
  )
</script>

<div class="strip" bind:clientWidth={width}>
  <div class="pill" bind:clientWidth={pillWidth} style="left: {centre}px">
    <OverlayControls {ctx} visible={$look.buttons} small />
    {#if !$session}
      <span>No session</span>
    {:else if model.status === 'finished'}
      <span>Finished</span>
    {:else}
      {#if model.paused}<span class="paused"><span class="pause-ic"></span>Paused</span>{/if}
      <span class="name">{model.status === 'ready' ? 'Ready' : (seg?.name ?? '')}</span>
      <b class="big num" class:warn>{big}</b>
      <span class="words">{model.status === 'ready' ? 'press Start' : model.word.replace(' · plan paused', '')}</span>
      {#if model.standing && model.status === 'running'}
        <span class="dot">·</span>
        <b class="chip {model.standing.status}">{formatTalkStatus(model.standing)}</b>
      {/if}
    {/if}
  </div>
  {#if model.layout}
    <div class="bar">
      <MiniTimeline layout={model.layout} paused={model.paused} height={10} edge />
    </div>
  {/if}
</div>

<style>
  .strip {
    position: relative;
    height: 100%;
  }

  .pill {
    position: absolute;
    bottom: 18px;
    transform: translateX(-50%);
    display: flex;
    align-items: center;
    gap: 9px;
    padding: 4px 14px 4px 6px;
    border-radius: 99px;
    border: 1px solid var(--panel-border);
    background: var(--panel-bg);
    font-size: 14px;
    white-space: nowrap;
  }

  .name {
    font-weight: 650;
  }

  .big {
    font-size: 17px;
  }

  .big.warn {
    color: var(--warn);
  }

  .num,
  b {
    font-variant-numeric: tabular-nums;
  }

  .words,
  .dot {
    color: var(--text-muted);
  }

  .paused {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    padding: 0 8px;
    border: 1px solid currentColor;
    border-radius: 99px;
    font-size: 12px;
    font-weight: 700;
  }

  .pause-ic {
    width: 9px;
    height: 10px;
    border-left: 3px solid currentColor;
    border-right: 3px solid currentColor;
    box-sizing: border-box;
  }

  .chip {
    font-size: 13px;
    font-weight: 750;
  }

  .chip.late {
    color: var(--late);
  }

  .chip.early,
  .chip.on-time {
    color: var(--early);
  }

  /* The strip itself, flush with the bottom edge of the screen. */
  .bar {
    position: absolute;
    left: 0;
    right: 0;
    bottom: 0;
    /* Lighter than a panel, by the same share at every opacity (0.6 at the default 78%). */
    background: rgba(18, 18, 22, calc(var(--panel-alpha) * 0.77));
  }
</style>
