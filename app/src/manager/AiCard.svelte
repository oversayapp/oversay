<script lang="ts">
  // Home's card about the Oversay skill: what you
  // get and Install for the AI apps found here, until a skill is installed; then a prompt to try
  // and the way to the AI page. Its × hides it for good.
  import { onMount } from 'svelte'
  import { logAction } from '../lib/log'
  import { hideAiCard, settings } from '../lib/settings/store'
  import { installSkill, skillTargets, TARGET_LABELS, type SkillTarget, type SkillTargets } from '../lib/skill/targets'
  import { attempt } from './errors'
  import Icon from './Icon.svelte'
  import { goAi } from './route'

  let info = $state<SkillTargets | null>(null)
  let copied = $state(false)

  onMount(() => attempt(async () => (info = await skillTargets())))

  const installed = $derived(info?.targets.some((t) => t.installedVersion !== null) ?? false)
  const found = $derived(info?.targets.filter((t) => t.found && t.installedVersion === null) ?? [])

  const PROMPT = 'Create an Oversay note for my catch-up with Sam tomorrow: hiring, her promotion case, the offsite. Then show it.'

  function install(target: SkillTarget) {
    logAction('install skill from home', target)
    attempt(async () => {
      await installSkill(target)
      info = await skillTargets()
    })
  }

  function copy() {
    attempt(async () => {
      await navigator.clipboard.writeText(PROMPT)
      copied = true
      setTimeout(() => (copied = false), 1500)
    })
  }
</script>

{#if info && !$settings.aiCardHidden}
  <div class="aicard">
    <div class="top">
      <span class="kicon"><Icon name="ai" size={18} /></span>
      <div class="grow">
        {#if installed}
          <h2>Your AI can write notes</h2>
          <p class="muted">Ask it for a note; it appears in Notes, even when Oversay is closed.</p>
        {:else}
          <h2>Let your AI write your meeting notes</h2>
          <p class="muted">
            Tell Claude, Codex or ChatGPT what the meeting is about. It writes the note into Oversay, ready to show on screen during the call.
          </p>
        {/if}
      </div>
      {#if installed}<button class="ghost" onclick={goAi}>Manage</button>{/if}
      <button class="x" title="Hide" aria-label="Hide" onclick={() => attempt(hideAiCard)}><Icon name="close" size={15} /></button>
    </div>
    {#if installed}
      <div class="say">
        <span class="grow">“{PROMPT}”</span>
        <button class="x" title={copied ? 'Copied' : 'Copy'} aria-label="Copy" onclick={copy}><Icon name={copied ? 'check' : 'copy'} size={15} /></button>
      </div>
    {:else}
      <div class="how3">
        <div><b>1 · Install</b>Add the Oversay skill to your AI app. One click for apps on this computer.</div>
        <div><b>2 · Ask</b>“Create a note for my catch-up with Sam: hiring, her promotion case, the offsite.”</div>
        <div><b>3 · Show it</b>The note is in Notes. Show puts it beside the call, hidden from screen sharing.</div>
      </div>
      <div class="apps">
        {#if found.length > 0}<span class="muted small">On this computer:</span>{/if}
        {#each found as t (t.id)}
          <span class="app1"
            ><span class="logo {t.id}">{TARGET_LABELS[t.id].abbr}</span>{TARGET_LABELS[t.id].name}
            <button class="primary small" onclick={() => install(t.id)}>Install</button></span
          >
        {/each}
        <button class="ghost" onclick={goAi}>{found.length > 0 ? 'Other AI apps…' : 'Set it up'}</button>
      </div>
    {/if}
  </div>
{/if}

<style>
  .aicard {
    border: 1px solid var(--line);
    border-left: 4px solid var(--c-note);
    border-radius: 14px;
    background: var(--card);
    padding: 16px 18px;
    margin-top: 22px;
    container-type: inline-size;
  }

  .top {
    display: flex;
    align-items: flex-start;
    gap: 12px;
  }

  .grow {
    flex: 1;
    min-width: 0;
  }

  h2 {
    font-size: 17px;
    font-weight: 650;
    letter-spacing: normal;
    text-transform: none;
    color: var(--text);
    margin: 0;
  }

  .muted {
    margin: 2px 0 0;
    font-size: 13.5px;
  }

  .small {
    font-size: 12.5px;
  }

  .kicon {
    width: 34px;
    height: 34px;
    border-radius: 9px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    background: var(--c-note-bg);
    color: var(--c-note);
    flex: none;
  }

  .how3 {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 10px;
    margin: 14px 0 4px;
  }

  @container (max-width: 560px) {
    .how3 {
      grid-template-columns: minmax(0, 1fr);
    }
  }

  .how3 div {
    background: var(--side);
    border-radius: 10px;
    padding: 10px 12px;
    font-size: 13px;
  }

  .how3 b {
    display: block;
    font-size: 12px;
    letter-spacing: 0.05em;
    text-transform: uppercase;
    color: var(--faint);
    margin-bottom: 4px;
  }

  .apps {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
    align-items: center;
    margin-top: 12px;
  }

  .app1 {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    border: 1px solid var(--line);
    border-radius: 10px;
    padding: 5px 6px;
  }

  .logo {
    width: 26px;
    height: 26px;
    border-radius: 7px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    font: 700 11px/1 ui-monospace, Menlo, monospace;
    color: #fff;
  }

  .logo.claude-code {
    background: #c15f3c;
  }

  .logo.codex {
    background: #111;
  }

  button.small {
    padding: 3px 9px;
  }

  .ghost {
    border-color: transparent;
    background: none;
    color: var(--accent-text);
  }

  .x {
    border: 0;
    background: none;
    padding: 4px;
    color: var(--muted);
  }

  .say {
    display: flex;
    gap: 8px;
    align-items: flex-start;
    border: 1px dashed var(--line-strong);
    border-radius: 10px;
    padding: 8px 10px;
    margin-top: 12px;
    font-size: 13.5px;
  }
</style>
