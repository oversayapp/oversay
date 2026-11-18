<script lang="ts">
  // A list in the Library's main pane (epic 036 (#54)): a group of the left pane, as decks (ADR 0036) and
  // workspaces (ADR 0040) together for Recent and Pinned, or decks alone, with Show; a deck opens in the
  // deck editor, a workspace in the Library. Each deck is a card with its cards as a mini timeline.
  // All decks has the filters, and groups a long list by when it changed.
  import { onMount } from 'svelte'
  import { whenLabel } from '../lib/project/recent-view'
  import { count } from '../lib/words'
  import { decks, deleteDeck, loadDecks, renameDeck, type DeckEntry } from '../lib/decks/store'
  import type { LibraryRef } from '../lib/library/groups'
  import { TAG_COLOUR_CSS, tagColour, withPin as withWorkspacePin } from '../lib/workspaces/navigation'
  import { showDeckOnScreen } from '../lib/decks/show'
  import ConfirmDelete from './ConfirmDelete.svelte'
  import AddedBanner from './AddedBanner.svelte'
  import { pasteAsNote } from './drop'
  import { attempt } from './errors'
  import Icon from './Icon.svelte'
  import InlineRename from './InlineRename.svelte'
  import MiniPlan from './MiniPlan.svelte'
  import WorkspacePicker from './WorkspacePicker.svelte'
  import { workspaces } from '../lib/workspaces/store'
  import type { Workspace } from '../lib/workspaces/workspaces'
  import { findWorkspace, workspacesWith } from '../lib/workspaces/workspaces'
  import { goAi, goDeck, goWorkspace, nav } from './route'
  import { readQuickFile } from '../lib/notes/files'
  import { parseNoteDoc } from '../lib/notes/format'
  import { showBlockedBy } from '../lib/notes/show'
  import { session } from '../lib/session/store'
  import { isPinned } from '../lib/settings/quick'
  import { DATE_RANGES, NO_FILTERS, filterChoices, filterDecks, groupByDate, isFiltered, type DateRange, type DeckFilters } from '../lib/decks/list'
  import { changeWorkspaceNav, freshPaths, pins, setPin, workspaceNav } from '../lib/settings/store'
  import { logAction } from '../lib/log'

  let { title, refs, sub = '', grouped = false, filterable = false }: { title: string; refs: LibraryRef[]; sub?: string; grouped?: boolean; filterable?: boolean } = $props()

  onMount(() => attempt(loadDecks))

  let renaming = $state<string | null>(null)
  let deleting = $state<string | null>(null)

  // Filters: tags (any of several), audience, workspace (ADR 0040) and when it last changed.
  let filters = $state<DeckFilters>({ ...NO_FILTERS })
  /** Each deck with the ids of the workspaces it is in, for the workspace filter. */
  const listed = $derived(($decks ?? []).map((d) => ({ ...d, workspaces: workspacesWith($workspaces ?? [], d.id).map((w) => w.id) })))
  const choices = $derived(filterChoices(listed))
  /** A workspace's name, for its filter chip. */
  const workspaceName = (id: string) => findWorkspace($workspaces ?? [], id)?.name ?? id
  const filtering = $derived(isFiltered(filters))
  const toggleTag = (tag: string) =>
    (filters = { ...filters, tags: filters.tags.includes(tag) ? filters.tags.filter((t) => t !== tag) : [...filters.tags, tag] })
  const rangeLabel = (id: DateRange) => DATE_RANGES.find((r) => r.id === id)?.label ?? ''
  /** How many filters are on, for the badge on the Filter button. */
  const filterCount = $derived(filters.tags.length + (filters.audience ? 1 : 0) + (filters.workspace ? 1 : 0) + (filters.range !== 'all' ? 1 : 0))

  // The filters open from the Filter button, and the ones that are on show under the header, each
  // with × to take it off.
  let filterOpen = $state(false)

  // Searching is the app's one search bar; this page only filters.
  /** The decks of the list, narrowed by the filters (on All decks only), with the ids filters need. */
  const inList = $derived(refs.flatMap((r) => (r.kind === 'deck' ? [r.deck] : [])))
  const shown = $derived(filterDecks(listed.filter((d) => inList.some((x) => x.path === d.path)), filters, Date.now()))
  /** What the list shows, in its order: filters hide workspaces, which they don't describe. */
  const rows = $derived(filtering ? refs.filter((r) => r.kind === 'deck' && shown.some((d) => d.path === r.deck.path)) : refs)
  const groups = $derived(grouped ? groupByDate(shown, Date.now()) : [])

  /** Who it is for and when it changed, under its name; its tags show beside as chips. */
  const about = (d: DeckEntry) => (d.unreadable ? 'Could not be read' : [d.audience && `for ${d.audience}`, whenLabel(new Date(d.modifiedMs).toISOString())].filter(Boolean).join(' · '))

  // The ⋯ menu on a row: Rename and Delete (John, 23 Oct: where they usually are).
  let menuFor = $state<string | null>(null)
  // Add to workspace, from the ⋯ menu (ADR 0040).
  let pickingFor = $state<string | null>(null)
  let pickingKey = $state('')
  let menuKey = $state('')
  /** Its length and cards, under its mini timeline. */
  const size = (d: DeckEntry) =>
    [d.seconds > 0 ? `${Math.ceil(d.seconds / 60)} min${d.timingOff ? ', timing off' : ''}` : 'untimed', count(d.cards, 'card')].join(' · ')

  const blocked = $derived(showBlockedBy($session))

  function show(d: DeckEntry) {
    attempt(async () => showDeckOnScreen(parseNoteDoc(await readQuickFile('decks', d.path)), d.name, d.path))
  }

  /** ⌘⇧V (Ctrl+Shift+V) on the list: Markdown on the clipboard becomes a deck. Not while typing. */
  function onKey(e: KeyboardEvent) {
    const typing = e.target instanceof HTMLElement && e.target.closest('input, textarea, [contenteditable]') !== null
    if (!typing && !$nav.deck && e.shiftKey && (e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'v') {
      e.preventDefault()
      pasteAsNote()
    }
  }
</script>

<svelte:window
  onkeydown={(e) => {
    if (menuFor && e.key === 'Escape') menuFor = null
    else if (filterOpen && e.key === 'Escape') filterOpen = false
    else onKey(e)
  }}
  onclick={(e) => {
    if (menuFor && !(e.target as HTMLElement).closest('.more')) menuFor = null
    if (filterOpen && !(e.target as HTMLElement).closest('.fwrap')) filterOpen = false
  }}
/>

{#snippet item(d: DeckEntry)}
  {#if renaming === d.path}
    <div class="inline">
      <InlineRename
        initial={d.name}
        label="Deck name"
        onrename={(name) => {
          renaming = null
          attempt(() => renameDeck(d.path, name))
        }}
        oncancel={() => (renaming = null)}
      />
    </div>
  {:else if deleting === d.path}
    <div class="inline">
      <ConfirmDelete
        label="Move to Trash"
        onconfirm={() => {
          deleting = null
          attempt(() => deleteDeck(d.path))
        }}
        oncancel={() => (deleting = null)}>Delete “{d.name}”? It moves to the Trash, where you can get it back.</ConfirmDelete
      >
    </div>
  {:else}
    {@render row(d, 'all')}
  {/if}
{/snippet}

{#snippet row(d: DeckEntry, key: string)}
  {@const pinned = isPinned($pins, 'deck', d.path)}
  <button
    class="pin"
    class:on={pinned}
    title={pinned ? 'Unpin' : 'Pin to the top'}
    aria-label="{pinned ? 'Unpin' : 'Pin'} {d.name}"
    aria-pressed={pinned}
    onclick={() => attempt(() => setPin('deck', d.path, !pinned, d.id || undefined))}><Icon name="pin" size={17} /></button
  >
  <!-- The card opens the deck: its name and what is under it. -->
  <button class="what" disabled={d.unreadable} onclick={() => goDeck(d.path)}>
    <span class="t">{d.name}{#if $freshPaths.has(d.path)} <span class="new-tag">New</span>{/if}</span>
    <span class="sub">
      <span class="p">{about(d)}</span>
      {#each d.tags as tag (tag)}<span class="chip">{tag}</span>{/each}
    </span>
  </button>
  <button class="plan" disabled={d.unreadable} tabindex="-1" aria-hidden="true" onclick={() => goDeck(d.path)}>
    <MiniPlan bar={d.bar} />
    <span class="p num">{size(d)}</span>
  </button>
  <div class="acts">
    <button
      class="primary"
      disabled={!!blocked || d.unreadable || d.cards === 0}
      title={blocked ?? (d.cards === 0 ? 'Add a card to show' : 'Show on screen')}
      onclick={() => show(d)}><Icon name="show" size={15} /> Show</button
    >
    <div class="more">
      <button
        class="ibtn"
        aria-haspopup="menu"
        aria-expanded={menuFor === d.path && menuKey === key}
        aria-label="More actions for {d.name}"
        title="More actions"
        onclick={() => {
          const open = menuFor === d.path && menuKey === key
          menuFor = open ? null : d.path
          menuKey = key
        }}><Icon name="more" size={18} /></button
      >
      {#if menuFor === d.path && menuKey === key}
        <div class="menu" role="menu">
          <button
            role="menuitem"
            onclick={() => {
              menuFor = null
              renaming = d.path
            }}><Icon name="edit" size={15} /> Rename</button
          >
          <button
            role="menuitem"
            data-picker-toggle
            onclick={() => {
              menuFor = null
              pickingFor = d.path
              pickingKey = key
            }}><Icon name="plus" size={15} /> Add to workspace…</button
          >
          <button
            role="menuitem"
            class="danger"
            onclick={() => {
              menuFor = null
              deleting = d.path
            }}><Icon name="trash" size={15} /> Delete…</button
          >
        </div>
      {/if}
      {#if pickingFor === d.path && pickingKey === key}
        <div class="pickat"><WorkspacePicker deckId={d.id} onclose={() => (pickingFor = null)} /></div>
      {/if}
    </div>
  </div>
{/snippet}


{#snippet spaceRow(w: Workspace)}
  {@const on = $workspaceNav.pins.some((p) => p.id === w.id)}
  <button
    class="pin"
    class:on
    title={on ? 'Unpin' : 'Pin to the top'}
    aria-label="{on ? 'Unpin' : 'Pin'} {w.name}"
    aria-pressed={on}
    onclick={() => {
      logAction(on ? 'unpin workspace' : 'pin workspace', w.name)
      attempt(() => changeWorkspaceNav((nav) => withWorkspacePin(nav, w.id, !on, new Date().toISOString())))
    }}><Icon name="pin" size={17} /></button
  >
  <button class="what" onclick={() => goWorkspace(w.id)}>
    <span class="t"><span class="wdot" style="background: {TAG_COLOUR_CSS[tagColour($workspaceNav, w.tags[0] ?? w.name)]}" aria-hidden="true"></span>{w.name} <span class="ws-mark">Workspace</span></span>
    <span class="sub">
      <span class="p">{count(w.decks.length, 'deck')}</span>
      {#each w.tags as tag (tag)}<span class="chip">{tag}</span>{/each}
    </span>
  </button>
  <span class="plan"></span>
  <div class="acts"><button onclick={() => goWorkspace(w.id)}>Open</button></div>
{/snippet}

<div class="page">
  <header class="phead">
    <h1>{title}</h1>
    <div class="fwrap">
      {#if filterable && $decks && $decks.length > 0}
        <button
          class="ftoggle"
          class:on={filtering}
          aria-haspopup="dialog"
          aria-expanded={filterOpen}
          title="Filter"
          aria-label="Filter decks{filterCount ? `, ${filterCount} on` : ''}"
          onclick={() => (filterOpen = !filterOpen)}
          ><Icon name="filter" size={16} /> Filter{#if filterCount}<span class="badge">{filterCount}</span>{/if}</button
        >
      {/if}
      {#if filterOpen && $decks}
        <div class="fpanel" role="dialog" aria-label="Filter decks">
          {#if choices.tags.length}
            <h4>Tags</h4>
            <div class="opts">
              {#each choices.tags as tag (tag)}
                <button class="fchip" class:on={filters.tags.includes(tag)} aria-pressed={filters.tags.includes(tag)} onclick={() => toggleTag(tag)}>{tag}</button>
              {/each}
            </div>
          {/if}
          {#if choices.audiences.length}
            <h4>Audience</h4>
            <div class="opts">
              {#each choices.audiences as a (a)}
                {@const on = filters.audience === a}
                <button class="fchip" class:on aria-pressed={on} onclick={() => (filters = { ...filters, audience: on ? '' : a })}>{a}</button>
              {/each}
            </div>
          {/if}
          {#if choices.workspaces.length}
            <h4>Workspace</h4>
            <div class="opts">
              {#each choices.workspaces as id (id)}
                {@const on = filters.workspace === id}
                <button class="fchip" class:on aria-pressed={on} onclick={() => (filters = { ...filters, workspace: on ? '' : id })}>{workspaceName(id)}</button>
              {/each}
            </div>
          {/if}
          <h4>Last changed</h4>
          <div class="opts">
            {#each DATE_RANGES as r (r.id)}
              {@const on = filters.range === r.id}
              <button class="fchip" class:on aria-pressed={on} onclick={() => (filters = { ...filters, range: r.id })}>{r.label}</button>
            {/each}
          </div>
          <div class="ffoot">
            <span class="fcount">{shown.length} of {$decks.length} decks</span>
            <button class="link" disabled={!filtering} onclick={() => (filters = { ...NO_FILTERS })}>Clear all</button>
          </div>
        </div>
      {/if}
    </div>
    <div class="hacts">
      <button title="Make a deck from Markdown you copied (⌘⇧V or Ctrl+Shift+V)" onclick={pasteAsNote}>Paste as deck</button>
    </div>
  </header>
  {#if sub}<p class="muted">{sub}</p>{/if}
  <AddedBanner />
  {#if $decks && filtering}
    <!-- The filters that are on, each with × to take it off. -->
    <div class="active" role="group" aria-label="Filters on">
      <span class="fcount">{shown.length} of {$decks.length}</span>
      {#each filters.tags as tag (tag)}
        <button class="token" aria-label="Remove tag {tag}" onclick={() => toggleTag(tag)}>{tag} <Icon name="close" size={12} /></button>
      {/each}
      {#if filters.audience}
        <button class="token" aria-label="Remove audience {filters.audience}" onclick={() => (filters = { ...filters, audience: '' })}
          >For {filters.audience} <Icon name="close" size={12} /></button
        >
      {/if}
      {#if filters.workspace}
        <button class="token" aria-label="Remove workspace {workspaceName(filters.workspace)}" onclick={() => (filters = { ...filters, workspace: '' })}
          >{workspaceName(filters.workspace)} <Icon name="close" size={12} /></button
        >
      {/if}
      {#if filters.range !== 'all'}
        <button class="token" aria-label="Remove {rangeLabel(filters.range)}" onclick={() => (filters = { ...filters, range: 'all' })}
          >{rangeLabel(filters.range)} <Icon name="close" size={12} /></button
        >
      {/if}
      <button class="link" onclick={() => (filters = { ...NO_FILTERS })}>Clear</button>
    </div>
  {/if}

  {#if $decks && refs.length === 0}
    <div class="empty">
      <p>{title === 'All decks' ? 'No decks yet. A deck is a few cards with points under each, kept in a folder of its own in Documents › Oversay › Decks.' : 'Nothing here yet.'}</p>
      {#if title === 'All decks'}<button onclick={goAi}><Icon name="ai" size={16} /> Ask your AI for one</button>{/if}
    </div>
  {:else if $decks}
    {#if grouped}
      {#each groups as g (g.label)}
        <h3 class="sec">{g.label} <span class="cnt">{g.decks.length}</span></h3>
        <ul class="decklist">
          {#each g.decks as d (d.path)}<li class:editing={renaming === d.path || deleting === d.path}>{@render item(d)}</li>{/each}
        </ul>
      {/each}
    {:else}
      <ul class="decklist">
        {#each rows as r (r.kind === 'deck' ? r.deck.path : r.workspace.id)}
          {#if r.kind === 'deck'}
            <li class:editing={renaming === r.deck.path || deleting === r.deck.path}>{@render item(r.deck)}</li>
          {:else}
            <li class="space">{@render spaceRow(r.workspace)}</li>
          {/if}
        {/each}
      </ul>
    {/if}
    {#if filtering && shown.length === 0}
      <p class="muted">No decks match these filters.</p>
    {/if}
  {/if}
</div>

<style>
  .page {
    max-width: 960px;
    margin: 0 auto;
    padding: 22px 28px 48px;
  }

  .phead {
    display: flex;
    align-items: center;
    gap: 10px;
    flex-wrap: wrap;
  }

  .phead h1 {
    margin-right: auto;
  }

  .hacts {
    display: flex;
    gap: 10px;
  }

  .phead button {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    white-space: nowrap;
  }

  .fwrap {
    position: relative;
  }

  .ftoggle {
    position: relative;
  }

  .ftoggle[aria-expanded='true'] {
    background: var(--hover);
  }

  .ftoggle.on {
    color: var(--accent-text);
    border-color: color-mix(in srgb, var(--accent) 45%, transparent);
  }

  .badge {
    position: absolute;
    top: -3px;
    right: -3px;
    min-width: 15px;
    height: 15px;
    padding: 0 4px;
    border-radius: 99px;
    background: var(--accent);
    color: var(--on-accent);
    font-size: 10px;
    font-weight: 700;
    line-height: 15px;
    text-align: center;
  }

  .fpanel {
    position: absolute;
    top: calc(100% + 8px);
    right: 0;
    z-index: 30;
    width: min(360px, calc(100vw - 32px));
    padding: 6px 16px 12px;
    background: var(--card);
    border: 1px solid var(--line-strong);
    border-radius: 12px;
    box-shadow: 0 12px 34px rgba(0, 0, 0, 0.18);
  }

  .fpanel h4 {
    margin: 12px 0 7px;
    font-size: 11.5px;
    letter-spacing: 0.07em;
    text-transform: uppercase;
    color: var(--faint);
  }

  .opts {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }

  .ffoot {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-top: 14px;
    padding-top: 10px;
    border-top: 1px solid var(--line);
  }

  .sec {
    margin: 22px 0 8px;
    font-size: 12px;
    letter-spacing: 0.07em;
    text-transform: uppercase;
    color: var(--faint);
  }

  .fchip {
    padding: 3px 11px;
    border-radius: 99px;
    border: 1px solid var(--line-strong);
    background: var(--card);
    color: var(--muted);
    font-size: 13px;
    font-weight: 600;
  }

  .fchip.on {
    background: var(--accent-soft);
    border-color: color-mix(in srgb, var(--accent) 45%, transparent);
    color: var(--accent-text);
  }

  .fcount {
    font-size: 12.5px;
    color: var(--muted);
  }

  /* The filters that are on, under the header. */
  .active {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px 8px;
    margin: 14px 0 4px;
  }

  .token {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    padding: 3px 8px 3px 11px;
    border-radius: 99px;
    border: 1px solid color-mix(in srgb, var(--accent) 45%, transparent);
    background: var(--accent-soft);
    color: var(--accent-text);
    font-size: 13px;
    font-weight: 600;
  }

  .link {
    border: 0;
    background: none;
    color: var(--accent-text);
    font-weight: 600;
    font-size: 13px;
    padding: 2px 4px;
  }

  .link:disabled {
    color: var(--faint);
  }

  .cnt {
    font-weight: 500;
    letter-spacing: 0;
    color: var(--faint);
  }

  /* Each deck a card, as a favourite talk is on Favourites: pin, name, its cards as a mini timeline, actions. */
  .decklist {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  li {
    display: grid;
    grid-template-columns: 30px minmax(0, 1fr) minmax(140px, 220px) auto;
    gap: 14px;
    align-items: center;
    padding: 12px 14px;
    border: 1px solid var(--line);
    border-radius: 14px;
    background: var(--card);
  }

  li:hover {
    border-color: var(--line-strong);
  }

  li.editing {
    display: block;
  }

  /* The pinned decks end with a rule before the rest. */
  .pin {
    border: 0;
    background: none;
    padding: 4px;
    border-radius: 7px;
    color: var(--faint);
    display: inline-flex;
    justify-content: center;
  }

  .pin:hover {
    background: var(--hover);
  }

  .pin.on {
    color: var(--accent-text);
  }

  .what {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    min-width: 0;
    border: 0;
    background: none;
    padding: 0;
    text-align: left;
    font-weight: 400;
  }

  .what:hover:not(:disabled),
  .plan:hover:not(:disabled) {
    background: none;
  }

  .sub {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 4px 6px;
    max-width: 100%;
    min-width: 0;
  }

  .chip {
    padding: 0 7px;
    border-radius: 99px;
    background: var(--accent-soft);
    color: var(--accent-text);
    font-size: 11.5px;
    font-weight: 600;
    line-height: 18px;
  }

  .t {
    max-width: 100%;
    font-weight: 650;
    font-size: 15px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .p {
    max-width: 100%;
    font-size: 12.5px;
    color: var(--muted);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  /* A button, so it fills its column only when told to: the mini timeline is the column's width. */
  .plan {
    display: flex;
    flex-direction: column;
    align-items: stretch;
    width: 100%;
    gap: 4px;
    border: 0;
    background: none;
    padding: 0;
    text-align: left;
    font-weight: 400;
  }

  .acts {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .acts button {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    white-space: nowrap;
  }

  /* The ⋯ menu: Rename and Delete, as the talk's menu has them. */
  .more {
    position: relative;
  }

  .acts .ibtn {
    border: 0;
    background: none;
    padding: 6px;
    color: var(--muted);
    border-radius: 8px;
  }

  .acts .ibtn:hover {
    background: var(--hover);
  }

  .menu {
    position: absolute;
    top: calc(100% + 6px);
    right: 0;
    z-index: 20;
    min-width: 170px;
    padding: 6px;
    background: var(--card);
    border: 1px solid var(--line-strong);
    border-radius: 12px;
    box-shadow: 0 10px 30px rgba(0, 0, 0, 0.18);
  }

  .menu button {
    display: flex;
    align-items: center;
    gap: 10px;
    width: 100%;
    border: 0;
    background: none;
    border-radius: 8px;
    padding: 8px 10px;
    text-align: left;
    color: var(--text);
    font-weight: 500;
  }

  .menu button:hover {
    background: var(--hover);
  }

  /* The picker opens under the ⋯ button, towards the page. */
  .pickat :global(.picker) {
    left: auto;
    right: 0;
  }

  .menu button.danger {
    color: var(--danger);
  }

  .inline {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
  }

  .empty {
    margin-top: 18px;
    padding: 26px;
    border: 1.5px dashed var(--line-strong);
    border-radius: 14px;
    text-align: center;
    color: var(--muted);
  }

  .empty button {
    display: inline-flex;
    align-items: center;
    gap: 6px;
  }

  .wdot {
    display: inline-block;
    width: 10px;
    height: 10px;
    border-radius: 3px;
    margin-right: 8px;
  }

  .ws-mark {
    font-size: 10.5px;
    font-weight: 700;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: var(--muted);
    margin-left: 6px;
  }

  .num {
    font-variant-numeric: tabular-nums;
  }

  /* Narrow: the mini timeline gives way to the name. Last, so it wins over the rules above. */
  @media (max-width: 760px) {
    li {
      grid-template-columns: 30px minmax(0, 1fr) auto;
    }

    .plan {
      display: none;
    }
  }

  /* Appeared outside Oversay and not opened yet (ADR 0034). */
  .new-tag {
    font-size: 10.5px;
    font-weight: 700;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: var(--on-accent);
    background: var(--accent);
    border-radius: 6px;
    padding: 1px 6px;
    margin-left: 6px;
    vertical-align: 1px;
  }
</style>
