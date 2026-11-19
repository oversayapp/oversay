<script lang="ts">
  // The Look card (ADR 0051, Control Panel v2): what is judged by eye against a slide, at the top
  // of the right edge. Opacity with See-through / Solid first, then Dark / Light, then Hide from
  // screen sharing. The run, the keys and the app are in the menu-bar / tray menu. It is never in a
  // screen share, never takes focus from the slides, and with nothing running it puts a sample deck
  // on screen while it is open.
  import { invoke } from '@tauri-apps/api/core'
  import { getCurrentWindow } from '@tauri-apps/api/window'
  import { listen } from '@tauri-apps/api/event'
  import { get } from 'svelte/store'
  import { onMount } from 'svelte'
  import Icon from '../manager/Icon.svelte'
  import { channel } from '../lib/channel'
  import { logAction } from '../lib/log'
  import { session, openSession } from '../lib/session/store'
  import { shortcutText, isMac } from '../lib/session/shortcuts'
  import { sampleDeckTalk } from '../lib/session/preview'
  import { MIN_OVERLAY_OPACITY, OVERLAY_SETTINGS_CHANNEL, parseOverlaySettings, type LookChange } from '../lib/settings/overlays'
  import { CONTROL_PANEL_OPEN_EVENT, closeOverlay, hiddenFromCapture, openOverlay, setHiddenFromCapture } from '../lib/windows'
  import { flashcard } from '../plugins/flashcard'
  import { overlayWindow } from '../plugins/registry'

  // The manager saves the look; every overlay, and this card, follow it (ADR 0028).
  const change = (c: LookChange) => {
    if (c.key !== 'opacityPreview') logAction(`look card ${c.key}`, String(c.value))
    void invoke('control_panel_look', { key: c.key, value: c.value }).catch(() => {})
  }

  const lookChannel = channel<unknown>(OVERLAY_SETTINGS_CHANNEL, null)
  const look = $derived(parseOverlaySettings($lookChannel))
  // While the slider moves, the card shows where it is before the manager answers.
  let dragging = $state<number | null>(null)
  const shown = $derived(dragging ?? (look.solid ? 100 : look.opacity))

  const running = $derived(!!$session && $session.status !== 'finished' && !$session.preview)
  const mac = isMac()

  // The key that opens and closes this card, as set in Settings (Rust keeps it registered).
  let panelKey = $state('')
  const readPanelKey = () =>
    invoke<string | null>('panel_shortcut')
      .then((k) => (panelKey = k ? shortcutText(k, mac) : ''))
      .catch(() => {})

  // With nothing running, the sample deck goes on screen. Rust refuses it when anything else is
  // open or the card has closed, and ends it when the card closes (ADR 0051).
  async function startPreview() {
    try {
      await openSession(sampleDeckTalk(), { mode: 'preview' })
    } catch {
      return
    }
    await openOverlay(flashcard.id, flashcard.name, overlayWindow(flashcard, parseOverlaySettings(get(lookChannel)))).catch(() => {})
    // Closed while it was opening: the preview has ended, so the widget goes too.
    if (!(await getCurrentWindow().isVisible())) await closeOverlay(flashcard.id).catch(() => {})
  }

  // The card is as tall as what it shows (control_panel_fit keeps its top right corner).
  let card: HTMLElement | undefined = $state()
  $effect(() => {
    if (!card) return
    let sent = 0
    const fit = () => {
      const height = Math.ceil(card!.getBoundingClientRect().height)
      if (height === sent) return
      sent = height
      void invoke('control_panel_fit', { height }).catch(() => {})
    }
    const watch = new ResizeObserver(fit)
    watch.observe(card)
    return () => watch.disconnect()
  })

  onMount(() => {
    // The first opening happened before this page loaded; later ones arrive as events.
    void startPreview()
    void readPanelKey()
    const opened = listen<boolean>(CONTROL_PANEL_OPEN_EVENT, (e) => {
      if (e.payload) void startPreview().then(readPanelKey)
    })
    return () => void opened.then((unlisten) => unlisten())
  })

  const close = () => invoke('control_panel_close')
</script>

<aside class="look" aria-label="Look" bind:this={card}>
  <header class="lh">
    <b>Look</b>
    <span class="cap" title="Never shown in a screen share or recording">Not shared</span>
    <button class="ib" title={panelKey ? `Close (${panelKey})` : 'Close'} aria-label="Close the Look card" onclick={close}><Icon name="close" size={15} /></button>
  </header>

  <section class="sec">
    <h5 id="opacity-label">Opacity <span class="v num">{dragging === null && look.solid ? 'Solid' : `${shown}%`}</span></h5>
    <input
      type="range"
      min={MIN_OVERLAY_OPACITY}
      max="100"
      step="1"
      value={shown}
      aria-labelledby="opacity-label"
      oninput={(e) => {
        dragging = Number(e.currentTarget.value)
        change({ key: 'opacityPreview', value: dragging })
      }}
      onchange={(e) => {
        change({ key: 'opacity', value: Number(e.currentTarget.value) })
        dragging = null
      }}
    />
    <div class="seg" role="radiogroup" aria-label="See-through or solid">
      <button role="radio" aria-checked={!look.solid} class:on={!look.solid} onclick={() => change({ key: 'solid', value: false })}>See-through</button>
      <button role="radio" aria-checked={look.solid} class:on={look.solid} onclick={() => change({ key: 'solid', value: true })}>Solid</button>
    </div>
  </section>

  <section class="sec">
    <h5>Panel</h5>
    <div class="seg" role="radiogroup" aria-label="Panel">
      <button role="radio" aria-checked={look.panel === 'dark'} class:on={look.panel === 'dark'} onclick={() => change({ key: 'panel', value: 'dark' })}><span class="sw"></span>Dark</button>
      <button role="radio" aria-checked={look.panel === 'light'} class:on={look.panel === 'light'} onclick={() => change({ key: 'panel', value: 'light' })}><span class="sw l"></span>Light</button>
    </div>
  </section>

  <section class="sec">
    <div class="row">
      <div class="t">
        <b>Hide from screen sharing</b>
        {#if $hiddenFromCapture}
          <small>Zoom, Teams, Meet and recordings don’t see the deck widget.</small>
        {:else}
          <small class="warn">Your audience can see the deck widget.</small>
        {/if}
      </div>
      <button
        class="tog"
        class:on={$hiddenFromCapture}
        role="switch"
        aria-checked={$hiddenFromCapture}
        aria-label="Hide from screen sharing"
        onclick={() => {
          logAction('look card hide from sharing', String(!$hiddenFromCapture))
          void setHiddenFromCapture(!$hiddenFromCapture).catch(() => {})
        }}
      ></button>
    </div>
  </section>

  {#if !running}
    <section class="sec">
      <p class="pvn">Nothing is running, so a sample deck is on screen while this is open: set the look against your slides. It goes when you close this.</p>
    </section>
  {/if}

  <footer class="ft">
    <button onclick={() => invoke('control_panel_show_manager')}>Open Oversay</button>
    <span class="sp"></span>
    {#if panelKey}<span>{panelKey} closes</span>{/if}
  </footer>
</aside>

<style>
  :global(html),
  :global(body) {
    background: transparent;
    overflow: hidden;
  }

  /* The manager's minimum width (app.css) is not the card's. */
  :global(body) {
    min-width: 0 !important;
  }

  .look {
    background: var(--card);
    color: var(--text);
    border: 1px solid var(--line-strong);
    border-radius: 14px;
    overflow: hidden;
    font-size: 13.5px;
    line-height: 1.4;
  }

  .lh {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 9px 8px 9px 14px;
    border-bottom: 1px solid var(--line);
    background: var(--side);
  }

  .lh b {
    flex: 1;
  }

  .cap {
    font-size: 11px;
    font-weight: 700;
    color: var(--ok);
    background: var(--ok-bg);
    border-radius: 99px;
    padding: 1px 8px;
  }

  .ib {
    border: 0;
    background: none;
    padding: 4px 6px;
    color: var(--muted);
    border-radius: 6px;
    display: inline-flex;
  }

  .sec {
    padding: 12px 14px;
    border-bottom: 1px solid var(--line);
  }

  h5 {
    margin: 0 0 8px;
    font-size: 11px;
    letter-spacing: 0.07em;
    text-transform: uppercase;
    color: var(--faint);
    display: flex;
    align-items: center;
  }

  h5 .v {
    margin-left: auto;
    text-transform: none;
    letter-spacing: 0;
    color: var(--text);
    font-size: 15px;
    font-weight: 700;
  }

  .num {
    font-variant-numeric: tabular-nums;
  }

  input[type='range'] {
    width: 100%;
    accent-color: var(--accent);
    margin: 2px 0 10px;
  }

  .seg {
    display: flex;
    border: 1px solid var(--line-strong);
    border-radius: 9px;
    padding: 2px;
    gap: 2px;
  }

  .seg button {
    flex: 1;
    border: 0;
    background: none;
    border-radius: 7px;
    padding: 5px 8px;
    font-size: 13px;
    font-weight: 600;
    color: var(--muted);
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
  }

  .seg button.on {
    background: var(--accent-soft);
    color: var(--accent-text);
  }

  .sw {
    width: 12px;
    height: 12px;
    border-radius: 4px;
    border: 2px solid #fff;
    background: #000;
    display: inline-block;
  }

  .sw.l {
    border-color: #000;
    background: #fff;
  }

  .row {
    display: flex;
    align-items: flex-start;
    gap: 10px;
  }

  .row .t {
    flex: 1;
  }

  .row small {
    display: block;
    color: var(--muted);
    font-size: 12px;
    margin-top: 2px;
  }

  .row small.warn {
    color: var(--warn);
  }

  .tog {
    flex: none;
    width: 36px;
    height: 21px;
    border-radius: 99px;
    border: 0;
    padding: 0;
    background: var(--line-strong);
    position: relative;
    margin-top: 1px;
  }

  .tog::after {
    content: '';
    position: absolute;
    left: 3px;
    top: 3px;
    width: 15px;
    height: 15px;
    border-radius: 50%;
    background: #fff;
    transition: left 0.15s;
  }

  .tog.on {
    background: var(--accent);
  }

  .tog.on::after {
    left: 18px;
  }

  .pvn {
    font-size: 12px;
    color: var(--muted);
    background: var(--accent-soft);
    border-radius: 8px;
    padding: 7px 10px;
    margin: 0;
  }

  .ft {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 9px 14px;
    font-size: 12.5px;
    color: var(--faint);
    background: var(--side);
  }

  .ft button {
    border: 0;
    background: none;
    color: var(--accent-text);
    font-weight: 600;
    padding: 2px 0;
  }

  .ft .sp {
    flex: 1;
  }
</style>
