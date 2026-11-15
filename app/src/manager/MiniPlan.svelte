<script lang="ts">
  // A deck's cards as a mini timeline in their kinds' colours, untimed cards dashed: on the
  // Decks list and a collection's page.
  import type { SegmentKind } from '../lib/project/types'

  let { bar }: { bar: { kind: SegmentKind; seconds: number | null }[] } = $props()

  // The timed cards' share of the bar; an untimed card takes a minute's width, dashed.
  const width = (seconds: number | null) => Math.max(seconds ?? 60, 1)
</script>

<span class="mini">
  {#each bar as c, i (i)}<i class:open={c.seconds === null} style="flex: {width(c.seconds)} 1 0; --c: var(--k-{c.kind})"></i>{/each}
</span>

<style>
  .mini {
    display: flex;
    width: 100%;
    gap: 2px;
    height: 10px;
  }

  .mini i {
    min-width: 3px;
    border-radius: 3px;
    background: var(--c);
  }

  .mini i.open {
    background: transparent;
    border: 1.5px dashed var(--c);
  }
</style>
