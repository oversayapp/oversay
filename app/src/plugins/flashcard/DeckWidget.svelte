<script lang="ts">
  // The deck widget (ADR 0042): one window, two views of the
  // same run. The Card view is the flashcard widget; the Agenda view is every card along the bottom.
  // The Look button left of the host's ✕ opens the Look card. The view is chosen in the menu (Card
  // view / Agenda view): the manager saves it as the view last used, and the host moves the window
  // to that view's remembered place and size (`windowFor`).
  import { deckRun } from '../../lib/decks/run'
  import { recordButton, recordFromWidget, recording, stopRecordingThisRun } from '../../lib/sessions/recording'
  import type { DeckView } from '../../lib/settings/overlays'
  import { toggleControlPanel } from '../../lib/windows'
  import AgendaView from './AgendaView.svelte'
  import type { PluginContext } from '../types'
  import DeckTab from './DeckTab.svelte'
  import Flashcard from './Flashcard.svelte'
  import { TAB_HEIGHT } from './fit'
  import { flashcardModel } from './model'

  // `inWindow`: in its own overlay window, the Card view sizes the window to the card; in the
  // deck editor's preview the same widget sits on a made-up screen and leaves the window alone.
  let { ctx, inWindow = true }: { ctx: PluginContext; inWindow?: boolean } = $props()
  const session = $derived(ctx.session)
  const look = $derived(ctx.settings)
  const now = $derived(ctx.now)
  const model = $derived(flashcardModel($session))
  const run = $derived($session && model.status !== 'finished' ? deckRun($session, $now, model.options.autoAdvance, model.options.timing) : null)

  // Auto-advance, whichever view shows: once the card's time is up, ask for the next card once. The
  // engine moves on only if this card is still showing, so a late tick or a second window asking changes nothing.
  let asked = -1
  $effect(() => {
    if (!run?.due) asked = -1
    else if (asked !== model.index) {
      asked = model.index
      ctx.commands.advance(model.index)
    }
  })

  // The view shown follows the saved one; while the window moves to the other view's place, the
  // widget fades out and back, so the new view isn't seen in the old view's frame.
  let view = $state<DeckView>('card')
  let hidden = $state(false)
  let settle: ReturnType<typeof setTimeout> | undefined
  $effect(() => {
    const wanted = $look.deckView
    if (wanted === view) return
    hidden = true
    clearTimeout(settle)
    settle = setTimeout(() => {
      view = wanted
      hidden = false
    }, 140)
  })
  // The first view is the saved one, at once.
  let first = true
  $effect(() => {
    if (!first) return
    first = false
    view = $look.deckView
  })
  $effect(() => () => clearTimeout(settle))

  // Record my voice (ADR 0041, 0042): on every running deck the button is shown left of the
  // switch: red while recording, dimmed while paused, grey when not, struck through when the
  // microphone was refused; a click toggles it (Auto record, in Settings, starts it at Start).
  const rec = $derived(recordButton($session, $recording))
  const onWindows = typeof navigator !== 'undefined' && /Windows/.test(navigator.userAgent)
  const recTitle = $derived(
    rec === 'refused'
      ? `Oversay can’t use the microphone. Allow it in ${onWindows ? 'Settings › Privacy & security › Microphone' : 'System Settings › Privacy & Security › Microphone'}, then click to record`
      : rec === 'stopped'
        ? 'Not recording. Click to record your voice'
        : rec === 'paused'
          ? 'Recording your voice: paused with the deck. Click to stop'
          : 'Recording your voice. Click to stop',
  )
  const recordingNow = $derived(rec === 'recording' || rec === 'paused')
  function toggleRecording() {
    if (recordingNow) stopRecordingThisRun()
    else if ($session) recordFromWidget($session)
  }
</script>

<div class="dw" class:hidden class:ink-light={$look.panel === 'light'} style:--tab="{TAB_HEIGHT}px" style:--corner={rec ? '78px' : null}>
  <div class="view">
    {#if view === 'agenda'}
      <div class="agenda" class:light={$look.panel === 'light'} class:one={model.options.colour === 'one'}>
        <AgendaView {ctx} />
      </div>
    {:else}
      <Flashcard {ctx} fit={inWindow} below={TAB_HEIGHT} buttons={false} />
    {/if}
  </div>
  <DeckTab {ctx} {model} {run} preview={!!$session?.preview} />
  {#if rec}
    <button
      class="rec"
      class:paused={rec === 'paused'}
      class:off={rec === 'stopped'}
      class:refused={rec === 'refused'}
      type="button"
      title={recTitle}
      aria-label={recordingNow ? 'Stop recording your voice' : 'Record your voice'}
      aria-pressed={recordingNow}
      onclick={toggleRecording}
    >
      <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"
        ><circle class="ring" cx="8" cy="8" r="6.6" fill="none" stroke-width="1.6" /><circle class="dot" cx="8" cy="8" r="3.8" />{#if rec === 'refused'}<path
            class="slash"
            d="M3 13L13 3"
            stroke-width="1.6"
            stroke-linecap="round"
          />{/if}</svg
      >
    </button>
  {/if}
  <button class="look" type="button" title="Look panel" aria-label="Look panel" onclick={() => void toggleControlPanel()}>
    <svg width="16" height="14" viewBox="0 0 16 14" aria-hidden="true"
      ><path d="M1.5 3.5h7M12 3.5h2.5M1.5 10.5h2.5M7.5 10.5h7" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" /><circle
        cx="10.2"
        cy="3.5"
        r="1.8"
        fill="none"
        stroke="currentColor"
        stroke-width="1.5"
      /><circle cx="5.8" cy="10.5" r="1.8" fill="none" stroke="currentColor" stroke-width="1.5" /></svg
    >
  </button>
</div>

<style>
  .dw {
    position: relative;
    height: 100%;
    transition: opacity 0.14s;
  }

  .dw.hidden {
    opacity: 0;
  }

  /* The view fills the window but for the room its tab slides into. */
  .view {
    position: relative;
    z-index: 1;
    height: calc(100% - var(--tab));
  }

  .agenda {
    height: 100%;
  }

  /* The light panel's kind colours, as on the Card view. */
  .agenda.light {
    --k-intro: #4a78e8;
    --k-topic: #1f8f83;
    --k-demo: #d97a1c;
    --k-outro: #8062d0;
    --k-break: #7d889b;
  }

  /* One colour: every kind in the panel's ink. */
  .agenda.one {
    --k-intro: rgb(var(--ink));
    --k-topic: rgb(var(--ink));
    --k-demo: rgb(var(--ink));
    --k-outro: rgb(var(--ink));
    --k-break: rgb(var(--ink));
  }

  /* The view sits over its tab; the host's ✕ and the Look button sit over the view. */
  :global(.host > .corner) {
    z-index: 2;
  }

  /* The host's ✕ in the panel's ink, as the Look button is: dark on the Light panel. */
  :global(.host:has(.dw.ink-light) > .corner .close) {
    color: rgba(0, 0, 0, 0.7);
  }

  /* Left of the host's ✕, and like it shown while the pointer is over the widget. */
  .look {
    position: absolute;
    z-index: 2;
    top: 7px;
    right: 32px;
    width: 22px;
    height: 22px;
    display: grid;
    place-items: center;
    padding: 0;
    border: 0;
    border-radius: 6px;
    background: transparent;
    color: rgba(var(--ink), 0.7);
    cursor: pointer;
    opacity: 0;
    transition: opacity 0.15s;
  }

  :global(.host:hover) .look,
  .look:focus-visible {
    opacity: 1;
  }

  /* The record button: on every running deck, a red dot in a ring while recording, the dot dimmed
     while paused, grey when not recording and struck through when the microphone was refused (red means recording, as in every recording app). */
  .rec {
    position: absolute;
    z-index: 2;
    top: 7px;
    right: 58px;
    width: 22px;
    height: 22px;
    display: grid;
    place-items: center;
    padding: 0;
    border: 0;
    border-radius: 6px;
    background: transparent;
    cursor: pointer;
  }

  .rec:hover {
    background: rgba(var(--ink), 0.14);
  }

  .rec .ring {
    stroke: rgba(var(--ink), 0.85);
  }

  .rec .dot {
    fill: #ff3b3b;
    animation: rec-pulse 2s ease-in-out infinite;
  }

  .rec.paused .dot {
    opacity: 0.35;
    animation: none;
  }

  .rec.off .ring {
    stroke: rgba(var(--ink), 0.55);
  }

  .rec.off .dot {
    fill: rgba(var(--ink), 0.45);
    animation: none;
  }

  .rec.refused .ring {
    stroke: rgba(var(--ink), 0.4);
  }

  .rec.refused .dot {
    fill: rgba(var(--ink), 0.3);
    animation: none;
  }

  .rec .slash {
    stroke: rgba(var(--ink), 0.85);
  }

  @keyframes rec-pulse {
    50% {
      opacity: 0.55;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .rec .dot {
      animation: none;
    }
  }

  .look:hover {
    background: rgba(var(--ink), 0.14);
    color: rgb(var(--ink));
  }
</style>
