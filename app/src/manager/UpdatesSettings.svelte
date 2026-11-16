<script lang="ts">
  // Settings › Updates (epic #16): what Oversay found, the one-click install, and whether it
  // checks by itself. Shown only in a build that has a feed (ADR 0030).
  import { settings, setUpdateSettings } from '../lib/settings/store'
  import { updateSettings } from '../lib/updates/policy'
  import { checkNow, installKind, installUpdate, openReleasePage, updates } from '../lib/updates/store'
  import { attempt } from './errors'

  const auto = $derived(updateSettings($settings).auto)
  const busy = $derived($updates.phase !== 'idle')
  const when = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' }) : '')
</script>

<label class="switch"
  ><input type="checkbox" role="switch" checked={auto} onchange={(e) => attempt(() => setUpdateSettings({ auto: e.currentTarget.checked }))} /> Check for updates automatically</label
>
<p class="muted hint">
  {auto
    ? 'On: Oversay looks for a newer version as it starts, at most once a day. It never checks while a session is open.'
    : 'Off: Oversay makes no request until you press Check for updates.'}
  Checking asks the update server for one small file, which sees the address it comes from; nothing else about you or your decks is sent.
</p>

{#if $updates.found}
  {@const f = $updates.found}
  <div class="found" role="status">
    <h3>Version {f.version} is available{#if f.date}<span class="muted"> · {when(f.date)}</span>{/if}</h3>
    {#if f.notes}
      <ul class="notes">
        {#each f.notes.split('\n').filter((l) => l.trim()) as line, i (i)}<li>{line}</li>{/each}
      </ul>
    {/if}
    {#if $installKind === 'installer'}
      <button class="primary" disabled={busy} onclick={() => attempt(installUpdate)}>
        {$updates.phase === 'installing' ? 'Installing…' : 'Update and restart'}
      </button>
      <p class="muted hint">Downloads the update, checks its signature, installs it and restarts Oversay. Your decks and settings stay as they are.</p>
    {:else}
      <p class="muted hint">This copy can’t update itself. Download the new version from the release page.</p>
      {#if f.page}
        <button class="primary" onclick={() => attempt(openReleasePage)}>Open the release page</button>
      {/if}
    {/if}
  </div>
{/if}

<div class="row">
  <button disabled={busy} onclick={() => attempt(checkNow)}>{$updates.phase === 'checking' ? 'Checking…' : 'Check for updates'}</button>
  {#if $updates.message}<span class="msg" role="status">{$updates.message}</span>{/if}
</div>

<style>
  .found {
    margin: 12px 0;
    padding: 12px 14px;
    border: 1px solid var(--line-strong);
    border-radius: 10px;
    background: var(--card);
  }
  .found h3 {
    margin: 0 0 6px;
  }
  .notes {
    margin: 0 0 10px;
    padding-left: 18px;
    font-size: 13px;
  }
  .row {
    display: flex;
    align-items: center;
    gap: 12px;
    margin-top: 10px;
  }
  .msg {
    font-size: 13px;
    color: var(--muted);
  }
</style>
