<script lang="ts">
  // New workspace (ADR 0040): a name, the tags that group it (research, tutorials), and when, where
  // and notes if there are any.
  import type { WorkspaceChange } from '../lib/workspaces/workspaces'
  import TagPicker from './TagPicker.svelte'

  let {
    tags = [],
    oncreate,
    oncancel,
  }: {
    /** Tags to start with: the tag the page is filtered to. */
    tags?: string[]
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
    oncreate({ name: text('name'), tags: chosen, when: text('when'), where: text('where'), notes: text('notes') })
  }
</script>

<form class="panel" aria-label="New workspace" onsubmit={submit}>
  <h3>New workspace</h3>
  <div class="grid">
    <label class="wide">Name
      <!-- svelte-ignore a11y_autofocus -->
      <input name="name" required placeholder="Prompt injection in AI agents" autofocus onkeydown={(e) => e.key === 'Escape' && oncancel()} />
    </label>
    <div class="wide field"><span>Tags</span><TagPicker tags={chosen} onchange={(t) => (chosen = t)} placeholder="research, talks…" /></div>
    <label>When <input name="when" type="date" /></label>
    <label>Where <input name="where" placeholder="Zoom, Lisbon…" /></label>
    <label class="wide">Notes <textarea name="notes" rows="2" placeholder="Who it's with, what it's for"></textarea></label>
  </div>
  <div class="acts">
    <button type="submit" class="primary">Create</button>
    <button type="button" onclick={oncancel}>Cancel</button>
  </div>
</form>

<style>
  .panel {
    margin: 4px 0 18px;
    padding: 14px 16px;
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
