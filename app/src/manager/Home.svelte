<script lang="ts">
  // Home (ADR 0039, epic 036 (#54)): a welcome and round shortcuts (the same three as + New, and the Library),
  // then, once there is something to pick up, where you left off, Recent and Pinned: a few things, however
  // much is in the Library. Nothing is listed on a first run. No calendar, so no What's next.
  import { onMount } from 'svelte'
  import { attempt } from './errors'
  import Icon from './Icon.svelte'
  import AiCard from './AiCard.svelte'
  import { decks, loadDecks } from '../lib/decks/store'
  import { libraryGroups, type LibraryRef } from '../lib/library/groups'
  import { homeSections } from '../lib/library/home'
  import { count } from '../lib/words'
  import { opened, pins, workspaceNav } from '../lib/settings/store'
  import { loadWorkspaces, workspaces } from '../lib/workspaces/store'
  import { goDeck, goLibrary, goWorkspace } from './route'
  import { newBlankDeck, openWorkspaceDialog, showDeckEntry } from './new'
  import { openTemplatePicker } from './picker'

  onMount(() => attempt(async () => void (await Promise.all([loadDecks(), loadWorkspaces()]))))

  const groups = $derived(
    libraryGroups({ decks: $decks ?? [], workspaces: $workspaces ?? [], pins: $pins, opened: $opened, workspaceNav: $workspaceNav, now: Date.now() }),
  )
  const sections = $derived(homeSections(groups, { decks: ($decks ?? []).length, workspaces: ($workspaces ?? []).length }))

  const open = (r: LibraryRef) => (r.kind === 'deck' ? goDeck(r.deck.path) : goWorkspace(r.workspace.id))
  const nameOf = (r: LibraryRef) => (r.kind === 'deck' ? r.deck.name : r.workspace.name)
  const subOf = (r: LibraryRef) =>
    r.kind === 'deck'
      ? [r.deck.seconds > 0 ? `${Math.ceil(r.deck.seconds / 60)} min` : 'untimed', count(r.deck.cards, 'card')].join(' · ')
      : `Workspace · ${count(r.workspace.decks.length, 'deck')}`
</script>

<div class="page">
  <h1>Your cards, on screen, <em>through every call</em></h1>
  <p class="lede muted">A deck is a few cards with points under each, shown one at a time beside a call or a talk. Workspaces keep the decks for a project, a course or a talk together.</p>

  <div class="shortcuts">
    <button class="sc" onclick={() => attempt(() => newBlankDeck())}><span class="c"><Icon name="plus" size={22} /></span>New deck</button>
    <button class="sc" onclick={() => openTemplatePicker()}><span class="c"><Icon name="template" size={22} /></span>From a template</button>
    <button class="sc" onclick={() => openWorkspaceDialog()}><span class="c"><Icon name="folder" size={22} /></span>New workspace</button>
    <button class="sc" onclick={() => goLibrary()}><span class="c"><Icon name="deck" size={22} /></span>Library</button>
  </div>

  {#if sections.pickUp && sections.pickUp.kind === 'deck'}
    {@const d = sections.pickUp.deck}
    <h3 class="sec">Pick up where you left off</h3>
    <div class="hero">
      <button class="what" onclick={() => goDeck(d.path)}><b>{d.name}</b><small>{subOf(sections.pickUp)}</small></button>
      <button onclick={() => goDeck(d.path)}>Edit</button>
      <button class="primary" disabled={d.cards === 0 || !!d.unreadable} onclick={() => attempt(() => showDeckEntry(d))}><Icon name="show" size={15} /> Show</button>
    </div>
  {/if}

  {#if sections.recent.length}
    <h3 class="sec">Recent <button class="go" onclick={() => goLibrary('recent')}>Library</button></h3>
    <div class="cards">{#each sections.recent as r (r.kind === 'deck' ? r.deck.path : r.workspace.id)}{@render tile(r)}{/each}</div>
  {/if}

  {#if sections.pinned.length}
    <h3 class="sec">Pinned <button class="go" onclick={() => goLibrary('pinned')}>Library</button></h3>
    <div class="cards">{#each sections.pinned as r (r.kind === 'deck' ? r.deck.path : r.workspace.id)}{@render tile(r)}{/each}</div>
  {/if}

  {#if sections.nudge}
    <h3 class="sec">Next</h3>
    <p class="nudge muted">When you have a few decks for one project, put them in a workspace. <button class="link" onclick={() => openWorkspaceDialog()}>New workspace</button></p>
  {/if}

  <AiCard />
</div>

{#snippet tile(r: LibraryRef)}
  <button class="tile" onclick={() => open(r)}>
    <span class="t">{#if r.kind === 'workspace'}<Icon name="folder" size={14} /> {/if}{nameOf(r)}</span>
    <span class="s">{subOf(r)}</span>
  </button>
{/snippet}

<style>
  .page {
    max-width: 860px;
    margin: 0 auto;
    padding: 26px 32px 48px;
    container-type: inline-size;
  }

  h1 {
    text-align: center;
    padding-top: 18px;
  }

  h1 em {
    font-style: normal;
    color: var(--accent);
  }

  .lede {
    max-width: 560px;
    margin: 10px auto 0;
    text-align: center;
  }

  .shortcuts {
    display: flex;
    justify-content: center;
    gap: 26px;
    margin: 28px 0 24px;
    flex-wrap: wrap;
  }

  .sc {
    border: 0;
    background: none !important;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 7px;
    font-size: 12.5px;
    font-weight: 400;
    color: var(--text);
    width: 84px;
    padding: 0;
  }

  .sc .c {
    width: 48px;
    height: 48px;
    border-radius: 50%;
    background: var(--accent-soft);
    color: var(--accent-text);
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .sc:hover:not(:disabled) .c {
    box-shadow: 0 0 0 3px var(--accent-soft);
  }

  .sec {
    display: flex;
    align-items: baseline;
    gap: 10px;
    margin: 26px 0 10px;
    font-size: 12px;
    letter-spacing: 0.07em;
    text-transform: uppercase;
    color: var(--faint);
  }

  .go,
  .link {
    border: 0;
    background: none;
    padding: 0;
    font-size: 12.5px;
    font-weight: 600;
    letter-spacing: 0;
    text-transform: none;
    color: var(--accent-text);
  }

  .hero {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 14px 16px;
    border: 1px solid var(--line);
    border-radius: 14px;
    background: var(--card);
  }

  .hero .what {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    border: 0;
    background: none !important;
    padding: 0;
    text-align: left;
    font-weight: 400;
  }

  .hero b {
    font-size: 15.5px;
    max-width: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .hero small {
    color: var(--muted);
  }

  .hero button:not(.what) {
    display: inline-flex;
    align-items: center;
    gap: 6px;
  }

  .cards {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(190px, 1fr));
    gap: 10px;
  }

  .tile {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 3px;
    padding: 12px 14px;
    border: 1px solid var(--line);
    border-radius: 12px;
    background: var(--card);
    text-align: left;
    font-weight: 400;
    color: var(--text);
    min-width: 0;
  }

  .tile:hover {
    border-color: var(--line-strong);
  }

  .tile .t {
    max-width: 100%;
    font-weight: 650;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    display: inline-flex;
    align-items: center;
    gap: 5px;
  }

  .tile .s,
  .nudge {
    font-size: 12.5px;
    color: var(--muted);
  }

  .nudge {
    margin: 0;
  }

  /* Narrow page (smallest window): the shortcuts close up. */
  @container (max-width: 560px) {
    .shortcuts {
      gap: 8px;
    }

    .sc {
      width: 72px;
    }
  }
</style>
