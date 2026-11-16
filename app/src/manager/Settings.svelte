<script lang="ts">
  import { hiddenFromCapture, setHiddenFromCapture } from '../lib/windows'
  import { linkPermission, overlaySettings, settings, previewOverlayOpacity, setAppearance, setLinkPermission, setOverlayOpacity, setOverlaySetting } from '../lib/settings/store'
  import type { LinkPermission } from '../lib/links'
  import type { Appearance } from '../lib/settings/settings'
  import {
    STRIP_EDGE_OPTIONS,
    BUTTON_OPTIONS,
    TIMELINE_STYLE_OPTIONS,
    PANEL_OPTIONS,
    TEXT_SIZE_OPTIONS,
    LAYOUT_OPTIONS,
    minOpacity,
    shownOpacity,
  } from '../lib/settings/overlays'
  import { attempt } from './errors'
  import DevTools from './DevTools.svelte'
  import ShortcutsSettings from './ShortcutsSettings.svelte'
  import RecordingsSettings from './RecordingsSettings.svelte'
  import AboutSection from './AboutSection.svelte'
  import ThirdPartyLicences from './ThirdPartyLicences.svelte'
  import { deletedStarters, type StarterCounts } from '../lib/templates/library'
  import { count } from '../lib/words'
  import { library, restoreStarters } from '../lib/templates/library-store'
  import { onMount, tick, untrack } from 'svelte'
  import { nav as screen } from './route'
  import { SETTINGS_SECTIONS, atScrollEnd, currentSection, type SettingsSectionId } from '../lib/settings/sections'
  import { logAction } from '../lib/log'
  import { installExampleDecks, missingExampleDecks } from '../lib/decks/examples'

  // Checked again when the window comes back to the front, in case it was deleted in Finder meanwhile.
  // The example deck: which examples are missing from Decks, and how many were just put back.
  let missingDecks = $state<string[] | null>(null)
  let decksRestored = $state(0)
  const checkDemo = () =>
    attempt(async () => {
      missingDecks = await missingExampleDecks()
    })
  onMount(checkDemo)

  async function restoreExampleDecks() {
    logAction('restore example decks')
    decksRestored = (await installExampleDecks()).length
    missingDecks = await missingExampleDecks()
  }

  const missing = $derived(deletedStarters($library))
  let restored = $state<StarterCounts | null>(null)

  async function restore() {
    const before = missing
    await restoreStarters()
    restored = before
  }

  const cats = (n: number) => count(n, 'category', 'categories')
  const tpls = (n: number) => count(n, 'template')

  // The list of sections: the page is the manager's own scrolling <main>, so the list watches that.
  // Below 760 px it is a menu across the top (John chose the menu).
  const NARROW = 760
  let root: HTMLElement
  let toc = $state<HTMLElement>()
  let current = $state<SettingsSectionId>(SETTINGS_SECTIONS[0].id)
  let menuOpen = $state(false)
  let devOpen = $state(false)
  // About's third-party licences are a page of their own, in place of the sections (013/03).
  let showLicences = $state(false)

  async function openLicences() {
    logAction('open third-party licences')
    showLicences = true
    await tick()
    scroller().scrollTop = 0
  }

  async function closeLicences() {
    logAction('close third-party licences')
    showLicences = false
    await tick()
    void jump('about', true)
  }
  // After a click the list shows the chosen section at once; the scroll that follows doesn't change it.
  let lockUntil = 0

  const scroller = () => root.closest('main') as HTMLElement
  const isNarrow = () => root.clientWidth <= NARROW
  // How far from the top of the scrolling area a section counts as reached: under the sticky bar when narrow.
  const offset = () => (isNarrow() && toc ? toc.offsetHeight + 8 : 16)
  const topOf = (id: string) =>
    document.getElementById(id)!.getBoundingClientRect().top - scroller().getBoundingClientRect().top
  const label = (id: SettingsSectionId) => SETTINGS_SECTIONS.find((s) => s.id === id)!.label

  function onScroll() {
    if (!root || showLicences || Date.now() < lockUntil) return
    const sc = scroller()
    const end = atScrollEnd(sc.scrollTop, sc.clientHeight, sc.scrollHeight)
    current = SETTINGS_SECTIONS[currentSection(SETTINGS_SECTIONS.map((s) => topOf(s.id)), offset() + 8, end)].id
  }

  async function jump(id: SettingsSectionId, instant = false) {
    if (id === 'developer-tools') {
      devOpen = true
      await tick()
    }
    const sc = scroller()
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches
    current = id
    lockUntil = Date.now() + (instant || reduced ? 50 : 700)
    sc.scrollTo({ top: sc.scrollTop + topOf(id) - offset(), behavior: instant || reduced ? 'auto' : 'smooth' })
    document.getElementById(id)?.querySelector('h2')?.focus({ preventScroll: true })
  }

  function choose(id: SettingsSectionId) {
    logAction('settings section', label(id))
    menuOpen = false
    void jump(id)
  }

  function onWindowClick(e: MouseEvent) {
    if (menuOpen && !toc?.contains(e.target as Node)) menuOpen = false
  }

  function onMenuKey(e: KeyboardEvent) {
    if (e.key !== 'Escape' || !menuOpen) return
    menuOpen = false
    toc?.querySelector<HTMLElement>('.menubtn')?.focus()
  }

  // The page opens at the top, or at the section another screen asked for.
  $effect(() => {
    const id = $screen.settingsSection
    untrack(() => {
      if (id) void jump(id, true)
      else scroller().scrollTop = 0
    })
  })

  $effect(() => {
    const sc = scroller()
    sc.addEventListener('scroll', onScroll, { passive: true })
    return () => sc.removeEventListener('scroll', onScroll)
  })

  const LINK_CHOICES: { id: LinkPermission; label: string }[] = [
    { id: 'ask', label: 'Ask' },
    { id: 'allow', label: 'Allow' },
    { id: 'never', label: 'Never' },
  ]

  const appearances: { id: Appearance; label: string }[] = [
    { id: 'system', label: 'System' },
    { id: 'light', label: 'Light' },
    { id: 'dark', label: 'Dark' },
  ]

</script>

<svelte:window onfocus={checkDemo} onresize={onScroll} onclick={onWindowClick} onkeydown={onMenuKey} />

<div class="settings" bind:this={root}>
<div class="page">
  <h1>Settings</h1>

  {#if showLicences}
    <ThirdPartyLicences onBack={closeLicences} />
  {:else}

  <div class="layout">
  <nav class="toc" aria-label="Settings sections" bind:this={toc}>
    <button
      class="menubtn"
      aria-haspopup="true"
      aria-expanded={menuOpen}
      aria-controls="settings-menu"
      onclick={() => (menuOpen = !menuOpen)}
    >
      <span class="k">Section</span><span class="cur">{label(current)}</span><span aria-hidden="true">▾</span>
    </button>
    {#if menuOpen}
      <div class="menu" id="settings-menu">
        {#each SETTINGS_SECTIONS as s (s.id)}
          <button aria-current={current === s.id ? 'true' : undefined} onclick={() => choose(s.id)}>{s.label}</button>
        {/each}
      </div>
    {/if}
    <ul>
      {#each SETTINGS_SECTIONS as s (s.id)}
        <li><button aria-current={current === s.id ? 'true' : undefined} onclick={() => choose(s.id)}>{s.label}</button></li>
      {/each}
    </ul>
  </nav>

  <div class="sections">
  <section id="appearance">
    <h2 id="appearance-label" tabindex="-1">Appearance</h2>
    <div class="segmented" role="radiogroup" aria-labelledby="appearance-label">
      {#each appearances as a (a.id)}
        <label class:on={$settings.appearance === a.id}>
          <input
            type="radio"
            name="appearance"
            value={a.id}
            checked={$settings.appearance === a.id}
            onchange={() => attempt(() => setAppearance(a.id))}
          />
          {a.label}
        </label>
      {/each}
    </div>
    <p class="muted hint">System follows your computer's light or dark setting.</p>
  </section>

  {#snippet choice<T extends string>(name: string, labelId: string, options: readonly { id: T; label: string }[], value: T, set: (v: T) => Promise<void>, built?: readonly T[])}
    <div class="segmented" role="radiogroup" aria-labelledby={labelId}>
      {#each options as o (o.id)}
        {@const unavailable = built !== undefined && !built.includes(o.id)}
        <label class:on={value === o.id} class:unavailable>
          <input
            type="radio"
            {name}
            value={o.id}
            checked={value === o.id}
            disabled={unavailable}
            onchange={() => attempt(() => set(o.id))}
          />
          {o.label}{unavailable ? ' (coming)' : ''}
        </label>
      {/each}
    </div>
  {/snippet}

  <section id="overlays">
    <h2 tabindex="-1">Overlays</h2>
    <h3 id="style-label">Timeline style</h3>
    {@render choice('timeline-style', 'style-label', TIMELINE_STYLE_OPTIONS, $overlaySettings.timelineStyle, (v) => setOverlaySetting('timelineStyle', v))}
    <p class="muted hint">For a project's talks. A deck shows every card on the deck widget's Agenda view.</p>
    <h3 id="buttons-label">Buttons</h3>
    {@render choice('buttons', 'buttons-label', BUTTON_OPTIONS, $overlaySettings.buttons, (v) => setOverlaySetting('buttons', v))}
    <p class="muted hint">Previous, Pause and Next on the overlay. An open overlay changes straight away.</p>
    <!-- How solid every overlay's panels are (task 145); the overlays follow as the slider moves. -->
    <h3 id="opacity-label">Overlay opacity</h3>
    <div class="opacity-row">
      <input
        type="range"
        min={minOpacity($overlaySettings)}
        max="100"
        step="1"
        value={$overlaySettings.solid ? 100 : shownOpacity($overlaySettings)}
        aria-labelledby="opacity-label"
        oninput={(e) => attempt(() => previewOverlayOpacity(Number(e.currentTarget.value)))}
        onchange={(e) => attempt(() => setOverlayOpacity(Number(e.currentTarget.value)))}
      />
      <output class="num">{$overlaySettings.solid ? 'Solid' : `${shownOpacity($overlaySettings)}%`}</output>
    </div>
    <p class="muted hint">How much of your slide shows through the overlays, {minOpacity($overlaySettings)}% to 100%{$overlaySettings.timelineStyle === 'waveform' ? ' with the waveform' : ''}. Only the panels fade; the text stays solid. Overlays are hidden from screen sharing unless you choose otherwise, so this changes your view, not your audience’s.</p>
    <!-- Talking Points' look, also on the Get ready page and the control panel. -->
    <h3 id="panel-label">Panel</h3>
    {@render choice('panel', 'panel-label', PANEL_OPTIONS, $overlaySettings.panel, (v) => setOverlaySetting('panel', v))}
    <h3 id="text-size-label">Talking Points text</h3>
    {@render choice('text-size', 'text-size-label', TEXT_SIZE_OPTIONS, $overlaySettings.textSize, (v) => setOverlaySetting('textSize', v))}
    <h3 id="layout-label">Talking Points shows</h3>
    {@render choice('layout', 'layout-label', LAYOUT_OPTIONS, $overlaySettings.layout, (v) => setOverlaySetting('layout', v))}
    <p class="muted hint">Talking Points and the waveform each come dark or light; a light panel reads better over a dark slide. With the waveform, Talking Points takes its look too: white on black inside a white frame, or black on white. “Every part” lists the whole talk with the current part open.</p>
    <h3 id="strip-edge-label">Edge strip sits against</h3>
    {@render choice('strip-edge', 'strip-edge-label', STRIP_EDGE_OPTIONS, $overlaySettings.stripEdge, (v) => setOverlaySetting('stripEdge', v))}
    <p class="muted hint">The edge strip always runs along the bottom of the screen; with a full-screen slideshow the Dock is hidden, so the edge of the screen is usually right.</p>
  </section>

  <section id="screen-sharing">
    <h2 tabindex="-1">Screen sharing</h2>
    <label class="row">
      <input
        type="checkbox"
        checked={$hiddenFromCapture}
        onchange={(e) => attempt(() => setHiddenFromCapture(e.currentTarget.checked))}
      />
      Hide overlays from screen sharing and recordings
    </label>
  </section>

  <section id="links">
    <h2 id="links-label" tabindex="-1">Links from other apps</h2>
    {@render choice('links', 'links-label', LINK_CHOICES, $linkPermission, setLinkPermission)}
    <p class="muted hint">
      An AI or another app can open Oversay on a note with an <code>oversay://</code> link. Opening always works; this is whether a link may also
      put a note on screen, or open a quick talk's Get ready page, without asking. A link never starts a talk.
    </p>
  </section>

  <section id="recordings">
    <h2 tabindex="-1">Recordings</h2>
    <RecordingsSettings />
  </section>

  <section id="shortcuts">
    <h2 tabindex="-1">Shortcuts</h2>
    <ShortcutsSettings />
  </section>

  <section id="templates">
    <h2 tabindex="-1">Templates</h2>
    <div class="row">
      <button disabled={missing.categories === 0 && missing.templates === 0} onclick={() => attempt(restore)}>
        Restore starter categories and templates
      </button>
    </div>
    <p class="muted hint" role="status">
      {#if restored}
        Restored {cats(restored.categories)} and {tpls(restored.templates)}. Your own categories and templates were not
        changed.
      {:else if missing.categories === 0 && missing.templates === 0}
        All starter categories and templates are there; nothing to restore.
      {:else}
        Brings back {missing.categories > 0 ? `${cats(missing.categories)} and ` : ''}{tpls(missing.templates)} you
        deleted. Your own categories and templates stay as they are.
      {/if}
    </p>
  </section>

  <section id="example-decks">
    <h2 tabindex="-1">Example deck</h2>
    <div class="row">
      <button disabled={missingDecks === null || missingDecks.length === 0} onclick={() => attempt(restoreExampleDecks)}>Restore example deck</button>
    </div>
    <p class="muted hint" role="status">
      {#if missingDecks === null}
        &nbsp;
      {:else if decksRestored > 0}
        Put it back in Decks.
      {:else if missingDecks.length === 0}
        “Welcome to Oversay” shows what Oversay can do, card by card; it's in Decks. If you delete it, you can restore it here.
      {:else}
        Puts {missingDecks.map((n) => `“${n}”`).join(', ')} back in Decks. Your own decks aren't touched.
      {/if}
    </p>
  </section>

  <section id="developer-tools">
    <details bind:open={devOpen}>
      <summary onclick={() => logAction('developer tools', devOpen ? 'close' : 'open')}>
        <h2 tabindex="-1">Developer tools</h2>
      </summary>
      <DevTools />
    </details>
  </section>

  <section id="about">
    <AboutSection onOpenLicences={openLicences} />
  </section>
  </div>
  </div>
  {/if}
</div>
</div>

<style>
  .segmented {
    display: inline-flex;
    background: var(--rail);
    border-radius: 10px;
    padding: 3px;
    gap: 2px;
    flex-wrap: wrap;
  }

  .segmented label {
    padding: 6px 16px;
    white-space: nowrap;
    border-radius: 8px;
    color: var(--muted);
    cursor: pointer;
  }

  .segmented label.unavailable {
    opacity: 0.5;
    cursor: default;
  }

  h3 {
    margin: 14px 0 6px;
    font-size: 13px;
    font-weight: 600;
    color: var(--muted);
  }

  .segmented label.on {
    background: var(--card);
    color: var(--text);
    font-weight: 600;
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.12);
  }

  .segmented label:has(input:focus-visible) {
    outline: 2px solid var(--accent);
    outline-offset: 1px;
  }

  /* The radio itself is hidden; the whole label is the target. */
  .segmented input {
    position: absolute;
    opacity: 0;
    pointer-events: none;
  }

  .hint {
    margin: 6px 0 0;
    font-size: 13px;
  }

  .settings {
    container-type: inline-size;
  }

  .page {
    max-width: 900px;
    margin: 0 auto;
    padding: 26px 32px 48px;
  }

  .layout {
    display: grid;
    grid-template-columns: 176px minmax(0, 1fr);
    gap: 32px;
    align-items: start;
    margin-top: 18px;
  }

  /* Each section is a card of its own, so where one ends and the next begins is clear. */
  .sections section {
    margin-bottom: 18px;
    padding: 18px 22px 20px;
    border: 1px solid var(--line);
    border-radius: 14px;
    background: var(--side);
    /* Not under the sticky bar when a jump lands. */
    scroll-margin-top: 16px;
  }

  .sections section:last-child {
    margin-bottom: 0;
  }

  /* :global so About's heading, which its own component renders, matches the others. */
  .sections :global(h2) {
    margin: 0 0 12px;
    padding-bottom: 10px;
    border-bottom: 1px solid var(--line);
    font-size: 16px;
    font-weight: 650;
    letter-spacing: 0;
    text-transform: none;
    color: var(--text);
  }

  .sections :global(h2:focus) {
    outline: none;
  }

  .sections :global(h2:focus-visible) {
    outline: 2px solid var(--accent);
    outline-offset: 3px;
    border-radius: 4px;
  }

  details > summary {
    cursor: pointer;
    list-style: none;
    display: flex;
    align-items: center;
    gap: 8px;
  }

  details > summary::-webkit-details-marker {
    display: none;
  }

  details > summary::before {
    content: '▸';
    color: var(--muted);
  }

  details[open] > summary::before {
    content: '▾';
  }

  .sections details > summary :global(h2) {
    margin: 0;
    padding: 0;
    border-bottom: 0;
  }

  /* The list of sections: beside the page, sticky while it scrolls. */
  .toc {
    position: sticky;
    top: 16px;
  }

  .toc ul {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .toc li button {
    display: block;
    width: 100%;
    text-align: left;
    padding: 7px 10px;
    border: 0;
    border-left: 3px solid transparent;
    border-radius: 8px;
    background: none;
    color: var(--muted);
    font-size: 13.5px;
  }

  .toc li button:hover {
    background: var(--hover);
    color: var(--text);
  }

  .toc li button[aria-current='true'] {
    background: var(--accent-soft);
    color: var(--accent-text);
    font-weight: 600;
    border-left-color: var(--accent);
  }

  .toc button:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 1px;
  }

  .menubtn,
  .menu {
    display: none;
  }

  /* Narrow: the list becomes a menu across the top of the page (John chose it over a row). */
  @container (max-width: 760px) {
    .page {
      padding: 0 16px 48px;
    }

    h1 {
      padding-top: 20px;
    }

    .layout {
      grid-template-columns: minmax(0, 1fr);
      gap: 0;
    }

    .toc {
      top: 0;
      z-index: 5;
      margin: 0 -16px 18px;
      padding: 8px 16px;
      background: var(--bg);
      border-bottom: 1px solid var(--line);
    }

    .toc ul {
      display: none;
    }

    .menubtn {
      display: flex;
      align-items: center;
      gap: 8px;
      width: 100%;
      padding: 8px 12px;
      border: 1px solid var(--line-strong);
      border-radius: 10px;
      background: var(--card);
      font-weight: 600;
      text-align: left;
    }

    .menubtn .k {
      color: var(--faint);
      font-weight: 500;
      font-size: 12.5px;
    }

    .menubtn .cur {
      flex: 1;
    }

    .menu {
      display: block;
      position: absolute;
      left: 16px;
      right: 16px;
      top: calc(100% - 6px);
      padding: 6px;
      border: 1px solid var(--line-strong);
      border-radius: 12px;
      background: var(--card);
      box-shadow: var(--shadow);
    }

    .menu button {
      display: flex;
      width: 100%;
      padding: 9px 10px;
      border: 0;
      border-radius: 8px;
      background: none;
      text-align: left;
    }

    .menu button:hover {
      background: var(--hover);
    }

    .menu button[aria-current='true'] {
      background: var(--accent-soft);
      color: var(--accent-text);
      font-weight: 600;
    }

    .menu button[aria-current='true']::after {
      content: '✓';
      margin-left: auto;
    }
  }

  .opacity-row {
    display: flex;
    align-items: center;
    gap: 12px;
    max-width: 420px;
  }

  .opacity-row input {
    flex: 1;
    accent-color: var(--accent);
  }

  .opacity-row output {
    min-width: 3.5em;
    font-variant-numeric: tabular-nums;
  }
</style>
