<script lang="ts">
  // A workspace's page, under its own resources (ADR 0040):
  // From its decks, each of its decks' own resources under the deck's name. They open with a click,
  // as in the deck; adding or taking one away is done in the deck, which Open deck goes to.
  import { listResources, kindLabel, openResource, sizeLabel, type Resource } from '../lib/decks/resources'
  import type { DeckEntry } from '../lib/decks/store'
  import { attempt } from './errors'
  import Icon from './Icon.svelte'
  import { goDeck } from './route'

  let { decks }: { decks: DeckEntry[] } = $props()

  /** Each deck's resources, by its path; a deck with none, or none yet, is left out. */
  let found = $state<{ deck: DeckEntry; items: Resource[] }[] | null>(null)

  async function load() {
    const all = await Promise.all(decks.map(async (deck) => ({ deck, items: await listResources({ deck: deck.path }).catch(() => []) })))
    found = all.filter((d) => d.items.length > 0)
  }
  $effect(() => {
    void decks
    attempt(load)
  })

  const icon = (r: Resource) => (r.kind === 'folder' ? 'folder' : r.kind === 'link' ? 'arrow' : r.kind === 'alias' ? 'popout' : 'file')
</script>

<svelte:window onfocus={() => attempt(load)} />

<div class="from" aria-label="From its decks">
  <h4>From its decks</h4>
  {#if found && found.length === 0}
    <p class="sub">None of its decks has resources yet.</p>
  {:else if found}
    {#each found as { deck, items } (deck.path)}
      <div class="dh">
        <span class="dn" title={deck.name}>{deck.name}</span>
        <button class="act" onclick={() => goDeck(deck.path)}>Open deck</button>
      </div>
      <ul>
        {#each items as r (r.name)}
          <li>
            <button class="item" title="Open {r.name}" onclick={() => attempt(() => openResource({ deck: deck.path }, r.name))}>
              <Icon name={icon(r)} size={15} />
              <span class="name">{r.name}</span>
              <span class="meta">{kindLabel(r)}{r.size !== null && r.kind === 'file' ? ` · ${sizeLabel(r.size)}` : ''}</span>
            </button>
          </li>
        {/each}
      </ul>
    {/each}
  {/if}
</div>

<style>
  .from {
    border-top: 1px solid var(--line);
    margin-top: 12px;
    padding-top: 10px;
  }

  h4 {
    margin: 0;
    font-size: 12px;
    letter-spacing: 0.07em;
    text-transform: uppercase;
    color: var(--faint);
  }

  .dh {
    display: flex;
    align-items: center;
    gap: 10px;
    margin: 10px 0 0;
  }

  .dn {
    flex: 1;
    min-width: 0;
    font-weight: 650;
    font-size: 13.5px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .act {
    padding: 0;
    border: 0;
    background: none;
    color: var(--accent);
    font-size: 13px;
    font-weight: 600;
    white-space: nowrap;
  }

  .act:hover {
    text-decoration: underline;
  }

  ul {
    list-style: none;
    margin: 2px 0 0;
    padding: 0;
  }

  .item {
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
    padding: 6px 4px;
    border: 0;
    border-radius: 8px;
    background: none;
    color: inherit;
    text-align: left;
    font: inherit;
  }

  .item:hover,
  .item:focus-visible {
    background: var(--hover);
  }

  .name {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .meta {
    flex-shrink: 0;
    font-size: 12px;
    color: var(--faint);
  }

  .sub {
    margin: 8px 0 0;
    font-size: 12.5px;
    color: var(--faint);
  }
</style>
