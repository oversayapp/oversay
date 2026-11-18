<script lang="ts">
  // The template picker (epic 036 (#54)): the Templates page in a dialog, from + New, the command bar, Home
  // and the Library's empty state. Using one starts a deck, in the workspace being looked at if there is one.
  import { attempt } from './errors'
  import { startDeckFromTemplate } from './new'
  import { closeTemplatePicker, picker } from './picker'
  import TemplateBrowser from './TemplateBrowser.svelte'
</script>

{#if $picker.open}
  <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
  <div class="scrim" onclick={(e) => e.target === e.currentTarget && closeTemplatePicker()}>
    <div class="dialog" role="dialog" aria-modal="true" aria-label="Deck from a template">
      <TemplateBrowser
        mode="picker"
        initial={$picker.template}
        onstart={(t) => {
          const workspace = $picker.workspace
          closeTemplatePicker()
          attempt(() => startDeckFromTemplate(t, workspace))
        }}
        oncancel={closeTemplatePicker}
      />
    </div>
  </div>
{/if}

<svelte:window onkeydown={(e) => $picker.open && e.key === 'Escape' && closeTemplatePicker()} />

<style>
  .scrim {
    position: fixed;
    inset: 0;
    z-index: 100;
    background: rgba(10, 14, 24, 0.42);
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 24px;
  }

  .dialog {
    width: min(1040px, 100%);
    height: min(640px, 100%);
    background: var(--card);
    border-radius: 16px;
    box-shadow: 0 24px 60px rgba(0, 0, 0, 0.32);
    overflow: hidden;
  }
</style>
