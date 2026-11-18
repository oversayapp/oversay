<script lang="ts">
  // Templates, as one component in two places (epic 036 (#54)): the Templates page, and the picker, which is
  // this page in a dialog. Categories down the left, the templates of the one picked, and the chosen
  // template's cards with Start a deck. The page adds managing: categories are yours to add, rename,
  // recolour and delete (005/04), and your templates to rename and move; deleting a template or a category
  // always asks first, and says whether it can be brought back.
  import { formatDuration } from '../lib/project/duration'
  import { logAction } from '../lib/log'
  import { count } from '../lib/words'
  import { CATEGORY_COLORS, DEFAULT_CATEGORY, templateSeconds, type Category, type Template } from '../lib/templates/catalog'
  import { categoryDeletion, countInCategory, findCategory, visibleCategories, visibleTemplates } from '../lib/templates/library'
  import { createCategory, deleteCategory, deleteTemplate, library, renameCategory, renameTemplate, setCategoryColor, setTemplateCategory } from '../lib/templates/library-store'
  import Icon from './Icon.svelte'
  import InlineRename from './InlineRename.svelte'
  import { attempt } from './errors'

  let {
    mode,
    initial,
    onstart,
    oncancel,
  }: {
    mode: 'page' | 'picker'
    /** The template to start on, when it was found by name. */
    initial?: string
    onstart: (template: Template) => void
    oncancel?: () => void
  } = $props()

  const manage = $derived(mode === 'page')
  const categories = $derived(visibleCategories($library))
  const templates = $derived(visibleTemplates($library))

  // svelte-ignore state_referenced_locally
  let cat = $state<string>(initial ? (templates.find((t) => t.id === initial)?.category ?? 'all') : 'all')
  // svelte-ignore state_referenced_locally
  let pickId = $state<string | null>(initial ?? null)
  /** A category that has just been deleted falls back to All templates. */
  const activeCat = $derived(cat === 'all' || categories.some((c) => c.id === cat) ? cat : 'all')
  const listed = $derived(activeCat === 'all' ? templates : templates.filter((t) => t.category === activeCat))
  const selected = $derived(listed.find((t) => t.id === pickId) ?? listed[0] ?? null)
  const category = $derived(activeCat === 'all' ? null : (findCategory($library, activeCat) ?? null))
  const categoryOf = (id: string): Category => findCategory($library, id) ?? DEFAULT_CATEGORY
  const kindName = (k: string) => k.charAt(0).toUpperCase() + k.slice(1)

  let menuFor = $state<string | null>(null)
  let colouring = $state<string | null>(null)
  let renamingCat = $state<string | null>(null)
  let newCategory = $state<string | null>(null)
  let deletingCat = $state<string | null>(null)
  let deletingTpl = $state<string | null>(null)
  let renamingTpl = $state(false)
  let moving = $state(false)

  // A starter's id says which template it was; yours have random ids, which say nothing.
  const logRef = (t: Template) => (t.builtin ? t.id : 'one of yours')

  function pickCat(id: string) {
    cat = id
    menuFor = null
    logAction('templates category', id)
  }

  function pick(t: Template) {
    pickId = t.id
    renamingTpl = false
    moving = false
    logAction('template selected', logRef(t))
  }

  async function addCategory() {
    const made = await createCategory(newCategory ?? '')
    newCategory = null
    pickCat(made.id)
  }

  const closeMenus = () => {
    menuFor = null
    colouring = null
  }

  const delCat = $derived(deletingCat ? categories.find((c) => c.id === deletingCat) : undefined)
  const delTpl = $derived(deletingTpl ? templates.find((t) => t.id === deletingTpl) : undefined)
</script>

<svelte:window
  onkeydown={(e) => {
    if (e.key !== 'Escape') return
    if (deletingCat || deletingTpl) {
      e.stopPropagation()
      deletingCat = deletingTpl = null
    } else if (menuFor) closeMenus()
  }}
  onclick={(e) => {
    if (menuFor && !(e.target as HTMLElement).closest('.catmenu, .more')) closeMenus()
  }}
/>

<div class="tb" class:picker={mode === 'picker'}>
  <div class="cats" role="group" aria-label="Template categories">
    <button class="nav" class:on={activeCat === 'all'} aria-pressed={activeCat === 'all'} onclick={() => pickCat('all')}>
      <span class="ic"><Icon name="template" size={15} /></span><span class="lab">All templates</span><span class="n">{templates.length}</span>
    </button>
    <h4>
      Categories
      {#if manage}<button class="plus" title="New category" aria-label="New category" onclick={() => (newCategory = '')}><Icon name="plus" size={14} /></button>{/if}
    </h4>
    {#if newCategory !== null}
      <form
        class="newcat"
        onsubmit={(e) => {
          e.preventDefault()
          attempt(addCategory)
        }}
      >
        <!-- svelte-ignore a11y_autofocus -->
        <input bind:value={newCategory} placeholder="Category name" aria-label="New category name" autofocus onkeydown={(e) => e.key === 'Escape' && (newCategory = null)} />
        <button type="submit" class="primary">Add</button>
      </form>
    {/if}
    {#each categories.filter((c) => c.id !== DEFAULT_CATEGORY.id) as c (c.id)}{@render catRow(c)}{/each}
    <h4>Yours</h4>
    {@render catRow(categories.find((c) => c.id === DEFAULT_CATEGORY.id) ?? DEFAULT_CATEGORY)}
  </div>

  <div class="mid">
    <div class="ph">
      <h3>
        {#if category}<span class="dot" style="--c: var(--cat-{category.color})"></span>{category.name}{:else}All templates{/if}
      </h3>
      <span class="faint">{count(listed.length, 'template')}</span>
    </div>
    <div class="grid">
      {#each listed as t (t.id)}
        <button class="t" class:on={selected?.id === t.id} aria-pressed={selected?.id === t.id} onclick={() => pick(t)}>
          <b>{t.name}{#if !t.builtin}<span class="own">Yours</span>{/if}</b>
          <small>{t.description}</small>
          <span class="ck"><span class="dot" style="--c: var(--cat-{categoryOf(t.category).color})"></span>{categoryOf(t.category).name} · {count(t.segments.length, 'card')} · {formatDuration(templateSeconds(t))}</span>
        </button>
      {:else}
        <p class="empty">
          {#if activeCat === DEFAULT_CATEGORY.id}
            <b>No templates of your own yet</b><br />Templates you save from a deck go here unless you pick another category.
          {:else}
            No templates in this category.
          {/if}
        </p>
      {/each}
    </div>
  </div>

  <section class="prev" aria-label="Template preview">
    {#if selected}
      {@const tpl = selected}
      <div class="ph2">
        <h3>{tpl.name}</h3>
        {#if manage}
          <button class="iconbtn" title="Delete this template" aria-label="Delete {tpl.name}" onclick={() => (deletingTpl = tpl.id)}><Icon name="trash" size={16} /></button>
        {/if}
      </div>
      <p class="d">{tpl.description}</p>
      <span class="ck"><span class="dot" style="--c: var(--cat-{categoryOf(tpl.category).color})"></span>{categoryOf(tpl.category).name} · {count(tpl.segments.length, 'card')} · {formatDuration(templateSeconds(tpl))}{tpl.builtin ? ' · starter' : ' · yours'}</span>
      <ol class="cardlist">
        {#each tpl.segments as s, i (i)}
          <li>
            <span class="faint">{i + 1}</span><span class="nm">{s.name}</span>
            <span class="ck"><span class="dot" style="--c: var(--k-{s.kind})"></span>{kindName(s.kind)}</span>
            <span class="tm">{s.openEnded ? 'open' : formatDuration(s.plannedSeconds)}</span>
          </li>
        {/each}
      </ol>
      <p class="faint small">“open” runs until you move on.</p>
      {#if manage && !tpl.builtin}
        <div class="own-acts">
          {#if renamingTpl}
            <InlineRename initial={tpl.name} label="Template name" onrename={(name) => ((renamingTpl = false), attempt(() => renameTemplate(tpl.id, name)))} oncancel={() => (renamingTpl = false)} />
          {:else}
            <button onclick={() => (renamingTpl = true)}><Icon name="edit" size={14} /> Rename</button>
            <button onclick={() => (moving = !moving)} aria-expanded={moving}>Move to…</button>
          {/if}
        </div>
        {#if moving}
          <div class="moveto">
            {#each categories.filter((c) => c.id !== tpl.category) as c (c.id)}
              <button class="nav" onclick={() => ((moving = false), attempt(() => setTemplateCategory(tpl.id, c.id)))}><span class="dot" style="--c: var(--cat-{c.color})"></span><span class="lab">{c.name}</span></button>
            {/each}
          </div>
        {/if}
      {/if}
      <div class="foot">
        <button class="cta" onclick={() => onstart(tpl)}>
          <span class="ci"><Icon name="plus" size={18} /></span>
          <span class="ct"><b>{mode === 'picker' ? 'Use template' : 'Start a deck'}</b><small>{count(tpl.segments.length, 'card')} · {formatDuration(templateSeconds(tpl))} · opens in the editor</small></span>
        </button>
        {#if oncancel}<button class="cancel" onclick={oncancel}>Cancel</button>{/if}
      </div>
    {:else}
      <p class="faint none">Pick a template to see its cards.</p>
      {#if oncancel}<div class="foot"><button class="cancel" onclick={oncancel}>Cancel</button></div>{/if}
    {/if}
  </section>
</div>

{#snippet catRow(c: Category)}
  <div class="nav" class:on={activeCat === c.id} role="presentation">
    {#if renamingCat === c.id}
      <span class="dot" style="--c: var(--cat-{c.color})"></span>
      <InlineRename initial={c.name} label="Category name" onrename={(name) => ((renamingCat = null), attempt(() => renameCategory(c.id, name)))} oncancel={() => (renamingCat = null)} />
    {:else}
      <button class="rowbtn" aria-pressed={activeCat === c.id} onclick={() => pickCat(c.id)}>
        <span class="dot" style="--c: var(--cat-{c.color})"></span><span class="lab">{c.name}</span><span class="n">{countInCategory($library, c.id)}</span>
      </button>
      {#if manage}
        <button class="more" aria-haspopup="menu" aria-expanded={menuFor === c.id} aria-label="More for {c.name}" title="Rename, colour, delete" onclick={() => ((menuFor = menuFor === c.id ? null : c.id), (colouring = null))}><Icon name="more" size={15} /></button>
        {#if menuFor === c.id}
          <div class="catmenu" role="menu">
            {#if colouring === c.id}
              <div class="h">Colour for {c.name}</div>
              <div class="sw">
                {#each CATEGORY_COLORS as color (color)}
                  <button role="menuitemradio" aria-checked={c.color === color} class:on={c.color === color} onclick={() => ((menuFor = colouring = null), attempt(() => setCategoryColor(c.id, color)))}><span class="dot" style="--c: var(--cat-{color})"></span>{kindName(color)}</button>
                {/each}
              </div>
            {:else}
              {#if !c.builtin}
                <button role="menuitem" onclick={() => ((menuFor = null), (renamingCat = c.id))}><Icon name="edit" size={14} /> Rename</button>
                <button role="menuitem" onclick={() => (colouring = c.id)}><span class="dot" style="--c: var(--cat-{c.color})"></span> Change colour…</button>
              {:else}
                <p class="h">Starter category: its name and colour are fixed.</p>
              {/if}
              {#if c.id === DEFAULT_CATEGORY.id}
                <p class="h">My templates can’t be deleted.</p>
              {:else}
                <button role="menuitem" class="danger" onclick={() => ((menuFor = null), (deletingCat = c.id))}><Icon name="trash" size={14} /> Delete category…</button>
              {/if}
            {/if}
          </div>
        {/if}
      {/if}
    {/if}
  </div>
{/snippet}

{#if delTpl}
  {@const t = delTpl}
  <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
  <div class="scrim" onclick={(e) => e.target === e.currentTarget && (deletingTpl = null)}>
    <div class="dlg" role="alertdialog" aria-modal="true" aria-label="Delete template">
      <h4>Delete “{t.name}”?</h4>
      <p>
        {t.builtin ? 'It’s a starter template. Settings › Templates brings it back.' : 'This is one of your own templates. It can’t be brought back.'}
        Decks already made from it don’t change.
      </p>
      <div class="dfoot">
        <button onclick={() => (deletingTpl = null)}>Cancel</button>
        <button class="danger solid" onclick={() => ((deletingTpl = null), attempt(() => deleteTemplate(t.id)))}><Icon name="trash" size={15} /> Delete template</button>
      </div>
    </div>
  </div>
{/if}

{#if delCat}
  {@const c = delCat}
  {@const gone = categoryDeletion($library, c.id)}
  <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
  <div class="scrim" onclick={(e) => e.target === e.currentTarget && (deletingCat = null)}>
    <div class="dlg" role="alertdialog" aria-modal="true" aria-label="Delete category">
      <h4>Delete {c.name}?</h4>
      <p>
        {#if gone.templates === 0}It has no templates.{:else}Its {count(gone.templates, 'template')} {gone.templates === 1 ? 'goes' : 'go'} with it.{/if}
        {#if gone.starters}Starter templates can be brought back in Settings › Templates{gone.yours ? '; ' : '.'}{/if}
        {#if gone.yours}templates of your own can’t.{/if}
        {#if gone.templates}Decks made from them don’t change.{/if}
      </p>
      <div class="dfoot">
        <button onclick={() => (deletingCat = null)}>Cancel</button>
        <button class="danger solid" onclick={() => ((deletingCat = null), attempt(() => deleteCategory(c.id)))}><Icon name="trash" size={15} /> Delete category</button>
      </div>
    </div>
  </div>
{/if}

<style>
  .tb {
    display: grid;
    grid-template-columns: 220px minmax(0, 1fr) minmax(260px, 340px);
    gap: 0;
    height: 100%;
    min-height: 0;
  }

  .cats,
  .mid,
  .prev {
    overflow: auto;
    min-height: 0;
    padding: 16px 14px 24px;
  }

  .cats {
    border-right: 1px solid var(--line);
    padding: 14px 10px 24px;
  }

  .prev {
    border-left: 1px solid var(--line);
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  h4 {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin: 16px 10px 6px;
    font-size: 11.5px;
    letter-spacing: 0.07em;
    text-transform: uppercase;
    color: var(--faint);
  }

  .plus {
    border: 0;
    background: none;
    padding: 2px;
    color: var(--muted);
    border-radius: 6px;
  }

  .nav {
    position: relative;
    display: flex;
    align-items: center;
    gap: 4px;
    width: 100%;
    border-radius: 9px;
    padding: 0;
    color: var(--text);
    font-size: 13.5px;
  }

  button.nav {
    border: 0;
    background: none;
    padding: 7px 10px;
    gap: 9px;
    text-align: left;
    font-weight: 500;
  }

  .nav:hover {
    background: var(--hover);
  }

  .nav.on {
    background: var(--accent-soft);
    color: var(--accent-text);
    font-weight: 650;
  }

  .rowbtn {
    flex: 1;
    min-width: 0;
    display: flex;
    align-items: center;
    gap: 9px;
    border: 0;
    background: none !important;
    padding: 7px 4px 7px 10px;
    text-align: left;
    color: inherit;
    font-weight: inherit;
  }

  .more {
    border: 0;
    background: none;
    color: var(--muted);
    padding: 5px;
    border-radius: 7px;
    opacity: 0;
  }

  .nav:hover .more,
  .more[aria-expanded='true'],
  .more:focus-visible {
    opacity: 1;
  }

  .lab {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .n {
    font-size: 12px;
    color: var(--faint);
    font-variant-numeric: tabular-nums;
  }

  .ic {
    display: inline-flex;
    color: var(--muted);
  }

  .dot {
    width: 10px;
    height: 10px;
    border-radius: 3px;
    flex: none;
    background: var(--c);
    display: inline-block;
  }

  .newcat {
    display: flex;
    gap: 6px;
    margin: 0 4px 6px;
  }

  .newcat input {
    flex: 1;
    min-width: 0;
  }

  .catmenu {
    position: absolute;
    top: calc(100% + 4px);
    left: 8px;
    z-index: 30;
    width: 240px;
    padding: 6px;
    background: var(--card);
    border: 1px solid var(--line-strong);
    border-radius: 12px;
    box-shadow: 0 10px 30px rgba(0, 0, 0, 0.18);
  }

  .catmenu button {
    display: flex;
    align-items: center;
    gap: 9px;
    width: 100%;
    border: 0;
    background: none;
    border-radius: 8px;
    padding: 7px 9px;
    text-align: left;
    color: var(--text);
    font-weight: 500;
  }

  .catmenu button:hover {
    background: var(--hover);
  }

  .catmenu .danger {
    color: var(--danger);
  }

  .catmenu .sw {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 2px;
  }

  .catmenu .sw .on {
    background: var(--accent-soft);
  }

  .h {
    margin: 4px 8px;
    font-size: 12px;
    color: var(--muted);
  }

  .ph {
    display: flex;
    align-items: baseline;
    gap: 10px;
    margin-bottom: 12px;
  }

  .ph h3,
  .ph2 h3 {
    margin: 0;
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .ph2 {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
  }

  .iconbtn {
    border: 0;
    background: none;
    padding: 6px;
    border-radius: 8px;
    color: var(--muted);
  }

  .iconbtn:hover {
    background: var(--hover);
    color: var(--danger);
  }

  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
    gap: 10px;
  }

  .t {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 3px;
    text-align: left;
    padding: 12px 14px;
    border: 1px solid var(--line);
    border-radius: 12px;
    background: var(--card);
    font-weight: 400;
    color: var(--text);
  }

  .t:hover {
    border-color: var(--line-strong);
  }

  .t.on {
    border-color: var(--accent);
    box-shadow: 0 0 0 1px var(--accent);
  }

  .t b {
    font-size: 14.5px;
  }

  .t small,
  .d {
    color: var(--muted);
    font-size: 12.5px;
    margin: 0;
  }

  .own {
    margin-left: 8px;
    font-size: 10.5px;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: var(--accent-text);
    background: var(--accent-soft);
    border-radius: 6px;
    padding: 1px 6px;
  }

  .ck {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font-size: 12px;
    color: var(--muted);
  }

  .empty {
    grid-column: 1 / -1;
    padding: 22px;
    border: 1.5px dashed var(--line-strong);
    border-radius: 12px;
    color: var(--muted);
    text-align: center;
  }

  .cardlist {
    list-style: none;
    margin: 6px 0 0;
    padding: 0;
    display: flex;
    flex-direction: column;
  }

  .cardlist li {
    display: grid;
    grid-template-columns: 18px minmax(0, 1fr) auto 52px;
    gap: 8px;
    align-items: center;
    padding: 7px 0;
    border-bottom: 1px solid var(--line);
    font-size: 13px;
  }

  .nm {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .tm {
    text-align: right;
    font-variant-numeric: tabular-nums;
    color: var(--muted);
  }

  .small {
    font-size: 12px;
    margin: 2px 0 0;
  }

  .own-acts {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
    align-items: center;
  }

  .own-acts button {
    display: inline-flex;
    align-items: center;
    gap: 6px;
  }

  .moveto {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .foot {
    margin-top: auto;
    padding-top: 12px;
    display: flex;
    flex-direction: column;
    gap: 8px;
    position: sticky;
    bottom: 0;
    background: var(--bg);
  }

  .picker .foot {
    background: var(--card);
  }

  .cta {
    display: flex;
    align-items: center;
    gap: 12px;
    width: 100%;
    padding: 12px 14px;
    border: 0;
    border-radius: 12px;
    background: var(--accent);
    color: var(--on-accent);
    text-align: left;
  }

  .cta:hover:not(:disabled) {
    filter: brightness(1.08);
  }

  .ci {
    display: inline-flex;
  }

  .ct {
    display: flex;
    flex-direction: column;
  }

  .ct small {
    opacity: 0.85;
    font-weight: 400;
  }

  .cancel {
    align-self: stretch;
  }

  .none {
    text-align: center;
    margin-top: 40px;
  }

  .scrim {
    position: fixed;
    inset: 0;
    z-index: 200;
    background: rgba(10, 14, 24, 0.45);
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .dlg {
    width: min(420px, calc(100vw - 32px));
    padding: 20px 22px;
    background: var(--card);
    border-radius: 14px;
    box-shadow: 0 24px 60px rgba(0, 0, 0, 0.35);
  }

  .dlg h4 {
    display: block;
    margin: 0 0 8px;
    font-size: 16px;
    letter-spacing: 0;
    text-transform: none;
    color: var(--text);
  }

  .dlg p {
    margin: 0;
    color: var(--muted);
  }

  .dfoot {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    margin-top: 18px;
  }

  .dfoot button {
    display: inline-flex;
    align-items: center;
    gap: 6px;
  }

  .danger.solid {
    background: var(--danger);
    border-color: var(--danger);
    color: #fff;
  }

  /* Narrow: the cards go under the templates, the categories above. */
  @media (max-width: 900px) {
    .tb {
      grid-template-columns: 180px minmax(0, 1fr);
      grid-template-rows: minmax(0, 1fr) auto;
    }

    .prev {
      grid-column: 1 / -1;
      border-left: 0;
      border-top: 1px solid var(--line);
      max-height: 46%;
    }
  }
</style>
