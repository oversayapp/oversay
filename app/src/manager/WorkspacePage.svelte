<script lang="ts">
  // A workspace's page (ADR 0040): its name, tags, when, where and notes (changed
  // in place), its decks in order, each with Show and opening in the deck editor, dragged by its grip
  // (or Alt+↑/↓) into another order, and taken out with ×; Add decks picks from Decks. Its resources
  // folder is below. A deck it lists that Oversay can't find shows as gone, never as an error.
  import { count } from '../lib/words'
  import { decks, newDeck, type DeckEntry } from '../lib/decks/store'
  import { showDeckOnScreen } from '../lib/decks/show'
  import { quickName, readQuickFile } from '../lib/notes/files'
  import { parseNoteDoc } from '../lib/notes/format'
  import { showBlockedBy } from '../lib/notes/show'
  import { session } from '../lib/session/store'
  import { addDeckToWorkspace, deleteWorkspace, removeDeckFromWorkspace, reorderWorkspace, updateWorkspace, workspaces } from '../lib/workspaces/store'
  import { findWorkspace, movedDeck, type WorkspaceChange } from '../lib/workspaces/workspaces'
  import { dropIndex, moveItemTo } from '../lib/project/lists'
  import ConfirmDelete from './ConfirmDelete.svelte'
  import DeckResources from './DeckResources.svelte'
  import { attempt } from './errors'
  import Icon from './Icon.svelte'
  import InlineRename from './InlineRename.svelte'
  import MiniPlan from './MiniPlan.svelte'
  import { goDeck, goWorkspaces } from './route'
  import { showBack } from './back'
  import TagPicker from './TagPicker.svelte'
  import DecksResources from './DecksResources.svelte'
  import { changeWorkspaceNav, workspaceNav } from '../lib/settings/store'
  import { withOpened, withPin } from '../lib/workspaces/navigation'
  import { logAction } from '../lib/log'

  let { id }: { id: string } = $props()

  const workspace = $derived(findWorkspace($workspaces ?? [], id))
  /** Its decks in order: each listed deck, or its id when Oversay can't find it. */
  const entries = $derived(
    (workspace?.decks ?? []).map((deckId) => ({ id: deckId, deck: ($decks ?? []).find((d) => d.id === deckId) ?? null })),
  )
  const blocked = $derived(showBlockedBy($session))

  // The way back, in the search bar's row (back.ts).
  $effect(() => showBack({ label: 'Workspaces', go: goWorkspaces, width: 960 }))

  // Opening it puts it first in the Workspaces page's Recent. Not worth an error if it can't be written.
  $effect(() => {
    const opened = id
    changeWorkspaceNav((nav) => withOpened(nav, opened, new Date().toISOString())).catch(() => {})
  })
  const pinned = $derived($workspaceNav.pins.some((p) => p.id === id))
  function pin() {
    logAction(pinned ? 'unpin workspace' : 'pin workspace', workspace?.name ?? id)
    const on = !pinned
    attempt(() => changeWorkspaceNav((nav) => withPin(nav, id, on, new Date().toISOString())))
  }

  let renaming = $state(false)
  let deleting = $state(false)
  let menu = $state(false)

  // Tags group workspaces on the Workspaces page (ADR 0040): picked from the tags in use, or new.
  const setTags = (tags: string[]) => attempt(() => updateWorkspace(id, { tags }, 'workspace tags'))

  function change(field: keyof WorkspaceChange, value: string) {
    if (!workspace || (workspace[field as 'when' | 'where' | 'notes'] ?? '') === value.trim()) return
    attempt(() => updateWorkspace(id, { [field]: value }, `workspace ${field}`))
  }

  function show(d: DeckEntry) {
    attempt(async () => showDeckOnScreen(parseNoteDoc(await readQuickFile('decks', d.path)), d.name, d.path))
  }

  // Reordering (pointer events, ADR 0010, as the talk editor's lists): where a dragged deck would land.
  let list = $state<HTMLElement | null>(null)
  let drag = $state<{ from: number; position: number } | null>(null)
  const midpoints = () =>
    [...(list?.querySelectorAll<HTMLElement>('[data-index]') ?? [])].map((row) => {
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

  function endDrag(commit: boolean) {
    const d = drag
    drag = null
    if (!d || !commit || !workspace) return
    const next = moveItemTo(workspace.decks, d.from, d.position)
    if (next !== workspace.decks) attempt(() => reorderWorkspace(id, next))
  }

  function moveBy(e: KeyboardEvent, index: number) {
    if (!e.altKey || (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') || !workspace) return
    e.preventDefault()
    const to = index + (e.key === 'ArrowUp' ? -1 : 1)
    if (to < 0 || to >= workspace.decks.length) return
    attempt(() => reorderWorkspace(id, movedDeck(workspace.decks, index, to)))
  }

  /** New deck here: made in Decks, as every deck is, and added to this workspace. */
  function createHere() {
    attempt(async () => {
      const path = await newDeck()
      const made = ($decks ?? []).find((d) => d.path === path)
      if (!made?.id) throw new Error(`${quickName(path)} was made, but has no id yet to add it here; add it in a moment`)
      await addDeckToWorkspace(id, made.id)
      goDeck(path)
    })
  }

  // Add decks: the decks not in this workspace, narrowed by what is typed.
  let adding = $state(false)
  let addText = $state('')
  const addable = $derived(
    ($decks ?? []).filter((d) => d.id && !workspace?.decks.includes(d.id) && d.name.toLowerCase().includes(addText.trim().toLowerCase())),
  )

  const size = (d: DeckEntry) => [d.seconds > 0 ? `${Math.ceil(d.seconds / 60)} min` : 'untimed', count(d.cards, 'card')].join(' · ')
</script>

<svelte:window
  onclick={(e) => {
    if (menu && !(e.target as HTMLElement).closest('.more')) menu = false
  }}
  onkeydown={(e) => {
    if (menu && e.key === 'Escape') menu = false
  }}
/>

<div class="page">
  {#if !workspace}
    {#if $workspaces}<p class="muted">That workspace is no longer there.</p>{/if}
  {:else}
    <header class="phead">
      {#if renaming}
        <div class="inline">
          <InlineRename
            initial={workspace.name}
            label="Workspace name"
            onrename={(name) => {
              renaming = false
              attempt(() => updateWorkspace(id, { name }, 'rename workspace'))
            }}
            oncancel={() => (renaming = false)}
          />
        </div>
      {:else}
        <h1>{workspace.name}</h1>
        <button class="ibtn pin" class:on={pinned} aria-pressed={pinned} aria-label={pinned ? 'Unpin' : 'Pin'} title={pinned ? 'Unpin' : 'Pin to Pinned on Workspaces'} onclick={pin}
          ><Icon name="pin" size={18} /></button
        >
        <div class="more">
          <button class="ibtn" aria-haspopup="menu" aria-expanded={menu} aria-label="More actions for {workspace.name}" title="More actions" onclick={() => (menu = !menu)}
            ><Icon name="more" size={18} /></button
          >
          {#if menu}
            <div class="menu" role="menu">
              <button role="menuitem" onclick={() => ((menu = false), (renaming = true))}><Icon name="edit" size={15} /> Rename</button>
              <button role="menuitem" class="danger" onclick={() => ((menu = false), (deleting = true))}><Icon name="trash" size={15} /> Delete…</button>
            </div>
          {/if}
        </div>
      {/if}
    </header>
    {#if deleting}
      <div class="inline confirm">
        <ConfirmDelete
          label="Move to Trash"
          onconfirm={() => {
            deleting = false
            attempt(async () => {
              await deleteWorkspace(id)
              goWorkspaces()
            })
          }}
          oncancel={() => (deleting = false)}>Delete “{workspace.name}”? Its decks stay in Decks. It moves to the Trash, with its files.</ConfirmDelete
        >
      </div>
    {/if}

    {#if workspace.problem}
      <p class="error">{workspace.problem}. Oversay won't change it until it can read it again.</p>
    {:else}
      <div class="tags" role="group" aria-label="Tags">
        <span class="lab">Tags</span>
        <TagPicker tags={workspace.tags} onchange={setTags} />
      </div>
      <div class="details">
        <label>When <input type="date" value={workspace.when} onchange={(e) => change('when', e.currentTarget.value)} /></label>
        <label>Where <input value={workspace.where} placeholder="Zoom, Lisbon…" onchange={(e) => change('where', e.currentTarget.value)} /></label>
        <label class="wide"
          >Notes <textarea rows="2" value={workspace.notes} placeholder="Who it's with, what it's for" onchange={(e) => change('notes', e.currentTarget.value)}></textarea></label
        >
      </div>
    {/if}

    <div class="dhead">
      <h3 class="sec">Decks <span class="cnt">{workspace.decks.length}</span></h3>
      {#if !workspace.problem}
        <span class="dacts">
          <button onclick={() => ((adding = !adding), (addText = ''))} aria-expanded={adding}><Icon name="plus" size={15} /> Add decks</button>
          <button onclick={createHere}><Icon name="plus" size={15} /> New deck</button>
        </span>
      {/if}
    </div>
    {#if adding}
      <div class="adder" role="group" aria-label="Add decks">
        <!-- svelte-ignore a11y_autofocus -->
        <input placeholder="Find a deck" aria-label="Find a deck to add" bind:value={addText} autofocus onkeydown={(e) => e.key === 'Escape' && (adding = false)} />
        <ul>
          {#each addable.slice(0, 30) as d (d.id)}
            <li>
              <span class="t">{d.name}</span>
              <button onclick={() => attempt(() => addDeckToWorkspace(id, d.id))}><Icon name="plus" size={14} /> Add</button>
            </li>
          {:else}
            <li class="muted">{($decks ?? []).length ? 'Every deck that matches is in this workspace.' : 'No decks yet.'}</li>
          {/each}
        </ul>
        <button class="link" onclick={() => (adding = false)}>Done</button>
      </div>
    {/if}
    {#if entries.length === 0}
      <div class="empty"><p>No decks in this workspace yet. Add decks here, or from a deck's editor.</p></div>
    {:else}
      <ol class="decklist" bind:this={list}>
        {#each entries as e, i (e.id)}
          <li
            data-index={i}
            class:gone={!e.deck}
            class:dragging={drag?.from === i}
            class:drop-before={drag !== null && drag.position === i && drag.from !== i && drag.from !== i - 1}
            class:drop-after={drag !== null && i === entries.length - 1 && drag.position === entries.length && drag.from !== i}
          >
            <button
              class="grip"
              aria-label="Move {e.deck?.name ?? 'this deck'}: drag, or press Alt with the up and down arrow keys"
              title="Drag to reorder"
              onpointerdown={(ev) => startDrag(ev, i)}
              onpointermove={(ev) => drag && (drag = { ...drag, position: dropIndex(midpoints(), ev.clientY) })}
              onpointerup={() => endDrag(true)}
              onpointercancel={() => endDrag(false)}
              onkeydown={(ev) => moveBy(ev, i)}><Icon name="grip" size={14} /></button
            >
            {#if e.deck}
              {@const d = e.deck}
              <button class="what" disabled={d.unreadable} onclick={() => goDeck(d.path)}>
                <span class="t">{d.name}</span>
                <span class="p">{[d.audience && `for ${d.audience}`, size(d)].filter(Boolean).join(' · ')}</span>
              </button>
              <button class="plan" tabindex="-1" aria-hidden="true" onclick={() => goDeck(d.path)}><MiniPlan bar={d.bar} /></button>
              <div class="acts">
                <button
                  class="primary"
                  disabled={!!blocked || d.unreadable || d.cards === 0}
                  title={blocked ?? (d.cards === 0 ? 'Add a card to show' : 'Show on screen')}
                  onclick={() => show(d)}><Icon name="show" size={15} /> Show</button
                >
                <button class="ibtn" aria-label="Remove {d.name} from this workspace" title="Remove from this workspace (it stays in Decks)" onclick={() => attempt(() => removeDeckFromWorkspace(id, e.id))}
                  ><Icon name="close" size={16} /></button
                >
              </div>
            {:else}
              <span class="what"><span class="t">A deck that has gone</span><span class="p">Moved to the Trash or not here yet ({e.id})</span></span>
              <span class="plan"></span>
              <div class="acts">
                <button class="ibtn" aria-label="Remove the deck that has gone" title="Remove from this workspace" onclick={() => attempt(() => removeDeckFromWorkspace(id, e.id))}
                  ><Icon name="close" size={16} /></button
                >
              </div>
            {/if}
          </li>
        {/each}
      </ol>
    {/if}

    {#if workspace.id && !workspace.problem}
      <!-- Its own files first, then each of its decks' (ADR 0040). -->
      <DeckResources owner={{ workspace: workspace.id }}>
        <DecksResources decks={entries.flatMap((e) => (e.deck ? [e.deck] : []))} />
      </DeckResources>
    {/if}
  {/if}
</div>

<style>
  .page {
    max-width: 960px;
    margin: 0 auto;
    padding: 26px 32px 48px;
  }


  .phead {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .phead h1 {
    margin: 0;
  }

  .tags {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 6px;
    margin: 14px 0 0;
  }

  .tags .lab {
    font-size: 12.5px;
    font-weight: 600;
    color: var(--muted);
    margin-right: 2px;
  }

  .details {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
    gap: 10px 14px;
    margin: 16px 0 6px;
  }

  label {
    display: flex;
    flex-direction: column;
    gap: 4px;
    font-size: 12.5px;
    font-weight: 600;
    color: var(--muted);
  }

  label input,
  label textarea {
    font-weight: 400;
    color: var(--text);
  }

  .wide {
    grid-column: 1 / -1;
  }

  .sec {
    margin: 22px 0 8px;
    font-size: 12px;
    letter-spacing: 0.07em;
    text-transform: uppercase;
    color: var(--faint);
  }

  .cnt {
    font-weight: 500;
    letter-spacing: 0;
  }

  .decklist {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .dhead {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin: 22px 0 8px;
  }

  .dhead .sec {
    margin: 0;
  }

  .dacts {
    display: flex;
    gap: 8px;
  }

  .dhead button {
    display: inline-flex;
    align-items: center;
    gap: 6px;
  }

  .adder {
    margin: 0 0 12px;
    padding: 10px 12px;
    border: 1px solid var(--line-strong);
    border-radius: 12px;
    background: var(--card);
  }

  .adder input {
    width: 100%;
  }

  .adder ul {
    list-style: none;
    margin: 8px 0;
    padding: 0;
    max-height: 260px;
    overflow: auto;
  }

  .adder li {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 5px 4px;
    border: 0;
    border-radius: 8px;
    grid-template-columns: none;
  }

  .adder li .t {
    flex: 1;
    font-size: 14px;
  }

  .adder li button {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 3px 10px;
  }

  .link {
    border: 0;
    background: none;
    color: var(--accent-text);
    font-weight: 600;
    padding: 2px 4px;
  }

  .grip {
    border: 0;
    background: none;
    padding: 4px 2px;
    color: var(--faint);
    cursor: grab;
    touch-action: none;
  }

  .decklist li.dragging {
    opacity: 0.5;
  }

  .decklist li.drop-before {
    box-shadow: 0 -3px 0 var(--accent);
  }

  .decklist li.drop-after {
    box-shadow: 0 3px 0 var(--accent);
  }

  .decklist li {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) minmax(140px, 220px) auto;
    gap: 14px;
    align-items: center;
    padding: 12px 14px;
    border: 1px solid var(--line);
    border-radius: 14px;
    background: var(--card);
  }

  .decklist li.gone {
    border-style: dashed;
    color: var(--muted);
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
  .plan:hover {
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
    max-width: 100%;
    font-size: 12.5px;
    color: var(--muted);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .plan {
    width: 100%;
    border: 0;
    background: none;
    padding: 0;
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

  .more {
    position: relative;
  }

  .ibtn {
    border: 0;
    background: none;
    padding: 6px;
    color: var(--muted);
    border-radius: 8px;
  }

  .ibtn:hover {
    background: var(--hover);
  }

  .pin {
    display: inline-flex;
    color: var(--faint);
  }

  .pin.on {
    color: var(--accent-text);
  }

  .menu {
    position: absolute;
    top: calc(100% + 6px);
    left: 0;
    z-index: 20;
    min-width: 190px;
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

  .menu button.danger {
    color: var(--danger);
  }

  .inline {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
    width: 100%;
  }

  .confirm {
    margin-top: 10px;
  }

  .empty {
    padding: 18px;
    border: 1.5px dashed var(--line-strong);
    border-radius: 14px;
    text-align: center;
    color: var(--muted);
  }

  .empty p {
    margin: 0;
  }

  @media (max-width: 760px) {
    .decklist li {
      grid-template-columns: auto minmax(0, 1fr) auto;
    }

    .plan {
      display: none;
    }
  }
</style>
