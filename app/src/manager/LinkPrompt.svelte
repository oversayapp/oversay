<script lang="ts">
  // Asks before a link puts a note on screen or opens Get ready (ADR 0032).
  import { linkQuestion } from './links'

  let remember = $state(false)
</script>

{#if $linkQuestion}
  {@const q = $linkQuestion}
  <div class="backdrop">
    <div class="dialog" role="alertdialog" aria-labelledby="link-title" aria-modal="true">
      <h3 id="link-title">{q.title}</h3>
      <p>Another app asked Oversay to do this with a link.</p>
      <label class="remember"><input type="checkbox" bind:checked={remember} /> Don't ask again (Settings › Links from other apps)</label>
      <div class="row buttons">
        <button onclick={() => q.answer(false, remember)}>{q.instead}</button>
        <button class="primary" onclick={() => q.answer(true, remember)}>{q.title.startsWith('Show') ? 'Show' : 'Get ready'}</button>
      </div>
    </div>
  </div>
{/if}

<style>
  .backdrop {
    position: fixed;
    inset: 0;
    display: grid;
    place-items: center;
    background: rgb(0 0 0 / 0.4);
    z-index: 50;
  }

  .dialog {
    background: var(--bg);
    padding: 20px 24px;
    border-radius: 10px;
    max-width: 440px;
    box-shadow: 0 8px 32px rgb(0 0 0 / 0.35);
  }

  h3 {
    margin-top: 0;
    overflow-wrap: anywhere;
  }

  .remember {
    display: flex;
    gap: 8px;
    align-items: center;
    font-size: 13.5px;
    color: var(--muted);
  }

  .buttons {
    justify-content: flex-end;
    margin-top: 16px;
    gap: 8px;
  }
</style>
