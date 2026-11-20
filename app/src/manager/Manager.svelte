<script lang="ts">
  // The manager window (ADR 0039, 0041): Home, Library (decks and workspaces), Templates, Sessions, AI and Settings, with the
  // one search bar above every page. Decks are what Oversay shows; projects are gone.
  import { onMount } from 'svelte'
  import { derived, get } from 'svelte/store'
  import { listen } from '@tauri-apps/api/event'
  import { logProblem } from '../lib/log'
  import { applyLookChange, changeOverlayOpacity, loadSettings, pinStarredDecks, pins, settings } from '../lib/settings/store'
  import { CONTROL_PANEL_LOOK_EVENT, OPACITY_CHANGES, OVERLAY_OPACITY_EVENT, checkLookChange, type OpacityChange } from '../lib/settings/overlays'
  import { installExampleDecksOnFirstRun } from '../lib/decks/examples'
  import { TRAY_EVENT, checkTrayChoice, pinnedDecks, syncTrayDecks, syncTrayTitle, type TrayChoice } from '../lib/session/tray'
  import { showDeckOnScreen } from '../lib/decks/show'
  import { readQuickFile } from '../lib/notes/files'
  import { parseNoteDoc } from '../lib/notes/format'
  import { closeFinishedNotes } from '../lib/notes/show'
  import { QUICK_FILES_CHANGED_EVENT, type QuickKind } from '../lib/notes/files'
  import { checkOpenNote } from '../lib/notes/store'
  import { LINK_EVENT } from '../lib/links'
  import { followLinks } from './links'
  import LinkPrompt from './LinkPrompt.svelte'
  import NewWorkspace from './NewWorkspace.svelte'
  import PasteDeckDialog from './PasteDeckDialog.svelte'
  import TemplatePicker from './TemplatePicker.svelte'
  import DropZone from './DropZone.svelte'
  import { loadLibrary } from '../lib/templates/library-store'
  import { attempt, notice } from './errors'
  import { goLibrary, goSession, goSettings, nav } from './route'
  import Home from './Home.svelte'
  import LibraryPage from './LibraryPage.svelte'
  import SessionsPage from './SessionsPage.svelte'
  import SessionPage from './SessionPage.svelte'
  import DeckEditor from './DeckEditor.svelte'
  import { decks, loadDecks } from '../lib/decks/store'
  import { WORKSPACES_CHANGED_EVENT, loadWorkspaces, moveProjectLines, workspaces } from '../lib/workspaces/store'
  import { justRan, recordFinishedDecks } from '../lib/decks/sessions'
  import { loadDeckSessions } from '../lib/sessions/store'
  import { followRecording } from '../lib/sessions/recording'
  import { followVoiceWork, transcribeAfterRun } from '../lib/sessions/whisper'
  import { moveIntoDecks } from '../lib/decks/migrate'
  import { moveDeckResources, movePlan } from '../lib/workspaces/resources'
  import MovedBanner, { moved as resourcesMoved } from './MovedBanner.svelte'
  import { count } from '../lib/words'
  import Rail from './Rail.svelte'
  import GlobalSearch from './GlobalSearch.svelte'
  import Settings from './Settings.svelte'
  import TemplatesPage from './TemplatesPage.svelte'
  import AiPage from './AiPage.svelte'
  import { checkAtStartup, loadUpdateSupport } from '../lib/updates/store'

  /** Moves quick notes and quick talks into Decks, and says what moved. */
  async function intoDecks() {
    const moved = await moveIntoDecks()
    if (moved.notes + moved.talks === 0) return
    const what = [moved.notes && count(moved.notes, 'note'), moved.talks && count(moved.talks, 'quick talk')].filter(Boolean).join(' and ')
    notice.set(`Moved ${what} into Decks. The originals are in the Trash.`)
    await loadDecks()
  }

  /** Settings, the Library, or a pinned deck put on screen, from the menu-bar / tray menu. */
  async function trayChose(choice: TrayChoice): Promise<void> {
    if (choice.kind === 'settings') return goSettings()
    if (choice.kind === 'library') return goLibrary()
    const deck = get(decks)?.find((d) => d.path === choice.id)
    if (!deck) throw new Error('That deck is no longer in your Library.')
    await showDeckOnScreen(parseNoteDoc(await readQuickFile('decks', deck.path)), deck.name, deck.path)
  }

  onMount(() => {
    // The time beside the session's menu-bar/tray icon (006/08).
    const stopTray = syncTrayTitle()
    // Show a deck ▸ in the menu lists the pinned decks (ADR 0051).
    const stopTrayDecks = syncTrayDecks(derived([pins, decks], ([p, d]) => pinnedDecks(p, d)))
    // A menu item that needs this window: it has come forward already (tray.rs).
    const trayListener = listen<unknown>(TRAY_EVENT, (e) => {
      const choice = checkTrayChoice(e.payload)
      if (choice) attempt(() => trayChose(choice))
    })
    // Settings first: they say whether the example decks were already added.
    attempt(async () => {
      await loadSettings()
      // Whether this build has a feed, then the start-up check if it is due (epic 015 (#16)); not waited for.
      void attempt(async () => {
        await loadUpdateSupport()
        await checkAtStartup()
      })
      // Decks have pins, not favourites: a deck starred before is pinned instead.
      await pinStarredDecks()
      // Not worth stopping the start for: Settings can add them later.
      await installExampleDecksOnFirstRun().catch((e) => logProblem('example decks not added', String(e)))
      // Lists read once at start, after settings, so decks added while Oversay was closed are New (ADR 0034).
      await Promise.all([loadDecks(), loadWorkspaces()])
      await intoDecks()
      // Decks' project lines become collections in Projects, once (ADR 0038).
      const moved = await moveProjectLines(get(decks) ?? [])
      if (moved) notice.set(`Put ${count(moved, 'deck')} into collections in Projects, from their project lines.`)
      // A deck's own resources move up to its workspaces, once (ADR 0046).
      const up = await moveDeckResources(movePlan(get(decks) ?? [], get(workspaces) ?? [])).catch((e) => (logProblem('resources not moved up', String(e)), null))
      if (up) resourcesMoved.set(up)
      // A link Oversay was started with, now that Settings says whether it may show things (ADR 0032).
      await followLinks()
    })
    attempt(loadLibrary)
    // An overlay's ⋯ menu and the darker / lighter hotkeys, through Rust.
    const opacityListener = listen<string>(OVERLAY_OPACITY_EVENT, (e) => {
      if ((OPACITY_CHANGES as readonly string[]).includes(e.payload)) attempt(() => changeOverlayOpacity(e.payload as OpacityChange))
    })
    // The Look card and the menu change the look through here: the manager owns the saved settings (ADR 0051).
    const lookListener = listen<unknown>(CONTROL_PANEL_LOOK_EVENT, (e) => {
      const change = checkLookChange(e.payload)
      if (change) attempt(() => applyLookChange(change))
    })
    // A shown deck's session closes as soon as its widget is closed.
    const stopNotes = closeFinishedNotes()
    // A deck that ends opens its session's page (John, 7 Nov): its times, and its recording
    // being transcribed straight away; the deck editor is a click away.
    const stopDecks = recordFinishedDecks((path, startedAt) => {
      justRan.set(path)
      goSession(path, startedAt)
      // Its recording, if it made one, becomes a transcript on this computer (ADR 0041).
      void transcribeAfterRun(path)
    })
    // Record my voice: with Auto record on, every deck records from Start (ADR 0041).
    const stopRecording = followRecording(() => !!get(settings).autoRecord)
    const stopVoiceWork = followVoiceWork()
    // Every deck's sessions, for Sessions and search (ADR 0041): read again with the decks, and once a run is kept.
    const stopSessions = decks.subscribe((all) => {
      if (all) attempt(() => loadDeckSessions(all))
    })
    const stopJustRan = justRan.subscribe((path) => {
      const all = get(decks)
      if (path && all) attempt(() => loadDeckSessions(all))
    })
    // Decks written outside Oversay (an AI, another editor) as they land (ADR 0034).
    const folderListener = listen<QuickKind>(QUICK_FILES_CHANGED_EVENT, (e) => {
      if (e.payload === 'decks') attempt(async () => loadDecks().then(() => checkOpenNote('decks')))
      // A note or quick talk landing in the old folders (an older AI skill) moves into Decks.
      else attempt(intoDecks)
    })
    // Workspaces made or changed by the skill, in Finder or here (ADR 0040).
    const workspacesListener = listen(WORKSPACES_CHANGED_EVENT, () => attempt(loadWorkspaces))
    // oversay:// links an AI or another app opened while Oversay runs (ADR 0032).
    const linkListener = listen(LINK_EVENT, () => void followLinks())
    return () => {
      stopNotes()
      stopSessions()
      stopRecording()
      stopVoiceWork()
      stopJustRan()
      stopDecks()
      stopTray()
      stopTrayDecks()
      trayListener.then((unlisten) => unlisten())
      opacityListener.then((unlisten) => unlisten())
      lookListener.then((unlisten) => unlisten())
      folderListener.then((unlisten) => unlisten())
      workspacesListener.then((unlisten) => unlisten())
      linkListener.then((unlisten) => unlisten())
    }
  })
</script>

<div class="app">
  <Rail />
  <div class="col">
  <!-- One search for the whole app, above every page (task 253). -->
  <GlobalSearch />
  <main>
    {#if $notice}<p class="error notice" role="alert">{$notice}</p>{/if}
    <MovedBanner />

    <!-- No router library: the nav state decides the screen. A deck opens in its editor over
         Decks, or over the workspace it was opened from (ADR 0039, 0040). -->
    {#if $nav.deck && $nav.view === 'library'}
      <DeckEditor path={$nav.deck} />
    {:else if $nav.view === 'settings'}
      <Settings />
    {:else if $nav.view === 'ai'}
      <AiPage />
    {:else if $nav.view === 'library'}
      <LibraryPage />
    {:else if $nav.view === 'templates'}
      <TemplatesPage />
    {:else if $nav.view === 'sessions' && $nav.session}
      {#key $nav.session}<SessionPage path={$nav.session.deck} startedAt={$nav.session.startedAt} />{/key}
    {:else if $nav.view === 'sessions'}
      <SessionsPage />
    {:else}
      <Home />
    {/if}
  </main>
  </div>
</div>

<LinkPrompt />
<NewWorkspace />
<PasteDeckDialog />
<TemplatePicker />
<DropZone />

<style>
  .app {
    display: flex;
    height: 100vh;
  }

  .col {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
  }

  main {
    flex: 1;
    min-height: 0;
    min-width: 0;
    overflow: auto;
    background: var(--bg);
  }

  .notice {
    margin: 0;
    padding: 10px 32px;
    background: var(--danger-bg);
  }
</style>
