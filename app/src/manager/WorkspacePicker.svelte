<script lang="ts">
  // Add to workspace (ADR 0040): every workspace, each ticked when the deck is in it; a click
  // adds the deck or takes it out. The deck itself never moves.
  import { addDeckToWorkspace, removeDeckFromWorkspace, workspaces } from '../lib/workspaces/store'
  import { sortWorkspaces } from '../lib/workspaces/workspaces'
  import { attempt } from './errors'
  import Icon from './Icon.svelte'
  import { goWorkspaces } from './route'

  let { deckId, onclose }: { deckId: string; onclose: () => void } = $props()

  const usable = $derived(sortWorkspaces(($workspaces ?? []).filter((w) => w.id && !w.problem)))

  function toggle(id: string, inIt: boolean) {
    attempt(() => (inIt ? removeDeckFromWorkspace(id, deckId) : addDeckToWorkspace(id, deckId)))
  }
</script>

<svelte:window
  onkeydown={(e) => e.key === 'Escape' && onclose()}
  onclick={(e) => {
    const t = e.target as HTMLElement
    if (!t.closest('.picker') && !t.closest('[data-picker-toggle]')) onclose()
  }}
/>

<div class="picker" role="dialog" aria-label="Add to workspace">
  {#if !deckId}
    <p class="muted">This deck has no id yet; try again in a moment.</p>
  {:else if usable.length === 0}
    <p class="muted">No workspaces yet.</p>
    <button class="link" onclick={() => (onclose(), goWorkspaces())}>Make one in Workspaces</button>
  {:else}
    {#each usable as w (w.id)}
      {@const inIt = w.decks.includes(deckId)}
      <button role="menuitemcheckbox" aria-checked={inIt} onclick={() => toggle(w.id, inIt)}>
        <span class="box" class:on={inIt}>{#if inIt}<Icon name="check" size={12} />{/if}</span>
        <span class="name">{w.name}</span>
        {#if w.tags.length}<span class="tags">{w.tags.join(', ')}</span>{/if}
      </button>
    {/each}
  {/if}
</div>

<style>
  .picker {
    position: absolute;
    top: calc(100% + 6px);
    left: 0;
    z-index: 40;
    width: 280px;
    max-height: 360px;
    overflow: auto;
    padding: 4px 6px 8px;
    background: var(--card);
    border: 1px solid var(--line-strong);
    border-radius: 12px;
    box-shadow: 0 12px 34px rgba(0, 0, 0, 0.18);
    text-align: left;
  }

  button[role='menuitemcheckbox'] {
    display: flex;
    align-items: center;
    gap: 9px;
    width: 100%;
    border: 0;
    background: none;
    border-radius: 8px;
    padding: 7px 8px;
    text-align: left;
    color: var(--text);
    font-weight: 500;
  }

  button[role='menuitemcheckbox']:hover {
    background: var(--hover);
  }

  .box {
    flex: none;
    width: 16px;
    height: 16px;
    border: 1.5px solid var(--line-strong);
    border-radius: 4px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    color: var(--on-accent);
  }

  .box.on {
    background: var(--accent);
    border-color: var(--accent);
  }

  .name {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .tags {
    margin-left: auto;
    padding-left: 8px;
    font-size: 12px;
    color: var(--faint);
    white-space: nowrap;
  }

  .muted {
    margin: 10px 8px 4px;
  }

  .link {
    border: 0;
    background: none;
    color: var(--accent-text);
    font-weight: 600;
    padding: 4px 8px;
  }
</style>
