<script lang="ts">
  // The New workspace dialog (epic 036 (#54)): a name, a description and tags, from + New or the command bar.
  import { attempt } from './errors'
  import { closeWorkspaceDialog, makeWorkspace, workspaceDialog } from './new'
  import WorkspaceForm from './WorkspaceForm.svelte'
</script>

{#if $workspaceDialog.open}
  <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
  <div class="scrim" onclick={(e) => e.target === e.currentTarget && closeWorkspaceDialog()}>
    <div class="dialog" role="dialog" aria-modal="true" aria-label="New workspace">
      {#key $workspaceDialog.name}
        <WorkspaceForm name={$workspaceDialog.name} oncreate={(change) => attempt(() => makeWorkspace(change))} oncancel={closeWorkspaceDialog} />
      {/key}
    </div>
  </div>
{/if}

<style>
  .scrim {
    position: fixed;
    inset: 0;
    z-index: 100;
    background: rgba(10, 14, 24, 0.42);
    display: flex;
    align-items: flex-start;
    justify-content: center;
    padding-top: 12vh;
  }

  .dialog {
    width: min(480px, calc(100vw - 32px));
    border-radius: 14px;
    box-shadow: 0 24px 60px rgba(0, 0, 0, 0.32);
    background: var(--card);
  }
</style>
