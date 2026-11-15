<script lang="ts">
  // After the deck: the deck's runs, kept
  // beside it, newest first. The latest as planned against actual for each card, and the earlier
  // ones by their totals. Right after a run it opens at the top of the editor, marked Just now.
  import { readDeckSessions, justRan, type DeckSession } from '../lib/decks/sessions'
  import { formatDuration } from '../lib/project/duration'
  import { whenLabel } from '../lib/project/recent-view'
  import { attempt } from './errors'
  import { goSession } from './route'

  let { path, top = false }: { path: string; top?: boolean } = $props()

  let sessions = $state<DeckSession[]>([])
  $effect(() => {
    const p = path
    void $justRan
    attempt(async () => {
      sessions = (await readDeckSessions(p)).reverse()
    })
  })
  const latest = $derived(sessions[0] ?? null)
  const just = $derived($justRan === path)

  const planned = (s: DeckSession) => s.cards.reduce((n, c) => n + (c.plannedSeconds ?? 0), 0)
  const actual = (s: DeckSession) => s.cards.reduce((n, c) => n + c.seconds, 0)
  const total = $derived(latest ? diff(planned(latest) || null, actual(latest)) : null)
  /** "+0:12 over", "0:30 under", or "on time"; words as well as colour. */
  function diff(planned: number | null, actual: number): { text: string; over: boolean | null } {
    if (planned === null || planned === 0) return { text: '', over: null }
    const d = actual - planned
    if (Math.abs(d) < 1) return { text: 'on time', over: null }
    return d > 0 ? { text: `+${formatDuration(d)} over`, over: true } : { text: `${formatDuration(-d)} under`, over: false }
  }
</script>

{#if latest}
  <section class="after" class:top aria-label="After the deck">
    <h3>
      After the deck
      <span class="when">{#if just}<span class="new">Just now</span>{:else}{whenLabel(latest.endedAt)}{/if}</span>
      {#if just}<button class="link" onclick={() => justRan.set(null)}>Done</button>{/if}
    </h3>
    <table>
      <thead><tr><th>Card</th><th class="r">Planned</th><th class="r">Actual</th><th class="r">Difference</th></tr></thead>
      <tbody>
        {#each latest.cards as c, i (i)}
          {@const d = diff(c.plannedSeconds, c.seconds)}
          <tr>
            <td><span class="kd" style:background="var(--k-{c.kind})"></span>{i + 1}. {c.name}</td>
            <td class="r num">{c.plannedSeconds === null ? 'untimed' : formatDuration(c.plannedSeconds)}</td>
            <td class="r num">{formatDuration(c.seconds)}</td>
            <td class="r num" class:over={d.over === true} class:under={d.over === false}>{d.text}</td>
          </tr>
        {/each}
      </tbody>
      <tfoot>
        <tr>
          <th>Total</th>
          <th class="r num">{planned(latest) ? formatDuration(planned(latest)) : '–'}</th>
          <th class="r num">{formatDuration(actual(latest))}</th>
          <th class="r num" class:over={total?.over === true} class:under={total?.over === false}>{total?.text}</th>
        </tr>
      </tfoot>
    </table>
    {#if sessions.length > 1}
      <h4>Earlier runs</h4>
      <ul>
        {#each sessions.slice(1) as s (s.startedAt)}
          {@const d = diff(planned(s) || null, actual(s))}
          <li>
            <span>{whenLabel(s.endedAt)}</span><span class="num">{formatDuration(actual(s))}</span><span
              class="num"
              class:over={d.over === true}
              class:under={d.over === false}>{d.text}</span
            ><button class="link" aria-label="Open the session of {whenLabel(s.endedAt)}" onclick={() => goSession(path, s.startedAt)}>Open</button>
          </li>
        {/each}
      </ul>
    {/if}
    <p class="hint">
      The last {sessions.length === 1 ? 'run is' : `${sessions.length} runs are`} kept beside the deck; nothing is written into it.
      <button class="link" onclick={() => latest && goSession(path, latest.startedAt)}>Open this session</button> to write a note on it.
    </p>
  </section>
{/if}

<style>
  .after {
    margin: 22px 0 0;
    padding: 12px 16px 10px;
    border: 1px solid var(--line);
    border-radius: 14px;
    background: var(--card);
  }

  .after.top {
    margin: 0 0 16px;
    border-color: color-mix(in srgb, var(--accent) 45%, var(--line));
  }

  h3 {
    display: flex;
    align-items: baseline;
    gap: 10px;
    margin: 0 0 8px;
    font-size: 15px;
  }

  .when {
    flex: 1;
    font-size: 12.5px;
    font-weight: 500;
    color: var(--muted);
  }

  .new {
    font-size: 10.5px;
    font-weight: 700;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: var(--on-accent);
    background: var(--accent);
    border-radius: 6px;
    padding: 1px 6px;
  }

  .link {
    border: 0;
    background: none;
    color: var(--accent-text);
    font-weight: 600;
    font-size: 13px;
    padding: 2px 4px;
  }

  table {
    width: 100%;
    border-collapse: collapse;
    font-size: 13.5px;
  }

  th,
  td {
    padding: 5px 6px;
    border-bottom: 1px solid var(--line);
    text-align: left;
  }

  thead th {
    font-size: 12px;
    font-weight: 600;
    color: var(--muted);
  }

  tfoot th {
    border-bottom: 0;
  }

  .r {
    text-align: right;
  }

  .num {
    font-variant-numeric: tabular-nums;
  }

  .kd {
    display: inline-block;
    width: 8px;
    height: 8px;
    border-radius: 2px;
    margin-right: 7px;
  }

  .over {
    color: var(--danger);
  }

  .under {
    color: var(--ok);
  }

  h4 {
    margin: 14px 0 4px;
    font-size: 12px;
    letter-spacing: 0.07em;
    text-transform: uppercase;
    color: var(--faint);
  }

  ul {
    list-style: none;
    margin: 0;
    padding: 0;
    font-size: 13px;
  }

  li {
    display: grid;
    grid-template-columns: 1fr auto 110px auto;
    gap: 12px;
    padding: 3px 6px;
  }

  li span:nth-child(3) {
    text-align: right;
  }

  .hint {
    margin: 10px 0 0;
    font-size: 12px;
    color: var(--faint);
  }
</style>
