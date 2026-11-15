<script lang="ts">
  // Styled spans from lib/markdown.ts, as text: nothing here is ever HTML (ADR 0025).
  import type { Span } from '../markdown'

  let { spans }: { spans: Span[] } = $props()
</script>

{#each spans as s, i (i)}{#if s.code}<code>{s.text}</code>{:else if s.bold && s.italic}<strong><em>{s.text}</em></strong>{:else if s.bold}<strong>{s.text}</strong>{:else if s.italic}<em>{s.text}</em>{:else}{s.text}{/if}{/each}

<style>
  strong {
    font-weight: 700;
  }

  code {
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    font-size: 0.9em;
    padding: 0 0.25em;
    border-radius: 4px;
    background: color-mix(in srgb, currentColor 14%, transparent);
  }
</style>
