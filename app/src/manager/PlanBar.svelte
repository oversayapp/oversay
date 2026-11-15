<script lang="ts">
  // The talk's plan as a proportional bar (007/07): one
  // block per segment, as wide as its planned length, coloured by kind; open-ended segments are
  // hatched and dashed at their estimate. Under the editor header it shows the plan; in the live
  // view (`progress`) the blocks start faint and fill in their own colour as the talk goes, so
  // the colour changes as it moves into each segment. Kinds are also in each block's tooltip
  // and label, never colour alone.
  import type { SegmentKind } from '../lib/project/types'
  import { formatDuration, LENGTH_STEP_SECONDS, stepLength } from '../lib/project/duration'
  import { logAction } from '../lib/log'

  interface Block {
    id: string
    name: string
    kind: SegmentKind
    plannedSeconds: number
    openEnded: boolean
  }

  let {
    segments,
    selectedId = null,
    onselect,
    onresize,
    progress,
  }: {
    segments: Block[]
    selectedId?: string | null
    onselect?: (id: string) => void
    /**
     * In the editor (011/05): a block's right edge can be dragged, and a selected block nudged
     * with ← →, to change its length in 30-second steps. While dragging it's called with
     * `done` false at each step (a preview); once at the end with `done` true, so a drag is
     * one change.
     */
    onresize?: (id: string, seconds: number, done: boolean) => void
    /** While a session runs: how much of each segment has been presented, 0 to 1. */
    progress?: number[]
  } = $props()

  let bar: HTMLElement | undefined = $state()
  // The drag under way: the block, where it started, and seconds per pixel as the bar was then
  // (kept for the whole drag, so the edge follows the pointer even as the bar rescales).
  let drag = $state<{ id: string; x: number; seconds: number; perPixel: number } | null>(null)

  function startDrag(e: PointerEvent, s: Block) {
    if (e.button !== 0 || !bar || !onresize) return
    e.preventDefault()
    e.stopPropagation()
    try {
      ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    } catch {
      // No capture for this pointer (it already went away): the drag still follows its moves.
    }
    const total = segments.reduce((sum, b) => sum + Math.max(b.plannedSeconds, 1), 0)
    drag = { id: s.id, x: e.clientX, seconds: s.plannedSeconds, perPixel: total / bar.getBoundingClientRect().width }
    logAction('segment length drag started', s.id)
    onselect?.(s.id)
  }

  function moveDrag(e: PointerEvent) {
    if (!drag || !onresize) return
    const next = stepLength(drag.seconds, (e.clientX - drag.x) * drag.perPixel)
    const now = segments.find((b) => b.id === drag!.id)?.plannedSeconds
    if (next !== now) onresize(drag.id, next, false)
  }

  function endDrag(commit: boolean) {
    if (!drag || !onresize) return
    const length = segments.find((b) => b.id === drag!.id)?.plannedSeconds ?? drag.seconds
    const kept = commit ? length : drag.seconds
    if (kept !== drag.seconds) logAction('segment length dragged', `${drag.id} ${kept}`)
    onresize(drag.id, kept, true)
    drag = null
  }

  function nudge(e: KeyboardEvent, s: Block) {
    if (!onresize || (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') || e.altKey || e.metaKey || e.ctrlKey) return
    e.preventDefault()
    const length = stepLength(s.plannedSeconds, e.key === 'ArrowRight' ? LENGTH_STEP_SECONDS : -LENGTH_STEP_SECONDS)
    logAction('segment length nudged', `${s.id} ${length}`)
    onresize(s.id, length, true)
  }

  const label = (s: Block) => `${s.name}: ${s.kind}, ${s.openEnded ? 'open-ended, estimate ' : ''}${formatDuration(s.plannedSeconds)}`
</script>

<div class="plan-bar" class:live={progress !== undefined} class:dragging={drag !== null} role="img" aria-label="Plan: {segments.map(label).join('; ')}" bind:this={bar}>
  {#each segments as s, i (s.id)}
    {#if onselect}
      <span class="slot" style="flex: {Math.max(s.plannedSeconds, 1)} 1 0">
        <button
          class="block"
          class:open={s.openEnded}
          class:sel={s.id === selectedId}
          style="--c: var(--k-{s.kind})"
          title={onresize ? `${label(s)}. Drag its right edge, or press ← →, to change the length` : label(s)}
          aria-label={label(s)}
          onclick={() => onselect(s.id)}
          onkeydown={(e) => nudge(e, s)}
        ></button>
        {#if onresize}
          <!-- The right edge: drag to change the length in 30-second steps. -->
          <span
            class="grab"
            class:on={drag?.id === s.id}
            class:sel={s.id === selectedId}
            role="separator"
            aria-hidden="true"
            onpointerdown={(e) => startDrag(e, s)}
            onpointermove={moveDrag}
            onpointerup={() => endDrag(true)}
            onpointercancel={() => endDrag(false)}
          ></span>
          {#if drag?.id === s.id}<span class="tip num">{formatDuration(s.plannedSeconds)}</span>{/if}
        {/if}
      </span>
    {:else}
      <span
        class="block"
        class:open={s.openEnded}
        style="flex: {Math.max(s.plannedSeconds, 1)} 1 0; --c: var(--k-{s.kind})"
        title={label(s)}
      >
        {#if progress}<i style="width: {Math.min(1, Math.max(0, progress[i] ?? 0)) * 100}%"></i>{/if}
      </span>
    {/if}
  {/each}
</div>

<style>
  .plan-bar {
    display: flex;
    gap: 2px;
    height: 22px;
  }

  .slot {
    position: relative;
    display: flex;
    min-width: 6px;
  }

  .slot .block {
    flex: 1;
  }

  /* The drag handle sits over the block's right edge, with a wide target so it's easy to catch.
     The selected block's handle always shows; the others show while the pointer is over the bar
     (011/05, after John couldn't find an edge that showed only on a block's own hover). */
  .grab {
    position: absolute;
    top: -5px;
    bottom: -5px;
    right: -9px;
    z-index: 2;
    width: 16px;
    cursor: ew-resize;
    touch-action: none;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .grab::after {
    content: '';
    width: 6px;
    height: 26px;
    border-radius: 3px;
    background: var(--card);
    border: 1.5px solid var(--muted);
    box-shadow: 0 1px 3px rgb(0 0 0 / 0.25);
    opacity: 0;
    transition:
      opacity 0.12s,
      transform 0.12s;
  }

  .plan-bar:hover .grab::after,
  .grab.sel::after,
  .grab.on::after {
    opacity: 1;
  }

  .grab:hover::after,
  .grab.on::after {
    border-color: var(--text);
    transform: scaleX(1.25);
  }

  .dragging,
  .dragging * {
    cursor: ew-resize !important;
  }

  .tip {
    position: absolute;
    bottom: calc(100% + 6px);
    right: -24px;
    z-index: 3;
    padding: 2px 7px;
    border-radius: 7px;
    background: var(--text);
    color: var(--bg);
    font-size: 12px;
    font-weight: 700;
    white-space: nowrap;
    pointer-events: none;
  }

  .num {
    font-variant-numeric: tabular-nums;
  }

  .block {
    position: relative;
    min-width: 6px;
    padding: 0;
    border: 0;
    border-radius: 5px;
    background: var(--c);
    overflow: hidden;
  }

  button.block:hover {
    filter: brightness(1.1);
  }

  .block.open {
    border: 2px dashed var(--c);
    background: repeating-linear-gradient(
      135deg,
      color-mix(in srgb, var(--c) 28%, transparent) 0 5px,
      transparent 5px 9px
    );
  }

  .block.sel {
    box-shadow:
      0 0 0 2px var(--bg),
      0 0 0 4px var(--text);
  }

  /* Live: what hasn't been presented yet is faint; the fill is the segment's own colour. */
  .live .block {
    background: color-mix(in srgb, var(--c) 22%, transparent);
  }

  .live .block.open {
    background: repeating-linear-gradient(
      135deg,
      color-mix(in srgb, var(--c) 18%, transparent) 0 5px,
      transparent 5px 9px
    );
  }

  .block i {
    position: absolute;
    inset: 0 auto 0 0;
    background: var(--c);
  }
</style>
