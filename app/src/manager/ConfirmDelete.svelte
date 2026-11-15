<script lang="ts">
  import type { Snippet } from 'svelte'

  // Asking before a delete: the question, a red confirm button and Cancel, in the parent's row.
  let {
    label = 'Delete',
    onconfirm,
    oncancel,
    children,
  }: { label?: string; onconfirm: () => void; oncancel: () => void; children: Snippet } = $props()
</script>

<span class="question">{@render children()}</span>
<button class="danger" onclick={onconfirm}>{label}</button>
<button onclick={oncancel}>Cancel</button>

<style>
  .question {
    flex: 1 1 240px;
  }
</style>
