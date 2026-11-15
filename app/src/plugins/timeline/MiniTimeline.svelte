<script lang="ts">
  // The whole talk as one thin bar for the card styles (C, E) and the edge strip (B): each segment
  // at its planned width in its colour, filling as it is presented, the playhead where you are.
  // The same blocks as the square wave but in one row, so the picture keeps still the same way.
  import type { TimelineLayout } from '../../lib/session/timeline'

  let {
    layout,
    paused,
    height = 8,
    edge = false,
  }: {
    layout: TimelineLayout
    paused: boolean
    height?: number
    /** Square ends, for a bar along the edge of the screen. */
    edge?: boolean
  } = $props()

  const at = (seconds: number) => `${(Math.min(seconds, layout.total) / layout.total) * 100}%`
  const share = (part: number, whole: number) => `${whole > 0 ? (part / whole) * 100 : 0}%`
</script>

<div class="mini" class:edge style="height: {height}px">
  {#each layout.blocks as b (b.segmentId)}
    <span
      class="blk {b.state}"
      class:open={b.openEnded}
      class:pulse={b.state === 'current' && b.beyond > 0 && !b.openEnded && !paused}
      style="left: {at(b.start)}; width: {at(b.plannedSeconds)}; --c: var(--k-{b.kind})"
      title="{b.name}: {b.kind}{b.openEnded ? ', open-ended' : ''}"
    >
      <i class="fill" style="width: {share(b.presented, b.plannedSeconds)}"></i>
    </span>
  {/each}
  {#if layout.playhead !== null}<i class="playhead" style="left: {at(layout.playhead)}"></i>{/if}
</div>

<style>
  .mini {
    position: relative;
    flex: none;
    width: 100%;
  }

  .blk {
    position: absolute;
    top: 0;
    bottom: 0;
    min-width: 2px;
    margin-right: 2px;
    border-radius: 2px;
    overflow: hidden;
    background: var(--c);
    box-sizing: border-box;
  }

  .edge .blk {
    border-radius: 0;
  }

  .blk.ahead {
    opacity: 0.32;
  }

  /* The unfilled part of a block is time still to present (or, once done, time not used). */
  .blk.current,
  .blk.done {
    background: color-mix(in srgb, var(--c) 30%, transparent);
  }

  .blk.open {
    background: transparent;
    border: 2px dashed var(--c);
  }

  .blk.open.ahead {
    opacity: 0.55;
  }

  .fill {
    position: absolute;
    top: 0;
    bottom: 0;
    left: 0;
    background: var(--c);
  }

  .blk.open .fill {
    opacity: 0.85;
  }

  /* Over its time: full, and pulsing gently (an outline says it without motion). */
  .blk.pulse {
    animation: pulse 1.8s ease-in-out infinite;
  }

  @keyframes pulse {
    50% {
      opacity: 0.55;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .blk.pulse {
      animation: none;
      outline: 2px solid var(--warn);
      outline-offset: -2px;
    }
  }

  .playhead {
    position: absolute;
    top: -4px;
    bottom: -4px;
    width: 2px;
    margin-left: -1px;
    border-radius: 2px;
    background: #fff;
    box-shadow:
      0 0 0 1px rgba(0, 0, 0, 0.35),
      0 0 8px rgba(255, 255, 255, 0.7);
  }
</style>
