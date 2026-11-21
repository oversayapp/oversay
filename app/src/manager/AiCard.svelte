<script lang="ts">
  // Home's card about the Oversay skill: what you
  // get and Install for the AI apps found here, until a skill is installed; then a prompt to try
  // and the way to the AI page. Its × hides it for good.
  import { onMount } from 'svelte'
  import { logAction } from '../lib/log'
  import { hideAiCard, settings } from '../lib/settings/store'
  import { addedChatApps } from '../lib/skill/page'
  import { installSkill, skillTargets, TARGET_LABELS, type SkillTarget, type SkillTargets } from '../lib/skill/targets'
  import { attempt } from './errors'
  import Icon from './Icon.svelte'
  import { goAi } from './route'

  /** Home shows the card twice: once above everything when a skill is in an AI app (`ready`), else below. */
  let { show }: { show: 'ready' | 'setup' } = $props()
  let info = $state<SkillTargets | null>(null)
  let copied = $state(false)

  onMount(() => attempt(async () => (info = await skillTargets())))

  // Installed on this computer, or added to a chat app on the AI page.
  const installed = $derived((info?.targets.some((t) => t.installedVersion !== null) ?? false) || addedChatApps($settings.aiAdded).length > 0)
  const found = $derived(info?.targets.filter((t) => t.found && t.installedVersion === null) ?? [])

  const PROMPT = 'Add a two-minute point about the offsite to my catch-up with Sam.'

  /** "Claude Code and Codex": the apps on this computer that have the skill. */
  const installedIn = $derived.by(() => {
    const names = (info?.targets ?? []).filter((t) => t.installedVersion !== null).map((t) => TARGET_LABELS[t.id].name)
    if (names.length === 0) return 'Installed in your AI app'
    return `Installed in ${names.length > 1 ? `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}` : names[0]}`
  })

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

{#if info && !$settings.aiCardHidden && installed === (show === 'ready')}
  <div class="aicard">
    <div class="top">
      <span class="kicon"><Icon name="ai" size={18} /></span>
      <div class="grow">
        {#if installed}
          <h2>Your AI can manage your decks</h2>
          <p class="muted">{installedIn}. Ask it to make a deck, change one, add to it or find one.</p>
        {:else}
          <h2>Manage your decks from your AI app</h2>
          <p class="muted">
            Add the Oversay skill to Claude, Codex or ChatGPT. Then ask it to make a deck, change one, add points to it, or find one, including your
            workspaces.
          </p>
        {/if}
      </div>
      <button class="x" title="Hide" aria-label="Hide" onclick={() => attempt(hideAiCard)}><Icon name="close" size={15} /></button>
    </div>
    {#if installed}
      <div class="say">
        <span class="grow">“{PROMPT}”</span>
        <button class="x" title={copied ? 'Copied' : 'Copy'} aria-label="Copy" onclick={copy}><Icon name={copied ? 'check' : 'copy'} size={15} /></button>
      </div>
      <div class="apps">
        <span class="pill"><Icon name="check" size={13} /> Installed</span>
        <button class="ghost" onclick={goAi}>Manage</button>
      </div>
    {:else}
      <div class="how3">
        <div><b>1 · Add the skill</b>One click for apps on this computer.</div>
        <div><b>2 · Ask</b>“Make a deck for my catch-up with Sam: hiring, her promotion case, the offsite.”</div>
        <div><b>3 · Show it</b>Put the deck beside your call. It stays hidden from screen sharing.</div>
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
    border-left: 4px solid var(--ok);
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
    background: var(--ok-bg);
    color: var(--ok);
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

  .pill {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    font-size: 12px;
    font-weight: 600;
    border-radius: 99px;
    padding: 2px 9px;
    background: var(--ok-bg);
    color: var(--ok);
    white-space: nowrap;
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
