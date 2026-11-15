<script lang="ts">
  // A talking point or hint with its Markdown (ADR 0025): its lines, then its sub-list one
  // level deep. Shared by the Talking Points overlay, the one card (E) and the editor's side panel
  //, so they always agree. `firstLine` (lib/markdown.ts) with `Spans` is the short form.
  import { parseNote } from '../markdown'
  import Spans from './Spans.svelte'

  let { text }: { text: string } = $props()
  const blocks = $derived(parseNote(text))
</script>

{#each blocks as block, i (i)}
  {#if block.kind === 'line'}
    <span class="line"><Spans spans={block.spans} /></span>
  {:else if block.ordered}
    <ol class="sub">
      {#each block.items as item, j (j)}<li><Spans spans={item} /></li>{/each}
    </ol>
  {:else}
    <ul class="sub">
      {#each block.items as item, j (j)}<li><Spans spans={item} /></li>{/each}
    </ul>
  {/if}
{/each}

<style>
  .line {
    display: block;
  }

  .sub {
    margin: 3px 0 0;
    padding-left: 1.2em;
    font-size: 0.875em;
    opacity: 0.8;
  }

  .sub li {
    margin: 1px 0;
  }

  /* Overlays number points with their own counter; the sub-list keeps the browser's markers. */
  ol.sub {
    list-style: decimal;
  }

  ul.sub {
    list-style: '– ';
  }

</style>
