<script lang="ts">
  // The Library (epic 036 (#54)): decks and workspaces in one place. A left pane of smart groups first
  // (Recent, Pinned and This week, with decks and workspaces together; Unsorted, the decks in no
  // workspace, while there are some), then the workspaces, then All decks; the main pane lists the
  // one picked, or is the workspace's page. New is the + New beside the search bar (NewMenu), not here.
  import { onMount } from 'svelte'
  import { decks, loadDecks } from '../lib/decks/store'
  import { libraryGroups, type LibraryRef } from '../lib/library/groups'
  import { opened, pins, workspaceNav } from '../lib/settings/store'
  import { TAG_COLOUR_CSS, tagColour } from '../lib/workspaces/navigation'
  import { loadWorkspaces, workspaces } from '../lib/workspaces/store'
  import { sortWorkspaces } from '../lib/workspaces/workspaces'
  import { attempt } from './errors'
  import { goAi, goLibrary, goWorkspace, nav as screen } from './route'
  import { newBlankDeck } from './new'
  import { openTemplatePicker } from './picker'
  import Icon from './Icon.svelte'
  import DeckList from './DeckList.svelte'
  import WorkspacePage from './WorkspacePage.svelte'
  import type { IconName } from './icons'
  import { PLACE_TITLES, type LibraryPlace } from './nav'

  onMount(() => attempt(async () => void (await Promise.all([loadDecks(), loadWorkspaces()]))))

  const groups = $derived(
    libraryGroups({ decks: $decks ?? [], workspaces: $workspaces ?? [], pins: $pins, opened: $opened, workspaceNav: $workspaceNav, now: Date.now() }),
  )
  const place = $derived<LibraryPlace>($screen.place ?? (groups.recent.length ? 'recent' : 'all'))
  const allSpaces = $derived(sortWorkspaces(($workspaces ?? []).filter((w) => w.id)))
  const empty = $derived($decks !== null && $decks.length === 0 && allSpaces.length === 0)

  /** Workspaces in the pane: the last opened first, then the rest, six unless "All N workspaces" is on. */
  let allShown = $state(false)
  const paneSpaces = $derived.by(() => {
    const byOpened = $workspaceNav.opened.flatMap((o) => allSpaces.find((w) => w.id === o.id) ?? [])
    const list = [...byOpened, ...allSpaces.filter((w) => !byOpened.includes(w))]
    // The one open stays in the list even when it is past the sixth.
    const shown = list.slice(0, 6)
    const open = $screen.workspace ? list.find((w) => w.id === $screen.workspace) : undefined
    return allShown ? list : open && !shown.includes(open) ? [...shown.slice(0, 5), open] : shown
  })

  const decksIn = (refs: LibraryRef[]) => refs
  const asDecks = (list: { path: string }[]): LibraryRef[] =>
    list.flatMap((d) => {
      const deck = ($decks ?? []).find((x) => x.path === d.path)
      return deck ? [{ kind: 'deck' as const, deck, at: deck.modifiedMs }] : []
    })

  const SUBS: Partial<Record<LibraryPlace, string>> = {
    recent: 'Decks and workspaces together, as you opened them.',
    pinned: 'Decks and workspaces together, newest pin first.',
    unsorted: 'Decks in no workspace. ⋯ on a deck adds it to one.',
  }
  const refs = $derived<LibraryRef[]>(
    place === 'recent' ? decksIn(groups.recent) : place === 'pinned' ? decksIn(groups.pinned) : place === 'week' ? decksIn(groups.week) : place === 'unsorted' ? asDecks(groups.unsorted) : asDecks($decks ?? []),
  )
  const pick = (p: LibraryPlace) => goLibrary(p)
</script>

<div class="library">
  <nav class="side" aria-label="Library">
    {#if groups.recent.length}{@render entry('recent', 'Recent', groups.recent.length, 'history')}{/if}
    {#if groups.pinned.length}{@render entry('pinned', 'Pinned', groups.pinned.length, 'pin')}{/if}
    {#if groups.week.length}{@render entry('week', 'This week', groups.week.length, 'session')}{/if}
    {#if groups.unsorted.length}{@render entry('unsorted', 'Unsorted', groups.unsorted.length, 'deck', 'Decks in no workspace')}{/if}

    {#if allSpaces.length}
      <h4>Workspaces</h4>
      {#each paneSpaces as w (w.id)}
        <button class="nav" class:on={$screen.workspace === w.id} aria-current={$screen.workspace === w.id ? 'page' : undefined} onclick={() => goWorkspace(w.id)}>
          <span class="dot" style="background: {TAG_COLOUR_CSS[tagColour($workspaceNav, w.tags[0] ?? w.name)]}" aria-hidden="true"></span>
          <span class="lab">{w.name}</span><span class="n">{w.decks.length}</span>
        </button>
      {/each}
      {#if allSpaces.length > 6}
        <button class="more" onclick={() => (allShown = !allShown)}>{allShown ? 'Fewer' : `All ${allSpaces.length} workspaces`}</button>
      {/if}
    {/if}

    <h4>Everything</h4>
    {@render entry('all', 'All decks', ($decks ?? []).length, 'deck')}
    {#if empty}<p class="hint">Recent, Pinned and This week fill in as you work. Workspaces show here once you make one.</p>{/if}
  </nav>

  <div class="mainpane">
    {#if $screen.workspace}
      <WorkspacePage id={$screen.workspace} />
    {:else if empty}
      <div class="page first">
        <h1>Library</h1>
        <div class="welcome">
          <b>No decks yet</b>
          <p>A deck is a few cards for one call or talk.</p>
          <div class="acts">
            <button class="primary" onclick={() => attempt(newBlankDeck)}><Icon name="plus" size={16} /> Blank deck</button>
            <button onclick={() => openTemplatePicker()}>From a template</button>
            <button onclick={goAi}><Icon name="ai" size={16} /> Ask your AI for one</button>
          </div>
        </div>
      </div>
    {:else}
      {#key place}
        <DeckList title={PLACE_TITLES[place]} sub={SUBS[place] ?? ''} {refs} grouped={place === 'all' && ($decks ?? []).length > 12} filterable={place === 'all'} />
      {/key}
    {/if}
  </div>
</div>

{#snippet entry(key: LibraryPlace, label: string, n: number, icon: IconName, title?: string)}
  <button class="nav" class:on={!$screen.workspace && place === key} aria-current={!$screen.workspace && place === key ? 'page' : undefined} {title} onclick={() => pick(key)}>
    <span class="ic"><Icon name={icon} size={15} /></span><span class="lab">{label}</span><span class="n">{n}</span>
  </button>
{/snippet}

<style>
  .library {
    display: grid;
    grid-template-columns: 224px minmax(0, 1fr);
    height: 100%;
    min-height: 0;
  }

  .side {
    overflow: auto;
    padding: 14px 10px 24px;
    border-right: 1px solid var(--line);
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .mainpane {
    overflow: auto;
    min-width: 0;
  }

  h4 {
    margin: 16px 10px 6px;
    font-size: 11.5px;
    letter-spacing: 0.07em;
    text-transform: uppercase;
    color: var(--faint);
  }

  .nav {
    display: flex;
    align-items: center;
    gap: 9px;
    width: 100%;
    border: 0;
    background: none;
    border-radius: 9px;
    padding: 7px 10px;
    text-align: left;
    color: var(--text);
    font-weight: 500;
    font-size: 13.5px;
  }

  .nav:hover {
    background: var(--hover);
  }

  .nav.on {
    background: var(--accent-soft);
    color: var(--accent-text);
    font-weight: 650;
  }

  .lab {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .ic {
    display: inline-flex;
    color: var(--muted);
  }

  .nav.on .ic {
    color: var(--accent-text);
  }

  .dot {
    width: 10px;
    height: 10px;
    border-radius: 3px;
    flex: none;
    margin: 0 2.5px;
  }

  .n {
    font-size: 12px;
    color: var(--faint);
    font-variant-numeric: tabular-nums;
  }

  .more {
    border: 0;
    background: none;
    text-align: left;
    padding: 5px 10px;
    font-size: 12.5px;
    font-weight: 600;
    color: var(--accent-text);
  }

  .hint {
    margin: 14px 10px 0;
    font-size: 12.5px;
    color: var(--muted);
  }

  .page.first {
    max-width: 640px;
    margin: 0 auto;
    padding: 22px 28px 48px;
  }

  .welcome {
    margin-top: 18px;
    padding: 30px 26px;
    border: 1.5px dashed var(--line-strong);
    border-radius: 14px;
    text-align: center;
    color: var(--muted);
  }

  .welcome b {
    color: var(--text);
  }

  .acts {
    display: flex;
    gap: 10px;
    justify-content: center;
    flex-wrap: wrap;
    margin-top: 14px;
  }

  .acts button {
    display: inline-flex;
    align-items: center;
    gap: 6px;
  }

  /* Narrow window: a smaller pane, so the list keeps its room. */
  @media (max-width: 800px) {
    .library {
      grid-template-columns: 184px minmax(0, 1fr);
    }
  }
</style>
