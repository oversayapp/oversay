<script lang="ts">
  // The control panel (ADR 0028):
  // what is running with its buttons, which overlays are on screen, and the keys. It docks to
  // the right edge, is never in a screen share, and never takes focus from the slides.
  import { invoke } from '@tauri-apps/api/core'
  import { getCurrentWindow } from '@tauri-apps/api/window'
  import { setOverlay, visibleOverlays } from '../lib/session/overlays'
  import { onDestroy, onMount } from 'svelte'
  import Icon from '../manager/Icon.svelte'
  import { formatDuration } from '../lib/project/duration'
  import { channel } from '../lib/channel'
  import { formatElapsed, segmentReadout, sessionClock, ticking } from '../lib/session/clock'
  import { session, sessionCommands } from '../lib/session/store'
  import { shortcutText } from '../lib/session/shortcuts'
  import { OVERLAY_SETTINGS_CHANNEL, parseOverlaySettings } from '../lib/settings/overlays'
  import { closeOverlay, hiddenFromCapture, openOverlay, setHiddenFromCapture } from '../lib/windows'
  import { overlaysFor, overlayWindow, plugins } from '../plugins/registry'
  import { listen } from '@tauri-apps/api/event'
  import { get } from 'svelte/store'
  import { openSession } from '../lib/session/store'
  import { PREVIEW_TALK } from '../lib/session/preview'
  import { CONTROL_PANEL_OPEN_EVENT } from '../lib/windows'
  import LookControls from '../manager/LookControls.svelte'
  import type { LookChange } from '../lib/settings/overlays'

  // The manager saves the look; every overlay, and this panel, follow it (ADR 0028).
  const changeLook = (c: LookChange) => void invoke('control_panel_look', { key: c.key, value: c.value }).catch(() => {})

  const now = ticking(250)
  const lookChannel = channel<unknown>(OVERLAY_SETTINGS_CHANNEL, null)
  const look = $derived(parseOverlaySettings($lookChannel))

  const live = $derived($session && $session.status !== 'finished' && !$session.preview ? $session : null)
  const previewing = $derived($session?.preview === true && $session.status !== 'finished')

  // With nothing running, the panel puts a sample talk on screen so the look can be seen while it
  // is set. Rust refuses it when anything else is open or the panel has closed, and ends it when
  // the panel closes (ADR 0028).
  async function startPreview() {
    try {
      await openSession(PREVIEW_TALK, { mode: 'preview' })
    } catch {
      return
    }
    const shown = parseOverlaySettings(get(lookChannel))
    const ids = overlaysFor(shown).map((p) => p.id)
    for (const plugin of overlaysFor(shown)) await openOverlay(plugin.id, plugin.name, overlayWindow(plugin, shown)).catch(() => {})
    // Closed while they were opening: the preview has ended, so they go too.
    if (!(await getCurrentWindow().isVisible())) for (const id of ids) await closeOverlay(id).catch(() => {})
    await readVisible()
  }
  const clock = $derived(live ? sessionClock(live, $now) : null)
  const readout = $derived(clock ? segmentReadout(clock) : null)
  const note = $derived(live?.note === true)
  const mac = typeof navigator !== 'undefined' && /Mac/.test(navigator.userAgent)

  // Which overlays are showing: read from the windows, as they can also be closed with their ✕.
  let visible = $state<Set<string>>(new Set())
  const readVisible = async () => void (visible = await visibleOverlays())
  // The key that opens this panel, as set in Settings (Rust keeps it registered).
  let panelKey = $state('')
  const readPanelKey = () =>
    invoke<string | null>('panel_shortcut')
      .then((k) => (panelKey = k ?? ''))
      .catch(() => {})
  let poll: ReturnType<typeof setInterval> | undefined
  // Read every second while the panel is open; the page was loaded by its first opening.
  function polling(on: boolean) {
    clearInterval(poll)
    poll = on ? setInterval(() => void readVisible(), 1000) : undefined
    if (on) void readVisible()
  }
  onMount(() => {
    polling(true)
    // The first opening happened before this page loaded; later ones arrive as events.
    void startPreview()
    void readPanelKey()
    const opened = listen<boolean>(CONTROL_PANEL_OPEN_EVENT, (e) => {
      polling(e.payload)
      if (e.payload) void startPreview().then(readPanelKey)
    })
    return () => void opened.then((unlisten) => unlisten())
  })
  onDestroy(() => clearInterval(poll))

  // A shown note has only its Talking Points, a deck its flashcard widget; a talk, the overlays its look opens.
  const onScreen = $derived(
    note ? plugins.filter((p) => p.id === 'talking-points') : live?.deck ? plugins.filter((p) => p.id === 'flashcard') : overlaysFor(look),
  )

  async function setShown(id: string, show: boolean) {
    await setOverlay(id, show, look)
    await readVisible()
  }

  // End asks once, as on the Timeline (012/07).
  let confirmingEnd = $state(false)
  let endTimer: ReturnType<typeof setTimeout> | undefined
  function end() {
    if (!confirmingEnd) {
      confirmingEnd = true
      clearTimeout(endTimer)
      endTimer = setTimeout(() => (confirmingEnd = false), 3500)
      return
    }
    clearTimeout(endTimer)
    confirmingEnd = false
    void sessionCommands.end()
  }

  const key = (action: string) => (live?.shortcuts[action] ? shortcutText(live.shortcuts[action], mac) : '')
  const close = () => invoke('control_panel_close')
</script>

<aside class="cp" aria-label="Control panel">
  <header class="cph">
    <b>Control panel</b>
    <span class="grow"></span>
    <span class="cpcap" title="Never shown in a screen share or recording">Not shared</span>
    <button class="ibtn" title="Close" aria-label="Close the control panel" onclick={close}><Icon name="close" size={16} /></button>
  </header>

  <section class="sec">
    {#if live && clock}
      <div class="now">
        <span class="kicon" class:note><Icon name={note ? 'note' : 'talk'} size={17} /></span>
        <div class="what">
          <b>{live.talk?.name ?? 'Session'}</b>
          <span class="muted">
            {#if note}Topic {live.index + 1} of {live.plan.length} · {clock.current?.name ?? ''}
            {:else if live.status === 'ready'}Ready · press Start{:else}{clock.current?.name ?? ''} · {live.index + 1} of {live.plan.length}{/if}
            {#if live.paused} · paused{/if}
          </span>
        </div>
      </div>
      <div class="clockrow">
        <span class="clk num">{formatElapsed(clock.inTalk)}{#if !note}<small> / {formatDuration(clock.plannedLength)}</small>{/if}</span>
        {#if !note && readout}
          <span class="muted" class:over={readout.mode === 'over'}
            >{readout.mode === 'left' ? `${formatDuration(readout.seconds)} left in this part` : readout.mode === 'over' ? `${formatDuration(readout.seconds)} over` : `${formatDuration(readout.seconds)} so far`}</span
          >
        {/if}
      </div>
      <div class="btns">
        {#if note}
          <button disabled={live.index === 0} onclick={sessionCommands.previous}><Icon name="back" size={14} /> Previous topic</button>
          <button disabled={live.index >= live.plan.length - 1} onclick={sessionCommands.next}>Next topic <Icon name="arrow" size={14} /></button>
        {:else}
          <button disabled={live.status !== 'running' || live.index === 0} onclick={sessionCommands.previous}><Icon name="prev" size={14} /> Previous</button>
          {#if live.status === 'running'}
            <button onclick={sessionCommands.togglePause}><Icon name={live.paused ? 'play' : 'pause'} size={14} /> {live.paused ? 'Resume' : 'Pause'}</button>
            <button onclick={sessionCommands.next}>Next <Icon name="next" size={14} /></button>
          {:else}
            <button class="primary" onclick={sessionCommands.next}><Icon name="play" size={14} /> Start</button>
          {/if}
        {/if}
      </div>
      <div class="btns">
        {#if note}
          <button class="danger" onclick={sessionCommands.end}><Icon name="close" size={14} /> Close notes</button>
        {:else}
          <button class="danger" class:confirm={confirmingEnd} onclick={end}><Icon name="stop" size={14} /> {confirmingEnd ? 'Click again to end' : 'End…'}</button>
        {/if}
      </div>
    {:else}
      <div class="now">
        <span class="kicon idle"><Icon name="show" size={17} /></span>
        <div class="what">
          <b>Nothing running</b>
          <span class="muted">{previewing ? 'The overlays show a preview while this panel is open, so you can set how they look.' : 'Start a talk or show a note from the Oversay window.'}</span>
        </div>
      </div>
    {/if}
  </section>

  <section class="sec">
    <h5>On screen</h5>
    {#if live || previewing}
      {#each onScreen as plugin (plugin.id)}
        <label class="tog">
          <span>{plugin.name}</span>
          <input type="checkbox" checked={visible.has(plugin.id)} onchange={(e) => void setShown(plugin.id, e.currentTarget.checked)} />
        </label>
      {/each}
    {/if}
    <label class="tog">
      <span>Overlays hidden from screen sharing</span>
      <input type="checkbox" checked={$hiddenFromCapture} onchange={(e) => void setHiddenFromCapture(e.currentTarget.checked)} />
    </label>
  </section>

  <section class="sec">
    <h5>How it looks</h5>
    <LookControls {look} note={note} compact onchange={changeLook} />
    <p class="lnote">Darker or lighter at any time: {mac ? '⌃⌥↑ ⌃⌥↓' : 'Ctrl+Alt+Shift+↑ / ↓'}.</p>
  </section>

  <section class="sec keys">
    <h5>Keys</h5>
    {#if live}
      {#if key('next')}<div><kbd>{key('next')}</kbd> {note ? 'Next topic' : 'Start / Next'}</div>{/if}
      {#if key('previous')}<div><kbd>{key('previous')}</kbd> {note ? 'Previous topic' : 'Previous'}</div>{/if}
      {#if !note && key('pause')}<div><kbd>{key('pause')}</kbd> Pause</div>{/if}
    {/if}
    {#if panelKey}<div><kbd>{shortcutText(panelKey, mac)}</kbd> This panel</div>{/if}
  </section>

  <footer class="foot">
    <button onclick={() => invoke('control_panel_show_manager')}><Icon name="open" size={15} /> Open Oversay window</button>
  </footer>
</aside>

<style>
  :global(html),
  :global(body) {
    background: transparent;
    overflow: hidden;
  }

  /* The manager's minimum width (app.css) is not the panel's. */
  :global(body) {
    min-width: 0 !important;
  }

  .cp {
    height: 100vh;
    display: flex;
    flex-direction: column;
    background: var(--card);
    color: var(--text);
    border: 1px solid var(--line-strong);
    border-radius: 14px;
    overflow: hidden;
    font-size: 13.5px;
  }

  .cph {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 10px 10px 10px 14px;
    border-bottom: 1px solid var(--line);
    background: var(--side);
  }

  .grow {
    flex: 1;
  }

  .cpcap {
    font-size: 11.5px;
    font-weight: 700;
    color: var(--ok);
    background: var(--ok-bg);
    border-radius: 99px;
    padding: 2px 8px;
  }

  .ibtn {
    border: 0;
    background: none;
    padding: 5px;
    color: var(--muted);
    display: inline-flex;
  }

  .sec {
    padding: 10px 14px;
    border-bottom: 1px solid var(--line);
  }

  h5 {
    margin: 0 0 6px;
    font-size: 11px;
    letter-spacing: 0.07em;
    text-transform: uppercase;
    color: var(--faint);
  }

  .now {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .kicon {
    width: 32px;
    height: 32px;
    border-radius: 9px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex: none;
    background: var(--c-talk-bg);
    color: var(--c-talk);
  }

  .kicon.note {
    background: var(--c-note-bg);
    color: var(--c-note);
  }

  .kicon.idle {
    background: var(--accent-soft);
    color: var(--accent-text);
  }

  .what {
    display: flex;
    flex-direction: column;
    min-width: 0;
    flex: 1;
  }

  .what b {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .muted {
    color: var(--muted);
    font-size: 12.5px;
  }

  .clockrow {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 10px;
    margin-top: 8px;
  }

  .over {
    color: var(--warn);
  }

  .clk {
    font-size: 20px;
    font-weight: 700;
    white-space: nowrap;
  }

  .clk small {
    font-size: 12px;
    color: var(--muted);
    font-weight: 500;
  }

  .num {
    font-variant-numeric: tabular-nums;
  }

  .btns {
    display: flex;
    gap: 6px;
    margin-top: 8px;
    flex-wrap: wrap;
  }

  .btns button {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    font-size: 13px;
    padding: 5px 10px;
  }

  .danger.confirm {
    background: var(--danger);
    color: #fff;
  }

  .tog {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 10px;
    padding: 4px 0;
  }

  .tog input {
    accent-color: var(--accent);
    width: 16px;
    height: 16px;
  }

  .lnote {
    margin: 4px 0 0;
    font-size: 11.5px;
    color: var(--faint);
  }

  .keys div {
    display: flex;
    gap: 8px;
    align-items: center;
    margin: 3px 0;
    font-size: 12.5px;
    color: var(--muted);
  }

  .foot {
    margin-top: auto;
    padding: 10px 14px;
    border-top: 1px solid var(--line);
  }

  .foot button {
    display: inline-flex;
    align-items: center;
    gap: 6px;
  }
</style>
