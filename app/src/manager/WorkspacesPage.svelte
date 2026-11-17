<script lang="ts">
  // Workspaces (ADR 0039, 0040; John, 27 Oct): the rail's
  // Workspaces item. A sidebar like a mail app's folders: All workspaces, Pinned, Recent, each tag
  // with its colour and how many workspaces have it, and Untagged; the workspaces of the one picked
  // are listed beside it. Where the sidebar is, the pins, Recent and the tags' colours are kept in
  // settings (lib/workspaces/navigation.ts). A tag's ⋯ renames, recolours, merges or deletes it.
  import { onMount } from 'svelte'
  import { count } from '../lib/words'
  import { decks } from '../lib/decks/store'
  import { changeWorkspaceNav, workspaceNav } from '../lib/settings/store'
  import { changeTag, createWorkspace, deleteWorkspace, loadWorkspaces, updateWorkspace, workspaces } from '../lib/workspaces/store'
  import { dateLabel, hasTag, type Workspace } from '../lib/workspaces/workspaces'
  import {
    openedLabel,
    placeTag,
    sidebarTags,
    TAG_COLOUR_CSS,
    TAG_COLOURS,
    tagColour,
    withNewTag,
    withPin,
    withPinOrder,
    workspacesAt,
    type Place,
    type Sort,
    type TagColour,
  } from '../lib/workspaces/navigation'
  import { dropIndex, moveItemTo } from '../lib/project/lists'
  import { logAction } from '../lib/log'
  import ConfirmDelete from './ConfirmDelete.svelte'
  import WorkspaceForm from './WorkspaceForm.svelte'
  import { attempt } from './errors'
  import Icon from './Icon.svelte'
  import InlineRename from './InlineRename.svelte'
  import { goWorkspace } from './route'

  onMount(() => attempt(loadWorkspaces))

  const all = $derived($workspaces ?? [])
  const tags = $derived(sidebarTags(all, $workspaceNav))
  /** Where the sidebar is; a tag that has gone (renamed in Finder) goes back to All. */
  const place = $derived.by((): Place => {
    const t = placeTag($workspaceNav.place)
    return t && !tags.some((x) => x.toLowerCase() === t.toLowerCase()) ? 'all' : $workspaceNav.place
  })
  const tag = $derived(placeTag(place))
  const list = $derived(workspacesAt(all, $workspaceNav, place))
  const title = $derived(tag ?? { all: 'All workspaces', pinned: 'Pinned', recent: 'Recent', untagged: 'Untagged' }[place as string] ?? '')
  const known = $derived(new Set(($decks ?? []).map((d) => d.id).filter(Boolean)))
  const pinned = (w: Workspace) => $workspaceNav.pins.some((p) => p.id === w.id)

  let adding = $state(false)
  let menuFor = $state<string | null>(null)
  let renaming = $state<string | null>(null)
  let deleting = $state<string | null>(null)
  /** The tag whose ⋯ menu is open, and what it is showing: its actions, colours, or tags to merge into. */
  let tagMenu = $state<{ tag: string; show: 'actions' | 'colour' | 'merge' } | null>(null)
  let renamingTag = $state<string | null>(null)
  let deletingTag = $state<string | null>(null)
  let makingTag = $state(false)

  const go = (p: Place) => {
    adding = false
    attempt(() => changeWorkspaceNav((nav) => ({ ...nav, place: p })))
  }
  const setSort = (sort: Sort) => attempt(() => changeWorkspaceNav((nav) => ({ ...nav, sort })))
  function pin(w: Workspace) {
    const on = !pinned(w)
    logAction(on ? 'pin workspace' : 'unpin workspace', w.name)
    attempt(() => changeWorkspaceNav((nav) => withPin(nav, w.id, on, new Date().toISOString())))
  }
  function setColour(t: string, colour: TagColour) {
    tagMenu = null
    logAction('tag colour', `${t}: ${colour}`)
    attempt(() => changeWorkspaceNav((nav) => ({ ...nav, colours: { ...nav.colours, [t.toLowerCase()]: colour } })))
  }
  const uses = (t: string) => all.filter((w) => hasTag(w, t)).length

  /** "2 Jun 2026 · Zoom · 3 decks", with any that have gone, and when it was opened on Recent. */
  function about(w: Workspace): string {
    if (w.problem) return 'Could not be read'
    const gone = w.decks.filter((id) => $decks && !known.has(id)).length
    const opened = place === 'recent' ? $workspaceNav.opened.find((o) => o.id === w.id) : null
    return [dateLabel(w.when), w.where, count(w.decks.length, 'deck'), gone && `${gone} gone`, opened && `opened ${openedLabel(opened.at, Date.now())}`]
      .filter(Boolean)
      .join(' · ')
  }

  // Pinned is in the order you pin, and dragged into another by a row's grip (or Alt+↑/↓).
  let listEl = $state<HTMLElement | null>(null)
  let drag = $state<{ from: number; position: number } | null>(null)
  const midpoints = () =>
    [...(listEl?.querySelectorAll<HTMLElement>('[data-index]') ?? [])].map((row) => {
      const box = row.getBoundingClientRect()
      return box.top + box.height / 2
    })
  function startDrag(e: PointerEvent, index: number) {
    if (e.button !== 0) return
    e.preventDefault()
    try {
      ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    } catch {
      // No capture for this pointer: the drag still follows its moves.
    }
    drag = { from: index, position: dropIndex(midpoints(), e.clientY) }
  }
  function reorder(ids: string[]) {
    logAction('reorder pinned workspaces')
    attempt(() => changeWorkspaceNav((nav) => withPinOrder(nav, ids)))
  }
  function endDrag(commit: boolean) {
    const d = drag
    drag = null
    if (!d || !commit) return
    const ids = list.map((w) => w.id)
    const next = moveItemTo(ids, d.from, d.position)
    if (next !== ids) reorder(next)
  }
  function moveBy(e: KeyboardEvent, index: number) {
    if (place !== 'pinned' || !e.altKey || (e.key !== 'ArrowUp' && e.key !== 'ArrowDown')) return
    e.preventDefault()
    const to = index + (e.key === 'ArrowUp' ? -1 : 1)
    if (to < 0 || to >= list.length) return
    const ids = list.map((w) => w.id)
    reorder(moveItemTo(ids, index, to > index ? to + 1 : to))
  }
</script>

<svelte:window
  onclick={(e) => {
    const el = e.target as HTMLElement
    if (menuFor && !el.closest('.more')) menuFor = null
    if (tagMenu && !el.closest('.tagrow')) tagMenu = null
  }}
  onkeydown={(e) => {
    if (e.key === 'Escape') {
      menuFor = null
      tagMenu = null
    }
  }}
/>

{#snippet entry(p: Place, label: string, n: number, icon?: 'pin' | 'history')}
  <button class="nav" class:on={place === p} aria-current={place === p ? 'page' : undefined} onclick={() => go(p)}>
    {#if icon}<Icon name={icon} size={15} />{/if}<span class="lab" title={label}>{label}</span><span class="n">{n}</span>
  </button>
{/snippet}

<div class="wrap">
<div class="split">
  <nav class="side" aria-label="Workspaces by tag">
    {@render entry('all', 'All workspaces', all.length)}
    {@render entry('pinned', 'Pinned', $workspaceNav.pins.filter((p) => all.some((w) => w.id === p.id)).length, 'pin')}
    {@render entry('recent', 'Recent', $workspaceNav.opened.filter((o) => all.some((w) => w.id === o.id)).length, 'history')}
    <h2>Tags <button class="addtag" title="New tag" aria-label="New tag" onclick={() => (makingTag = !makingTag)}><Icon name="plus" size={14} /></button></h2>
    {#if makingTag}
      <form
        class="newtag"
        onsubmit={(e) => {
          e.preventDefault()
          const t = String(new FormData(e.currentTarget).get('tag') ?? '').trim()
          makingTag = false
          if (t) {
            logAction('new tag', t)
            attempt(() => changeWorkspaceNav((nav) => withNewTag(nav, t)))
          }
        }}
      >
        <!-- svelte-ignore a11y_autofocus -->
        <input name="tag" aria-label="New tag" placeholder="New tag" autofocus onkeydown={(e) => e.key === 'Escape' && (makingTag = false)} onblur={() => (makingTag = false)} />
      </form>
    {/if}
    {#each tags as t (t)}
      {@const colour = TAG_COLOUR_CSS[tagColour($workspaceNav, t)]}
      <div class="tagrow">
        {#if renamingTag === t}
          <form
            class="newtag"
            onsubmit={(e) => {
              e.preventDefault()
              const to = String(new FormData(e.currentTarget).get('tag') ?? '').trim()
              renamingTag = null
              if (to && to !== t) attempt(() => changeTag(t, to))
            }}
          >
            <!-- svelte-ignore a11y_autofocus -->
            <input name="tag" aria-label="Tag name" value={t} autofocus onkeydown={(e) => e.key === 'Escape' && (renamingTag = null)} onblur={() => (renamingTag = null)} />
          </form>
        {:else}
          <button class="nav" class:on={tag?.toLowerCase() === t.toLowerCase()} aria-current={tag?.toLowerCase() === t.toLowerCase() ? 'page' : undefined} onclick={() => go(`tag:${t}`)}>
            <span class="dot" style="--c:{colour}"></span><span class="lab" title={t}>{t}</span><span class="n">{uses(t)}</span>
          </button>
          <button
            class="tagmore"
            aria-haspopup="menu"
            aria-expanded={tagMenu?.tag === t}
            aria-label="Change the tag {t}"
            title="Rename, colour, merge or delete"
            onclick={() => (tagMenu = tagMenu?.tag === t ? null : { tag: t, show: 'actions' })}><Icon name="more" size={15} /></button
          >
          {#if tagMenu?.tag === t}
            <div class="menu" role="menu">
              {#if tagMenu.show === 'colour'}
                <div class="swatches" role="group" aria-label="Colour">
                  {#each TAG_COLOURS as c (c)}
                    <button class="swatch" class:on={tagColour($workspaceNav, t) === c} style="--c:{TAG_COLOUR_CSS[c]}" title={c} aria-label={c} onclick={() => setColour(t, c)}></button>
                  {/each}
                </div>
              {:else if tagMenu.show === 'merge'}
                <h3>Merge “{t}” into</h3>
                {#each tags.filter((x) => x !== t) as other (other)}
                  <button role="menuitem" onclick={() => ((tagMenu = null), attempt(() => changeTag(t, other)))}
                    ><span class="dot" style="--c:{TAG_COLOUR_CSS[tagColour($workspaceNav, other)]}"></span>{other}</button
                  >
                {:else}
                  <p class="none">No other tags yet.</p>
                {/each}
              {:else}
                <button role="menuitem" onclick={() => ((tagMenu = null), (renamingTag = t))}><Icon name="edit" size={15} /> Rename</button>
                <button role="menuitem" onclick={() => (tagMenu = { tag: t, show: 'colour' })}><span class="dot" style="--c:{colour}"></span> Change colour</button>
                <button role="menuitem" onclick={() => (tagMenu = { tag: t, show: 'merge' })}><Icon name="copyto" size={15} /> Merge into…</button>
                <hr />
                <button role="menuitem" class="danger" onclick={() => ((tagMenu = null), (deletingTag = t))}><Icon name="trash" size={15} /> Delete tag…</button>
              {/if}
            </div>
          {/if}
        {/if}
      </div>
    {/each}
    {@render entry('untagged', 'Untagged', all.filter((w) => w.tags.length === 0).length)}
  </nav>

  <div class="content">
  <div class="page">
    <header class="phead">
      {#if tag}<span class="dot big" style="--c:{TAG_COLOUR_CSS[tagColour($workspaceNav, tag)]}"></span>{/if}
      <h1>{title}</h1>
      <span class="grow"></span>
      <button class="primary" onclick={() => (adding = true)}><Icon name="plus" size={16} /> New workspace</button>
    </header>
    {#if place === 'all'}
      <p class="muted">A workspace keeps the decks for one project, course day or talk together, with its date, place, notes and shared files. Tags group workspaces; a deck can be in several workspaces, or none.</p>
    {/if}

    {#if deletingTag}
      <div class="inline confirm">
        <ConfirmDelete
          label="Delete tag"
          onconfirm={() => {
            const t = deletingTag!
            deletingTag = null
            attempt(() => changeTag(t, null))
          }}
          oncancel={() => (deletingTag = null)}>Delete the tag “{deletingTag}”? {count(uses(deletingTag), 'workspace')} lose it; the workspaces stay.</ConfirmDelete
        >
      </div>
    {/if}

    {#if adding}
      <WorkspaceForm
        tags={tag ? [tag] : []}
        oncancel={() => (adding = false)}
        oncreate={(change) => {
          adding = false
          attempt(async () => goWorkspace((await createWorkspace(change)).id))
        }}
      />
    {/if}

    {#if all.length > 0}
      <div class="bar">
        {#if place === 'recent'}
          <span class="faint">Last opened first</span>
        {:else if place === 'pinned'}
          <span class="faint">In the order you pinned them; drag to reorder</span>
        {:else}
          <label class="sort"
            >Sort <select value={$workspaceNav.sort} onchange={(e) => setSort(e.currentTarget.value as Sort)}
              ><option value="date">Date</option><option value="name">Name</option><option value="opened">Last opened</option></select
            ></label
          >
        {/if}
      </div>
    {/if}

    {#if $workspaces && all.length === 0}
      <div class="empty">
        <p>No workspaces yet. Make one for a project, a day of a course or a talk you're preparing, and add its decks.</p>
        <button class="primary" onclick={() => (adding = true)}><Icon name="plus" size={16} /> New workspace</button>
      </div>
    {:else if $workspaces && list.length === 0}
      <p class="faint">
        {place === 'pinned'
          ? 'Nothing pinned yet: the pin on a workspace keeps it here.'
          : place === 'recent'
            ? 'The workspaces you open show here.'
            : tag
              ? 'No workspace has this tag yet. New workspace starts with it.'
              : 'Every workspace has a tag.'}
      </p>
    {:else}
      <ul class="list" bind:this={listEl}>
        {#each list as w, i (w.id || w.folder)}
          {@const k = w.id || w.folder}
          <li
            data-index={i}
            class:editing={renaming === k || deleting === k}
            class:dragging={drag?.from === i}
            class:above={drag && drag.position === i && drag.from !== i && drag.from !== i - 1}
            class:below={drag && i === list.length - 1 && drag.position === list.length && drag.from !== i}
          >
            {#if renaming === k}
              <div class="inline">
                <InlineRename
                  initial={w.name}
                  label="Workspace name"
                  onrename={(name) => {
                    renaming = null
                    attempt(() => updateWorkspace(w.id, { name }, 'rename workspace'))
                  }}
                  oncancel={() => (renaming = null)}
                />
              </div>
            {:else if deleting === k}
              <div class="inline">
                <ConfirmDelete
                  label="Move to Trash"
                  onconfirm={() => {
                    deleting = null
                    attempt(() => deleteWorkspace(w.id))
                  }}
                  oncancel={() => (deleting = null)}>Delete “{w.name}”? Its decks stay in Decks. It moves to the Trash, with its files.</ConfirmDelete
                >
              </div>
            {:else}
              {#if place === 'pinned'}
                <button
                  class="grip"
                  aria-label="Move {w.name}: drag, or Alt+↑ and Alt+↓"
                  title="Drag to reorder"
                  onpointerdown={(e) => startDrag(e, i)}
                  onpointermove={(e) => drag && (drag = { ...drag, position: dropIndex(midpoints(), e.clientY) })}
                  onpointerup={() => endDrag(true)}
                  onpointercancel={() => endDrag(false)}
                  onkeydown={(e) => moveBy(e, i)}><Icon name="grip" size={15} /></button
                >
              {/if}
              {#if w.id}
                <button class="pin" class:on={pinned(w)} aria-pressed={pinned(w)} aria-label="{pinned(w) ? 'Unpin' : 'Pin'} {w.name}" title={pinned(w) ? 'Unpin' : 'Pin'} onclick={() => pin(w)}
                  ><Icon name="pin" size={16} /></button
                >
              {/if}
              <button class="what" disabled={!w.id} onclick={() => goWorkspace(w.id)} onkeydown={(e) => moveBy(e, i)}>
                <span class="t" title={w.name}>{w.name}</span>
                <span class="p" title={about(w)}>{about(w)}</span>
              </button>
              <span class="chips"
                >{#each w.tags as t (t)}<span class="chip" title={t}><span class="dot" style="--c:{TAG_COLOUR_CSS[tagColour($workspaceNav, t)]}"></span><span class="tn">{t}</span></span>{/each}</span
              >
              {#if w.id}
                <div class="more">
                  <button class="ibtn" aria-haspopup="menu" aria-expanded={menuFor === k} aria-label="More actions for {w.name}" title="More actions" onclick={() => (menuFor = menuFor === k ? null : k)}
                    ><Icon name="more" size={18} /></button
                  >
                  {#if menuFor === k}
                    <div class="menu right" role="menu">
                      <button role="menuitem" onclick={() => ((menuFor = null), (renaming = k))}><Icon name="edit" size={15} /> Rename</button>
                      <button role="menuitem" class="danger" onclick={() => ((menuFor = null), (deleting = k))}><Icon name="trash" size={15} /> Delete…</button>
                    </div>
                  {/if}
                </div>
              {/if}
            {/if}
          </li>
        {/each}
      </ul>
    {/if}
  </div>
  </div>
</div>
</div>

<style>
  /* The sidebar and the list each scroll on their own, filling the window below the search bar. */
  .wrap {
    height: 100%;
    display: flex;
    container-type: inline-size;
  }

  .split {
    display: grid;
    grid-template-columns: 220px minmax(0, 1fr);
    flex: 1;
    min-width: 0;
    height: 100%;
  }

  .side {
    overflow-y: auto;
    padding: 18px 10px;
    background: var(--side);
    border-right: 1px solid var(--line);
  }

  .side h2 {
    display: flex;
    align-items: center;
    margin: 18px 8px 4px;
    font-size: 11px;
    letter-spacing: 0.07em;
    text-transform: uppercase;
    color: var(--faint);
  }

  .addtag {
    display: inline-flex;
    margin-left: auto;
    border: 0;
    background: none;
    padding: 2px;
    color: var(--accent-text);
    border-radius: 6px;
  }

  .addtag:hover {
    background: var(--hover);
  }

  .nav {
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
    border: 0;
    background: none;
    border-radius: 8px;
    padding: 6px 8px;
    text-align: left;
    color: var(--text);
    font-weight: 500;
  }

  .nav:hover {
    background: var(--hover);
  }

  .nav.on {
    background: var(--accent-soft);
    color: var(--accent-text);
    font-weight: 600;
  }

  .lab {
    flex: 1;
    min-width: 0;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .n {
    font-size: 12px;
    color: var(--faint);
  }

  .dot {
    flex: none;
    display: inline-block;
    width: 9px;
    height: 9px;
    border-radius: 3px;
    background: var(--c);
  }

  .dot.big {
    width: 13px;
    height: 13px;
    border-radius: 4px;
  }

  .tagrow {
    position: relative;
  }

  .tagmore {
    position: absolute;
    right: 4px;
    top: 50%;
    transform: translateY(-50%);
    display: inline-flex;
    border: 0;
    background: none;
    padding: 3px;
    border-radius: 6px;
    color: var(--muted);
    opacity: 0;
  }

  .tagrow:hover .tagmore,
  .tagmore:focus-visible,
  .tagmore[aria-expanded='true'] {
    opacity: 1;
  }

  .tagmore:hover {
    background: var(--hover);
  }

  .tagrow .n {
    transition: opacity 0.1s;
  }

  .tagrow:hover .n,
  .tagrow:has(.tagmore[aria-expanded='true']) .n {
    opacity: 0;
  }

  .newtag {
    padding: 2px 4px;
  }

  .newtag input {
    width: 100%;
    padding: 4px 8px;
    font-size: 13px;
  }

  .menu {
    position: absolute;
    top: calc(100% + 4px);
    left: 8px;
    z-index: 20;
    min-width: 190px;
    padding: 6px;
    background: var(--card);
    border: 1px solid var(--line-strong);
    border-radius: 12px;
    box-shadow: 0 10px 30px rgba(0, 0, 0, 0.18);
  }

  /* The tag's menu stays inside the sidebar, which scrolls and would cut it off. */
  .tagrow .menu {
    left: 0;
    right: 0;
    min-width: 0;
  }

  .menu.right {
    left: auto;
    right: 0;
  }

  .menu button {
    display: flex;
    align-items: center;
    gap: 10px;
    width: 100%;
    border: 0;
    background: none;
    border-radius: 8px;
    padding: 7px 10px;
    text-align: left;
    color: var(--text);
    font-weight: 500;
  }

  .menu button:hover {
    background: var(--hover);
  }

  .menu button.danger {
    color: var(--danger);
  }

  .menu hr {
    border: 0;
    border-top: 1px solid var(--line);
    margin: 4px 2px;
  }

  .menu h3 {
    margin: 4px 10px 4px;
    font-size: 12px;
    color: var(--faint);
    font-weight: 600;
  }

  .menu .none {
    margin: 4px 10px;
    color: var(--faint);
    font-size: 13px;
  }

  .swatches {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    padding: 4px;
  }

  .menu .swatch {
    width: 22px;
    height: 22px;
    padding: 0;
    border-radius: 6px;
    background: var(--c);
    border: 2px solid transparent;
  }

  .menu .swatch:hover {
    background: var(--c);
    border-color: var(--line-strong);
  }

  .menu .swatch.on {
    border-color: var(--text);
  }

  .content {
    min-height: 0;
    overflow-y: auto;
  }

  .page {
    /* Centred in its column, as Decks is, with the same top, so moving between them doesn't jump. */
    width: 100%;
    max-width: 960px;
    margin: 0 auto;
    padding: 26px 32px 48px;
  }

  .phead {
    display: flex;
    align-items: center;
    gap: 10px;
    flex-wrap: wrap;
  }

  .phead h1 {
    margin: 0;
  }

  .phead button {
    display: inline-flex;
    align-items: center;
    gap: 6px;
  }

  .grow {
    flex: 1;
  }

  .bar {
    display: flex;
    justify-content: flex-end;
    margin: 12px 0 8px;
    font-size: 12.5px;
  }

  .bar .faint {
    margin-right: auto;
  }

  .sort {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    color: var(--muted);
  }

  .sort select {
    padding: 3px 6px;
    font-size: 12.5px;
  }

  .list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  li {
    position: relative;
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 10px 12px 10px 8px;
    border: 1px solid var(--line);
    border-radius: 14px;
    background: var(--card);
    min-width: 0;
  }

  li:hover {
    border-color: var(--line-strong);
  }

  li.dragging {
    opacity: 0.5;
  }

  li.above::before,
  li.below::after {
    content: '';
    position: absolute;
    left: 8px;
    right: 8px;
    height: 2px;
    background: var(--accent);
    border-radius: 2px;
  }

  li.above::before {
    top: -6px;
  }

  li.below::after {
    bottom: -6px;
  }

  .pin,
  .grip {
    flex: none;
    display: inline-flex;
    border: 0;
    background: none;
    padding: 4px;
    border-radius: 8px;
    color: var(--faint);
  }

  .grip {
    cursor: grab;
    touch-action: none;
  }

  .pin:hover,
  .grip:hover {
    background: var(--hover);
  }

  .pin.on {
    color: var(--accent-text);
  }

  .what {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 2px;
    border: 0;
    background: none;
    padding: 0;
    text-align: left;
    font-weight: 400;
  }

  .what:hover:not(:disabled) {
    background: none;
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
    font-size: 12.5px;
    color: var(--muted);
  }

  /* The tags take at most half the row, so a long tag can't squeeze the workspace's name; a tag
     longer than that shortens, the whole of it in its title. */
  .chips {
    flex: 0 1 auto;
    min-width: 0;
    max-width: 50%;
    display: flex;
    flex-wrap: wrap;
    justify-content: flex-end;
    gap: 4px;
  }

  .chip {
    max-width: 100%;
    min-width: 0;
    box-sizing: border-box;
    display: inline-flex;
    align-items: center;
    gap: 5px;
    padding: 0 8px;
    border-radius: 99px;
    background: var(--accent-soft);
    color: var(--accent-text);
    font-size: 11.5px;
    font-weight: 600;
    line-height: 19px;
  }

  .chip .tn {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .chip .dot {
    flex: none;
    width: 7px;
    height: 7px;
    border-radius: 2px;
  }

  .more {
    position: relative;
  }

  .ibtn {
    border: 0;
    background: none;
    padding: 4px;
    color: var(--muted);
    border-radius: 8px;
  }

  .ibtn:hover {
    background: var(--hover);
  }

  .inline {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
    width: 100%;
  }

  .confirm {
    margin: 14px 0 4px;
    padding: 10px 14px;
    border: 1px solid var(--line-strong);
    border-radius: 12px;
    background: var(--card);
  }

  .empty {
    margin-top: 16px;
    padding: 22px;
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

  @container (max-width: 860px) {
    .split {
      grid-template-columns: 180px minmax(0, 1fr);
    }

    .page {
      padding: 22px 22px 44px;
    }
  }

  /* Narrow windows: the sidebar becomes a row across the top that scrolls sideways. */
  @container (max-width: 640px) {
    .split {
      grid-template-columns: minmax(0, 1fr);
    }

    .split {
      grid-template-rows: auto minmax(0, 1fr);
    }

    .side {
      display: flex;
      align-items: center;
      gap: 4px;
      overflow-x: auto;
      padding: 8px 12px;
      border-right: 0;
      border-bottom: 1px solid var(--line);
    }

    .side h2,
    .newtag,
    .tagmore {
      display: none;
    }

    .nav {
      width: auto;
      white-space: nowrap;
    }

    .tagrow:hover .n {
      opacity: 1;
    }

    .page {
      padding: 18px 16px 40px;
    }

    .chips {
      display: none;
    }
  }
</style>
