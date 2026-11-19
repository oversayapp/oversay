<script lang="ts">
  // The Talking Points overlay (spec §8): one
  // minimalist panel with the current segment's name, its points numbered and its hints muted, in
  // the look chosen as its panel, Dark or Light. Its text size and Shows (This part / Every part)
  // went with the Timeline in Control Panel v2 (epic 030).
  import Note from '../../lib/markdown-ui/Note.svelte'
  import { formatDuration } from '../../lib/project/duration'
  import { sessionClock } from '../../lib/session/clock'
  import Icon from '../../manager/Icon.svelte'
  import { talkingPointsModel } from './model'
  import type { PluginContext } from '../types'

  let { ctx }: { ctx: PluginContext } = $props()
  const session = $derived(ctx.session)
  const model = $derived(talkingPointsModel($session))
  const seg = $derived(model.segment)
  // A quick note shown on screen: a clock counting up, and Previous / Next topic.
  const note = $derived($session?.note === true)
  const now = $derived(ctx.now)
  const elapsed = $derived(note && $session ? sessionClock($session, $now).inTalk : 0)
  // The look: a dark or a light panel.
  const look = $derived(ctx.settings)

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

<div class="overlay-panel tp" class:light={$look.panel === 'light'}>
  {#if model.status === 'none'}
    <div class="head"><span class="name">Talking Points</span></div>
    <p class="quiet">No session</p>
  {:else if model.status === 'finished' || !seg}
    <div class="head"><span class="name">{model.talkName ?? 'Talking Points'}</span></div>
    <p class="quiet">Finished</p>
  {:else}
    <div class="head">
      <span class="name" title={seg.name}>{model.status === 'ready' ? 'Starts with · ' : ''}{seg.name}</span>
      <span class="pos num">{#if note}<span class="clock">{formatDuration(elapsed)}</span>{' · '}{/if}{model.position} of {model.count}</span>
    </div>
    <div class="body" class:more bind:this={body} onscroll={measure}>
      {#if seg.points.length === 0 && seg.hints.length === 0}
        <p class="quiet">No notes for this segment</p>
      {:else}
        {#if seg.points.length > 0}
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

  .tp {
    --pt-size: 16px;
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
