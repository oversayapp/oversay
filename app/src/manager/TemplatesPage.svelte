<script lang="ts">
  // Templates: search, category
  // chips, cards with a mini plan bar, and a preview of the selected template. Categories are
  // yours to add, rename, recolour and delete (005/04).
  import { formatDuration } from '../lib/project/duration'
  import { logAction } from '../lib/log'
  import { count } from '../lib/words'
  import { CATEGORY_COLORS, DEFAULT_CATEGORY, templateSeconds, type Category, type Template } from '../lib/templates/catalog'
  import { filterTemplates, type TemplateFilter } from '../lib/templates/filter'
  import { countInCategory, findCategory, visibleCategories, visibleTemplates } from '../lib/templates/library'
  import {
    createCategory,
    deleteCategory,
    deleteTemplate,
    library,
    renameCategory,
    renameTemplate,
    setCategoryColor,
    setTemplateCategory,
  } from '../lib/templates/library-store'
  import ConfirmDelete from './ConfirmDelete.svelte'
  import Icon from './Icon.svelte'
  import InlineRename from './InlineRename.svelte'
  import { attempt } from './errors'

  const categories = $derived(visibleCategories($library))
  // Starter templates first, then yours (newest last).
  const templates = $derived(visibleTemplates($library))

  let chip = $state<TemplateFilter['chip']>('all')
  let query = $state('')
  let selectedId = $state<string | null>(null)

  // A chip for a category that has just been deleted falls back to All.
  const activeChip = $derived(chip === 'all' || categories.some((c) => c.id === chip) ? chip : 'all')
  const activeCategory = $derived(activeChip === 'all' ? null : (findCategory($library, activeChip) ?? null))

  const shown = $derived(filterTemplates(templates, { chip: activeChip, query }))
  // Keep a selection whenever something is listed; follow the filter when it hides the old one.
  const selected = $derived(shown.find((t) => t.id === selectedId) ?? shown[0] ?? null)

  const categoryOf = (id: string): Category => findCategory($library, id) ?? DEFAULT_CATEGORY

  // Editing one of your templates in the preview.
  let renaming = $state(false)
  let confirmingDelete = $state(false)

  // Managing categories: a new one, and renaming or deleting the selected chip's category.
  let newCategory = $state<string | null>(null)
  let renamingCategory = $state(false)
  let confirmingCategoryDelete = $state(false)

  function pickChip(next: TemplateFilter['chip']) {
    chip = next
    renamingCategory = false
    confirmingCategoryDelete = false
    logAction('templates filter', next)
  }

  async function addCategory() {
    const category = await createCategory(newCategory ?? '')
    newCategory = null
    pickChip(category.id)
  }

  let preview: HTMLElement | undefined = $state()
  let searchBox: HTMLInputElement | undefined = $state()

  function clearSearch() {
    query = ''
    searchBox?.focus()
  }

  // A starter's id says which template it was; yours have random ids, which say nothing.
  const logRef = (t: Template) => (t.builtin ? t.id : 'one of yours')

  function select(t: Template) {
    selectedId = t.id
    renaming = false
    confirmingDelete = false
    logAction('template selected', logRef(t))
    // In the narrow layout the preview is below the cards; bring it into view.
    if (preview && getComputedStyle(preview).position !== 'sticky') {
      requestAnimationFrame(() => preview?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }))
    }
  }

</script>

{#snippet miniBar(t: Template)}
  <span class="mini" aria-hidden="true">
    {#each t.segments as s, i (i)}
      <i class:open={s.openEnded} style="flex: {s.plannedSeconds} 1 0; --c: var(--k-{s.kind})"></i>
    {/each}
  </span>
{/snippet}

{#snippet catLabel(c: Category)}
  <span class="cat" style="--cat: var(--cat-{c.color})"><span class="dot" aria-hidden="true"></span>{c.name}</span>
{/snippet}

<div class="page">
  <header class="phead">
    <div class="grow">
      <h1>Templates</h1>
      <!-- Projects and talks are gone (ADR 0039); templates are kept to start decks later. -->
      <p class="muted">Skeletons of cards, kinds and lengths. Starting a deck from one is coming.</p>
    </div>
    <div class="search">
      <Icon name="search" size={16} />
      <input
        type="search"
        bind:this={searchBox}
        bind:value={query}
        placeholder="Search templates"
        aria-label="Search templates"
        onkeydown={(e) => {
          if (e.key === 'Escape' && query) {
            e.preventDefault()
            clearSearch()
          }
        }}
      />
      {#if query}
        <button class="clear" type="button" aria-label="Clear search" title="Clear search (Esc)" onclick={clearSearch}>
          <Icon name="close" size={14} />
        </button>
      {/if}
    </div>
  </header>

  <div class="chips" role="group" aria-label="Template categories">
    <button class="chip" aria-pressed={activeChip === 'all'} onclick={() => pickChip('all')}>All</button>
    {#each categories as c (c.id)}
      <button class="chip" aria-pressed={activeChip === c.id} onclick={() => pickChip(c.id)} style="--cat: var(--cat-{c.color})">
        <span class="dot" aria-hidden="true"></span>{c.name}
      </button>
    {/each}
    {#if newCategory === null}
      <button class="chip add" onclick={() => (newCategory = '')}><Icon name="plus" size={14} /> New category</button>
    {:else}
      <form
        class="new-cat"
        onsubmit={(e) => {
          e.preventDefault()
          attempt(addCategory)
        }}
      >
        <!-- svelte-ignore a11y_autofocus -->
        <input
          bind:value={newCategory}
          placeholder="Category name"
          aria-label="New category name"
          autofocus
          onkeydown={(e) => {
            if (e.key === 'Escape') newCategory = null
          }}
        />
        <button type="submit" class="primary">Add</button>
        <button type="button" onclick={() => (newCategory = null)}>Cancel</button>
      </form>
    {/if}
  </div>

  {#if activeCategory}
    {@const cat = activeCategory}
    <div class="cat-bar" style="--cat: var(--cat-{cat.color})">
      {#if renamingCategory}
        <InlineRename
          initial={cat.name}
          label="Category name"
          onrename={(name) => {
            attempt(() => renameCategory(cat.id, name))
            renamingCategory = false
          }}
          oncancel={() => (renamingCategory = false)}
        />
      {:else if confirmingCategoryDelete}
        {@const n = countInCategory($library, cat.id)}
        <ConfirmDelete
          label="Delete category"
          onconfirm={() => {
            attempt(() => deleteCategory(cat.id))
            confirmingCategoryDelete = false
          }}
          oncancel={() => (confirmingCategoryDelete = false)}
        >
          Delete “{cat.name}”{n > 0 ? ` and the ${count(n, 'template')} in it` : ''}?
          {#if n > 0}To keep any of yours, move them first: select a template and change its category.{/if}
          {#if cat.builtin}Starter categories can be restored in Settings.{/if}
        </ConfirmDelete>
      {:else}
        <span class="cat-name"><span class="dot" aria-hidden="true"></span>{cat.name}</span>
        {#if !cat.builtin}
          <button onclick={() => (renamingCategory = true)}><Icon name="edit" size={14} /> Rename</button>
          <div class="swatches" role="radiogroup" aria-label="Category colour">
            {#each CATEGORY_COLORS as color (color)}
              <button
                class="swatch"
                role="radio"
                aria-checked={cat.color === color}
                aria-label={color}
                title={color}
                style="--sw: var(--cat-{color})"
                onclick={() => attempt(() => setCategoryColor(cat.id, color))}
              ></button>
            {/each}
          </div>
          {#if cat.id !== DEFAULT_CATEGORY.id}
            <button onclick={() => (confirmingCategoryDelete = true)}><Icon name="trash" size={14} /> Delete category</button>
          {:else}
            <span class="muted hint">Templates you save go here by default.</span>
          {/if}
        {:else}
          <span class="muted hint">Starter category</span>
          <button onclick={() => (confirmingCategoryDelete = true)}><Icon name="trash" size={14} /> Delete category</button>
        {/if}
      {/if}
    </div>
  {/if}

  <div class="body">
    {#if shown.length === 0}
      <p class="empty muted">
        {#if query}
          No templates match “{query}”.
        {:else if activeChip === DEFAULT_CATEGORY.id}
          Templates you save from a talk go here unless you pick another category.
        {:else}
          No templates in this category yet. Save a talk as a template to add one.
        {/if}
      </p>
    {:else}
      <div class="grid">
        {#each shown as t (t.id)}
          <button class="tpl" aria-pressed={selected?.id === t.id} onclick={() => select(t)}>
            <span class="name">{t.name}</span>
            {@render miniBar(t)}
            <span class="by">
              {@render catLabel(categoryOf(t.category))} · {count(t.segments.length, 'segment')} · {formatDuration(
                templateSeconds(t),
              )}{t.builtin ? '' : ' · Yours'}
            </span>
          </button>
        {/each}
      </div>
    {/if}

    {#if selected}
      {@const tpl = selected}
      <section class="preview" aria-label="Template preview" bind:this={preview}>
        <div class="ptop">
          <h2>{selected.name} <span class="muted">· {formatDuration(templateSeconds(selected))}</span></h2>
        </div>
        <p class="muted">{@render catLabel(categoryOf(selected.category))} · {selected.description}</p>
        <div class="manage">
          {#if renaming}
            <InlineRename
              initial={tpl.name}
              label="Template name"
              onrename={(name) => {
                attempt(() => renameTemplate(tpl.id, name))
                renaming = false
              }}
              oncancel={() => (renaming = false)}
            />
          {:else if confirmingDelete}
            <ConfirmDelete
              onconfirm={() => {
                attempt(() => deleteTemplate(tpl.id))
                confirmingDelete = false
              }}
              oncancel={() => (confirmingDelete = false)}
            >
              {#if tpl.builtin}
                Delete the starter template “{tpl.name}”? You can restore it in Settings.
              {:else}
                Delete “{tpl.name}”? This can't be undone.
              {/if}
            </ConfirmDelete>
          {:else}
            {#if !tpl.builtin}
              <button onclick={() => (renaming = true)}><Icon name="edit" size={14} /> Rename</button>
              <select
                value={tpl.category}
                aria-label="Category"
                onchange={(e) => attempt(() => setTemplateCategory(tpl.id, e.currentTarget.value))}
              >
                {#each categories as c (c.id)}<option value={c.id}>{c.name}</option>{/each}
              </select>
            {/if}
            <button onclick={() => (confirmingDelete = true)}><Icon name="trash" size={14} /> Delete</button>
          {/if}
        </div>
        <ol>
          {#each selected.segments as s, i (i)}
            <li class:open={s.openEnded} style="--c: var(--k-{s.kind})">
              <span class="sw"></span>
              <span class="kd">{s.kind}</span>
              <span class="nm">{s.name}</span>
              {#if s.openEnded}<span class="est" title="Open-ended: the length is an estimate">est.</span>{/if}
              <span class="len">{formatDuration(s.plannedSeconds)}</span>
            </li>
          {/each}
        </ol>
      </section>
    {/if}
  </div>
</div>

<style>
  /* Category colour: a dot beside the name, never colour alone. */
  .dot {
    display: inline-block;
    width: 9px;
    height: 9px;
    border-radius: 99px;
    background: var(--cat);
    margin-right: 6px;
    flex: none;
  }

  .chip {
    display: inline-flex;
    align-items: center;
  }

  .chip.add {
    gap: 4px;
    background: none;
    border: 1px dashed var(--line-strong);
    color: var(--accent-text);
  }

  .new-cat {
    display: inline-flex;
    gap: 6px;
    align-items: center;
  }

  .new-cat input {
    width: 180px;
  }

  .cat {
    display: inline-flex;
    align-items: center;
  }

  .cat-bar {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 8px;
    margin: -4px 0 16px;
    padding: 8px 12px;
    border: 1px solid var(--line);
    border-left: 4px solid var(--cat);
    border-radius: 10px;
    background: var(--card);
  }

  .cat-bar button {
    display: inline-flex;
    align-items: center;
    gap: 5px;
  }

  .cat-name {
    display: inline-flex;
    align-items: center;
    font-weight: 650;
    margin-right: 4px;
  }

  .hint {
    font-size: 12.5px;
  }

  .swatches {
    display: inline-flex;
    gap: 5px;
    padding: 0 4px;
  }

  .swatch {
    width: 20px;
    height: 20px;
    padding: 0;
    border-radius: 99px;
    border: 2px solid transparent;
    background: var(--sw);
    box-shadow: inset 0 0 0 2px var(--card);
  }

  .swatch[aria-checked='true'] {
    border-color: var(--text);
  }

  .page {
    max-width: 1180px;
    margin: 0 auto;
    padding: 26px 32px 48px;
    container-type: inline-size;
  }

  /* Wide: cards on the left, the preview beside them and kept in view while scrolling. */
  @container (min-width: 820px) {
    .body {
      display: grid;
      grid-template-columns: minmax(0, 1fr) 320px;
      gap: 20px;
      align-items: start;
    }

    .preview {
      position: sticky;
      top: 16px;
      margin-top: 0 !important;
    }
  }

  .phead {
    display: flex;
    align-items: flex-end;
    gap: 14px;
    flex-wrap: wrap;
    margin-bottom: 14px;
  }

  .grow {
    flex: 1 1 260px;
  }

  .phead h1 {
    margin: 0;
  }

  .phead p {
    margin: 4px 0 0;
  }

  .search {
    display: flex;
    align-items: center;
    gap: 6px;
    flex: 0 1 260px;
    border: 1px solid var(--line-strong);
    border-radius: 10px;
    padding: 0 10px;
    background: var(--card);
    color: var(--muted);
  }

  .search input {
    flex: 1;
    min-width: 0;
    border: 0;
    background: none;
    padding: 8px 0;
    outline: none;
  }

  /* Our own clear button instead of the browser's faint one. */
  .search input::-webkit-search-cancel-button {
    display: none;
  }

  .clear {
    display: grid;
    place-items: center;
    width: 22px;
    height: 22px;
    flex: none;
    border: 0;
    border-radius: 99px;
    padding: 0;
    background: var(--line-strong);
    color: var(--text);
  }

  .clear:hover {
    background: var(--muted);
    color: var(--bg);
  }

  .search:focus-within {
    border-color: var(--accent);
    box-shadow: 0 0 0 1px var(--accent);
  }

  .chips {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
    margin-bottom: 16px;
  }

  .chip {
    border: 0;
    background: var(--rail);
    color: var(--muted);
    border-radius: 99px;
    padding: 5px 14px;
    font-weight: 500;
  }

  .chip:hover {
    background: var(--line);
  }

  .chip[aria-pressed='true'] {
    background: var(--accent-soft);
    color: var(--accent-text);
    font-weight: 600;
  }

  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(230px, 1fr));
    gap: 14px;
  }

  .tpl {
    border: 1px solid var(--line);
    border-radius: 14px;
    background: var(--card);
    padding: 14px;
    text-align: left;
    display: flex;
    flex-direction: column;
    gap: 8px;
    color: var(--text);
  }

  .tpl:hover {
    border-color: var(--line-strong);
  }

  .tpl[aria-pressed='true'] {
    border-color: var(--accent);
    box-shadow: 0 0 0 1px var(--accent);
  }

  .tpl .name {
    font-size: 15px;
    font-weight: 650;
  }

  .tpl .by {
    font-size: 11.5px;
    color: var(--muted);
  }

  .mini {
    display: flex;
    gap: 2px;
    height: 12px;
  }

  .mini i {
    display: block;
    background: var(--c);
    border-radius: 3px;
  }

  .mini i.open {
    background: repeating-linear-gradient(
      135deg,
      color-mix(in srgb, var(--c) 28%, transparent) 0 4px,
      transparent 4px 7px
    );
    border: 1.5px dashed var(--c);
  }

  .empty {
    padding: 24px 0;
  }

  .preview {
    margin-top: 22px;
    border: 1px solid var(--line);
    border-radius: 14px;
    padding: 16px 18px;
    background: var(--card);
  }

  /* A heading, not the app's small uppercase section label. */
  .preview h2 {
    margin: 0;
    font-size: 16px;
    text-transform: none;
    letter-spacing: normal;
    color: var(--text);
  }

  .ptop {
    display: flex;
    align-items: center;
    gap: 10px;
    flex-wrap: wrap;
  }

  .ptop h2 {
    flex: 1 1 160px;
  }


  .manage {
    display: flex;
    align-items: center;
    gap: 6px;
    flex-wrap: wrap;
    margin-top: 10px;
  }

  .manage button {
    display: inline-flex;
    align-items: center;
    gap: 5px;
  }

  /* Rename and Delete side by side; the category menu on its own line below. */
  .manage select {
    order: 1;
    flex: 1 1 100%;
  }

  .preview h2 .muted {
    font-weight: 400;
  }

  .preview p {
    margin: 4px 0 0;
  }

  .preview ol {
    list-style: none;
    margin: 10px 0 0;
    padding: 0;
  }

  .preview li {
    display: flex;
    gap: 10px;
    align-items: center;
    padding: 6px 0;
    border-bottom: 1px solid var(--line);
  }

  .preview li:last-child {
    border-bottom: 0;
  }

  .sw {
    width: 5px;
    height: 20px;
    border-radius: 3px;
    background: var(--c);
    flex: none;
  }

  li.open .sw {
    background: none;
    border-left: 5px dashed var(--c);
    width: 0;
    border-radius: 0;
  }

  .kd {
    font-size: 12px;
    color: var(--c);
    font-weight: 600;
    width: 56px;
    flex: none;
  }

  .nm {
    flex: 1;
    min-width: 0;
  }

  .est {
    font-size: 11.5px;
    font-weight: 700;
    color: var(--k-demo);
    background: color-mix(in srgb, var(--k-demo) 16%, transparent);
    border-radius: 5px;
    padding: 1px 6px;
  }

  .len {
    font-variant-numeric: tabular-nums;
    color: var(--muted);
  }
</style>
