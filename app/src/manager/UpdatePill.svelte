<script lang="ts">
  // The header's "update available" pill (epic #16): small, never a dialog, and only while an
  // update has been found. It leads to Settings › Updates, where the update is managed.
  import { logAction } from '../lib/log'
  import { updateAvailable, updates } from '../lib/updates/store'
  import { goSettings } from './route'
</script>

{#if $updateAvailable}
  <button class="pill" onclick={() => { logAction('update pill'); goSettings('updates') }} title="Update available">
    Update available{#if $updates.found}{' · ' + $updates.found.version}{/if}
  </button>
{/if}

<style>
  .pill {
    justify-self: end;
    border: 0;
    border-radius: 999px;
    padding: 4px 12px;
    font-size: 12px;
    font-weight: 600;
    background: var(--accent);
    color: var(--on-accent);
    white-space: nowrap;
  }
</style>
