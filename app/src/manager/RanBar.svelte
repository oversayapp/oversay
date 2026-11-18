<script lang="ts">
  // A run as one bar (design sessions-v2): what it ran in the deck's colour, the plan as a tick, the time past the plan
  // hatched; an untimed run has no tick. The words beside it say the same, so colour is never alone.
  import { barShape } from '../lib/sessions/browse'

  let { planned, timed, ran, label }: { planned: number; timed: number; ran: number; label: string } = $props()
  const shape = $derived(barShape(planned, timed, ran))
</script>

<span class="bar" role="img" aria-label={label} title={label}>
  <i class="fill" class:untimed={shape.tick === null} style="width: {shape.fill}%"></i>
  {#if shape.over.width > 0}<i class="over" style="left: {shape.over.from}%; width: {shape.over.width}%"></i>{/if}
  {#if shape.tick !== null}<i class="tick" style="left: {shape.tick}%"></i>{/if}
</span>

<style>
  .bar {
    position: relative;
    display: block;
    width: 100%;
    height: 10px;
    border-radius: 5px;
    background: var(--rail);
    overflow: visible;
  }

  .bar i {
    position: absolute;
    top: 0;
    bottom: 0;
  }

  .fill {
    left: 0;
    border-radius: 5px 0 0 5px;
    background: var(--k-topic);
  }

  .fill.untimed {
    border-radius: 5px;
    background: repeating-linear-gradient(90deg, var(--k-break) 0 5px, transparent 5px 8px);
  }

  .over {
    background: repeating-linear-gradient(135deg, var(--danger) 0 2px, transparent 2px 4px);
    border-radius: 0 5px 5px 0;
  }

  .tick {
    width: 2px;
    margin-left: -1px;
    top: -3px;
    bottom: -3px;
    background: var(--text);
    border-radius: 1px;
  }
</style>
