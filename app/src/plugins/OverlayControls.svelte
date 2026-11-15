<script lang="ts">
  // Previous, Pause/Resume and Next on an overlay (006/07, 007/01),
  // for anyone who doesn't use the shortcuts. Each Timeline style places the group itself.
  // The buttons do what the hotkeys do, and clicking one doesn't take focus from the
  // slideshow (overlays are non-activating panels, ADR 0002). Dragging still works around them:
  // the overlay host doesn't start a drag from a button.
  import { onDestroy } from 'svelte'
  import { logAction } from '../lib/log'
  import Icon from '../manager/Icon.svelte'
  import type { PluginContext } from './types'

  let {
    ctx,
    visible = 'always',
    small = false,
    waveform = false,
  }: {
    ctx: PluginContext
    /** Settings › Overlays (007/02): always shown, only while the pointer is over the overlay, or never. */
    visible?: 'always' | 'hover' | 'hidden'
    small?: boolean
    /** The Waveform look: bare white glyphs, Start among them; Next filled white. */
    waveform?: boolean
  } = $props()
  const session = $derived(ctx.session)
  const running = $derived($session?.status === 'running')

  // End is the one button that throws the talk away, and a talk may never reach its last
  // segment, so it is here (012/07); but a stray click must not end it: the first click asks, the
  // second, within a few seconds, ends.
  let confirmingEnd = $state(false)
  let confirmTimer: ReturnType<typeof setTimeout> | undefined
  function end() {
    if (!confirmingEnd) {
      logAction('timeline: end asks')
      confirmingEnd = true
      clearTimeout(confirmTimer)
      confirmTimer = setTimeout(() => (confirmingEnd = false), 3500)
      return
    }
    clearTimeout(confirmTimer)
    confirmingEnd = false
    ctx.commands.end()
  }
  onDestroy(() => clearTimeout(confirmTimer))
</script>

{#if $session && $session.status !== 'finished' && visible !== 'hidden'}
  <div class="controls" class:hover={visible === 'hover'} class:small class:waveform role="toolbar" aria-label="Session controls">
    <button disabled={!running || $session.index === 0} onclick={ctx.commands.previous} title="Previous" aria-label="Previous">
      <Icon name="prev" size={small ? 13 : 15} />
    </button>
    <!-- The middle button starts the talk, then pauses and resumes it (John, 007/01). -->
    {#if running}
      <button
        onclick={ctx.commands.togglePause}
        title={$session.paused ? 'Resume' : 'Pause'}
        aria-label={$session.paused ? 'Resume' : 'Pause'}
      >
        <Icon name={$session.paused ? 'play' : 'pause'} size={small ? 13 : 15} />
      </button>
    {:else}
      <!-- Labelled, so before the talk starts it is plain what to press (John, 012/07). In Waveform it
           is a bare play glyph in the same place, the way Pause is once the talk runs (John, #193). -->
      <button class:go={!waveform} class:start={!waveform} onclick={ctx.commands.next} title="Start the talk" aria-label="Start">
        <Icon name="play" size={small ? 13 : 15} />{#if !waveform}<span>Start</span>{/if}
      </button>
    {/if}
    <button class:go={running} disabled={!running} onclick={ctx.commands.next} title="Next" aria-label="Next">
      <Icon name="next" size={small ? 13 : 15} />
    </button>
    <button
      class="end"
      class:confirm={confirmingEnd}
      onclick={end}
      title={confirmingEnd ? 'Click again to end the session' : 'End the session'}
      aria-label={confirmingEnd ? 'Confirm: end the session' : 'End session'}
    >
      <Icon name="stop" size={small ? 13 : 15} />{#if confirmingEnd}<span>End?</span>{/if}
    </button>
  </div>
{/if}

<style>
  .controls {
    display: inline-flex;
    flex: none;
    align-items: center;
    gap: 4px;
    transition: opacity 0.15s;
  }

  /* On hover: shown while the pointer is over the overlay window, or a button has keyboard focus. */
  .controls.hover {
    opacity: 0;
  }

  :global(body:hover) .controls.hover,
  .controls.hover:focus-within {
    opacity: 1;
  }

  button {
    width: 32px;
    height: 28px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: 0;
    border: 1px solid rgba(255, 255, 255, 0.13);
    border-radius: 8px;
    background: rgba(255, 255, 255, 0.08);
    color: #fff;
    cursor: pointer;
  }

  .small button {
    width: 27px;
    height: 24px;
    border-radius: 7px;
  }

  button:hover:not(:disabled) {
    background: rgba(255, 255, 255, 0.2);
  }

  button.start {
    width: auto;
    gap: 5px;
    padding: 0 10px;
    font-size: 12.5px;
    font-weight: 600;
  }

  button.end {
    margin-left: 6px;
  }

  button.end.confirm {
    width: auto;
    gap: 5px;
    padding: 0 9px;
    font-size: 12.5px;
    font-weight: 600;
    background: #c63a32;
    border-color: #c63a32;
  }

  button.go {
    background: #3b78ee;
    border-color: #3b78ee;
  }

  button.go:hover:not(:disabled) {
    background: #5a8ff3;
  }

  button:disabled {
    opacity: 0.3;
    cursor: default;
  }

  /* Waveform: no boxes, glyphs in the ink; the button to press is filled with it (white, or black when light). */
  .waveform button {
    border: 0;
    border-radius: 99px;
    background: none;
    color: rgb(var(--ink));
  }

  .waveform button:hover:not(:disabled) {
    background: rgba(var(--ink), 0.2);
  }

  .waveform button.go {
    background: rgb(var(--ink));
    color: rgb(var(--paper));
  }

  .waveform button.go:hover:not(:disabled) {
    background: rgba(var(--ink), 0.82);
  }

  .waveform button.end {
    position: relative;
    margin-left: 7px;
  }

  .waveform button.end::before {
    content: '';
    position: absolute;
    left: -5px;
    top: 5px;
    bottom: 5px;
    border-left: 1px solid rgba(var(--ink), 0.3);
  }

  .waveform button.end.confirm {
    background: rgb(var(--ink));
    color: rgb(var(--paper));
  }
</style>
