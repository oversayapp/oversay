<script lang="ts" module>
  import { writable } from 'svelte/store'
  import type { MoveSummary } from '../lib/workspaces/resources'

  /** What moved, until the note is closed or undone; null otherwise. */
  export const moved = writable<MoveSummary | null>(null)
</script>

<script lang="ts">
  // The one-time note after the update (ADR 0046): resources that lived in decks moved up to their
  // workspaces. Undo puts every file back where it was.
  import { movedNote, undoResourcesMove } from '../lib/workspaces/resources'
  import { attempt, notice } from './errors'
  import { resourcesChanged } from './drop'
  import Icon from './Icon.svelte'

  function undo() {
    attempt(async () => {
      await undoResourcesMove()
      moved.set(null)
      resourcesChanged.update((n) => n + 1)
      notice.set('Put the resources back in their decks. They stay there; the workspaces no longer list them.')
    })
  }
</script>

{#if $moved}
  <div class="moved" role="status">
    <Icon name="check" size={16} />
    <span class="grow">{movedNote($moved)} Resources now belong to the workspace.</span>
    <button onclick={undo}>Undo</button>
    <button class="x" title="Close" aria-label="Close" onclick={() => moved.set(null)}><Icon name="close" size={15} /></button>
  </div>
{/if}

<style>
  .moved {
    display: flex;
    align-items: center;
    gap: 10px;
    margin: 0 0 12px;
    padding: 8px 12px;
    border: 1px solid var(--line);
    border-radius: 10px;
    background: var(--card);
    font-size: 13.5px;
  }

  .grow {
    flex: 1;
  }

  .x {
    border: 0;
    background: none;
    padding: 2px;
    cursor: pointer;
    color: inherit;
  }
</style>
