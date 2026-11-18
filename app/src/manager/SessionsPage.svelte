<script lang="ts">
  // Sessions on the rail (ADR 0041): every run of
  // every deck, newest first, grouped by the day it started as Decks is. Each row: when it started,
  // the deck and its workspaces, how long it ran against the plan, a bar of each card's time, and
  // what has been written about it. Filter narrows by workspace, deck and dates; the app's one search
  // bar finds sessions by their deck.
  import { formatDuration } from '../lib/project/duration'
  import { count } from '../lib/words'
  import { decks } from '../lib/decks/store'
  import { deckSessions } from '../lib/sessions/store'
  import { sessionName } from '../lib/decks/sessions'
  import {
    NO_SESSION_FILTERS,
    RUN_RANGES,
    deckKey,
    difference,
    everyRun,
    filterRuns,
    groupRunsByDay,
    runTimes,
    sessionFilterCount,
    type Run,
    type RunRange,
    type SessionFilters,
  } from '../lib/sessions/runs'
  import { workspaces } from '../lib/workspaces/store'
  import { findWorkspace, workspacesWith } from '../lib/workspaces/workspaces'
  import Icon from './Icon.svelte'
  import RunBar from './RunBar.svelte'
  import { goLibrary, goSession } from './route'

  const runs = $derived(
    everyRun(
      ($decks ?? [])
        .filter((d) => !d.unreadable)
        .map((d) => ({
          deck: { path: d.path, id: d.id, name: d.name, audience: d.audience, workspaces: workspacesWith($workspaces ?? [], d.id).map((w) => w.id) },
          sessions: $deckSessions?.get(d.path)?.sessions ?? [],
        })),
    ),
  )

  let filters = $state<SessionFilters>({ ...NO_SESSION_FILTERS })
  let filterOpen = $state(false)
  const filterCount = $derived(sessionFilterCount(filters))
  const shown = $derived(filterRuns(runs, filters, Date.now()))
  const groups = $derived(groupRunsByDay(shown, Date.now()))

  /** The filters' choices: the workspaces and decks that have runs, by name. */
  const workspaceChoices = $derived(
    [...new Set(runs.flatMap((r) => r.deck.workspaces))]
      .map((id) => ({ id, name: findWorkspace($workspaces ?? [], id)?.name ?? id }))
      .sort((a, b) => a.name.localeCompare(b.name)),
  )
  const deckChoices = $derived(
    [...new Map(runs.map((r) => [deckKey(r.deck), r.deck.name])).entries()].map(([key, name]) => ({ key, name })).sort((a, b) => a.name.localeCompare(b.name)),
  )
  const workspaceName = (id: string) => findWorkspace($workspaces ?? [], id)?.name ?? id
  const deckName = (key: string) => deckChoices.find((d) => d.key === key)?.name ?? key
  const rangeLabel = (r: RunRange) => (r === 'dates' ? datesLabel() : (RUN_RANGES.find((x) => x.id === r)?.label ?? ''))
  const datesLabel = () => [filters.from && `From ${filters.from}`, filters.to && `to ${filters.to}`].filter(Boolean).join(' ') || 'Between dates'
  const toggle = (list: readonly string[], v: string) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v])

  const clock = (ms: number) => new Date(ms).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
  const day = (ms: number) => new Date(ms).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })

  /** What has been written about a run: its note, transcript, recording waiting and review. */
  function marks(r: Run): { note: boolean; transcript: boolean; recording: boolean; review: boolean } {
    const runs = $deckSessions?.get(r.deck.path)
    const name = sessionName(runs?.sessions ?? [], r.session)
    const has = (list: string[] | undefined) => !!list?.includes(name)
    return { note: !!r.session.note, transcript: has(runs?.files.transcripts), recording: has(runs?.files.recordings), review: has(runs?.files.reviews) }
  }

  /** How long it ran, any pause, and its plan, under the deck's name. */
  function about(r: Run): string {
    const t = runTimes(r.session)
    const plan = t.planned ? `planned ${formatDuration(t.planned)}${t.untimed ? ' + untimed' : ''}` : 'untimed'
    const paused = r.session.pausedSeconds ? `, paused ${formatDuration(r.session.pausedSeconds)}` : ''
    return [r.deck.audience && `for ${r.deck.audience}`, `ran ${formatDuration(t.ran)}${paused}`, plan].filter(Boolean).join(' · ')
  }
</script>

<svelte:window
  onkeydown={(e) => {
    if (filterOpen && e.key === 'Escape') filterOpen = false
  }}
  onclick={(e) => {
    if (filterOpen && !(e.target as HTMLElement).closest('.fwrap')) filterOpen = false
  }}
/>

<div class="page">
  <header class="phead">
    <h1>Sessions</h1>
    {#if runs.length > 0}
      <div class="fwrap">
        <button
          class="ftoggle"
          class:on={filterCount > 0}
          aria-haspopup="dialog"
          aria-expanded={filterOpen}
          title="Filter"
          aria-label="Filter sessions{filterCount ? `, ${filterCount} on` : ''}"
          onclick={() => (filterOpen = !filterOpen)}
          ><Icon name="filter" size={16} /> Filter{#if filterCount}<span class="badge">{filterCount}</span>{/if}</button
        >
        {#if filterOpen}
          <div class="fpanel" role="dialog" aria-label="Filter sessions">
            {#if workspaceChoices.length}
              <h4>Workspace</h4>
              <div class="opts">
                {#each workspaceChoices as w (w.id)}
                  {@const on = filters.workspaces.includes(w.id)}
                  <button class="fchip" class:on aria-pressed={on} onclick={() => (filters = { ...filters, workspaces: toggle(filters.workspaces, w.id) })}>{w.name}</button>
                {/each}
              </div>
            {/if}
            <h4>Deck</h4>
            <div class="opts">
              {#each deckChoices as d (d.key)}
                {@const on = filters.decks.includes(d.key)}
                <button class="fchip" class:on aria-pressed={on} onclick={() => (filters = { ...filters, decks: toggle(filters.decks, d.key) })}>{d.name}</button>
              {/each}
            </div>
            <h4>When it ran</h4>
            <div class="opts">
              {#each RUN_RANGES as r (r.id)}
                {@const on = filters.range === r.id}
                <button class="fchip" class:on aria-pressed={on} onclick={() => (filters = { ...filters, range: r.id })}>{r.label}</button>
              {/each}
            </div>
            {#if filters.range === 'dates'}
              <div class="dates">
                <label>From <input type="date" aria-label="From" bind:value={filters.from} /></label>
                <label>to <input type="date" aria-label="To" bind:value={filters.to} /></label>
              </div>
            {/if}
            <div class="ffoot">
              <span class="fcount">{shown.length} of {count(runs.length, 'session')}</span>
              <button class="link" disabled={filterCount === 0} onclick={() => (filters = { ...NO_SESSION_FILTERS })}>Clear all</button>
            </div>
          </div>
        {/if}
      </div>
    {/if}
  </header>
  <p class="muted">Every time a deck was started. Each card's time against its plan, newest first.</p>

  {#if filterCount > 0}
    <!-- The filters that are on, each with × to take it off. -->
    <div class="active" role="group" aria-label="Filters on">
      <span class="fcount">{shown.length} of {runs.length}</span>
      {#each filters.workspaces as id (id)}
        <button class="token" aria-label="Remove workspace {workspaceName(id)}" onclick={() => (filters = { ...filters, workspaces: toggle(filters.workspaces, id) })}
          >{workspaceName(id)} <Icon name="close" size={12} /></button
        >
      {/each}
      {#each filters.decks as key (key)}
        <button class="token" aria-label="Remove deck {deckName(key)}" onclick={() => (filters = { ...filters, decks: toggle(filters.decks, key) })}
          >{deckName(key)} <Icon name="close" size={12} /></button
        >
      {/each}
      {#if filters.range !== 'all'}
        <button class="token" aria-label="Remove {rangeLabel(filters.range)}" onclick={() => (filters = { ...filters, range: 'all', from: '', to: '' })}
          >{rangeLabel(filters.range)} <Icon name="close" size={12} /></button
        >
      {/if}
      <button class="link" onclick={() => (filters = { ...NO_SESSION_FILTERS })}>Clear</button>
    </div>
  {/if}

  {#if $decks && $deckSessions && runs.length === 0}
    <div class="empty">
      <p><b>No sessions yet.</b> Show a deck and press Start: each run is kept here, card by card, to look back on.</p>
      <button class="primary" onclick={() => goLibrary()}><Icon name="deck" size={16} /> Go to the Library</button>
    </div>
  {:else}
    {#each groups as g (g.label)}
      <h3 class="sec">{g.label} <span class="cnt">{g.runs.length}</span></h3>
      <ul class="runs">
        {#each g.runs as r (r.deck.path + r.session.startedAt)}
          {@const t = runTimes(r.session)}
          {@const d = difference(t.planned, t.timed)}
          {@const m = marks(r)}
          <li>
            <button class="open" aria-label="{r.deck.name}, {day(r.startedMs)} {clock(r.startedMs)}" onclick={() => goSession(r.deck.path, r.session.startedAt)}>
              <span class="at num">{clock(r.startedMs)}<small>{day(r.startedMs)}</small></span>
              <span class="what">
                <span class="line">
                  <span class="t">{r.deck.name}</span>
                  {#each r.deck.workspaces as id (id)}<span class="chip">{workspaceName(id)}</span>{/each}
                </span>
                <span class="p">{about(r)}</span>
                {#if m.note || m.transcript || m.recording || m.review}
                  <span class="marks">
                    {#if m.note}<span class="mark">✎ Note</span>{/if}
                    {#if m.transcript}<span class="mark">≡ Transcript</span>{/if}
                    {#if m.recording && !m.transcript}<span class="mark"><span class="rec"></span> Recording</span>{/if}
                    {#if m.review}<span class="mark review">✦ Review</span>{/if}
                  </span>
                {/if}
              </span>
              <span class="plan">
                <RunBar cards={r.session.cards} />
                <span class="tot num" class:over={d.over === true} class:under={d.over === false}>{d.text}</span>
              </span>
            </button>
          </li>
        {/each}
      </ul>
    {/each}
    {#if runs.length > 0 && shown.length === 0}
      <p class="muted">No sessions match these filters.</p>
    {/if}
    {#if runs.length > 0}
      <p class="keep">A deck keeps its newest 20 sessions, and any you've written a note on, transcribed or reviewed.</p>
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
    gap: 10px;
    flex-wrap: wrap;
  }

  .phead h1 {
    margin-right: auto;
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

  .dates {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin-top: 8px;
    font-size: 12.5px;
    color: var(--muted);
  }

  .dates label {
    display: inline-flex;
    align-items: center;
    gap: 6px;
  }

  .dates input {
    padding: 3px 6px;
    font-size: 12.5px;
  }

  .ffoot {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-top: 14px;
    padding-top: 10px;
    border-top: 1px solid var(--line);
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
    color: var(--faint);
  }

  .runs {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  /* Each run a card, as a deck is on Decks: when, the deck, and its cards as a bar. */
  .open {
    display: grid;
    grid-template-columns: 56px minmax(0, 1fr) minmax(140px, 220px);
    gap: 14px;
    align-items: center;
    width: 100%;
    padding: 11px 14px;
    border: 1px solid var(--line);
    border-radius: 14px;
    background: var(--card);
    text-align: left;
    font-weight: 400;
  }

  .open:hover {
    border-color: var(--line-strong);
    background: var(--card);
  }

  .at {
    display: flex;
    flex-direction: column;
    font-weight: 650;
  }

  .at small {
    font-weight: 400;
    font-size: 12px;
    color: var(--faint);
  }

  .what {
    display: flex;
    flex-direction: column;
    min-width: 0;
    gap: 2px;
  }

  .line {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 4px 6px;
    min-width: 0;
  }

  .t {
    font-weight: 650;
    font-size: 15px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .chip {
    padding: 0 7px;
    border-radius: 99px;
    background: var(--accent-soft);
    color: var(--accent-text);
    font-size: 11.5px;
    font-weight: 600;
    line-height: 18px;
    white-space: nowrap;
  }

  .p {
    font-size: 12.5px;
    color: var(--muted);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .marks {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
    margin-top: 4px;
  }

  .mark {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 1px 6px;
    border-radius: 6px;
    background: var(--rail);
    color: var(--muted);
    font-size: 11px;
    font-weight: 650;
    white-space: nowrap;
  }

  .mark.review {
    background: var(--accent-soft);
    color: var(--accent-text);
  }

  .rec {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: var(--danger);
  }

  .plan {
    display: flex;
    flex-direction: column;
    gap: 5px;
  }

  .tot {
    font-size: 12.5px;
    font-weight: 650;
    text-align: right;
    color: var(--muted);
  }

  .tot.over {
    color: var(--danger);
  }

  .tot.under {
    color: var(--ok);
  }

  .num {
    font-variant-numeric: tabular-nums;
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

  .empty button {
    display: inline-flex;
    align-items: center;
    gap: 6px;
  }

  /* Narrow: the bar goes under the deck's name. Last, so it wins over the rules above. */
  @media (max-width: 760px) {
    .open {
      grid-template-columns: 50px minmax(0, 1fr);
    }

    .plan {
      grid-column: 1 / -1;
    }
  }
</style>
