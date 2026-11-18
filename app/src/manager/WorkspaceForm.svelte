<script lang="ts">
  // New workspace (ADR 0040, epic 036 (#54)): a name, a description (the workspace's notes) and the tags
  // that group it (research, tutorials). When and where stay in the file; they are not asked for.
  import type { WorkspaceChange } from '../lib/workspaces/workspaces'
  import TagPicker from './TagPicker.svelte'

  let {
    tags = [],
    name = '',
    oncreate,
    oncancel,
  }: {
    /** Tags to start with: the tag the page is filtered to. */
    tags?: string[]
    /** A name to start with: what was typed in the bar. */
    name?: string
    oncreate: (change: WorkspaceChange) => void
    oncancel: () => void
  } = $props()

  // The tags it starts with: the one the page is filtered to.
  // svelte-ignore state_referenced_locally
  let chosen = $state([...tags])

  function submit(e: SubmitEvent) {
    e.preventDefault()
    const form = new FormData(e.currentTarget as HTMLFormElement)
    const text = (key: string) => String(form.get(key) ?? '').trim()
    if (!text('name')) return
    oncreate({ name: text('name'), tags: chosen, notes: text('notes') })
  }
</script>

<form class="panel" aria-label="New workspace" onsubmit={submit}>
  <h3>New workspace</h3>
  <div class="grid">
    <label class="wide">Name
      <!-- svelte-ignore a11y_autofocus -->
      <input name="name" required value={name} placeholder="Prompt injection in AI agents" autofocus onkeydown={(e) => e.key === 'Escape' && oncancel()} />
    </label>
    <div class="wide field"><span>Tags</span><TagPicker tags={chosen} onchange={(t) => (chosen = t)} placeholder="research, talks…" /></div>
    <label class="wide">Description <textarea name="notes" rows="3" placeholder="What this workspace is for"></textarea></label>
  </div>
  <div class="acts">
    <button type="submit" class="primary">Create</button>
    <button type="button" onclick={oncancel}>Cancel</button>
  </div>
</form>

<style>
  .panel {
    margin: 0;
    padding: 18px 20px;
    border: 1px solid var(--line-strong);
    border-radius: 14px;
    background: var(--card);
  }

  h3 {
    margin: 0 0 10px;
    font-size: 15px;
  }

  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
    gap: 10px 14px;
  }

  label,
  .field {
    display: flex;
    flex-direction: column;
    gap: 4px;
    font-size: 12.5px;
    font-weight: 600;
    color: var(--muted);
  }

  .wide {
    grid-column: 1 / -1;
  }

  input,
  textarea {
    font-weight: 400;
    color: var(--text);
  }

  .acts {
    display: flex;
    gap: 8px;
    margin-top: 12px;
  }
</style>
