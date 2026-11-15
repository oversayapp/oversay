<script lang="ts">
  // Settings → About (013/03): version, build, platform,
  // the licence, and the third-party components.
  import { onMount } from 'svelte'
  import { loadAbout, OVERSAY_LICENCE, type AboutInfo } from '../lib/about/about'
  import { summarise } from '../lib/about/notices'
  import generated from '../generated/third-party.json'
  import type { Component } from '../lib/about/notices'
  import { attempt } from './errors'

  let { onOpenLicences }: { onOpenLicences: () => void } = $props()

  let info = $state<AboutInfo | null>(null)
  onMount(() => attempt(async () => (info = await loadAbout())))

  const summary = summarise(generated.components as Component[])
</script>

<h2 tabindex="-1">About</h2>
<div class="head">
  <span class="name">{info?.name ?? 'Oversay'}</span>
  <span class="ver num">{info ? `Version ${info.version}` : ''}</span>
</div>

<!-- Where the update controls go. Nothing is built here; shown only in development. -->
<div class="slot" data-slot="update-controls">
  {#if import.meta.env.DEV}Update controls will sit here.{/if}
</div>

<table>
  <tbody>
    <tr><th scope="row">Build</th><td class="num">{info?.build ?? ''}</td></tr>
    <tr><th scope="row">Platform</th><td>{info?.platform ?? ''}</td></tr>
    <tr>
      <th scope="row">Licence</th>
      <td>
        <div>{OVERSAY_LICENCE.name} <span class="muted">({OVERSAY_LICENCE.id})</span></div>
        <div class="muted hint">{OVERSAY_LICENCE.copyright}. The full text is the LICENSE file in the source.</div>
      </td>
    </tr>
    <tr>
      <th scope="row">Third-party</th>
      <td>
        <div class="row">
          <span><b class="num">{summary.total}</b> components, under {summary.byLicence.length} licences</span>
          <button onclick={onOpenLicences}>View third-party licences</button>
        </div>
        {#if summary.withoutLicence > 0}
          <p class="muted hint">
            {summary.withoutLicence} {summary.withoutLicence === 1 ? 'declares' : 'declare'} no licence; listed first there.
          </p>
        {/if}
      </td>
    </tr>
  </tbody>
</table>

<style>
  .head {
    display: flex;
    align-items: baseline;
    gap: 12px;
    flex-wrap: wrap;
  }

  .name {
    font-size: 22px;
    font-weight: 700;
  }

  .ver {
    font-size: 18px;
    color: var(--muted);
  }

  .slot:empty {
    display: none;
  }

  .slot {
    margin: 12px 0 4px;
    border: 1.5px dashed var(--line-strong);
    border-radius: 10px;
    padding: 10px 14px;
    color: var(--faint);
    font-size: 13px;
  }

  table {
    width: 100%;
    margin-top: 10px;
    border-collapse: collapse;
  }

  th,
  td {
    padding: 8px 0;
    border-bottom: 1px solid var(--line);
    vertical-align: top;
    text-align: left;
  }

  tr:last-child th,
  tr:last-child td {
    border-bottom: 0;
  }

  th {
    width: 140px;
    font-weight: 400;
    color: var(--muted);
  }

  .row {
    flex-wrap: wrap;
  }

  .row button {
    white-space: nowrap;
  }

  .hint {
    margin: 6px 0 0;
    font-size: 13px;
  }

  .num {
    font-variant-numeric: tabular-nums;
  }
</style>
