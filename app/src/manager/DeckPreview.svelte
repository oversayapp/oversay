<script lang="ts">
  // The deck on screen, live as it is edited: the deck widget itself, the very component
  // the overlay window shows (ADR 0042), so the preview can never differ from the real thing. It
  // shows the view the deck widget shows (the Card view unless switched), where that view opens, on a made-up slide: close on the card for the
  // Card view, the whole screen for the Agenda view; its switch, tab and look work as on screen. It
  // gets a context of its own: the card being edited, its full time, never ticking; Previous and
  // Next in its tab move the editor.
  import { derived, readable, writable } from 'svelte/store'
  import { shownTopics, type NoteDoc } from '../lib/notes/format'
  import { deckTalk, type DeckOptions } from '../lib/decks/deck'
  import type { SessionState } from '../lib/session/clock'
  import { overlaySettings } from '../lib/settings/store'
  import DeckWidget from '../plugins/flashcard/DeckWidget.svelte'
  import { deckWidgetWindow } from '../plugins/flashcard'
  import type { PluginContext } from '../plugins/types'

  let {
    doc,
    name,
    options,
    current = $bindable(0),
  }: { doc: NoteDoc; name: string; options: DeckOptions; current?: number } = $props()

  // The screen the widget sits on, at its real size; the stage scales it down.
  const SCREEN = { width: 1440, height: 900 }
  /** The Card view: the part of the screen around the card, as wide as the screen is to its height. */
  const CLOSE = { width: 720, height: 450 }
  /** Where the Card view opens: the upper left, in from the corner (`UpperLeft` in src-tauri/src/overlay.rs). */
  const UPPER_LEFT_IN = { x: 0.08, y: 0.12 }
  /** How far up from the screen's bottom the Agenda view sits. */
  const AGENDA_BOTTOM = 24

  const shown = $derived(shownTopics(doc))
  // The card being edited, or the nearest one before it that shows.
  const index = $derived(Math.max(0, shown.findLastIndex((t) => doc.topics.indexOf(t) <= current)))
  const talk = $derived({ ...deckTalk(doc, name), deck: options })

  const look = overlaySettings
  const agenda = $derived($look.deckView === 'agenda')
  const size = $derived(deckWidgetWindow($look.deckView))
  const place = $derived(
    agenda
      ? { left: Math.round((SCREEN.width - size.width) / 2), top: SCREEN.height - AGENDA_BOTTOM - size.height }
      : { left: Math.round(SCREEN.width * UPPER_LEFT_IN.x), top: Math.round(SCREEN.height * UPPER_LEFT_IN.y) },
  )
  const view = $derived(agenda ? { x: 0, y: 0, ...SCREEN } : { x: 0, y: 0, ...CLOSE })

  let stageWidth = $state(300)
  const scale = $derived(stageWidth / view.width)

  // The widget's context, kept up to date from the deck as it is edited.
  const at = new Date().toISOString()
  const session = writable<SessionState | null>(null)
  $effect(() => {
    session.set({
      status: 'running',
      index,
      paused: false,
      plan: talk.segments.map((s) => ({ segmentId: s.id, name: s.name, plannedSeconds: s.plannedSeconds, openEnded: s.openEnded })),
      events: [{ at, type: 'start' }],
      talk,
      shortcuts: {},
      unavailable: [],
      deck: true,
    })
  })
  const step = (delta: number) => {
    const next = shown[index + delta]
    if (next) current = doc.topics.indexOf(next)
  }
  const ctx: PluginContext = {
    talk: derived(session, (s) => s?.talk ?? null),
    now: readable(Date.parse(at)),
    session,
    commands: { next: () => step(1), previous: () => step(-1), togglePause: () => {}, end: () => {}, advance: () => {} },
    settings: overlaySettings,
  }
</script>

<div class="stage" bind:clientWidth={stageWidth} style:height="{(stageWidth * view.height) / view.width}px">
  <div
    class="screen ov"
    class:ink-light={$look.panel === 'light'}
    style:width="{SCREEN.width}px"
    style:height="{SCREEN.height}px"
    style:--panel-alpha={$look.solid ? 1 : $look.opacity / 100}
    style:transform="translate({-view.x * scale}px, {-view.y * scale}px) scale({scale})"
  >
    <!-- A made-up slide behind the widget, so it reads as it will over a call or a presentation. -->
    <div class="slide" aria-hidden="true">
      <b>Q4 roadmap</b>
      <i></i><i style="width: 62%"></i><i></i><i style="width: 45%"></i><i style="width: 70%"></i>
      <span class="chart"><em style="height: 40%"></em><em style="height: 70%"></em><em style="height: 55%"></em><em style="height: 90%"></em></span>
    </div>
    <!-- `host`, as the overlay window's: pointing at it shows the switch and the tab. -->
    <div class="widget host" style:left="{place.left}px" style:top="{place.top}px" style:width="{size.width}px" style:height="{size.height}px">
      <DeckWidget {ctx} inWindow={false} />
    </div>
  </div>
</div>

<style>
  .stage {
    position: relative;
    overflow: hidden;
    border-radius: 12px;
    background: #20263a;
    transition: height 0.4s ease;
  }

  .screen {
    position: absolute;
    left: 0;
    top: 0;
    transform-origin: 0 0;
    transition: transform 0.4s ease;
    background: linear-gradient(135deg, #2f4f86, #7b4f8f 55%, #c27a52);
    /* The overlay windows' look (overlay/overlay.css), here on this screen only. */
    --panel-bg: rgba(18, 18, 22, var(--panel-alpha));
    --panel-border: rgba(255, 255, 255, 0.12);
    --text: #ffffff;
    --text-muted: rgba(255, 255, 255, 0.6);
    --text-faint: rgba(255, 255, 255, 0.42);
    --k-intro: #7f9fff;
    --k-topic: #4cc0b2;
    --k-demo: #f0a050;
    --k-outro: #aa94ee;
    --k-break: #9aa4b6;
    --warn: #ffb35c;
    --late: #ff9a7a;
    --early: #7fd8a6;
    --ink: 255, 255, 255;
    --paper: 0, 0, 0;
    --stripes: repeating-linear-gradient(135deg, rgba(0, 0, 0, 0.45) 0 4px, transparent 4px 9px);
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
    font-size: 15px;
    line-height: 1.4;
    color: var(--text);
    user-select: none;
  }

  .screen.ink-light {
    --ink: 0, 0, 0;
    --paper: 255, 255, 255;
  }

  @media (prefers-reduced-motion: reduce) {
    .stage,
    .screen {
      transition: none;
    }
  }

  .slide {
    position: absolute;
    inset: 0;
    padding: 110px 120px;
    display: flex;
    flex-direction: column;
    gap: 34px;
    pointer-events: none;
  }

  .slide b {
    font-size: 64px;
    letter-spacing: -0.01em;
    color: rgba(255, 255, 255, 0.9);
    margin-bottom: 20px;
  }

  .slide i {
    display: block;
    height: 22px;
    width: 64%;
    border-radius: 11px;
    background: rgba(255, 255, 255, 0.3);
  }

  .slide .chart {
    position: absolute;
    right: 120px;
    top: 260px;
    display: flex;
    align-items: flex-end;
    gap: 18px;
    height: 220px;
  }

  .slide .chart em {
    width: 46px;
    background: rgba(255, 255, 255, 0.55);
    border-radius: 6px 6px 0 0;
  }

  .widget {
    position: absolute;
  }
</style>
