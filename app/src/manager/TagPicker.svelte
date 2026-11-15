<script lang="ts">
  // A workspace's tags (ADR 0040): chips with × to take one off,
  // and a box that lists the tags already in use, with how many workspaces use each, narrowed by what
  // is typed, and offers New tag “…” when what is typed is new. Enter takes the first choice, and
  // Backspace in the empty box takes off the last tag.
  import { workspaces } from '../lib/workspaces/store'
  import { workspaceNav } from '../lib/settings/store'
  import { sidebarTags } from '../lib/workspaces/navigation'
  import { tagCase } from '../lib/workspaces/workspaces'
  import Icon from './Icon.svelte'

  let {
    tags,
    onchange,
    placeholder = 'research, tutorials…',
  }: {
    tags: string[]
    onchange: (tags: string[]) => void
    placeholder?: string
  } = $props()

  /** Ties the box to its list, for screen readers. */
  const listId = `tags-${Math.random().toString(36).slice(2, 8)}`

  let text = $state('')
  let open = $state(false)
  let input = $state<HTMLInputElement | null>(null)

  const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase()
  const uses = (t: string) => ($workspaces ?? []).filter((w) => w.tags.some((x) => same(x, t))).length
  /** The tags in use, and any made with + on the Workspaces page that none has yet. */
  const known = $derived(sidebarTags($workspaces ?? [], $workspaceNav))
  const query = $derived(tagCase(text))
  /** The tags in use that match and aren't on it yet. */
  const choices = $derived(known.filter((t) => !tags.some((x) => same(x, t)) && t.toLowerCase().includes(query.toLowerCase())))
  /** What is typed, when no tag in use or on it already is that word. */
  const fresh = $derived(query && !known.some((t) => same(t, query)) && !tags.some((t) => same(t, query)) ? query : '')

  function add(tag: string) {
    if (!tags.some((t) => same(t, tag))) onchange([...tags, tag])
    text = ''
    input?.focus()
  }

  function onKey(e: KeyboardEvent) {
    if ((e.key === 'Enter' || e.key === ',') && !e.isComposing) {
      e.preventDefault()
      const first = query ? (choices[0] ?? fresh) : ''
      if (first) add(first)
    } else if (e.key === 'Escape') {
      open = false
      input?.blur()
    } else if (e.key === 'Backspace' && text === '' && tags.length) {
      onchange(tags.slice(0, -1))
    } else open = true
  }
</script>

<svelte:window
  onclick={(e) => {
    if (open && !(e.target as HTMLElement).closest('.tagpick')) open = false
  }}
/>

<span class="tagpick">
  {#each tags as t (t)}
    <span class="tag">{t}<button type="button" aria-label="Remove tag {t}" title="Remove" onclick={() => onchange(tags.filter((x) => x !== t))}><Icon name="close" size={11} /></button></span>
  {/each}
  <span class="box">
    <input
      bind:this={input}
      bind:value={text}
      aria-label="Add a tag"
      role="combobox"
      aria-expanded={open}
      aria-controls={listId}
      autocomplete="off"
      placeholder={tags.length ? 'Add a tag' : placeholder}
      onfocus={() => (open = true)}
      onkeydown={onKey}
    />
    {#if open && (choices.length || fresh || !query)}
      <!-- mousedown keeps the focus in the box, so a click lands before it closes. -->
      <div class="suggest" id={listId} role="listbox" aria-label="Tags" tabindex="-1" onmousedown={(e) => e.preventDefault()}>
        {#if choices.length}<h5>{query ? 'Matching tags' : 'Tags in use'}</h5>{/if}
        {#each choices as t, i (t)}
          <button type="button" role="option" aria-selected={i === 0 && !!query} class:act={i === 0 && !!query} onclick={() => add(t)}
            >{t}<span class="n">{uses(t)} workspace{uses(t) === 1 ? '' : 's'}</span></button
          >
        {/each}
        {#if fresh}
          <button type="button" role="option" aria-selected={!choices.length} class="new" class:act={!choices.length} onclick={() => add(fresh)}>
            <Icon name="plus" size={13} /> New tag “{fresh}”</button
          >
        {:else if !choices.length}
          <p class="none">Type to make a new tag</p>
        {/if}
      </div>
    {/if}
  </span>
</span>

<style>
  .tagpick {
    display: inline-flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 6px;
  }

  .tag {
    display: inline-flex;
    align-items: center;
    gap: 2px;
    padding: 2px 4px 2px 9px;
    border-radius: 99px;
    background: var(--accent-soft);
    color: var(--accent-text);
    font-size: 13px;
    font-weight: 600;
  }

  .tag button {
    display: inline-flex;
    border: 0;
    background: none;
    padding: 3px;
    color: inherit;
    border-radius: 99px;
  }

  .box {
    position: relative;
  }

  .box input {
    width: 170px;
  }

  .suggest {
    position: absolute;
    top: calc(100% + 4px);
    left: 0;
    z-index: 40;
    min-width: 230px;
    padding: 5px;
    background: var(--card);
    border: 1px solid var(--line-strong);
    border-radius: 10px;
    box-shadow: 0 10px 28px rgba(0, 0, 0, 0.18);
  }

  h5 {
    margin: 4px 8px;
    font-size: 11px;
    letter-spacing: 0.07em;
    text-transform: uppercase;
    color: var(--faint);
  }

  .suggest button {
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
    border: 0;
    background: none;
    border-radius: 7px;
    padding: 6px 8px;
    text-align: left;
    color: var(--text);
    font-weight: 500;
  }

  .suggest button:hover,
  .suggest button.act {
    background: var(--accent-soft);
    color: var(--accent-text);
  }

  .n {
    margin-left: auto;
    padding-left: 10px;
    font-size: 12px;
    color: var(--faint);
    white-space: nowrap;
  }

  .suggest .new {
    border-top: 1px solid var(--line);
    margin-top: 4px;
  }

  .none {
    margin: 0;
    padding: 6px 8px;
    color: var(--faint);
    font-size: 13px;
  }
</style>
