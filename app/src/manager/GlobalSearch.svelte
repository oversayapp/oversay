<script lang="ts">
  // One search bar for the whole app, filled and rounded as Zoom's (task 253, John, 24 Oct). It is not
  // tied to the page you are on: it lists what matches across the app, grouped, and choosing one
  // goes to its page. Filters stay on their own pages (the Decks page's Filter button).
  import { logAction } from '../lib/log'
  import { decks } from '../lib/decks/store'
  import { deckSessions } from '../lib/sessions/store'
  import { difference, runTimes } from '../lib/sessions/runs'
  import { searchEverything, type SearchKind, type Searchable } from '../lib/search/everything'
  import { visibleSections, type SettingsSectionId } from '../lib/settings/sections'
  import { visibleTemplates } from '../lib/templates/library'
  import { library } from '../lib/templates/library-store'
  import Icon from './Icon.svelte'
  import UpdatePill from './UpdatePill.svelte'
  import { supported } from '../lib/updates/store'
  import { back } from './back'
  import type { IconName } from './icons'
  import { goAi, goDeck, goDecks, goHome, goSession, goSessions, goSettings, goTemplates, goWorkspace, goWorkspaces } from './route'
  import { workspaces } from '../lib/workspaces/store'
  import { dateLabel, workspacesWith } from '../lib/workspaces/workspaces'

  const PAGES: Record<string, { label: string; go: () => void }> = {
    home: { label: 'Home', go: goHome },
    decks: { label: 'Decks', go: goDecks },
    workspaces: { label: 'Workspaces', go: goWorkspaces },
    templates: { label: 'Templates', go: goTemplates },
    sessions: { label: 'Sessions', go: goSessions },
    ai: { label: 'AI', go: goAi },
    settings: { label: 'Settings', go: () => goSettings() },
  }
  const ICON: Record<SearchKind, IconName> = { deck: 'deck', workspace: 'folder', session: 'session', template: 'template', setting: 'gear', page: 'arrow' }

  /** Everything the bar can find, and the line under each: a deck by the workspaces it is in, a workspace by its tags (ADR 0040). */
  const items = $derived<(Searchable & { sub: string })[]>([
    ...($decks ?? [])
      .filter((d) => !d.unreadable)
      .map((d) => {
        const names = workspacesWith($workspaces ?? [], d.id).map((w) => w.name)
        const terms = [d.audience, ...d.tags, ...names].filter(Boolean)
        return { kind: 'deck' as const, id: d.path, label: d.name, terms, sub: [d.audience && `for ${d.audience}`, ...names, ...d.tags].filter(Boolean).join(' · ') }
      }),
    ...($workspaces ?? [])
      .filter((w) => w.id)
      .map((w) => ({ kind: 'workspace' as const, id: w.id, label: w.name, terms: [...w.tags, w.where].filter(Boolean), sub: [...w.tags, dateLabel(w.when), w.where].filter(Boolean).join(' · ') || 'Workspace' })),
    // Sessions by their deck's name, newest first, with when each ran (ADR 0041).
    ...($decks ?? [])
      .filter((d) => !d.unreadable)
      .flatMap((d) => ($deckSessions?.get(d.path)?.sessions ?? []).map((s) => ({ d, s, ms: Date.parse(s.startedAt) })))
      .sort((a, b) => b.ms - a.ms)
      .map(({ d, s, ms }) => {
        const when = new Date(ms).toLocaleString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
        const t = runTimes(s)
        return { kind: 'session' as const, id: `${d.path}#${s.startedAt}`, label: d.name, terms: [when], sub: [when, difference(t.planned, t.timed).text].filter(Boolean).join(' · ') }
      }),
    ...visibleTemplates($library).map((t) => ({ kind: 'template' as const, id: t.id, label: t.name, terms: [t.description], sub: t.description })),
    ...visibleSections($supported).map((s) => ({ kind: 'setting' as const, id: s.id, label: s.label, terms: ['Settings'], sub: 'Settings' })),
    ...Object.entries(PAGES).map(([id, p]) => ({ kind: 'page' as const, id, label: p.label, terms: [], sub: 'Page' })),
  ])

  let query = $state('')
  let focused = $state(false)
  let active = $state(0)
  let input = $state<HTMLInputElement | null>(null)

  const groups = $derived(searchEverything(query, items))
  const flat = $derived(groups.flatMap((g) => g.items))
  const open = $derived(focused && query.trim() !== '')
  const subOf = (item: Searchable) => items.find((i) => i.kind === item.kind && i.id === item.id)?.sub ?? ''

  // A new query starts at the best match.
  $effect(() => {
    void query
    active = 0
  })

  function choose(item: Searchable) {
    logAction('search', `${item.kind} ${item.label}`)
    query = ''
    input?.blur()
    if (item.kind === 'deck') goDeck(item.id)
    else if (item.kind === 'workspace') goWorkspace(item.id)
    else if (item.kind === 'session') goSession(item.id.slice(0, item.id.lastIndexOf('#')), item.id.slice(item.id.lastIndexOf('#') + 1))
    else if (item.kind === 'template') goTemplates()
    else if (item.kind === 'setting') goSettings(item.id as SettingsSectionId)
    else PAGES[item.id]?.go()
  }

  function onInputKey(e: KeyboardEvent) {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      if (flat.length) active = (active + (e.key === 'ArrowDown' ? 1 : flat.length - 1)) % flat.length
    } else if (e.key === 'Enter' && flat[active]) {
      e.preventDefault()
      choose(flat[active])
    } else if (e.key === 'Escape') {
      query = ''
      input?.blur()
    }
  }

  /** ⌘F (Ctrl+F) goes to the bar from anywhere. */
  function onWindowKey(e: KeyboardEvent) {
    if ((e.metaKey || e.ctrlKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === 'f') {
      e.preventDefault()
      input?.focus()
      input?.select()
    }
  }
</script>

<svelte:window onkeydown={onWindowKey} />

<div class="topbar">
  <!-- The bar's row has the page's width, so the way back lines up with the page's text (back.ts). -->
  <div class="inner" class:tight={$back?.tight} style="max-width: {$back?.width ?? 960}px">
  <span class="side">
    {#if $back}
      {@const b = $back}
      <button class="back" onclick={() => b.go()}><Icon name="back" size={15} /> {b.label}</button>
    {/if}
  </span>
  <div class="find" class:open>
    <label class="search" class:idle={!query}>
      <Icon name="search" size={15} />
      <input
        type="search"
        aria-label="Search Oversay"
        role="combobox"
        aria-expanded={open}
        aria-controls="search-results"
        aria-activedescendant={open && flat[active] ? `sr-${active}` : undefined}
        autocomplete="off"
        spellcheck="false"
        bind:this={input}
        bind:value={query}
        onfocus={() => (focused = true)}
        onblur={() => (focused = false)}
        onkeydown={onInputKey}
      />
      <!-- Centred while empty, as Zoom's is; it moves aside once you type. -->
      <span class="hint" aria-hidden="true">Search (⌘F)</span>
    </label>
    {#if open}
      <!-- mousedown keeps the focus in the bar, so a click lands before it closes. -->
      <div class="results" id="search-results" role="listbox" aria-label="Results" tabindex="-1" onmousedown={(e) => e.preventDefault()}>
        {#each groups as g (g.kind)}
          <h4>{g.label}</h4>
          {#each g.items as item (item.kind + item.id)}
            {@const i = flat.indexOf(item)}
            <button
              id="sr-{i}"
              role="option"
              aria-selected={i === active}
              class:active={i === active}
              onmouseenter={() => (active = i)}
              onclick={() => choose(item)}
            >
              <span class="ic"><Icon name={ICON[item.kind]} size={16} /></span>
              <span class="what">
                <span class="t">{item.label}</span>
                {#if subOf(item)}<span class="s">{subOf(item)}</span>{/if}
              </span>
            </button>
          {/each}
        {:else}
          <p class="none">Nothing matches “{query.trim()}”.</p>
        {/each}
      </div>
    {/if}
  </div>
  <UpdatePill />
  </div>
</div>

<style>
  .topbar {
    flex: none;
    container-type: inline-size;
    padding: 10px 0;
    border-bottom: 1px solid var(--line);
    background: var(--bg);
  }

  .inner {
    margin: 0 auto;
    padding: 0 32px;
    display: grid;
    /* The way back at the left, the search in the middle while there's room. */
    grid-template-columns: minmax(max-content, 1fr) minmax(0, 560px) 1fr;
    align-items: center;
    gap: 12px;
  }

  .side {
    min-width: 0;
  }

  /* A page whose side padding narrows (Settings) narrows the bar's too, so they still line up. */
  @container (max-width: 760px) {
    .inner.tight {
      padding: 0 16px;
    }
  }

  .back {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    border: 0;
    background: none;
    padding: 4px 6px 4px 0;
    color: var(--accent-text);
    font-weight: 600;
    white-space: nowrap;
  }

  .find {
    position: relative;
    width: 100%;
    background: var(--rail);
    border: 1px solid transparent;
    border-radius: 10px;
    transition: border-color 0.15s, background 0.15s;
  }

  .find:focus-within {
    background: var(--bg);
    border-color: var(--accent);
  }

  .search {
    position: relative;
    display: flex;
    align-items: center;
    gap: 7px;
    padding: 0 11px;
    color: var(--muted);
  }

  .search input,
  .search input:hover {
    flex: 1;
    min-width: 0;
    border: 0;
    background: none;
    padding: 7px 0;
    outline: none;
  }

  .search input::-webkit-search-decoration {
    appearance: none;
  }

  .hint {
    display: none;
    pointer-events: none;
  }

  /* Empty and not focused: the icon and "Search (⌘F)" sit in the middle of the bar. */
  .search.idle:not(:focus-within) {
    justify-content: center;
  }

  .search.idle:not(:focus-within) input {
    position: absolute;
    inset: 0;
    width: 100%;
    padding-left: 11px;
  }

  .search.idle:not(:focus-within) .hint {
    display: inline;
  }

  .results {
    position: absolute;
    top: calc(100% + 6px);
    left: 0;
    right: 0;
    z-index: 50;
    max-height: min(70vh, 520px);
    overflow: auto;
    padding: 4px 6px 8px;
    background: var(--card);
    border: 1px solid var(--line-strong);
    border-radius: 12px;
    box-shadow: 0 14px 38px rgba(0, 0, 0, 0.2);
  }

  h4 {
    margin: 10px 10px 4px;
    font-size: 11.5px;
    letter-spacing: 0.07em;
    text-transform: uppercase;
    color: var(--faint);
  }

  .results button {
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
    font-weight: 400;
  }

  .results button.active {
    background: var(--accent-soft);
  }

  .ic {
    color: var(--muted);
    display: inline-flex;
  }

  .what {
    display: flex;
    flex-direction: column;
    min-width: 0;
  }

  .t {
    font-weight: 600;
  }

  .s {
    font-size: 12.5px;
    color: var(--muted);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .none {
    margin: 10px;
    color: var(--muted);
  }
</style>
