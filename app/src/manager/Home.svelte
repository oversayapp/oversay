<script lang="ts">
  // Home (ADR 0039): decks are what Oversay shows, sorted into workspaces' collections. A new deck,
  // the way to the decks and workspaces, and the AI card. Projects are gone.
  import { attempt } from './errors'
  import Icon from './Icon.svelte'
  import AiCard from './AiCard.svelte'
  import { newDeck } from '../lib/decks/store'
  import { goDeck, goLibrary, goTemplates } from './route'
</script>

<div class="page">
  <h1>Your cards, on screen, <em>through every call</em></h1>
  <p class="lede muted">A deck is a few cards with points under each, shown one at a time beside a call or a talk. Collections in your workspaces keep the decks for each occasion together.</p>

  <div class="shortcuts">
    <button class="sc" onclick={() => attempt(async () => goDeck(await newDeck()))}><span class="c"><Icon name="plus" size={22} /></span>New deck</button>
    <button class="sc" onclick={() => goLibrary()}><span class="c"><Icon name="deck" size={22} /></span>Library</button>
    <button class="sc" onclick={goTemplates}><span class="c"><Icon name="template" size={22} /></span>Templates</button>
  </div>

  <AiCard />
</div>

<style>
  .page {
    max-width: 860px;
    margin: 0 auto;
    padding: 26px 32px 48px;
    container-type: inline-size;
  }

  h1 {
    text-align: center;
    padding-top: 18px;
  }

  h1 em {
    font-style: normal;
    color: var(--accent);
  }

  .lede {
    max-width: 560px;
    margin: 10px auto 0;
    text-align: center;
  }

  .shortcuts {
    display: flex;
    justify-content: center;
    gap: 26px;
    margin: 28px 0 24px;
    flex-wrap: wrap;
  }

  .sc {
    border: 0;
    background: none !important;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 7px;
    font-size: 12.5px;
    font-weight: 400;
    color: var(--text);
    width: 84px;
    padding: 0;
  }

  .sc .c {
    width: 48px;
    height: 48px;
    border-radius: 50%;
    background: var(--accent-soft);
    color: var(--accent-text);
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .sc:hover:not(:disabled) .c {
    box-shadow: 0 0 0 3px var(--accent-soft);
  }

  /* Narrow page (smallest window): the shortcuts close up. */
  @container (max-width: 560px) {
    .shortcuts {
      gap: 8px;
    }

    .sc {
      width: 72px;
    }
  }
</style>
