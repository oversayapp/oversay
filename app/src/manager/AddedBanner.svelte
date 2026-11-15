<script lang="ts">
  // What the last drop or paste added, on Decks, with Open, Show and Undo.
  import { quickName, readQuickFile } from '../lib/notes/files'
  import { parseNoteDoc } from '../lib/notes/format'
  import { showBlockedBy } from '../lib/notes/show'
  import { showDeckOnScreen } from '../lib/decks/show'
  import { decks } from '../lib/decks/store'
  import { session } from '../lib/session/store'
  import { markOpened } from '../lib/settings/store'
  import { count } from '../lib/words'
  import { added, undoAdded } from './drop'
  import { attempt } from './errors'
  import Icon from './Icon.svelte'
  import { goDeck } from './route'

  const one = $derived($added && $added.paths.length === 1 ? ($decks ?? []).find((d) => d.path === $added!.paths[0]) : undefined)

  function show(path: string) {
    attempt(async () => {
      await markOpened('deck', path)
      const doc = parseNoteDoc(await readQuickFile('decks', path))
      await showDeckOnScreen(doc, quickName(path), path)
    })
  }

</script>

{#if $added}
  <div class="added" class:warn={$added.renamed.length > 0} role="status">
    <Icon name="check" size={16} />
    <span class="grow">
      {#if $added.renamed.length > 0}
        {#each $added.renamed as [asked, got] (got)}
          You already have a deck called <b>{asked}</b>, so this one was added as <b>{got}</b>.
        {/each}
      {:else if one}
        Added <b>{one.name}</b> to Decks: {count(one.cards, 'card')}.
      {:else}
        Added {count($added.paths.length, 'deck')} to Decks.
      {/if}
    </span>
    {#if $added.paths.length === 1}
      <button onclick={() => goDeck($added!.paths[0])}>Open</button>
      <button class="primary" disabled={showBlockedBy($session) !== null} onclick={() => show($added!.paths[0])}><Icon name="show" size={15} /> Show</button>
    {/if}
    <button onclick={undoAdded}>Undo</button>
    <button class="x" title="Close" aria-label="Close" onclick={() => added.set(null)}><Icon name="close" size={15} /></button>
  </div>
{/if}

<style>
  .added {
    display: flex;
    align-items: center;
    gap: 10px;
    flex-wrap: wrap;
    margin: 14px 0;
    padding: 9px 12px;
    border-radius: 12px;
    background: var(--ok-bg);
    font-size: 13.5px;
  }

  .added.warn {
    background: var(--warn-bg);
  }

  .grow {
    flex: 1;
    min-width: 180px;
    overflow-wrap: anywhere;
  }

  button {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    padding: 4px 10px;
    font-size: 13px;
  }

  .x {
    border: 0;
    background: none;
    padding: 4px;
    color: var(--muted);
  }
</style>
