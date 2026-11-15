<script lang="ts">
  // A note the Oversay skill made: what Oversay shows differently from how the AI wrote
  // it, with the same messages `Oversay --check` gives the AI, and a nudge when an older skill
  // made it. Nothing for a note written by hand: its headings and quotes are the person's choice.
  import type { NoteDoc } from '../lib/notes/format'
  import { madeWithVersion } from '../lib/notes/format'
  import { lintNote } from '../lib/notes/lint'
  import { appVersion, staleSkill } from '../lib/notes/made-with'
  import { logAction } from '../lib/log'
  import Icon from './Icon.svelte'
  import { goAi } from './route'

  // `deck`: a deck the skill made, checked with the deck's keys.
  let { doc, text, deck = false }: { doc: NoteDoc; text: string; deck?: boolean } = $props()

  let bundled = $state('')
  appVersion().then((v) => (bundled = v))

  const fromSkill = $derived(madeWithVersion(doc) !== null)
  const problems = $derived(fromSkill ? lintNote(text, deck) : [])
  const stale = $derived(staleSkill(doc, bundled))
  let open = $state(false)

  function update() {
    logAction('update skill from note', stale ?? '')
    goAi()
  }
</script>

{#if problems.length}
  <div class="check warn" role="status">
    <Icon name="info" size={16} />
    <span class="grow">
      <b>Oversay shows {problems.length === 1 ? 'one thing' : `${problems.length} things`} in this {deck ? 'deck' : 'note'} differently from how the AI wrote {problems.length === 1 ? 'it' : 'them'}.</b>
      <button class="link" aria-expanded={open} onclick={() => (open = !open)}>{open ? 'Hide' : 'What and where'}</button>
    </span>
    {#if open}
      <ul>
        {#each problems as p, i (i)}
          <li>{#if p.line !== null}<span class="ln">Line {p.line}</span>{/if}{#each p.message.split('`') as part, j (j)}{#if j % 2}<code>{part}</code>{:else}{part}{/if}{/each}</li>
        {/each}
      </ul>
    {/if}
  </div>
{/if}
{#if stale}
  <div class="check" role="status">
    <Icon name="info" size={16} />
    <span class="grow">An older Oversay skill ({stale}) made this {deck ? 'deck' : 'note'}. Update it in your AI app to get what’s new in Oversay {bundled}.</span>
    <button onclick={update}>Update the skill</button>
  </div>
{/if}

<style>
  .check {
    display: flex;
    align-items: center;
    gap: 10px;
    flex-wrap: wrap;
    margin: 10px 0 4px;
    padding: 9px 12px;
    border-radius: 12px;
    background: var(--accent-soft);
    border: 1px solid transparent;
    font-size: 13.5px;
  }

  .check.warn {
    background: var(--warn-bg);
    border-color: color-mix(in srgb, var(--warn) 35%, transparent);
  }

  .grow {
    flex: 1;
    min-width: 200px;
  }

  .check button:not(.link) {
    padding: 4px 10px;
    font-size: 13px;
  }

  .link {
    border: 0;
    background: none;
    padding: 0 0 0 6px;
    color: var(--accent);
    font-size: 13px;
    cursor: pointer;
  }

  ul {
    flex-basis: 100%;
    margin: 0;
    padding: 0 0 0 26px;
    display: grid;
    gap: 4px;
  }

  li code {
    white-space: nowrap;
  }

  .ln {
    font-variant-numeric: tabular-nums;
    color: var(--muted);
    margin-right: 8px;
  }
</style>
