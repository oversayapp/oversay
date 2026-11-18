<script lang="ts">
  // One run in the Sessions list (design sessions-v2): when, the deck and its workspaces, how long it ran
  // and its plan, the bar, the words (+m:ss over, m:ss under, on time, untimed), and what it has: a note,
  // a transcript, a recording, a review. Every status has a name, never colour alone.
  import { formatDuration } from '../lib/project/duration'
  import type { MarkedRun } from '../lib/sessions/browse'
  import { difference, runTimes } from '../lib/sessions/runs'
  import RanBar from './RanBar.svelte'
  import { goSession } from './route'

  let { run, workspaceName, records }: { run: MarkedRun; workspaceName: (id: string) => string; records: boolean } = $props()

  const t = $derived(runTimes(run.session))
  const d = $derived(difference(t.planned, t.timed))
  const words = $derived(run.test ? `stopped after ${formatDuration(t.ran)}` : t.planned <= 0 ? 'untimed' : d.text)
  const clock = $derived(new Date(run.startedMs).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }))
  const day = $derived(new Date(run.startedMs).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }))
  const about = $derived(
    [
      run.deck.audience && `for ${run.deck.audience}`,
      `ran ${formatDuration(t.ran)}${run.session.pausedSeconds ? `, paused ${formatDuration(run.session.pausedSeconds)}` : ''}`,
      t.planned ? `planned ${formatDuration(t.planned)}${t.untimed ? ' + untimed' : ''}` : '',
    ]
      .filter(Boolean)
      .join(' · '),
  )
  const barLabel = $derived(t.planned > 0 ? `Planned ${formatDuration(t.planned)}, ran ${formatDuration(t.timed)}: ${words}` : `Untimed, ran ${formatDuration(t.ran)}`)
</script>

<button class="row" aria-label="{run.deck.name}, {day} {clock}" onclick={() => goSession(run.deck.path, run.session.startedAt)}>
  <span class="at num">{clock}<small>{day}</small></span>
  <span class="what">
    <span class="line">
      <span class="t">{run.deck.name}</span>
      {#if records}<span class="rtag" title="Record on start is on for this deck">Rec</span>{/if}
      {#each run.deck.workspaces as id (id)}<span class="chip">{workspaceName(id)}</span>{/each}
      {#if run.deck.workspaces.length === 0}<span class="chip none">Unsorted</span>{/if}
    </span>
    <span class="p">{about}</span>
    <span class="marks">
      {#if run.test}<span class="mark">Test run?</span>{:else if run.marks.note}<span class="mark">✎ Note</span>{:else}<span class="mark no">No note</span>{/if}
      {#if run.marks.transcript}<span class="mark">≡ Transcript</span>{/if}
      {#if run.marks.recording}<span class="mark"><span class="reddot"></span> Has recording</span>{/if}
      {#if run.marks.review}<span class="mark review">✦ Review ready</span>{:else if run.needsReview}<span class="mark need">Needs a review</span>{/if}
    </span>
  </span>
  <span class="plan">
    <RanBar planned={t.planned} timed={t.timed} ran={t.ran} label={barLabel} />
    <span class="tot num" class:over={!run.test && d.over === true} class:under={!run.test && d.over === false}>{words}</span>
  </span>
</button>

<style>
  .row {
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

  .row:hover {
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

  .chip.none {
    background: var(--rail);
    color: var(--muted);
  }

  .rtag {
    padding: 0 6px;
    border-radius: 5px;
    border: 1px solid var(--danger);
    color: var(--danger);
    font-size: 10.5px;
    font-weight: 700;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    line-height: 16px;
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

  .mark.no {
    color: var(--faint);
  }

  .mark.review {
    background: var(--accent-soft);
    color: var(--accent-text);
  }

  .mark.need {
    border: 1px solid var(--accent);
    background: none;
    color: var(--accent-text);
  }

  .reddot {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: var(--danger);
  }

  .plan {
    display: flex;
    flex-direction: column;
    gap: 6px;
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

  /* Narrow: the bar goes under the deck's name. Last, so it wins over the rules above. */
  @media (max-width: 760px) {
    .row {
      grid-template-columns: 50px minmax(0, 1fr);
    }

    .plan {
      grid-column: 1 / -1;
    }
  }
</style>
