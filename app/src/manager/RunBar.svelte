<script lang="ts">
  // A run's cards as a bar: each card as wide as the time it took,
  // in its kind's colour, the part past its plan hatched; an untimed card dashed. On Sessions.
  import type { DeckSessionCard } from '../lib/decks/sessions'
  import { ON_TIME_SECONDS } from '../lib/sessions/runs'

  let { cards }: { cards: readonly DeckSessionCard[] } = $props()

  /** The share of a card past its plan, as a percentage of what it took; 0 when it kept to it. */
  const over = (c: DeckSessionCard) =>
    c.plannedSeconds !== null && c.seconds - c.plannedSeconds >= ON_TIME_SECONDS ? ((c.seconds - c.plannedSeconds) / c.seconds) * 100 : 0
</script>

<span class="run">
  {#each cards as c, i (i)}
    <i class:open={c.plannedSeconds === null} style="flex: {Math.max(c.seconds, 4)} 1 0; --c: var(--k-{c.kind})"
      >{#if over(c)}<b style="width: {over(c)}%"></b>{/if}</i
    >
  {/each}
</span>

<style>
  .run {
    display: flex;
    width: 100%;
    gap: 2px;
    height: 10px;
  }

  .run i {
    position: relative;
    min-width: 3px;
    border-radius: 3px;
    background: var(--c);
    overflow: hidden;
  }

  .run i.open {
    background: transparent;
    border: 1.5px dashed var(--c);
  }

  /* Past the card's plan: hatched in the overrun colour. */
  .run b {
    position: absolute;
    top: 0;
    right: 0;
    bottom: 0;
    background: repeating-linear-gradient(135deg, var(--danger) 0 2px, transparent 2px 4px);
  }
</style>
