<script lang="ts">
  import type { Tone } from '../lib/account/summary'

  // The circle with the person's letter, or a dashed outline when signed out, and the sync dot.
  let { initial, tone = null, size = 30 }: { initial: string | null; tone?: Tone | null; size?: number } = $props()
</script>

<span class="av" class:out={initial === null} style:width="{size}px" style:height="{size}px" style:font-size="{Math.round(size * 0.43)}px">
  {#if initial}{initial}{:else}<svg width={size * 0.55} height={size * 0.55} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="8" r="4" /><path d="M4 21c1-4 4-6 8-6s7 2 8 6" /></svg>{/if}
  {#if tone}<span class="dot {tone}" data-tone={tone}></span>{/if}
</span>

<style>
  .av {
    position: relative;
    flex: none;
    border-radius: 50%;
    background: var(--accent-soft);
    color: var(--accent-text);
    font-weight: 700;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .av.out {
    background: var(--card);
    border: 1.5px dashed var(--faint);
    color: var(--muted);
    box-sizing: border-box;
  }
  .dot {
    position: absolute;
    right: -2px;
    bottom: -2px;
    width: 11px;
    height: 11px;
    border-radius: 50%;
    border: 2px solid var(--rail);
    box-sizing: border-box;
  }
  .ok {
    background: var(--ok);
  }
  .busy {
    background: var(--accent);
  }
  .warn {
    background: var(--warn);
  }
</style>
