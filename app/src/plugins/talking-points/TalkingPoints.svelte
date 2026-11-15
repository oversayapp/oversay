<script lang="ts">
  // The Talking Points overlay (spec §8): one
  // minimalist panel with the current segment's name, its points numbered and its hints muted, in
  // the look chosen as its panel, Dark or Light; with the waveform style it takes its look (a frame
  // of one colour on its opposite).
  // No clock, no buttons, no next segment: the Timeline says those.
  import Note from '../../lib/markdown-ui/Note.svelte'
  import { formatDuration } from '../../lib/project/duration'
  import { sessionClock } from '../../lib/session/clock'
  import Icon from '../../manager/Icon.svelte'
  import { talkingPointsModel } from './model'
  import type { PluginContext } from '../types'

  let { ctx }: { ctx: PluginContext } = $props()
  const session = $derived(ctx.session)
  const lookBack = $derived(ctx.lookBack)
  const model = $derived(talkingPointsModel($session, $lookBack))
  const seg = $derived(model.segment)
  // A quick note shown on screen: a clock counting up, and Previous / Next topic.
  const note = $derived($session?.note === true)
  const now = $derived(ctx.now)
  const elapsed = $derived(note && $session ? sessionClock($session, $now).inTalk : 0)
  // The look: dark or light panel, text size, and this part or every part.
  const look = $derived(ctx.settings)
  const every = $derived($look.layout === 'all' && model.status === 'running' && !!$session)
  const parts = $derived(
    every && $session
      ? $session.plan.map((p, i) => ({ name: p.name, current: i === model.position - 1, done: i < model.position - 1 }))
      : [],
  )

  // A long list scrolls inside the panel: a fade at the bottom while there is more below,
  // and back to the top whenever the segment changes.
  let body: HTMLElement | undefined = $state()
  let more = $state(false)
  const measure = () => {
    if (body) more = body.scrollTop + body.clientHeight < body.scrollHeight - 2
  }
  $effect(() => {
    void model.position
    if (!body) return
    body.scrollTop = 0
    measure()
  })
  $effect(() => {
    if (!body) return
    const watch = new ResizeObserver(measure)
    watch.observe(body)
    return () => watch.disconnect()
  })
</script>

<div class="overlay-panel tp size-{$look.textSize}" class:light={$look.panel === 'light'} class:waveform={$look.timelineStyle === 'waveform'}
  class:ink-light={$look.timelineStyle === 'waveform' && $look.panel === 'light'}
>
  {#if model.status === 'none'}
    <div class="head"><span class="name">Talking Points</span></div>
    <p class="quiet">No session</p>
  {:else if (model.status === 'finished' && !model.looking) || !seg}
    <div class="head"><span class="name">{model.talkName ?? 'Talking Points'}</span></div>
    <p class="quiet">Finished</p>
  {:else}
    <div class="head">
      <span class="name" title={seg.name}>{model.looking ? 'Looking at · ' : model.status === 'ready' ? 'Starts with · ' : ''}{seg.name}</span>
      <span class="pos num">{#if note}<span class="clock">{formatDuration(elapsed)}</span>{' · '}{/if}{model.position} of {model.count}</span>
    </div>
    <div class="body" class:more bind:this={body} onscroll={measure}>
      {#if seg.points.length === 0 && seg.hints.length === 0 && !every}
        <p class="quiet">No notes for this segment</p>
      {:else}
        {#if every}
          <!-- Every part, the current one open with its points (Shows: Every part). -->
          <ul class="parts">
            {#each parts as part, i (i)}
              <li class:current={part.current} class:done={part.done}>
                <span class="pname">{part.name}</span>
                {#if part.current && seg.points.length > 0}
                  <ol>
                    {#each seg.points as point, j (j)}<li><Note text={point} /></li>{/each}
                  </ol>
                {/if}
              </li>
            {/each}
          </ul>
        {:else if seg.points.length > 0}
          <ol>
            {#each seg.points as point, i (i)}<li><Note text={point} /></li>{/each}
          </ol>
        {/if}
        {#each seg.hints as hint, i (i)}<div class="hint"><Note text={hint} /></div>{/each}
      {/if}
    </div>
    {#if note}
      <div class="topics" role="toolbar" aria-label="Topics">
        <button disabled={model.position <= 1} onclick={ctx.commands.previous}><Icon name="back" size={13} /> Previous topic</button>
        <button disabled={model.position >= model.count} onclick={ctx.commands.next}>Next topic <Icon name="arrow" size={13} /></button>
      </div>
    {/if}
  {/if}
</div>

<style>
  /* A light panel, for a dark slide: the same alpha, dark text. */
  .tp.light {
    --panel-bg: rgba(248, 249, 252, var(--panel-alpha));
    --panel-border: rgba(20, 30, 50, 0.14);
    --text: #1a2130;
    --text-muted: rgba(26, 33, 48, 0.66);
    --text-faint: rgba(26, 33, 48, 0.46);
    color: var(--text);
    text-shadow: none;
  }

  /* Waveform (ADR 0029): white only, on solid
     black by default, inside a 4 px white frame with 20 px corners and a dark keyline outside it,
     so the frame keeps its edge on a white slide; the Light panel swaps the two (.ink-light). The keyline needs a pixel of the transparent
     window around the panel. White comes at four strengths: 100% now, 62% labels, 42% numbers. */
  .tp.waveform {
    --panel-bg: rgba(var(--paper), var(--panel-alpha));
    --panel-border: rgba(var(--ink), 0.2);
    --text: rgb(var(--ink));
    --text-muted: rgba(var(--ink), 0.62);
    --text-faint: rgba(var(--ink), 0.42);
    color: var(--text);
    height: calc(100% - 2px);
    margin: 1px;
    border: 4px solid rgb(var(--ink));
    border-radius: 20px;
    box-shadow: 0 0 0 1px rgba(var(--paper), 0.45);
    padding: 12px 16px 0;
  }

  .tp.waveform .head {
    font-size: 14px;
    color: var(--text);
  }

  .tp.waveform .hint {
    padding-top: 9px;
    border-top: 1px solid var(--panel-border);
  }

  .tp.waveform .parts > li.current {
    border-left-color: var(--text);
  }

  .tp.waveform .topics {
    border-top: 0;
    gap: 8px;
    padding: 4px 0 10px;
  }

  .tp.waveform .topics button {
    flex: 1;
    justify-content: center;
    height: 28px;
    border: 2px solid rgb(var(--ink));
    border-radius: 99px;
    opacity: 1;
  }

  .tp.waveform .topics button:disabled {
    opacity: 0.35;
  }

  /* Next topic is the one to press: filled, black on white. */
  .tp.waveform .topics button:last-child {
    background: rgb(var(--ink));
    color: rgb(var(--paper));
  }

  .tp.waveform .topics button:last-child:hover:not(:disabled) {
    background: rgba(var(--ink), 0.82);
  }

  .tp.size-s {
    --pt-size: 14px;
  }

  .tp.size-m {
    --pt-size: 16px;
  }

  .tp.size-l {
    --pt-size: 19.5px;
  }

  .parts {
    list-style: none;
    margin: 0;
    padding: 0;
  }

  .parts > li {
    padding: 3px 0 3px 10px;
    border-left: 2px solid transparent;
    color: var(--text-faint);
    font-size: calc(var(--pt-size, 16px) * 0.85);
  }

  /* The parts are listed, not numbered: the points in the open one are. */
  .parts > li::before {
    content: none;
  }

  .parts > li.current {
    border-left-color: var(--k-topic);
    color: var(--text);
  }

  .parts > li.current .pname {
    font-weight: 650;
  }

  .parts > li.done .pname {
    text-decoration: line-through;
    text-decoration-color: var(--text-faint);
  }

  .parts ol {
    margin-top: 4px;
    font-size: var(--pt-size, 16px);
  }

  .tp {
    display: flex;
    flex-direction: column;
    padding: 14px 18px 0;
    overflow: hidden;
  }

  .head {
    flex: none;
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    gap: 12px;
    /* Room for the host's close button in the corner. */
    padding-right: 28px;
    font-size: 13px;
    font-weight: 650;
    color: var(--text-muted);
  }

  .name {
    min-width: 0;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .pos {
    flex: none;
    font-weight: 500;
    color: var(--text-faint);
    font-variant-numeric: tabular-nums;
  }

  .body {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    scrollbar-width: thin;
    scrollbar-color: rgba(var(--ink), 0.25) transparent;
    padding: 6px 0 18px;
  }

  .body.more {
    -webkit-mask-image: linear-gradient(#000 calc(100% - 34px), transparent);
    mask-image: linear-gradient(#000 calc(100% - 34px), transparent);
  }

  ol {
    margin: 0;
    padding: 0;
    list-style: none;
    counter-reset: point;
    font-size: var(--pt-size, 16px);
    line-height: 1.42;
  }

  li {
    counter-increment: point;
    position: relative;
    padding-left: 24px;
    margin: 7px 0;
    overflow-wrap: anywhere;
  }

  li::before {
    content: counter(point);
    position: absolute;
    left: 0;
    top: 1.5px;
    color: var(--text-faint);
    font-size: 12.5px;
    font-weight: 700;
    font-variant-numeric: tabular-nums;
  }

  .hint {
    display: block;
    margin: 10px 0 0;
    font-size: 13.5px;
    line-height: 1.4;
    color: var(--text-muted);
    overflow-wrap: anywhere;
  }

  .clock {
    color: var(--text-muted);
    font-weight: 650;
  }

  .topics {
    flex: none;
    display: flex;
    justify-content: space-between;
    gap: 6px;
    border-top: 1px solid var(--panel-border);
    padding: 6px 0 8px;
  }

  .topics button {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    border: 0;
    background: none;
    color: var(--text);
    opacity: 0.85;
    font-size: 12.5px;
    font-weight: 600;
    padding: 4px 6px;
    border-radius: 7px;
    cursor: pointer;
  }

  .topics button:hover:not(:disabled) {
    background: rgba(var(--ink), 0.1);
  }

  .topics button:disabled {
    opacity: 0.35;
    cursor: default;
  }

  .quiet {
    margin: 10px 0 0;
    font-size: 14px;
    color: var(--text-faint);
  }
</style>
