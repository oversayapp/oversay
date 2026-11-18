<script lang="ts">
  // Add resource to workspace (ADR 0046), in the deck editor's left column. Resources belong to a
  // workspace, so this puts a file or a link in one: a deck in one workspace goes straight to it; in
  // several, straight to the one the deck was opened from, and it asks which only when opened from
  // outside (the Library); in none, it offers to put the deck in a workspace first.
  import { open as pickFiles } from '@tauri-apps/plugin-dialog'
  import { addLink, addResources } from '../lib/decks/resources'
  import { addResourceTarget } from '../lib/workspaces/resources'
  import { findWorkspace, workspacesWith } from '../lib/workspaces/workspaces'
  import { workspaces } from '../lib/workspaces/store'
  import { logAction } from '../lib/log'
  import { resourcesChanged } from './drop'
  import { attempt, notice } from './errors'
  import Icon from './Icon.svelte'
  import { goWorkspace, nav } from './route'
  import WorkspacePicker from './WorkspacePicker.svelte'

  let { deckId }: { deckId: string } = $props()

  const inIds = $derived(workspacesWith($workspaces ?? [], deckId).map((w) => w.id))
  const target = $derived(addResourceTarget(inIds, $nav.workspace ?? null))

  let opened = $state(false)
  /** Which workspace, once chosen (or the only one). */
  let chosen = $state<string | null>(null)
  let linkText = $state('')
  let picking = $state(false)

  const destination = $derived(target.kind === 'to' ? target.id : chosen)
  const destName = $derived(destination ? (findWorkspace($workspaces ?? [], destination)?.name ?? 'the workspace') : '')

  function toggle() {
    opened = !opened
    chosen = null
    linkText = ''
    logAction('add resource to workspace', opened ? target.kind : 'closed')
  }

  function choose() {
    attempt(async () => {
      const picked = await pickFiles({ multiple: true, directory: false, title: `Add to ${destName}` })
      const paths = picked === null ? [] : Array.isArray(picked) ? picked : [picked]
      if (!paths.length || !destination) return
      const said = await addResources({ workspace: destination }, paths, destName)
      resourcesChanged.update((n) => n + 1)
      if (said) notice.set(said)
      opened = false
    })
  }

  function addTyped() {
    const url = linkText.trim()
    if (!url || !destination) return
    attempt(async () => {
      await addLink({ workspace: destination }, url)
      resourcesChanged.update((n) => n + 1)
      notice.set(`Added a link to ${destName}.`)
      linkText = ''
      opened = false
    })
  }
</script>

<div class="add">
  <button class="main" aria-expanded={opened} data-picker-toggle onclick={toggle}><Icon name="plus" size={14} /> Add resource to workspace</button>
  {#if opened}
    <div class="panel" role="group" aria-label="Add resource to workspace">
      {#if target.kind === 'none'}
        <p>This deck is not in a workspace yet. Resources are kept with a workspace.</p>
        <span class="pickwrap">
          <button class="primary" data-picker-toggle aria-expanded={picking} onclick={() => (picking = !picking)}>Add the deck to a workspace…</button>
          {#if picking}<WorkspacePicker {deckId} onclose={() => (picking = false)} />{/if}
        </span>
      {:else if target.kind === 'ask' && !chosen}
        <p>Which workspace?</p>
        {#each target.ids as id (id)}
          <button class="ws" onclick={() => (chosen = id)}>{findWorkspace($workspaces ?? [], id)?.name ?? id}</button>
        {/each}
      {:else}
        <p>
          To <button class="link" title="Open {destName}" onclick={() => destination && goWorkspace(destination)}>{destName}</button>
        </p>
        <button class="primary" onclick={choose}>Choose files…</button>
        <form
          class="link-row"
          onsubmit={(e) => {
            e.preventDefault()
            addTyped()
          }}
        >
          <input type="url" placeholder="Or paste a link: https://…" aria-label="Web link" bind:value={linkText} />
          <button disabled={!linkText.trim()}>Add</button>
        </form>
        <p class="sub">Up to 200 MB each. You can also drop files on this page.</p>
      {/if}
    </div>
  {/if}
</div>

<style>
  .add {
    margin: 0 0 14px;
  }

  .main {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    width: 100%;
    justify-content: center;
  }

  .panel {
    margin-top: 8px;
    padding: 10px 12px;
    border: 1px solid var(--line);
    border-radius: 12px;
    background: var(--card);
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .panel p {
    margin: 0;
    font-size: 13px;
  }

  .ws {
    text-align: left;
  }

  .link {
    padding: 0;
    border: 0;
    background: none;
    color: var(--accent);
    font: inherit;
    font-weight: 600;
    cursor: pointer;
  }

  .link-row {
    display: flex;
    gap: 6px;
  }

  .link-row input {
    flex: 1;
    min-width: 0;
  }

  .sub {
    color: var(--faint);
    font-size: 12.5px;
  }

  .pickwrap {
    position: relative;
  }
</style>
