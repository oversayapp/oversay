<script lang="ts">
  // The Waveform look's wave (ADR 0029; sine.ts): one white line, each segment in its
  // kind's pattern, cancelled to a flat line as it is said with a faint shadow of the pattern kept
  // behind it. The playhead is a dot where the wave meets the line; over its time it pulses.
  import type { TimelineLayout } from '../../lib/session/timeline'
  import { shapeAt, sineDrawing, waveSpans } from './sine'

  // `look`: seconds into the talk where the wave is held to look back, or null.
  let { layout, over = false, look = null }: { layout: TimelineLayout; over?: boolean; look?: number | null } = $props()

  // Drawn in the box's own pixels, so wavelengths and line widths are what the design says.
  let width = $state(0)
  let height = $state(0)
  const amplitude = $derived(Math.max(4, Math.min(16, height / 2 - 4)))
  const drawing = $derived(width > 0 && height > 0 ? sineDrawing(layout, width, height, amplitude) : null)
  // The point looked at, on the shadow of the pattern.
  const marker = $derived.by(() => {
    if (look === null || width <= 0) return null
    const x = (look / layout.total) * width
    const span = waveSpans(layout, width).find((s) => x >= s.x0 && x <= s.x1)
    return { x, y: height / 2 + (span ? shapeAt(span, x) * amplitude : 0) }
  })
</script>

<div class="sine" bind:clientWidth={width} bind:clientHeight={height}>
  {#if drawing}
    <svg viewBox="0 0 {width} {height}" aria-hidden="true">
      {#each drawing.shadows as s, i (i)}<polyline class="shadow" class:dashed={s.dashed} points={s.points} />{/each}
      {#each drawing.runs as r, i (i)}<polyline class={r.part} class:dashed={r.dashed} data-kind={r.kind} points={r.points} />{/each}
      {#each drawing.nodes as x, i (i)}<line class="node" x1={x} x2={x} y1={height / 2 - 4} y2={height / 2 + 4} />{/each}
      {#if marker}
        <line class="look" x1={marker.x} x2={marker.x} y1="0" y2={height} />
        <circle class="look-dot" cx={marker.x} cy={marker.y} r="4" />
      {/if}
      {#if drawing.playhead !== null}
        <line class="head" x1={drawing.playhead} x2={drawing.playhead} y1="0" y2={height} />
        <circle class="dot" class:pulse={over} cx={drawing.playhead} cy={height / 2} r="4.5" />
      {/if}
    </svg>
  {/if}
</div>

<style>
  .sine {
    position: absolute;
    inset: 0;
  }

  svg {
    display: block;
    width: 100%;
    height: 100%;
    overflow: visible;
  }

  polyline {
    fill: none;
    stroke: rgb(var(--ink));
    stroke-linejoin: round;
    stroke-linecap: round;
  }

  /* What has been said: flat, full white. */
  .done,
  .current {
    stroke-width: 2.5;
  }

  /* What is ahead: fainter (42%). */
  .ahead {
    stroke-width: 1.5;
    opacity: 0.42;
  }

  /* The pattern behind the flat line, so what has been said can still be seen. */
  .shadow {
    stroke-width: 1.5;
    opacity: 0.3;
  }

  .dashed {
    stroke-dasharray: 5 4;
  }

  .node {
    stroke: rgba(var(--ink), 0.35);
    stroke-width: 1;
  }

  .head {
    stroke: rgba(var(--ink), 0.55);
    stroke-width: 1;
  }

  .look {
    stroke: rgb(var(--ink));
    stroke-width: 1.5;
    stroke-dasharray: 3 3;
  }

  .look-dot {
    fill: rgb(var(--paper));
    stroke: rgb(var(--ink));
    stroke-width: 2;
  }

  .dot {
    fill: rgb(var(--ink));
    stroke: rgb(var(--paper));
    stroke-width: 1.5;
  }

  /* Over its time: the dot holds at the segment's end, in the signal colour, and pulses. */
  .dot.pulse {
    fill: var(--warn);
    animation: pulse 1.8s ease-in-out infinite;
  }

  @keyframes pulse {
    50% {
      opacity: 0.45;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .dot.pulse {
      animation: none;
    }
  }
</style>
