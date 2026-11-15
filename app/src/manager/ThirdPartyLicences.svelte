<script lang="ts">
  // Settings → About → Third-party licences (013/03): every component Oversay ships with and the
  // licence it declares, generated from the dependency trees at build time. One that declares no
  // licence is flagged and listed first, never left out.
  import { openUrl } from '@tauri-apps/plugin-opener'
  import { filterComponents, summarise, type Component } from '../lib/about/notices'
  import generated from '../generated/third-party.json'
  import { logAction } from '../lib/log'
  import { attempt } from './errors'
  import { showBack } from './back'

  let { onBack }: { onBack: () => void } = $props()

  // The way back to About, in the search bar's row (back.ts); Settings is 900 px wide.
  $effect(() => showBack({ label: 'About', go: onBack, width: 900, tight: true }))

  const all = generated.components as Component[]
  const summary = summarise(all)
  let query = $state('')
  const shown = $derived(filterComponents(all, query))

  function open(c: Component) {
    logAction('open link', `${c.source} ${c.name}`)
    void attempt(() => openUrl(c.url))
  }
</script>

<h2 class="title" tabindex="-1">Third-party licences</h2>
<p class="muted">
  Oversay is built with {summary.total} open-source components. Their names, versions and licences are generated from
  the Cargo and npm dependencies when the app is built.
</p>

{#if summary.withoutLicence > 0}
  <p class="flag" role="note">
    <b>{summary.withoutLicence} {summary.withoutLicence === 1 ? 'component declares' : 'components declare'} no licence</b>
    and {summary.withoutLicence === 1 ? 'is' : 'are'} listed first so it can't be missed.
  </p>
{/if}

<div class="chips" aria-label="Licences">
  {#each summary.byLicence as l (l.licence)}
    <span class="chip">{l.licence} · {l.count}</span>
  {/each}
</div>

<div class="box">
  <div class="bar">
    <input type="search" placeholder="Search components" aria-label="Search third-party components" bind:value={query} />
    <span class="muted num">{shown.length} of {summary.total}</span>
  </div>
  <ul>
    {#each shown as c (`${c.source}:${c.name}@${c.version}`)}
      <li class:flagged={c.licence === null}>
        <b>{c.name}</b>
        <span class="ver muted num">{c.version}</span>
        <span class="lic">{c.licence ?? '⚠ No licence declared'}</span>
        <button class="link" onclick={() => open(c)}>{c.source === 'cargo' ? 'crates.io' : c.source === 'npm' ? 'npm' : new URL(c.url).host} ↗</button>
      </li>
    {:else}
      <li class="none">No component matches “{query}”.</li>
    {/each}
  </ul>
</div>

<style>

  .title {
    text-transform: none;
    letter-spacing: 0;
    font-size: 22px;
    color: var(--text);
    margin: 0 0 8px;
  }

  .flag {
    margin: 12px 0;
    padding: 8px 12px;
    border: 1.5px dashed var(--warn);
    border-radius: 10px;
    background: var(--warn-bg);
    color: var(--warn);
    font-size: 13px;
  }

  .chips {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    margin: 10px 0;
  }

  .chip {
    border: 1px solid var(--line-strong);
    border-radius: 99px;
    padding: 3px 11px;
    font-size: 12.5px;
    color: var(--muted);
  }

  .box {
    border: 1px solid var(--line);
    border-radius: 10px;
    overflow: hidden;
  }

  .bar {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 8px 10px;
    border-bottom: 1px solid var(--line);
    background: var(--side);
  }

  .bar input {
    flex: 1;
    min-width: 0;
  }

  ul {
    list-style: none;
    margin: 0;
    padding: 0;
  }

  li {
    display: grid;
    grid-template-columns: minmax(0, 1.4fr) 90px minmax(0, 1.6fr) 90px;
    gap: 10px;
    align-items: center;
    padding: 7px 12px;
    border-bottom: 1px solid var(--line);
    font-size: 13px;
  }

  li:last-child {
    border-bottom: 0;
  }

  li.flagged {
    background: var(--warn-bg);
  }

  li.flagged .lic {
    color: var(--warn);
    font-weight: 600;
  }

  li.none {
    display: block;
    color: var(--muted);
  }

  .lic {
    color: var(--muted);
  }

  .link {
    border: 0;
    background: none;
    color: var(--accent-text);
    text-align: right;
    padding: 0;
  }

  .link:hover {
    text-decoration: underline;
  }

  .num {
    font-variant-numeric: tabular-nums;
  }

  @container (max-width: 760px) {
    li {
      grid-template-columns: minmax(0, 1fr) auto auto;
    }

    .link {
      grid-column: 3;
      grid-row: 1;
    }

    .lic {
      grid-column: 1 / -1;
      grid-row: 2;
      margin-top: -4px;
    }
  }
</style>
