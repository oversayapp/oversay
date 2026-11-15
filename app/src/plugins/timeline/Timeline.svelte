<script lang="ts">
  // The Timeline overlay: the style chosen in Settings › Overlays (007/02), switched live without
  // reopening: the Waveform, or the Edge strip. Both show the same things from the same model
  // (model.ts); they differ in how they draw it and in the window they need (windows.ts, 007/10).
  // Decks replaced the other styles (ADR 0036).
  import type { PluginContext } from '../types'
  import EdgeStrip from './EdgeStrip.svelte'
  import SquareWave from './SquareWave.svelte'

  let { ctx }: { ctx: PluginContext } = $props()
  const look = $derived(ctx.settings)
</script>

{#if $look.timelineStyle === 'strip'}
  <EdgeStrip {ctx} />
{:else}
  <SquareWave {ctx} />
{/if}
