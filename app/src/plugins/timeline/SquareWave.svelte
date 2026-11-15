<script lang="ts">
  // The Timeline overlay, the Waveform look (ADR 0029):
  // white on black, or black on white with the Light panel. The talk is drawn as one line, each
  // segment in its kind's pattern, cancelled as the talk goes (SineWave.svelte); late or early sits
  // in the pill, and the wave shows how far through you are. The top row: the segment's name; its
  // time centred in a pill that fills as it goes; the time into the talk by a clock. The Blocks
  // style this component also drew, with its talk bar, ring and gauge and the notes inside the
  // Timeline, went when decks replaced them (ADR 0036).
  import { formatDuration } from '../../lib/project/duration'
  import { formatElapsed } from '../../lib/session/clock'
  import type { LookBack } from '../../lib/session/look-back'
  import { logAction } from '../../lib/log'
  import { formatTalkStatus, isWrapUp } from '../../lib/session/timeline'
  import Icon from '../../manager/Icon.svelte'
  import CardFrame from './CardFrame.svelte'
  import { timelineModel } from './model'
  import SineWave from './SineWave.svelte'
  import type { PluginContext } from '../types'

  let { ctx }: { ctx: PluginContext } = $props()
  const now = $derived(ctx.now)
  const session = $derived(ctx.session)
  const look = $derived(ctx.settings)

  const model = $derived(timelineModel($session, $now))
  const clock = $derived(model.clock)
  const readout = $derived(model.readout)
  const layout = $derived(model.layout)
  const standing = $derived(model.standing)
  const paused = $derived(model.paused)
  const currentKind = $derived(model.segment?.kind ?? 'topic')
  const segmentShare = $derived(model.segmentShare)
  const word = $derived(model.word)
  const talkOver = $derived(model.talkOver)
  const waveform = true
  // Whether the talk's progress is a bar under the timeline or a ring or gauge by the clock (007/02);
  // Waveform shows neither.
  // Ready, in Waveform: a large Start over the wave, unless the buttons are hidden.
  const startCover = $derived(waveform && $session?.status === 'ready' && $look.buttons !== 'hidden')
  // The segment being presented has run over its time (not a demo past its estimate).
  const overrun = $derived(!!layout?.blocks.some((b) => b.state === 'current' && b.beyond > 0 && !b.openEnded) && !paused)

  const at = (seconds: number) => `${(Math.min(seconds, layout?.total ?? 1) / (layout?.total ?? 1)) * 100}%`
  /** A ruler mark: minutes into the talk, `3`, or `4:30` when not a whole minute. */
  const minutes = (seconds: number) => (seconds % 60 === 0 ? String(seconds / 60) : formatDuration(seconds))
  const standingText = $derived(standing ? formatTalkStatus(standing) : '')

  // Holding the Waveform wave looks back: only behind the playhead, never ahead, and nothing
  // about the session changes. The other overlays hear it (Talking Points shows that segment), and
  // letting go comes back to now.
  let looking: LookBack | null = $state(null)
  function lookFrom(event: PointerEvent, box: HTMLElement) {
    if (!layout) return
    const reached = layout.playhead ?? (model.status === 'finished' ? layout.total : 0)
    if (reached <= 0) return
    const r = box.getBoundingClientRect()
    const seconds = Math.max(0, Math.min(reached, ((event.clientX - r.left) / r.width) * layout.total))
    let index = 0
    layout.blocks.forEach((b, i) => {
      if (b.start <= seconds) index = i
    })
    if (looking?.index === index && Math.abs(looking.seconds - seconds) < 0.5) return
    looking = { index, seconds }
    ctx.commands.lookBack(looking)
  }
  function hold(event: PointerEvent) {
    if (event.button !== 0) return
    const box = event.currentTarget as HTMLElement
    box.setPointerCapture(event.pointerId)
    lookFrom(event, box)
    if (looking && layout) logAction('timeline: look back', layout.blocks[looking.index].name)
  }
  const move = (event: PointerEvent) => {
    if (looking) lookFrom(event, event.currentTarget as HTMLElement)
  }
  function letGo() {
    if (!looking) return
    looking = null
    ctx.commands.lookBack(null)
  }
  $effect(() => () => {
    if (looking) ctx.commands.lookBack(null)
  })
</script>

<CardFrame {ctx} {waveform} light={$look.panel === 'light'}>
  <div class="look" class:waveform>
  {#if paused}
    <!-- Paused: a large pill over the middle of the timeline (John, 007/01). -->
    <div class="paused-cover" role="status"><span class="pause-ic"></span>Paused</div>
  {/if}
  {#if startCover}
    <!-- Ready, in Waveform: Start in the same place as Paused, since starting is the big moment
         (John, #193). Clicking it doesn't take focus from the slides, like every overlay button. -->
    <button class="paused-cover start-cover" onclick={ctx.commands.next} title="Start the talk">
      <Icon name="play" size={20} />Start
    </button>
  {/if}
  <div class="top">
    {#if !$session || !clock}
      <span class="seg">No session</span>
    {:else if $session.status === 'ready'}
      <span class="seg">Ready</span>
      <span class="muted">{$session.plan.length} segments · {formatDuration(clock.plannedLength)}{startCover ? '' : ' · press Start'}</span>
    {:else if $session.status === 'finished'}
      <span class="seg">Finished</span>
      <!-- Waveform has no talk bar to end with it, so how the talk ended sits here. -->
      {#if waveform && standing}<span class="standing {standing.status}">{standingText}</span>{/if}
    {:else if clock.current && readout}
      <!-- "Topic" before the name says what the name is (John, #193). -->
      <span class="seg" title={clock.current.name}><span class="seg-word">Topic</span> {clock.current.name}</span>
      <!-- The segment's time, centred, in a pill of its colour that fills as the segment goes (John, 007/01). -->
      <span
        class="pill"
        class:over={readout.mode === 'over'}
        class:wrap={isWrapUp(readout)}
        style="--c: var(--k-{currentKind})"
      >
        <i class="pill-fill" style="width: {segmentShare * 100}%"></i>
        <b class="big num">{readout.mode === 'over' ? '+' : ''}{formatElapsed(readout.seconds)}{readout.mode === 'so-far' ? ' ↑' : ''}</b>
        <small
          >{word}{#if waveform && standing}{' · '}<span class="standing {standing.status}">{standingText}</span>{/if}</small
        >
      </span>
    {/if}
    <span class="grow"></span>
    {#if clock && $session}
      <!-- The time into the talk. -->
      <span class="clock num" class:late={talkOver} title="Time into the talk">
        <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9.5" /><path d="M12 7v5l3.5 2" /></svg>
        {formatElapsed(clock.inTalk)}
      </span>
    {/if}
  </div>


  {#if layout}
    <div
      class="wave sine-box"
      class:dim={paused || startCover}
      data-hold
      role="presentation"
      onpointerdown={hold}
      onpointermove={move}
      onpointerup={letGo}
      onpointercancel={letGo}
      onlostpointercapture={letGo}
    >
      <SineWave {layout} over={overrun} look={looking?.seconds ?? null} />
      {#if looking}
        <!-- Kept inside the wave near either end. -->
        <span class="peek" style="left: clamp(95px, {at(looking.seconds)}, calc(100% - 95px))">Looking at {layout.blocks[looking.index].name} · {formatElapsed(looking.seconds)}</span>
      {/if}
    </div>
    <!-- Each segment's start minute and name; the talk's length at the end. -->
    <div class="ruler" aria-hidden="true">
      {#each layout.blocks as b, i (b.segmentId)}
        {@const next = layout.blocks[i + 1]}
        <!-- The last one stops short of the talk's length at the end. -->
        <span class="mark named" style="left: {at(b.start)}; max-width: calc({at(b.plannedSeconds)} - {next ? 2 : 40}px)"
          >{minutes(b.start)}{#if b.plannedSeconds / layout.total > (next ? 0.05 : 0.12)}<b>{b.name}</b>{/if}</span
        >
        {#if !next}<span class="mark last" style="left: 100%">{minutes(b.start + b.plannedSeconds)} min</span>{/if}
      {/each}
    </div>
  {/if}
  </div>
</CardFrame>

<style>
  /* The card's children, as one group so the Waveform look can be scoped to it. */
  .look {
    display: contents;
  }

  /* NOTES_HEIGHT in windows.ts, less the card's gap. */
  .notes-slot {
    flex: none;
    height: 75px;
    overflow: hidden;
  }

  .top {
    display: flex;
    align-items: center;
    gap: 12px;
    /* Room for the host's close button. */
    padding-right: 26px;
    white-space: nowrap;
    min-width: 0;
  }

  .seg {
    font-size: 17px;
    font-weight: 700;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .seg-word {
    font-weight: 600;
    color: var(--text-muted);
  }

  .big {
    font-size: 26px;
    font-weight: 750;
    line-height: 1;
  }

  .num,
  b {
    font-variant-numeric: tabular-nums;
  }

  .muted {
    color: var(--text-muted);
  }

  .grow {
    flex: 1;
  }

  .warn {
    color: var(--warn);
  }

  .late {
    color: var(--late);
  }

  .early,
  .on-time {
    color: var(--early);
  }

  /* A large pill in the middle of the timeline, which stays visible around it. */
  .paused-cover {
    position: absolute;
    left: 50%;
    top: calc(50% + 14px);
    z-index: 5;
    transform: translate(-50%, -50%);
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 7px 22px;
    border: 2px solid currentColor;
    border-radius: 99px;
    background: rgba(14, 17, 23, 0.9);
    font-size: 22px;
    font-weight: 750;
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.4);
  }

  .pause-ic {
    width: 15px;
    height: 18px;
    border-left: 5px solid currentColor;
    border-right: 5px solid currentColor;
    box-sizing: border-box;
  }

  .wave {
    position: relative;
    flex: 1;
    min-height: 30px;
  }

  .blk {
    position: absolute;
    top: 0;
    bottom: 0;
    min-width: 3px;
    margin-right: 2px;
    border-radius: 3px;
    overflow: hidden;
    background: var(--c);
    box-sizing: border-box;
  }

  .blk.low {
    top: 42%;
  }

  .blk.ahead {
    opacity: 0.32;
  }

  /* The unfilled part of a block is time still to present (or, once done, time not used). */
  .blk.current,
  .blk.done {
    background: color-mix(in srgb, var(--c) 30%, transparent);
  }

  /* Open-ended (a demo, Q&A): dashed at its estimate until it has been presented. */
  .blk.open {
    background: transparent;
    border: 2px dashed var(--c);
  }

  .blk.open.ahead {
    opacity: 0.55;
  }

  .fill {
    position: absolute;
    top: 0;
    bottom: 0;
    left: 0;
    background: var(--c);
  }

  .name {
    position: absolute;
    left: 5px;
    right: 3px;
    bottom: 2px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 11px;
    font-weight: 650;
    color: #fff;
    text-shadow: 0 1px 2px rgba(0, 0, 0, 0.6);
  }

  /* Over its time: the block is full and pulses gently (an outline says it without motion). */
  .blk.pulse {
    animation: pulse 1.8s ease-in-out infinite;
  }

  @keyframes pulse {
    50% {
      opacity: 0.55;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .blk.pulse {
      animation: none;
      outline: 2px solid var(--warn);
      outline-offset: -2px;
    }
  }

  .ruler {
    flex: none;
    position: relative;
    height: 13px;
    font-size: 10.5px;
    line-height: 13px;
    color: var(--text-muted);
    font-variant-numeric: tabular-nums;
  }

  .mark {
    position: absolute;
    top: 0;
    padding-left: 4px;
    border-left: 1px solid var(--text-faint);
    white-space: nowrap;
  }

  .mark.last {
    padding: 0 4px 0 0;
    border-left: 0;
    border-right: 1px solid var(--text-faint);
    transform: translateX(-100%);
  }

  .top {
    position: relative;
  }

  .pill {
    position: absolute;
    left: 50%;
    top: 50%;
    transform: translate(-50%, -50%);
    display: flex;
    align-items: baseline;
    gap: 8px;
    padding: 3px 16px 4px;
    overflow: hidden;
    border-radius: 99px;
    border: 1.5px solid color-mix(in srgb, var(--c) 75%, transparent);
    background: color-mix(in srgb, var(--c) 16%, transparent);
    text-shadow: 0 1px 2px rgba(0, 0, 0, 0.5);
  }

  /* Fills with the segment's colour as it goes, like the talk bar for the whole talk. */
  .pill-fill {
    position: absolute;
    left: 0;
    top: 0;
    bottom: 0;
    background: color-mix(in srgb, var(--c) 48%, transparent);
  }

  .pill.over {
    border-color: var(--warn);
  }

  .pill.over .pill-fill {
    background: color-mix(in srgb, var(--warn) 40%, transparent);
  }

  .pill.over .big,
  .pill.wrap .big {
    color: var(--warn);
  }

  .pill .big,
  .pill small {
    position: relative;
  }

  .pill small {
    font-size: 12px;
    font-weight: 600;
    color: var(--text-muted);
  }

  .clock {
    display: inline-flex;
    align-items: center;
    gap: 7px;
    font-size: 22px;
    font-weight: 720;
  }

  .clock svg {
    width: 19px;
    height: 19px;
    fill: none;
    stroke: currentColor;
    stroke-width: 2.2;
    stroke-linecap: round;
    opacity: 0.8;
  }

  .clock.late {
    color: var(--late);
  }

  .chip {
    flex: none;
    padding: 1px 9px;
    border: 1.5px solid currentColor;
    border-radius: 99px;
    background: rgba(14, 17, 23, 0.95);
    font-size: 12px;
    font-weight: 750;
    white-space: nowrap;
  }

  /* The talk bar with late or early at its end. */
  .talk-row {
    flex: none;
    display: flex;
    align-items: center;
    gap: 8px;
    /* As tall with the chip as without (Ready has none), so nothing moves when the talk starts. */
    min-height: 22px;
  }

  .talk-bar {
    position: relative;
    display: block;
    flex: 1;
    width: 100%;
    height: 8px;
    margin: 0;
    padding: 0;
    border: 0;
    border-radius: 4px;
    overflow: hidden;
    background: rgba(255, 255, 255, 0.12);
  }

  /* The talk's planned time has gone: red and hatched, so not by colour alone. */
  .talk-bar.over {
    background-color: var(--late);
    background-image: var(--stripes);
  }

  /* The ring's height for either picture, so switching doesn't move the timeline below. */
  .indicator {
    display: inline-flex;
    align-items: center;
    height: 30px;
  }

  .playhead {
    position: absolute;
    top: -6px;
    bottom: -6px;
    width: 2px;
    margin-left: -1px;
    border-radius: 2px;
    background: #fff;
    box-shadow:
      0 0 0 1px rgba(0, 0, 0, 0.35),
      0 0 8px rgba(255, 255, 255, 0.7);
  }

  /* ---- Blocks with the Light panel: dark marks on the light panel ---- */
  /* Dark names: the blocks ahead are pale on the light panel. */
  /* ---- Waveform (ADR 0029): one ink only, white or black (--ink, --paper in overlay.css); one signal colour as a segment ends ---- */
  .waveform .seg {
    font-weight: 650;
  }

  .waveform .big {
    font-weight: 700;
  }

  .waveform .clock {
    font-weight: 650;
  }

  /* The pill: a white outline that fills with a shade of white as the segment goes. */
  .waveform .pill {
    border: 0;
    background: none;
    box-shadow: inset 0 0 0 2px var(--pill, rgb(var(--ink)));
  }

  .waveform .pill-fill {
    background: rgba(var(--ink), 0.26);
  }

  .waveform .pill small {
    color: rgba(var(--ink), 0.72);
    white-space: nowrap;
  }

  /* The last 30 seconds: a ring in the signal colour. */
  .waveform .pill.wrap {
    --pill: var(--warn);
    box-shadow:
      inset 0 0 0 2px var(--warn),
      0 0 0 2px rgb(var(--paper)),
      0 0 0 4px var(--warn);
  }

  /* Over: the pill fills with the signal colour, black on it, and pulses. */
  .waveform .pill.over {
    --pill: var(--warn);
    background: var(--warn);
    text-shadow: none;
    box-shadow:
      inset 0 0 0 2px var(--warn),
      0 0 0 2px rgb(var(--paper)),
      0 0 0 4px var(--warn);
    animation: pill-pulse 1.8s ease-in-out infinite;
  }

  .waveform .pill.over .pill-fill {
    display: none;
  }

  .waveform .pill.over .big,
  .waveform .pill.over small {
    color: #000;
  }

  @keyframes pill-pulse {
    50% {
      opacity: 0.7;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .waveform .pill.over {
      animation: none;
    }
  }

  /* Late is black on white; early a plain word. */
  .standing {
    font-weight: 700;
  }

  .standing.late {
    padding: 0 7px;
    border-radius: 99px;
    background: rgb(var(--ink));
    color: rgb(var(--paper));
    text-shadow: none;
  }

  .standing.early,
  .standing.on-time {
    color: rgba(var(--ink), 0.8);
  }

  .waveform .pill.over .standing.late {
    background: #000;
    color: var(--warn);
  }

  .waveform .pill.over .standing.early,
  .waveform .pill.over .standing.on-time {
    color: #000;
  }

  /* The talk's planned time has gone: the clock turns over, black on white. */
  .waveform .clock.late {
    padding: 1px 11px 1px 8px;
    border-radius: 99px;
    background: rgb(var(--ink));
    color: rgb(var(--paper));
    text-shadow: none;
  }

  .waveform .paused-cover {
    border: 0;
    background: rgb(var(--ink));
    color: rgb(var(--paper));
    text-shadow: none;
    box-shadow: 0 0 0 1px rgb(var(--paper));
  }

  .start-cover {
    font: inherit;
    font-size: 22px;
    font-weight: 750;
    cursor: pointer;
  }

  .start-cover:hover {
    background: rgba(var(--ink), 0.82);
  }

  .sine-box {
    min-height: 40px;
  }

  .wave.dim {
    opacity: 0.45;
  }

  .waveform .ruler {
    color: rgba(var(--ink), 0.42);
  }

  .waveform .mark {
    border-color: rgba(var(--ink), 0.3);
  }

  .mark.named {
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .mark.named b {
    margin-left: 4px;
    font-weight: 600;
    color: rgba(var(--ink), 0.62);
  }

  /* Looking back: the wave is held, not dragged. */
  .sine-box {
    cursor: ew-resize;
    touch-action: none;
  }

  .peek {
    position: absolute;
    bottom: -17px;
    z-index: 4;
    transform: translateX(-50%);
    padding: 0 9px;
    border-radius: 99px;
    background: rgb(var(--ink));
    color: rgb(var(--paper));
    box-shadow: 0 0 0 1.5px rgb(var(--paper));
    font-size: 11px;
    font-weight: 700;
    line-height: 17px;
    white-space: nowrap;
    text-shadow: none;
    pointer-events: none;
  }
</style>
