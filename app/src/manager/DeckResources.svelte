<script lang="ts">
  import type { Snippet } from 'svelte'
  // A deck's resources in the deck editor (ADR 0037): what is in its `resources/` folder,
  // each opened with a click by the system, Finder's way. Files dropped on the window while the
  // deck is open are copied in (drop.ts); a link dragged here, or pasted into Add link, becomes a
  // web link file. Read again when the window comes back to the front, for changes made in Finder.
  import { addLink, droppedUrl, kindLabel, listResources, openResource, openResourcesFolder, sizeLabel, type Resource, type ResourceOwner } from '../lib/decks/resources'
  import { resourcesChanged } from './drop'
  import { attempt } from './errors'
  import Icon from './Icon.svelte'

  let { owner, children }: { owner: ResourceOwner; children?: Snippet } = $props()
  /** Whose they are, in words: a deck or a workspace (ADR 0040). */
  const whose = $derived('workspace' in owner ? 'workspace' : 'deck')

  let items = $state<Resource[] | null>(null)
  let linking = $state(false)
  let linkText = $state('')
  let over = $state(false)

  const load = () => attempt(async () => (items = await listResources(owner)))
  $effect(() => {
    void owner
    void $resourcesChanged
    load()
  })

  function addTyped() {
    const url = linkText.trim()
    if (!url) return
    attempt(async () => {
      await addLink(owner, url)
      linkText = ''
      linking = false
      await load()
    })
  }

  // A link dragged from a browser arrives as text, not a file.
  function dragOver(e: DragEvent) {
    if (!e.dataTransfer?.types.includes('text/uri-list')) return
    e.preventDefault()
    over = true
  }

  function drop(e: DragEvent) {
    over = false
    const url = droppedUrl(e.dataTransfer?.getData('text/uri-list') ?? '')
    if (!url) return
    e.preventDefault()
    attempt(async () => {
      await addLink(owner, url)
      await load()
    })
  }

  const icon = (r: Resource) => (r.kind === 'folder' ? 'folder' : r.kind === 'link' ? 'arrow' : r.kind === 'alias' ? 'popout' : 'file')
</script>

<svelte:window onfocus={load} />

<section class="res" class:over aria-label="Resources" ondragover={dragOver} ondragleave={() => (over = false)} ondrop={drop}>
  <div class="head">
    <h3>Resources</h3>
    <span class="grow"></span>
    <button class="act" onclick={() => (linking = !linking)}>Add link</button>
    <button class="act" title="Show the {whose}'s resources folder" onclick={() => attempt(() => openResourcesFolder(owner))}>Open folder</button>
  </div>
  {#if linking}
    <form
      class="add"
      onsubmit={(e) => {
        e.preventDefault()
        addTyped()
      }}
    >
      <!-- svelte-ignore a11y_autofocus -->
      <input type="url" placeholder="https://…" aria-label="Web link" bind:value={linkText} autofocus />
      <button class="primary" disabled={!linkText.trim()}>Add</button>
    </form>
  {/if}
  {#if items && items.length > 0}
    <ul>
      {#each items as r (r.name)}
        <li>
          <button class="item" title="Open {r.name}" onclick={() => attempt(() => openResource(owner, r.name))}>
            <Icon name={icon(r)} size={15} />
            <span class="name">{r.name}</span>
            <span class="meta">{kindLabel(r)}{r.size !== null && r.kind === 'file' ? ` · ${sizeLabel(r.size)}` : ''}</span>
          </button>
        </li>
      {/each}
    </ul>
  {:else if items}
    <p class="sub">Drop files or a link on this {whose} to keep them with it. They open with a click.</p>
  {/if}
  <!-- What the page adds below its own resources: a workspace's decks' (ADR 0040). -->
  {@render children?.()}
</section>

<style>
  .res {
    border: 1px solid var(--line);
    border-radius: 14px;
    background: var(--card);
    padding: 12px 14px 14px;
    margin-bottom: 14px;
  }

  .res.over {
    border-color: var(--accent);
  }

  .head {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  h3 {
    margin: 0;
    font-size: 12px;
    letter-spacing: 0.07em;
    text-transform: uppercase;
    color: var(--faint);
  }

  .grow {
    flex: 1;
  }

  .act {
    padding: 0;
    border: 0;
    background: none;
    color: var(--accent);
    font: inherit;
    font-size: 13px;
    font-weight: 600;
    white-space: nowrap;
    cursor: pointer;
  }

  .act:hover {
    text-decoration: underline;
  }

  .add {
    display: flex;
    gap: 8px;
    margin-top: 10px;
  }

  .add input {
    flex: 1;
    min-width: 0;
  }

  ul {
    list-style: none;
    margin: 10px 0 0;
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
    cursor: pointer;
  }

  .item:hover,
  .item:focus-visible {
    background: var(--hover, rgba(127, 127, 127, 0.1));
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
