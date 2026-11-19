<script lang="ts">
  // One deck (ADR 0036): a copy of the note
  // editor with a time and a kind on each card, and the deck's options beside it. It saves as you
  // type through the open-note store, keeps every line it doesn't show, and reads the deck again
  // when it changes outside Oversay, as a note does (ADR 0026, ADR 0034).
  import { onDestroy, tick } from 'svelte'
  import { parseNoteDoc, setTopic, topicAtLine, topicLine, writeNoteDoc, type NoteDoc } from '../lib/notes/format'
  import {
    DECK_PARTS,
    cardAt,
    deckAudience,
    deckCards,
    deckId,
    deckOptions,
    deckSeconds,
    deckTags,
    deckTalk,
    setDeckAudience,
    setDeckOption,
    setDeckTags,
    topicOfCard,
    type DeckOptions,
    type DeckPart,
  } from '../lib/decks/deck'
  import { isEditorPreview, previewDeckOnScreen, showDeckOnScreen, updateDeckPreview } from '../lib/decks/show'
  import { logAction } from '../lib/log'
  import { showBlockedBy } from '../lib/notes/show'
  import { session, sessionCommands } from '../lib/session/store'
  import { closeNote, dismissChanged, editNote, flushNote, keepBothVersions, noteSaveError, openNote, openNoteAt, renameOpenNote, useOutsideVersion } from '../lib/notes/store'
  import { quickName } from '../lib/notes/files'
  import { formatDuration } from '../lib/project/duration'
  import { count } from '../lib/words'
  import NoteTopics from './NoteTopics.svelte'
  import SkillNoteCheck from './SkillNoteCheck.svelte'
  import DeckAfter from './DeckAfter.svelte'
  import { justRan } from '../lib/decks/sessions'
  import PlanBar from './PlanBar.svelte'
  import DeckPreview from './DeckPreview.svelte'
  import AddResource from './AddResource.svelte'
  import { attempt } from './errors'
  import Icon from './Icon.svelte'
  import { goBackFromDeck, goDeck, goWorkspace, nav } from './route'
  import { PLACE_TITLES } from './nav'
  import { findWorkspace, workspacesWith } from '../lib/workspaces/workspaces'
  import WorkspacePicker from './WorkspacePicker.svelte'
  import { showBack } from './back'
  import { decks } from '../lib/decks/store'
  import { settings } from '../lib/settings/store'
  import { removeDeckFromWorkspace, workspaces } from '../lib/workspaces/store'

  let { path }: { path: string } = $props()

  $effect(() => {
    const p = path
    attempt(async () => {
      try {
        await openNoteAt(p, 'decks')
      } catch (e) {
        goBackFromDeck()
        throw e
      }
    })
  })

  // The way back, in the search bar's row (back.ts): to the workspace it was opened from, or the Library group.
  $effect(() =>
    showBack({ label: ($nav.workspace && findWorkspace($workspaces ?? [], $nav.workspace)?.name) || PLACE_TITLES[$nav.place ?? 'all'], go: goBackFromDeck, width: 1040 }),
  )

  onDestroy(() => {
    if (previewing) void attempt(sessionCommands.end)
    void attempt(closeNote)
  })

  const deck = $derived($openNote && $openNote.kind === 'decks' && $openNote.path === path ? $openNote : null)

  // Its folder was renamed or moved outside Oversay and the deck found again by its id (ADR 0037).
  $effect(() => {
    if ($openNote?.kind === 'decks' && $openNote.movedFrom === path) goDeck($openNote.path)
  })
  const doc = $derived(deck ? parseNoteDoc(deck.text) : null)
  const cards = $derived(doc && deck ? deckCards(doc, deck.name) : [])
  const seconds = $derived(deckSeconds(cards))
  const options = $derived(doc ? deckOptions(doc) : null)

  function setAudience(value: string) {
    if (!doc || deckAudience(doc) === value.trim()) return
    editNote(writeNoteDoc(setDeckAudience(doc, value)))
  }

  // The workspaces this deck is in (ADR 0040): each opens with a click and has × to take the
  // deck out; Add to workspace picks more.
  const deckIdNow = $derived(doc ? deckId(doc) : '')
  const inWorkspaces = $derived(workspacesWith($workspaces ?? [], deckIdNow))
  let picking = $state(false)

  // Tags: typed and added with Enter or a comma, removed with their ×.
  const tags = $derived(doc ? deckTags(doc) : [])
  let tagText = $state('')
  function setTags(next: string[]) {
    if (doc) editNote(writeNoteDoc(setDeckTags(doc, next)))
  }
  function addTag() {
    const tag = tagText.replace(/,/g, ' ').trim()
    tagText = ''
    if (tag && !tags.some((t) => t.toLowerCase() === tag.toLowerCase())) {
      logAction('deck tag', tag)
      setTags([...tags, tag])
    }
  }

  // The plan bar (as in the talk editor), when a card is timed: a card's right edge drags its time.
  // While dragging only the bar changes; letting go writes it, as one change.
  let resizing = $state<{ id: string; seconds: number } | null>(null)
  const bar = $derived(
    doc && deck
      ? deckTalk(doc, deck.name).segments.map((s) => ({
          ...s,
          // An untimed card shows at a minute's width, hatched, until it is given a time.
          plannedSeconds: resizing?.id === s.id ? resizing.seconds : s.openEnded && s.plannedSeconds === 0 ? 60 : s.plannedSeconds,
        }))
      : [],
  )
  const barIndex = (id: string) => Number(id.replace('s_deck', ''))
  function resize(id: string, seconds: number, done: boolean) {
    if (!done) {
      resizing = { id, seconds }
      return
    }
    resizing = null
    if (!doc) return
    const t = topicOfCard(doc, barIndex(id))
    const topic = doc.topics[t]
    if (!topic || topic.time?.seconds === seconds) return
    // `[~3m]` stays an estimate; an untimed card becomes timed.
    const about = !!topic.time?.open && topic.time.seconds > 0
    change(setTopic(doc, t, { time: { seconds, open: about } }))
  }

  function setOption<K extends keyof DeckOptions>(option: K, value: DeckOptions[K]) {
    if (!doc || !options || options[option] === value) return
    logAction('deck option', `${option} ${String(value)}`)
    editNote(writeNoteDoc(setDeckOption(doc, option, value)))
  }

  const PART_LABELS: Record<DeckPart, string> = { position: '2/4', bar: 'Deck bar', next: 'Next card', left: 'Time left', ends: 'Ends at' }
  function showPart(part: DeckPart, on: boolean) {
    if (!options) return
    setOption('hide', on ? options.hide.filter((p) => p !== part) : [...options.hide, part])
  }

  // The preview in the page, and the real widget on screen in preview, never
  // recorded, following the card being edited and the deck as it changes.
  const previewing = $derived(isEditorPreview($session))

  function previewOnScreen() {
    attempt(async () => {
      if (previewing) await sessionCommands.end()
      else if (doc && deck) await previewDeckOnScreen(doc, deck.name, cardAt(doc, current))
    })
  }

  // The widget's own Previous / Next move the editor to that card too.
  let sent = -1
  $effect(() => {
    const index = $session?.index ?? -1
    if (!previewing || !doc || index === sent) return
    const t = topicOfCard(doc, index)
    if (t >= 0) {
      sent = index
      current = t
    }
  })

  // The deck as it is now, on the card being edited; sent only when that changes, since every
  // update comes back as a new session.
  let last = ''
  $effect(() => {
    if (!previewing || !doc || !deck) {
      last = ''
      sent = -1
      return
    }
    const index = cardAt(doc, current)
    const key = `${index}\n${deck.name}\n${deck.text}`
    if (key === last) return
    last = key
    sent = index
    void updateDeckPreview(doc, deck.name, index).catch(() => {})
  })

  // Edit (cards) or Markdown; both edit the same text, and switching keeps the card.
  let view = $state<'edit' | 'markdown'>('edit')
  /** The page in the middle: the cards, or the deck's settings (ADR 0046). */
  let page = $state<'cards' | 'settings'>('cards')
  let current = $state(0)
  /** The card being edited, among the deck's cards. */
  const editing = $derived(doc ? cardAt(doc, current) : 0)
  let area: HTMLTextAreaElement | undefined = $state()

  const change = (next: NoteDoc) => editNote(writeNoteDoc(next))

  async function showView(next: 'edit' | 'markdown') {
    if (next === view) return
    logAction('deck view', next)
    view = next
    if (next !== 'markdown' || !doc) return
    await tick()
    if (!area) return
    const line = topicLine(doc, current)
    const at = area.value.split('\n').slice(0, line).reduce((n, l) => n + l.length + 1, 0)
    area.focus()
    area.setSelectionRange(at, at)
    area.scrollTop = Math.max(0, line * 21 - 60)
  }

  function followCursor() {
    if (!area || !doc) return
    current = topicAtLine(doc, area.value.slice(0, area.selectionStart).split('\n').length - 1)
  }

  // Not while a talk, a note or another deck is on screen; not before there is a card to show.
  const blocked = $derived(cards.length === 0 ? 'Add a card to show' : showBlockedBy($session))

  function show() {
    attempt(async () => {
      await flushNote()
      if (doc && deck) await showDeckOnScreen(doc, deck.name, deck.path)
    })
  }

  function rename(e: Event & { currentTarget: HTMLInputElement }) {
    const name = e.currentTarget.value.trim()
    if (!deck || name === '' || name === deck.name) {
      e.currentTarget.value = deck?.name ?? ''
      return
    }
    const input = e.currentTarget
    attempt(async () => {
      try {
        goDeck(await renameOpenNote(name))
      } catch (err) {
        input.value = deck.name
        throw err
      }
    })
  }

  const length = $derived(
    (seconds === 0 ? 'untimed' : seconds % 60 === 0 ? `${seconds / 60} min` : `${formatDuration(seconds)} min`) +
      (seconds > 0 && options && !options.timing ? ' · timing off' : ''),
  )
</script>

<div class="page">
  {#if deck && doc && options}
    <header class="nhead">
      <span class="kicon"><Icon name="deck" size={20} /></span>
      <input
        class="name"
        value={deck.name}
        aria-label="Deck name"
        onchange={rename}
        onkeydown={(e) => {
          if (e.key === 'Enter') e.currentTarget.blur()
          if (e.key === 'Escape') {
            e.currentTarget.value = deck.name
            e.currentTarget.blur()
          }
        }}
      />
      <span class="status" class:err={$noteSaveError} role="status">{$noteSaveError || (deck.saved ? 'Saved' : 'Saving…')}</span>
      <button class="primary show" disabled={!!blocked} title={blocked ?? 'Show the deck over your call or slides'} onclick={show}
        ><Icon name="show" size={16} /> Show</button
      >
    </header>
    <p class="meta">{count(cards.length, 'card')} · <span class="num">{length}</span></p>
    {#if deck.outside}
      <div class="outside warn" role="alert">
        <span class="grow"
          ><b>This deck was changed outside Oversay while you were typing.</b> Your typing is kept here; the other version is kept as the deck
          “{quickName(deck.outside.path)}”.</span
        >
        <button onclick={() => attempt(useOutsideVersion)}>Use theirs instead</button>
        <button class="primary" onclick={keepBothVersions}>Keep both</button>
      </div>
    {:else if deck.changed}
      <div class="outside" role="status">
        <Icon name="check" size={16} />
        <span class="grow">Updated outside Oversay just now: {deck.changed}.</span>
        <button class="x" title="Close" aria-label="Close" onclick={dismissChanged}><Icon name="close" size={15} /></button>
      </div>
    {/if}
    <SkillNoteCheck {doc} text={deck.text} deck />
    {#if $justRan === deck.path}<DeckAfter path={deck.path} top />{/if}
    <div class="ed">
      <aside class="side">
        <section class="pv" aria-label="Preview on screen">
          <div class="pvh">
            <b>On screen</b>
            <span class="grow"></span>
            <button
              class="onscreen"
              class:on={previewing}
              title={previewing ? 'Close the preview on your screen' : 'Open it on your screen as it will look; nothing is recorded'}
              onclick={previewOnScreen}><Icon name="popout" size={14} /> {previewing ? 'Stop preview' : 'Preview'}</button
            >
          </div>
          <DeckPreview {doc} name={deck.name} {options} bind:current />
          <p class="sub">The card you're editing; hover it for Previous and Next.</p>
          {#if previewing}<p class="sub">On your screen, following your edits. Nothing is recorded; its ✕ closes it.</p>{/if}
        </section>
        <AddResource deckId={deckIdNow} />
        <dl class="facts" aria-label="About this deck">
          <div><dt>Cards</dt><dd>{cards.length}</dd></div>
          <div><dt>Length</dt><dd class="num">{length}</dd></div>
          <div><dt>Changed</dt><dd>{new Date(($decks ?? []).find((d) => d.path === deck.path)?.modifiedMs ?? Date.now()).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}</dd></div>
          <div>
            <dt>Workspaces</dt>
            <dd>
              {#each inWorkspaces as c (c.id)}<button class="link" title="Open {c.name}" onclick={() => goWorkspace(c.id)}>{c.name}</button>{:else}None{/each}
            </dd>
          </div>
        </dl>
      </aside>
      <section class="mid">
        {#if seconds > 0}
      <div class="planbar">
        <PlanBar
          segments={bar}
          selectedId={bar[editing]?.id ?? null}
          onselect={(id) => {
            const t = doc ? topicOfCard(doc, barIndex(id)) : -1
            if (t >= 0) current = t
          }}
          onresize={resize}
        />
        <p class="bar-hint">Drag the handle on a card’s right edge to change its time in 30-second steps, or select it and press ← →.</p>
      </div>
    {/if}
        <div class="tabrow">
          <div class="tabs" role="tablist">
            <button role="tab" aria-selected={page === 'cards'} onclick={() => (page = 'cards')}>Cards</button>
            <button role="tab" aria-selected={page === 'settings'} onclick={() => (page = 'settings')}>Settings</button>
          </div>
          {#if page === 'cards'}
            <div class="modes" role="group" aria-label="View">
              <button aria-pressed={view === 'edit'} onclick={() => showView('edit')}>Edit</button>
              <button aria-pressed={view === 'markdown'} onclick={() => showView('markdown')}>Markdown</button>
            </div>
          {/if}
        </div>
        {#if page === 'cards'}
          <div class="main">
        {#if view === 'edit'}
          <NoteTopics {doc} noteName={deck.name} onchange={change} bind:current word="card" kinds />
          {#if $justRan !== deck.path}<DeckAfter path={deck.path} />{/if}
        {:else}
          <textarea
            class="md"
            aria-label="The deck in Markdown"
            spellcheck="true"
            bind:this={area}
            value={deck.text}
            oninput={(e) => {
              editNote(e.currentTarget.value)
              followCursor()
            }}
            onclick={followCursor}
            onkeyup={followCursor}
          ></textarea>
          <p class="hint muted">
            <code>## Card [3m]</code> starts a card, <code>[3m, demo]</code> gives it a kind and <code>[open]</code> or no time leaves it
            untimed; <code>- point</code> adds a point. Quotes, tables and code are kept but not shown.
          </p>
        {/if}
          </div>
        {:else}
          <div class="groups">
            <section class="grp" aria-label="About">
              <h3>About</h3>
              <div class="front">
      <label>
        <span>Audience</span>
        <input value={deckAudience(doc)} placeholder="Who it is for" onchange={(e) => setAudience(e.currentTarget.value)} />
      </label>
      <div class="tags" role="group" aria-label="Tags">
        <span>Tags</span>
        {#each tags as tag (tag)}
          <span class="tag"
            >{tag}<button aria-label="Remove tag {tag}" title="Remove" onclick={() => setTags(tags.filter((t) => t !== tag))}
              ><Icon name="close" size={11} /></button
            ></span
          >
        {/each}
        <input
          class="tagin"
          placeholder={tags.length ? 'Add' : 'weekly, platform…'}
          aria-label="Add a tag"
          bind:value={tagText}
          onkeydown={(e) => {
            if ((e.key === 'Enter' || e.key === ',') && !e.isComposing) {
              e.preventDefault()
              addTag()
            } else if (e.key === 'Backspace' && tagText === '' && tags.length) setTags(tags.slice(0, -1))
          }}
          onblur={addTag}
        />
      </div>
      <div class="tags cols" role="group" aria-label="Workspaces">
        <span>Workspaces</span>
        {#each inWorkspaces as c (c.id)}
          <span class="tag"
            ><button class="open" title="Open {c.name}" onclick={() => goWorkspace(c.id)}>{c.name}</button><button
              aria-label="Take this deck out of {c.name}"
              title="Take out of this workspace"
              onclick={() => attempt(() => removeDeckFromWorkspace(c.id, deckIdNow))}><Icon name="close" size={11} /></button
            ></span
          >
        {/each}
        <span class="pickwrap">
          <button class="addto" data-picker-toggle aria-haspopup="dialog" aria-expanded={picking} onclick={() => (picking = !picking)}
            ><Icon name="plus" size={13} /> Add to workspace</button
          >
          {#if picking}<WorkspacePicker deckId={deckIdNow} onclose={() => (picking = false)} />{/if}
        </span>
      </div>
              </div>
            </section>
            <section class="grp" aria-label="Timing">
              <h3>Timing</h3>
          <div class="seg" role="radiogroup" aria-label="Timing">
            {#each [[true, 'On'], [false, 'Off']] as const as [on, label] (label)}
              <button role="radio" aria-checked={options.timing === on} onclick={() => setOption('timing', on)}>{label}</button>
            {/each}
          </div>
          <p class="sub">
            {options.timing
              ? 'Timed cards count down.'
              : 'The times are kept, but every card counts up and waits for Next: no countdown and no Auto-advance.'}
          </p>
          <label class="chk" class:off={!options.timing}
            ><input
              type="checkbox"
              disabled={!options.timing}
              checked={options.autoAdvance}
              onchange={(e) => setOption('autoAdvance', e.currentTarget.checked)}
            /> Auto-advance</label
          >
          <p class="sub">Go to the next card when its time is up. Off, a card waits for Next, counting on in red.</p>
            </section>
            <section class="grp" aria-label="Recording">
              <h3>Recording</h3>
          <div class="seg" role="radiogroup" aria-label="Record on start">
            {#each [['global', 'Use global setting'], ['on', 'On'], ['off', 'Off']] as const as [id, label] (id)}
              <button role="radio" aria-checked={options.recordOnStart === id} onclick={() => setOption('recordOnStart', id)}>{label}</button>
            {/each}
          </div>
          <p class="sub">
            {options.recordOnStart === 'global'
              ? `Follows Settings › Recordings › Auto record, now ${$settings.autoRecord ? 'on' : 'off'}.`
              : options.recordOnStart === 'on'
                ? 'Records from Start, whatever Auto record says.'
                : 'Records only when you press the record button, whatever Auto record says.'}
            Only your own microphone, transcribed on this computer; the first recording still asks for permission.
          </p>
            </section>
            <section class="grp" aria-label="Look">
              <h3>Look</h3>
          <h4>The card shows</h4>
          <div class="parts">
            {#each DECK_PARTS as part (part)}
              <label class="chk part"
                ><input type="checkbox" checked={!options.hide.includes(part)} onchange={(e) => showPart(part, e.currentTarget.checked)} />
                {PART_LABELS[part]}</label
              >
            {/each}
          </div>
          <h4>Colour</h4>
          <div class="seg" role="radiogroup" aria-label="Colour">
            {#each [['kinds', 'By kind'], ['one', 'One colour']] as const as [id, label] (id)}
              <button role="radio" aria-checked={options.colour === id} onclick={() => setOption('colour', id)}>{label}</button>
            {/each}
          </div>
            </section>
          </div>
        {/if}
      </section>
    </div>
  {/if}
</div>


<style>
  .page {
    max-width: 1040px;
    margin: 0 auto;
    padding: 18px 32px 48px;
  }


  .nhead {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-top: 6px;
  }

  .kicon {
    width: 38px;
    height: 38px;
    border-radius: 10px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    background: var(--accent-soft, var(--hover));
    color: var(--accent-text);
    flex: none;
  }

  .name {
    flex: 1;
    min-width: 0;
    font-size: 24px;
    font-weight: 700;
    border: 1px solid transparent;
    background: none;
    padding: 2px 6px;
  }

  .name:hover,
  .name:focus {
    border-color: var(--line-strong);
    background: var(--card);
  }

  .show {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    white-space: nowrap;
  }

  .status {
    font-size: 12.5px;
    color: var(--faint);
    white-space: nowrap;
  }

  .status.err {
    color: var(--danger);
  }

  .meta {
    margin: 2px 0 0 54px;
    font-size: 13px;
    color: var(--muted);
  }

  .num {
    font-variant-numeric: tabular-nums;
  }

  .front {
    display: flex;
    gap: 10px;
    flex-wrap: wrap;
    margin: 0;
  }

  .front label {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 13px;
    color: var(--muted);
    font-weight: 600;
  }

  .front input {
    width: 200px;
  }

  .tags {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 6px;
    font-size: 13px;
    color: var(--muted);
    font-weight: 600;
  }

  .tag {
    display: inline-flex;
    align-items: center;
    gap: 2px;
    padding: 2px 4px 2px 9px;
    border-radius: 99px;
    background: var(--accent-soft);
    color: var(--accent-text);
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

  .tag button.open {
    padding: 0;
    font-weight: 600;
  }

  .pickwrap {
    position: relative;
  }

  /* The list opens towards the page, never past its right edge. */
  .pickwrap :global(.picker) {
    left: auto;
    right: 0;
  }

  .addto {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    border: 1px dashed var(--line-strong);
    background: none;
    border-radius: 99px;
    padding: 2px 10px;
    color: var(--muted);
    font-size: 13px;
    font-weight: 600;
  }

  .front .tagin {
    width: 150px;
  }

  .planbar {
    margin: 0 0 16px;
  }

  .bar-hint {
    margin: 6px 0 0;
    font-size: 12.5px;
    color: var(--muted);
  }

  .tabs {
    display: inline-flex;
    border: 1px solid var(--line-strong);
    border-radius: 10px;
    padding: 2px;
    margin-bottom: 12px;
  }

  .tabs button {
    border: 0;
    background: none;
    border-radius: 8px;
    padding: 5px 14px;
    font-weight: 600;
    color: var(--muted);
  }

  .tabs button[aria-selected='true'] {
    background: var(--accent-soft);
    color: var(--accent-text);
  }

  /* The slim left column (preview, Add resource, the deck's facts) and the middle (plan bar over Cards | Settings). */
  .ed {
    display: grid;
    grid-template-columns: 290px minmax(0, 1fr);
    gap: 22px;
    align-items: start;
    margin-top: 14px;
  }

  .mid {
    min-width: 0;
  }

  /* Stays in view while the cards scroll; scrolls itself when taller than the window. */
  .side {
    position: sticky;
    top: 12px;
    max-height: calc(100vh - 24px);
    overflow-y: auto;
    scrollbar-width: thin;
  }

  @media (max-width: 900px) {
    .ed {
      grid-template-columns: 1fr;
    }
  }

  .pv {
    margin-bottom: 12px;
  }

  .pvh {
    display: flex;
    align-items: center;
    gap: 6px;
    margin-bottom: 6px;
  }

  .pvh b {
    font-size: 12px;
    letter-spacing: 0.07em;
    text-transform: uppercase;
    color: var(--faint);
  }

  .grow {
    flex: 1;
    min-width: 0;
  }


  .onscreen {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    font-size: 12.5px;
    font-weight: 600;
    padding: 3px 9px;
  }

  .onscreen.on {
    background: var(--accent-soft);
    color: var(--accent-text);
  }

  .link {
    border: 0;
    background: none;
    padding: 2px 4px;
    font-size: 12.5px;
    font-weight: 600;
    color: var(--accent-text);
  }



  .groups {
    display: grid;
    gap: 12px;
    max-width: 680px;
  }

  .grp {
    border: 1px solid var(--line);
    border-radius: 14px;
    background: var(--card);
    padding: 12px 14px 14px;
  }

  .grp h3 {
    margin: 0 0 8px;
    font-size: 12px;
    letter-spacing: 0.07em;
    text-transform: uppercase;
    color: var(--faint);
  }

  .grp h4 {
    margin: 14px 0 6px;
    font-size: 12.5px;
    color: var(--muted);
  }

  .facts {
    margin: 0;
    padding: 10px 12px;
    border: 1px solid var(--line);
    border-radius: 12px;
    display: grid;
    gap: 6px;
    font-size: 13px;
  }

  .facts div {
    display: flex;
    justify-content: space-between;
    gap: 10px;
  }

  .facts dt {
    color: var(--faint);
  }

  .facts dd {
    margin: 0;
    text-align: right;
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    justify-content: flex-end;
  }

  /* Tabs at the left, the page's own options at the right of the same row. */
  .tabrow {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 12px;
  }

  .modes {
    display: inline-flex;
    gap: 2px;
    border: 1px solid var(--line-strong);
    border-radius: 10px;
    padding: 2px;
  }

  .modes button {
    border: 0;
    background: none;
    padding: 4px 12px;
    font-size: 12.5px;
    font-weight: 600;
    color: var(--muted);
    border-radius: 8px;
  }

  .modes button[aria-pressed='true'] {
    background: var(--accent-soft);
    color: var(--accent-text);
  }

  .parts {
    display: flex;
    flex-wrap: wrap;
    gap: 2px 14px;
  }

  .chk.part {
    margin-top: 2px;
    font-weight: 500;
  }

  .chk.off {
    opacity: 0.5;
  }

  .chk {
    margin-top: 10px;
    display: flex;
    align-items: center;
    gap: 8px;
    font-weight: 600;
  }

  .sub {
    margin: 4px 0 0;
    font-size: 12px;
    color: var(--faint);
  }

  .seg {
    display: inline-flex;
    border: 1px solid var(--line-strong);
    border-radius: 9px;
    padding: 2px;
    gap: 2px;
    flex-wrap: wrap;
  }

  .seg button {
    border: 0;
    background: none;
    border-radius: 7px;
    padding: 4px 10px;
    font-size: 12.5px;
    font-weight: 600;
    color: var(--muted);
  }

  .seg button[aria-checked='true'] {
    background: var(--accent-soft);
    color: var(--accent-text);
  }

  .md {
    width: 100%;
    min-height: 420px;
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    font-size: 13.5px;
    line-height: 1.6;
    resize: vertical;
  }

  .hint {
    font-size: 12.5px;
    margin: 8px 0 0;
  }

  /* The deck changed outside Oversay (ADR 0034), as in the note editor. */
  .outside {
    display: flex;
    align-items: center;
    gap: 10px;
    flex-wrap: wrap;
    margin: 10px 0 4px;
    padding: 9px 12px;
    border-radius: 12px;
    background: var(--accent-soft);
    border: 1px solid color-mix(in srgb, var(--accent) 35%, transparent);
    font-size: 13.5px;
  }

  .outside.warn {
    background: var(--warn-bg);
    border-color: color-mix(in srgb, var(--warn) 35%, transparent);
  }

  .outside .grow {
    flex: 1;
    min-width: 200px;
  }

  .outside button {
    padding: 4px 10px;
    font-size: 13px;
  }

  .outside .x {
    border: 0;
    background: none;
    padding: 4px;
    color: var(--muted);
  }
</style>
