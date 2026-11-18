<script lang="ts">
  // New deck from the clipboard: what was on the clipboard, in a box to look at and change before
  // it becomes a deck. Create makes it; Cancel (or Escape) leaves nothing behind.
  import { pastedDeckText } from '../lib/notes/drop'
  import { attempt } from './errors'
  import { closePasteDialog, createFromPasted, pasteDialog } from './drop'

  let text = $state('')
  $effect(() => {
    if ($pasteDialog.open) text = $pasteDialog.text
  })
  const ready = $derived(pastedDeckText(text) !== null)
  function create() {
    if (ready) attempt(() => createFromPasted(text))
  }
</script>

{#if $pasteDialog.open}
  <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
  <div class="scrim" onclick={(e) => e.target === e.currentTarget && closePasteDialog()}>
    <div
      class="dialog"
      role="dialog"
      aria-modal="true"
      aria-label="New deck from the clipboard"
      tabindex="-1"
      onkeydown={(e) => {
        if (e.key === 'Escape') closePasteDialog()
        else if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
          e.preventDefault()
          create()
        }
      }}
    >
    <form
      onsubmit={(e) => {
        e.preventDefault()
        create()
      }}
    >
      <h3>New deck from the clipboard</h3>
      <p class="muted">
        Each <code>## Card [3m]</code> line starts a card; <code>- point</code> adds a point. Change anything before you create it.
      </p>
      <!-- svelte-ignore a11y_autofocus -->
      <textarea aria-label="The deck, as Markdown" spellcheck="false" placeholder="Nothing was on the clipboard. Paste your Markdown here." autofocus bind:value={text}></textarea>
      <div class="acts">
        <button type="button" onclick={closePasteDialog}>Cancel</button>
        <button class="primary" disabled={!ready}>Create</button>
      </div>
    </form>
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
    padding-top: 10vh;
  }

  .dialog {
    width: min(640px, calc(100vw - 32px));
    border-radius: 14px;
    box-shadow: 0 24px 60px rgba(0, 0, 0, 0.32);
    background: var(--card);
    padding: 16px 18px 16px;
  }

  h3 {
    margin: 0 0 4px;
    font-size: 17px;
  }

  p {
    margin: 0 0 10px;
    font-size: 13px;
  }

  textarea {
    width: 100%;
    height: 320px;
    resize: vertical;
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    font-size: 13px;
    line-height: 1.55;
  }

  .acts {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    margin-top: 12px;
  }
</style>
