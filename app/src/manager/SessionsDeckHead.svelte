<script lang="ts">
  // One deck chosen on Sessions (design sessions-v2, option 3): above its runs, its Record on start choice
  // (the deck editor's, ADR 0047), its run stats, and the time it took against its plan, run by run.
  import { formatDuration } from '../lib/project/duration'
  import { count } from '../lib/words'
  import type { DeckEntry } from '../lib/decks/store'
  import { setDeckRecordOnStart } from '../lib/decks/store'
  import type { RecordOnStart } from '../lib/decks/deck'
  import { settings } from '../lib/settings/store'
  import { deckStats, trendCaption, trendPoints, type MarkedRun } from '../lib/sessions/browse'
  import { attempt } from './errors'
  import { goDeck } from './route'
  import { showDeckEntry } from './new'

  let { deck, runs, workspaces }: { deck: DeckEntry; runs: readonly MarkedRun[]; workspaces: readonly string[] } = $props()

  const stats = $derived(deckStats(runs))
  const points = $derived(trendPoints(runs))
  const caption = $derived(trendCaption(points, formatDuration))
  const planned = $derived(points.at(-1)?.planned ?? 0)
  const top = $derived(Math.max(1, ...points.map((p) => Math.max(p.ran, p.planned))) * 1.12)
  const records = $derived(deck.recordOnStart === 'on' || (deck.recordOnStart === 'global' && !!$settings.autoRecord))
  const globalWord = $derived($settings.autoRecord ? 'On' : 'Off')
  const average = $derived(stats.average === null ? null : Math.abs(stats.average) < 10 ? 'on time' : `${stats.average > 0 ? '+' : '-'}${formatDuration(Math.abs(stats.average))} ${stats.average > 0 ? 'over' : 'under'}`)
  const ago = (ms: number) => {
    const days = Math.floor((Date.now() - ms) / 86_400_000)
    return days <= 0 ? 'today' : days === 1 ? 'yesterday' : days < 14 ? `${days} days ago` : days < 60 ? `${Math.floor(days / 7)} weeks ago` : `${Math.floor(days / 30)} months ago`
  }
  const choose = (value: RecordOnStart) => attempt(() => setDeckRecordOnStart(deck.path, value))
</script>

<section class="head" aria-label="{deck.name}: Record on start, stats and trend">
  <div class="top">
    <h2>{deck.name}</h2>
    <span class="grow"></span>
    <button onclick={() => goDeck(deck.path)}>Open deck</button>
    <button class="primary" onclick={() => attempt(() => showDeckEntry(deck))}>Show</button>
  </div>
  <p class="meta muted">
    {#if workspaces.length}
      {workspaces.length > 1 ? `In ${workspaces.length} workspaces: ${workspaces.join(' and ')}. Its runs show under each.` : `In ${workspaces[0]}.`}
    {:else}
      Unsorted: in no workspace.
    {/if}
    {#if deck.audience}For {deck.audience}.{/if}
  </p>

  <div class="rec">
    <b>Record on start</b>
    <div class="seg" role="radiogroup" aria-label="Record on start for {deck.name}">
      {#each [['global', `Use global setting (${globalWord})`], ['on', 'On'], ['off', 'Off']] as const as [id, label] (id)}
        <button role="radio" aria-checked={deck.recordOnStart === id} onclick={() => choose(id)}>{label}</button>
      {/each}
    </div>
    <span class="faint">{records ? 'Your voice is recorded each time this deck starts.' : 'Not recorded unless you start it by hand.'}</span>
  </div>

  {#if runs.length === 0}
    <div class="never">
      <b>Never run</b>
      <p>
        Press Start on this deck and each run is kept here, card by card.
        {records ? 'It will be recorded: Record on start is on.' : 'It will not be recorded: Record on start is off.'}
      </p>
    </div>
  {:else}
    <p class="stats">
      <span><b>{count(stats.runs, 'run')}</b></span>
      {#if stats.lastMs !== null}<span>last <b>{ago(stats.lastMs)}</b></span>{/if}
      <span>{#if average === null}<b>untimed</b>{:else}on average <b class:over={stats.average! >= 10} class:under={stats.average! <= -10}>{average}</b>{/if}</span>
      <span><b>{stats.toReview}</b> to review</span>
    </p>
    {#if points.length >= 2}
      <div class="trend">
        <h3>{planned > 0 ? 'Planned and actual, run by run' : 'How long each run took'}</h3>
        <p class="muted cap">{caption}</p>
        <div class="chart" role="img" aria-label={caption}>
          {#if planned > 0}<div class="plan" style="bottom: {(planned / top) * 100}%"><span>planned {formatDuration(planned)}</span></div>{/if}
          {#each points as p (p.startedAt)}
            {@const within = planned > 0 ? Math.min(p.ran, p.planned) : p.ran}
            {@const over = planned > 0 && p.ran > p.planned ? p.ran - p.planned : 0}
            <span class="col" title="{new Date(p.startedMs).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}: ran {formatDuration(p.ran)}{p.planned ? `, planned ${formatDuration(p.planned)}` : ''}">
              <i class="a" style="height: {(within / top) * 100}%"></i>
              {#if over}<i class="o" style="height: {(over / top) * 100}%"></i>{/if}
            </span>
          {/each}
        </div>
        <div class="axis">
          <span>{new Date(points[0].startedMs).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</span>
          <span>Bars: ran. Hatched: over plan. Line: planned.</span>
          <span>{new Date(points.at(-1)!.startedMs).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</span>
        </div>
      </div>
    {:else}
      <p class="muted nudge">One run so far. A trend across runs shows from the second.</p>
    {/if}
  {/if}
</section>

<style>
  .head {
    margin: 14px 0 6px;
    padding: 14px 16px 16px;
    border: 1px solid var(--line);
    border-radius: 14px;
    background: var(--card);
  }

  .top {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
  }

  .top h2 {
    margin: 0;
    font-size: 18px;
    letter-spacing: 0;
    text-transform: none;
    color: var(--text);
  }

  .grow {
    flex: 1;
  }

  .meta {
    margin: 4px 0 0;
    font-size: 12.5px;
  }

  .rec {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 6px 12px;
    margin-top: 12px;
    font-size: 13px;
  }

  .seg {
    display: inline-flex;
    flex-wrap: wrap;
    gap: 2px;
    padding: 2px;
    border: 1px solid var(--line-strong);
    border-radius: 9px;
  }

  .seg button {
    border: 0;
    background: none;
    border-radius: 7px;
    padding: 4px 10px;
    font-size: 12.5px;
    font-weight: 600;
    color: var(--muted);
  }

  .seg button[aria-checked='true'] {
    background: var(--accent-soft);
    color: var(--accent-text);
  }

  .faint {
    font-size: 12.5px;
    color: var(--faint);
  }

  .stats {
    display: flex;
    flex-wrap: wrap;
    gap: 4px 18px;
    margin: 14px 0 0;
    font-size: 13px;
    color: var(--muted);
  }

  .stats b {
    color: var(--text);
  }

  .stats b.over {
    color: var(--danger);
  }

  .stats b.under {
    color: var(--ok);
  }

  .never {
    margin-top: 14px;
    padding: 18px;
    border: 1.5px dashed var(--line-strong);
    border-radius: 12px;
    text-align: center;
    color: var(--muted);
  }

  .never p {
    margin: 4px 0 0;
  }

  .nudge {
    margin: 12px 0 0;
    font-size: 12.5px;
  }

  .trend {
    margin-top: 14px;
  }

  .trend h3 {
    margin: 0;
    font-size: 12px;
    letter-spacing: 0.07em;
    text-transform: uppercase;
    color: var(--faint);
  }

  .cap {
    margin: 2px 0 0;
    font-size: 12.5px;
  }

  .chart {
    position: relative;
    display: flex;
    align-items: flex-end;
    gap: 6px;
    height: 110px;
    margin-top: 10px;
    padding: 0 4px;
    border-bottom: 1px solid var(--line-strong);
  }

  .col {
    flex: 1;
    max-width: 38px;
    height: 100%;
    display: flex;
    flex-direction: column-reverse;
  }

  .col i {
    display: block;
    width: 100%;
  }

  .col .a {
    background: var(--k-topic);
    border-radius: 0 0 3px 3px;
  }

  .col .o {
    background: repeating-linear-gradient(135deg, var(--danger) 0 2px, transparent 2px 4px);
    border-radius: 3px 3px 0 0;
  }

  .plan {
    position: absolute;
    left: 0;
    right: 0;
    border-top: 1.5px dashed var(--text);
    pointer-events: none;
  }

  .plan span {
    position: absolute;
    right: 0;
    bottom: 1px;
    padding: 0 4px;
    background: var(--card);
    font-size: 11px;
    color: var(--muted);
  }

  .axis {
    display: flex;
    justify-content: space-between;
    gap: 10px;
    margin-top: 4px;
    font-size: 11.5px;
    color: var(--faint);
  }
</style>
