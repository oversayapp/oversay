<script lang="ts">
  // A workspace's Files and links (ADR 0046): what is in its `resources/` folder, each opened with
  // a click by the system, Finder's way. Empty, a drop zone with Add link and Open folder; with
  // some, tiles for files and folders and plain rows for links on a tinted shelf, with a filter
  // and type chips once there are many. Files dropped on the page are copied in (drop.ts); a link
  // dragged here, or pasted into Add link, becomes a web link file. Read again when the window
  // comes back to the front, for changes made in Finder.
  import { addLink, droppedUrl, kindLabel, listResources, openResource, openResourcesFolder, sizeLabel, type Resource, type ResourceOwner } from '../lib/decks/resources'
  import { filterResources, resourceType, type TypeFilter } from '../lib/workspaces/resources'
  import { resourcesChanged } from './drop'
  import { attempt } from './errors'
  import Icon from './Icon.svelte'

  let { workspaceId, name }: { workspaceId: string; name: string } = $props()
  const owner: ResourceOwner = $derived({ workspace: workspaceId })

  /** Past this many, a filter and the type chips appear. */
  const MANY = 8

  let items = $state<Resource[] | null>(null)
  let linking = $state(false)
  let linkText = $state('')
  let over = $state(false)
  let query = $state('')
  let type = $state<TypeFilter>('all')

  const load = () => attempt(async () => (items = await listResources(owner)))
  $effect(() => {
    void owner
    void $resourcesChanged
    load()
  })

  const shown = $derived(filterResources(items ?? [], query, type))
  const tiles = $derived(shown.filter((r) => resourceType(r) !== 'link'))
  const links = $derived(shown.filter((r) => resourceType(r) === 'link'))
  const many = $derived((items?.length ?? 0) > MANY)

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
  const meta = (r: Resource) => `${kindLabel(r)}${r.size !== null && r.kind === 'file' ? ` · ${sizeLabel(r.size)}` : ''}`
  const CHIPS: [TypeFilter, string][] = [
    ['all', 'All'],
    ['file', 'Files'],
    ['link', 'Links'],
    ['folder', 'Folders'],
  ]
</script>

<svelte:window onfocus={load} />

<section class="shelf" class:over aria-label="Files and links" ondragover={dragOver} ondragleave={() => (over = false)} ondrop={drop}>
  <div class="head">
    {#if many}
      <input class="filter" type="search" placeholder="Filter files and links" aria-label="Filter files and links" bind:value={query} />
      <span class="chips" role="group" aria-label="Type">
        {#each CHIPS as [id, label] (id)}
          <button class="chip" aria-pressed={type === id} onclick={() => (type = id)}>{label}</button>
        {/each}
      </span>
    {/if}
    <span class="grow"></span>
    <button class="act" onclick={() => (linking = !linking)}>Add link</button>
    <button class="act" title="Show {name}'s resources folder" onclick={() => attempt(() => openResourcesFolder(owner))}>Open folder</button>
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
  {#if items && items.length === 0}
    <div class="empty">
      <Icon name="file" size={22} />
      <b>Drop files or a link here</b>
      <p>They are kept with {name}, opened with a click, and never read by Oversay. Up to 200 MB each.</p>
    </div>
  {:else if items}
    <div class="body" class:scroll={many}>
      {#if tiles.length > 0}
        <ul class="tiles">
          {#each tiles as r (r.name)}
            <li>
              <button class="tile" title="Open {r.name}" onclick={() => attempt(() => openResource(owner, r.name))}>
                <Icon name={icon(r)} size={22} />
                <span class="name">{r.name}</span>
                <span class="meta">{meta(r)}</span>
              </button>
            </li>
          {/each}
        </ul>
      {/if}
      {#if links.length > 0}
        <ul class="rows">
          {#each links as r (r.name)}
            <li>
              <button class="row" title="Open {r.name}" onclick={() => attempt(() => openResource(owner, r.name))}>
                <Icon name="arrow" size={15} />
                <span class="name">{r.name.replace(/\.(webloc|url)$/i, '')}</span>
                <span class="meta">Web link</span>
              </button>
            </li>
          {/each}
        </ul>
      {/if}
      {#if shown.length === 0}<p class="sub">Nothing matches.</p>{/if}
    </div>
  {/if}
</section>

<style>
  .shelf {
    border: 1.5px dashed var(--line-strong, var(--line));
    border-radius: 14px;
    background: var(--hover, rgba(127, 127, 127, 0.06));
    padding: 12px 14px 14px;
    margin: 10px 0 14px;
  }

  .shelf.over {
    border-color: var(--accent);
  }

  .head {
    display: flex;
    align-items: center;
    gap: 10px;
    flex-wrap: wrap;
  }

  .filter {
    width: 200px;
    max-width: 100%;
  }

  .chips {
    display: inline-flex;
    gap: 4px;
  }

  .chip {
    padding: 3px 10px;
    border: 1px solid var(--line);
    border-radius: 999px;
    background: none;
    color: inherit;
    font: inherit;
    font-size: 12.5px;
    cursor: pointer;
  }

  .chip[aria-pressed='true'] {
    background: var(--accent-soft, var(--hover));
    border-color: var(--accent);
    color: var(--accent-text, inherit);
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

  .empty {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
    padding: 26px 12px;
    text-align: center;
    color: var(--muted);
  }

  .empty p {
    margin: 0;
    font-size: 13px;
    color: var(--faint);
  }

  .body.scroll {
    max-height: 420px;
    overflow-y: auto;
  }

  ul {
    list-style: none;
    margin: 10px 0 0;
    padding: 0;
  }

  .tiles {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
    gap: 8px;
  }

  .tile {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 4px;
    width: 100%;
    height: 100%;
    padding: 10px;
    border: 1px solid var(--line);
    border-radius: 10px;
    background: var(--card);
    color: inherit;
    text-align: left;
    font: inherit;
    cursor: pointer;
  }

  .tile:hover,
  .tile:focus-visible,
  .row:hover,
  .row:focus-visible {
    border-color: var(--accent);
  }

  .tile .name {
    width: 100%;
    overflow-wrap: anywhere;
    font-size: 13px;
    font-weight: 600;
  }

  .rows {
    margin-top: 10px;
  }

  .row {
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
    padding: 6px 8px;
    border: 1px solid transparent;
    border-radius: 8px;
    background: none;
    color: inherit;
    text-align: left;
    font: inherit;
    cursor: pointer;
  }

  .row .name {
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
