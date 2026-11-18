<script lang="ts">
  // Sessions on the rail (ADR 0041, 0048; spec §11): every run of every deck as one list, newest first, narrowed by
  // tabs (All, This week, Needs a review, then a person's own saved views) and by chips (Workspace, Deck, Status,
  // When), and grouped as chosen. With one deck chosen, its Record on start, stats and trend sit above the list;
  // with one workspace, a summary line. The app's one search bar finds sessions by deck, workspace and note.
  import { count } from '../lib/words'
  import { decks } from '../lib/decks/store'
  import { deckSessions } from '../lib/sessions/store'
  import { settings, sessionViews, changeSessionViews } from '../lib/settings/store'
  import {
    GROUPS,
    NO_BROWSE,
    PAGE_RUNS,
    STATUSES,
    WHENS,
    browseFilterCount,
    deckChoices,
    decksInScope,
    filterMarked,
    groupMarked,
    markRuns,
    type BrowseFilters,
    type DeckChoice,
    type GroupMode,
    type StatusKey,
    type WhenKey,
  } from '../lib/sessions/browse'
  import { everyRun } from '../lib/sessions/runs'
  import { sessionsPage } from '../lib/sessions/page-state'
  import { BUILT_IN_VIEWS, canSaveView, suggestedName, tabFor, withView, withoutView } from '../lib/sessions/views'
  import { workspaces } from '../lib/workspaces/store'
  import { findWorkspace, workspacesWith } from '../lib/workspaces/workspaces'
  import Icon from './Icon.svelte'
  import SessionRow from './SessionRow.svelte'
  import SessionsDeckHead from './SessionsDeckHead.svelte'
  import { goLibrary } from './route'

  const entries = $derived(($decks ?? []).filter((d) => !d.unreadable))
  const workspaceName = (id: string) => findWorkspace($workspaces ?? [], id)?.name ?? id
  const memberOf = (id: string) => workspacesWith($workspaces ?? [], id).map((w) => w.id)

  const everything = $derived(
    markRuns(
      everyRun(
        entries.map((d) => ({
          deck: { path: d.path, id: d.id, name: d.name, audience: d.audience, workspaces: memberOf(d.id) },
          sessions: $deckSessions?.get(d.path)?.sessions ?? [],
        })),
      ),
      (path) => $deckSessions?.get(path),
    ),
  )

  const filters = $derived($sessionsPage.filters)
  const group = $derived($sessionsPage.group)
  const limit = $derived($sessionsPage.limit)
  const nFilters = $derived(browseFilterCount(filters))
  const setFilters = (next: BrowseFilters) => sessionsPage.update((s) => ({ ...s, filters: next, limit: PAGE_RUNS }))
  const setGroup = (g: GroupMode) => sessionsPage.update((s) => ({ ...s, group: g, limit: PAGE_RUNS }))
  const toggle = <T extends string>(list: readonly T[], v: T): T[] => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v])

  const keyOf = (d: { id: string; path: string }) => d.id || d.path
  const choices = $derived<DeckChoice[]>(
    entries.map((d) => ({ key: keyOf(d), name: d.name, workspaces: memberOf(d.id), runs: everything.filter((r) => r.deck.path === d.path).length })),
  )
  const deckName = (key: string) => choices.find((d) => d.key === key)?.name ?? key
  const workspaceChoices = $derived(
    ($workspaces ?? []).filter((w) => w.id).sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })),
  )
  const runsIn = (id: string) => everything.filter((r) => r.deck.workspaces.includes(id)).length

  const shown = $derived(filterMarked(everything, filters, Date.now()))
  const page = $derived(groupMarked(shown, group, Date.now(), limit))

  const tab = $derived(tabFor(filters, $sessionViews))
  const saveable = $derived(canSaveView(filters, $sessionViews))

  const one = $derived(filters.decks.length === 1 ? (entries.find((d) => keyOf(d) === filters.decks[0]) ?? null) : null)
  const oneRuns = $derived(one ? everything.filter((r) => r.deck.path === one.path) : [])
  const oneWorkspace = $derived(!one && filters.workspaces.length === 1 ? findWorkspace($workspaces ?? [], filters.workspaces[0]) : null)
  const recordsOnStart = (path: string) => {
    const d = entries.find((x) => x.path === path)
    return !!d && (d.recordOnStart === 'on' || (d.recordOnStart === 'global' && !!$settings.autoRecord))
  }

  // Which chip's menu is open, the Deck menu's search, and the name being given to a view to save.
  let pop = $state<null | 'ws' | 'deck' | 'status' | 'when' | 'group'>(null)
  let deckQuery = $state('')
  let naming = $state<string | null>(null)
  const deckMenu = $derived(deckChoices(choices, filters.workspaces, deckQuery))

  const toggleWorkspace = (id: string) => {
    const workspaces = toggle(filters.workspaces, id)
    setFilters({ ...filters, workspaces, decks: decksInScope(filters.decks, choices, workspaces) })
  }

  function saveView() {
    if (naming === null) return
    const name = naming
    naming = null
    void changeSessionViews((views) => withView(views, name, filters, `v_${Date.now().toString(36)}`), `save ${name.trim()}`)
  }

  const chips = $derived([
    ...filters.workspaces.map((id) => ({ label: `Workspace: ${workspaceName(id)}`, off: () => toggleWorkspace(id) })),
    ...filters.decks.map((key) => ({ label: `Deck: ${deckName(key)}`, off: () => setFilters({ ...filters, decks: filters.decks.filter((k) => k !== key) }) })),
    ...filters.status.map((k) => ({ label: STATUSES.find((s) => s.id === k)?.label ?? k, off: () => setFilters({ ...filters, status: filters.status.filter((x) => x !== k) }) })),
    ...(filters.when !== 'any' ? [{ label: WHENS.find((w) => w.id === filters.when)?.label ?? '', off: () => setFilters({ ...filters, when: 'any' }) }] : []),
  ])

  const loaded = $derived($decks !== null && $deckSessions !== null)
</script>

<svelte:window
  onkeydown={(e) => {
    if (e.key === 'Escape') {
      pop = null
      naming = null
    }
  }}
  onclick={(e) => {
    if (pop && !(e.target as HTMLElement).closest('.pw')) pop = null
  }}
/>

<div class="page">
  <header class="phead">
    <h1>Sessions</h1>
    {#if everything.length > 0}<span class="muted cnt">{count(shown.length, 'run')}{nFilters ? ` of ${everything.length}` : ''}</span>{/if}
  </header>

  {#if loaded && everything.length === 0 && !one}
    <div class="empty">
      <p><b>No sessions yet.</b> Every time you Start a deck, the run is kept here: each card's planned and actual time, your note, a transcript and a review.</p>
      <ol>
        <li>Open a deck in the Library.</li>
        <li>Press <b>Show</b>, then <b>Start</b> in the widget.</li>
        <li>When you stop, the run's page opens here.</li>
      </ol>
      <button class="primary" onclick={() => goLibrary()}><Icon name="deck" size={16} /> Open the Library</button>
    </div>
  {:else}
    <div class="tabs" role="tablist" aria-label="Views">
      {#each [...BUILT_IN_VIEWS, ...$sessionViews] as v (v.id)}
        {@const on = tab?.id === v.id}
        <span class="tabwrap" class:on>
          <button role="tab" aria-selected={on} onclick={() => setFilters(v.filters)}>{v.name}</button>
          {#if on && !BUILT_IN_VIEWS.some((b) => b.id === v.id)}
            <button class="x" title="Remove this saved view" aria-label="Remove the view {v.name}" onclick={() => void changeSessionViews((views) => withoutView(views, v.id), `remove ${v.name}`)}
              ><Icon name="close" size={12} /></button
            >
          {/if}
        </span>
      {/each}
      {#if saveable && naming === null}
        <button class="add" onclick={() => (naming = suggestedName(filters, { workspace: workspaceName, deck: deckName }))}>+ Save this view</button>
      {/if}
    </div>
    {#if naming !== null}
      <form class="naming" onsubmit={(e) => (e.preventDefault(), saveView())}>
        <!-- svelte-ignore a11y_autofocus -->
        <input aria-label="Name for this view" maxlength="60" bind:value={naming} autofocus />
        <button class="primary" type="submit" disabled={!naming.trim()}>Save view</button>
        <button type="button" onclick={() => (naming = null)}>Cancel</button>
      </form>
    {/if}

    <div class="frow">
      <div class="pw">
        <button class="fbtn" class:on={filters.workspaces.length > 0} aria-haspopup="true" aria-expanded={pop === 'ws'} onclick={() => (pop = pop === 'ws' ? null : 'ws')}
          >Workspace{filters.workspaces.length ? ` · ${filters.workspaces.length}` : ''} <Icon name="chevron" size={12} /></button
        >
        {#if pop === 'ws'}
          <div class="pop" role="group" aria-label="Workspace">
            {#each workspaceChoices as w (w.id)}
              <label><input type="checkbox" checked={filters.workspaces.includes(w.id)} onchange={() => toggleWorkspace(w.id)} />{w.name}<small>{count(runsIn(w.id), 'run')}</small></label>
            {:else}
              <span class="none">No workspaces yet.</span>
            {/each}
          </div>
        {/if}
      </div>
      <div class="pw">
        <button class="fbtn" class:on={filters.decks.length > 0} aria-haspopup="true" aria-expanded={pop === 'deck'} onclick={() => (pop = pop === 'deck' ? null : 'deck')}
          >Deck{filters.decks.length ? ` · ${filters.decks.length}` : ''} <Icon name="chevron" size={12} /></button
        >
        {#if pop === 'deck'}
          <div class="pop wide" role="group" aria-label="Deck">
            <!-- svelte-ignore a11y_autofocus -->
            <input type="search" placeholder="Find a deck" aria-label="Find a deck" bind:value={deckQuery} autofocus />
            {#if filters.workspaces.length}<h6>Decks in the chosen workspaces</h6>{/if}
            {#each deckMenu.shown as d (d.key)}
              <label
                ><input type="checkbox" checked={filters.decks.includes(d.key)} onchange={() => setFilters({ ...filters, decks: toggle(filters.decks, d.key) })} />{d.name}<small>{d.runs ? count(d.runs, 'run') : 'never run'}</small></label
              >
            {:else}
              <span class="none">No deck found.</span>
            {/each}
            {#if deckMenu.total > deckMenu.shown.length}<span class="none">{deckMenu.total - deckMenu.shown.length} more: type to find one.</span>{/if}
          </div>
        {/if}
      </div>
      <div class="pw">
        <button class="fbtn" class:on={filters.status.length > 0} aria-haspopup="true" aria-expanded={pop === 'status'} onclick={() => (pop = pop === 'status' ? null : 'status')}
          >Status{filters.status.length ? ` · ${filters.status.length}` : ''} <Icon name="chevron" size={12} /></button
        >
        {#if pop === 'status'}
          <div class="pop" role="group" aria-label="Status">
            {#each STATUSES as s (s.id)}
              <label><input type="checkbox" checked={filters.status.includes(s.id)} onchange={() => setFilters({ ...filters, status: toggle<StatusKey>(filters.status, s.id) })} />{s.label}</label>
            {/each}
          </div>
        {/if}
      </div>
      <div class="pw">
        <button class="fbtn" class:on={filters.when !== 'any'} aria-haspopup="true" aria-expanded={pop === 'when'} onclick={() => (pop = pop === 'when' ? null : 'when')}
          >{filters.when === 'any' ? 'When' : WHENS.find((w) => w.id === filters.when)?.label} <Icon name="chevron" size={12} /></button
        >
        {#if pop === 'when'}
          <div class="pop" role="radiogroup" aria-label="When">
            {#each WHENS as w (w.id)}
              <label><input type="radio" name="when" checked={filters.when === w.id} onchange={() => (setFilters({ ...filters, when: w.id as WhenKey }), (pop = null))} />{w.label}</label>
            {/each}
          </div>
        {/if}
      </div>
      <span class="grow"></span>
      <span class="muted small">Group by</span>
      <div class="pw right">
        <button class="fbtn" aria-haspopup="true" aria-expanded={pop === 'group'} onclick={() => (pop = pop === 'group' ? null : 'group')}
          >{GROUPS.find((g) => g.id === group)?.label} <Icon name="chevron" size={12} /></button
        >
        {#if pop === 'group'}
          <div class="pop" role="radiogroup" aria-label="Group by">
            {#each GROUPS as g (g.id)}
              <label><input type="radio" name="group" checked={group === g.id} onchange={() => (setGroup(g.id), (pop = null))} />{g.label}</label>
            {/each}
          </div>
        {/if}
      </div>
    </div>

    {#if chips.length}
      <div class="active" role="group" aria-label="Filters on">
        {#each chips as c (c.label)}
          <span class="token">{c.label}<button aria-label="Remove {c.label}" title="Take this filter off" onclick={c.off}><Icon name="close" size={12} /></button></span>
        {/each}
        <button class="link" onclick={() => setFilters(NO_BROWSE)}>Clear all</button>
      </div>
    {/if}

    {#if one}
      <SessionsDeckHead deck={one} runs={oneRuns} workspaces={memberOf(one.id).map(workspaceName)} />
    {:else if oneWorkspace}
      <p class="summary">
        <b>{oneWorkspace.name}</b>
        <span>{count(oneWorkspace.decks.length, 'deck')}</span>
        <span>{count(runsIn(oneWorkspace.id), 'run')}</span>
        <span><b>{everything.filter((r) => r.needsReview && r.deck.workspaces.includes(oneWorkspace.id)).length}</b> to review</span>
      </p>
    {/if}

    {#if one && oneRuns.length === 0}
      <!-- A deck never run: its head says so. -->
    {:else if shown.length === 0}
      <div class="empty small">
        <p>No runs match these filters.</p>
        <button onclick={() => setFilters(NO_BROWSE)}>Clear all</button>
      </div>
    {:else}
      {#each page.groups as g (g.label)}
        {#if g.label}<h3 class="sec">{g.label} <span class="cnt">{count(g.total, 'run')}</span></h3>{/if}
        <ul class="runs" class:ungrouped={!g.label}>
          {#each g.runs as r (r.deck.path + r.session.startedAt)}
            <li><SessionRow run={r} {workspaceName} records={recordsOnStart(r.deck.path)} /></li>
          {/each}
        </ul>
      {/each}
      {#if page.hidden > 0}
        <button class="more" onclick={() => sessionsPage.update((s) => ({ ...s, limit: s.limit + PAGE_RUNS }))}
          >Show {Math.min(PAGE_RUNS, page.hidden)} more <span class="muted">{page.hidden} left</span></button
        >
      {/if}
    {/if}
    {#if everything.length > 0}
      <p class="keep">A deck keeps its newest 20 sessions, and any you've written a note on, transcribed or reviewed.</p>
    {/if}
  {/if}
</div>

<style>
  .page {
    max-width: 980px;
    margin: 0 auto;
    padding: 26px 32px 48px;
  }

  .phead {
    display: flex;
    align-items: baseline;
    gap: 12px;
  }

  .cnt {
    font-size: 13px;
  }

  .small {
    font-size: 12.5px;
  }

  .grow {
    flex: 1;
  }

  /* Tabs: three ready-made, then the person's own. Scroll sideways rather than wrap, on a narrow window. */
  .tabs {
    display: flex;
    align-items: center;
    gap: 2px;
    margin-top: 12px;
    border-bottom: 1px solid var(--line);
    overflow-x: auto;
    scrollbar-width: none;
  }

  .tabwrap {
    display: inline-flex;
    align-items: center;
    border-bottom: 2px solid transparent;
    margin-bottom: -1px;
    white-space: nowrap;
  }

  .tabwrap.on {
    border-bottom-color: var(--accent);
  }

  .tabwrap button,
  .add {
    border: 0;
    background: none;
    padding: 8px 12px;
    font-size: 13.5px;
    font-weight: 600;
    color: var(--muted);
    white-space: nowrap;
  }

  .tabwrap.on button[role='tab'] {
    color: var(--accent-text);
  }

  .tabwrap .x {
    padding: 4px;
    margin-left: -8px;
    border-radius: 6px;
    line-height: 0;
  }

  .add {
    color: var(--accent-text);
  }

  .naming {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin-top: 10px;
  }

  .naming input {
    flex: 1;
    min-width: 200px;
  }

  .frow {
    position: relative;
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 8px;
    margin-top: 12px;
  }

  .pw {
    position: relative;
  }

  .fbtn {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 4px 11px;
    border-radius: 99px;
    border: 1px solid var(--line-strong);
    background: var(--card);
    color: var(--muted);
    font-size: 13px;
    font-weight: 600;
    white-space: nowrap;
  }

  .fbtn.on {
    background: var(--accent-soft);
    border-color: color-mix(in srgb, var(--accent) 45%, transparent);
    color: var(--accent-text);
  }

  .pop {
    position: absolute;
    top: calc(100% + 6px);
    left: 0;
    z-index: 30;
    display: flex;
    flex-direction: column;
    gap: 2px;
    width: 250px;
    max-height: 340px;
    overflow: auto;
    padding: 8px;
    background: var(--card);
    border: 1px solid var(--line-strong);
    border-radius: 12px;
    box-shadow: 0 12px 34px rgba(0, 0, 0, 0.18);
  }

  .pop.wide {
    width: 290px;
  }

  .pw.right .pop {
    left: auto;
    right: 0;
  }

  .pop label {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 5px 6px;
    border-radius: 7px;
    font-size: 13px;
    cursor: pointer;
  }

  .pop label:hover {
    background: var(--hover);
  }

  .pop label small {
    margin-left: auto;
    color: var(--faint);
    font-size: 11.5px;
    white-space: nowrap;
  }

  .pop h6 {
    margin: 6px 6px 2px;
    font-size: 11px;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--faint);
  }

  .none {
    padding: 6px;
    font-size: 12.5px;
    color: var(--faint);
  }

  .active {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px 8px;
    margin: 12px 0 0;
  }

  .token {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 2px 4px 2px 11px;
    border-radius: 99px;
    border: 1px solid color-mix(in srgb, var(--accent) 45%, transparent);
    background: var(--accent-soft);
    color: var(--accent-text);
    font-size: 13px;
    font-weight: 600;
  }

  .token button {
    border: 0;
    background: none;
    padding: 3px;
    line-height: 0;
    color: inherit;
  }

  .link {
    border: 0;
    background: none;
    color: var(--accent-text);
    font-weight: 600;
    font-size: 13px;
    padding: 2px 4px;
  }

  .summary {
    display: flex;
    flex-wrap: wrap;
    gap: 4px 18px;
    margin: 14px 0 0;
    font-size: 13px;
    color: var(--muted);
  }

  .summary b {
    color: var(--text);
  }

  .sec {
    margin: 22px 0 8px;
    font-size: 12px;
    letter-spacing: 0.07em;
    text-transform: uppercase;
    color: var(--faint);
  }

  .sec .cnt {
    font-weight: 500;
    letter-spacing: 0;
  }

  .runs {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .runs.ungrouped {
    margin-top: 16px;
  }

  .more {
    display: block;
    margin: 14px auto 0;
  }

  .keep {
    margin-top: 28px;
    font-size: 12.5px;
    color: var(--faint);
  }

  .empty {
    margin-top: 18px;
    padding: 26px;
    border: 1.5px dashed var(--line-strong);
    border-radius: 14px;
    text-align: center;
    color: var(--muted);
  }

  .empty ol {
    display: inline-block;
    margin: 6px 0 14px;
    text-align: left;
  }

  .empty.small {
    padding: 18px;
  }

  .empty p {
    margin: 0 0 8px;
  }

  .empty button {
    display: inline-flex;
    align-items: center;
    gap: 6px;
  }

  @media (max-width: 760px) {
    .page {
      padding: 20px 16px 40px;
    }
  }
</style>
