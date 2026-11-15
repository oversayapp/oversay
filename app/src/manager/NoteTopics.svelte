<script lang="ts">
  // A quick note's Edit tab: one card per
  // topic, its points typed like a list. Enter adds a point (splitting at the cursor), Tab makes it
  // a sub-point and Shift+Tab a point again, Backspace on an empty point removes it, and the arrow
  // keys move between points. Lines the editor doesn't show are listed, read-only, where they are.
  // The deck editor uses it too, where a topic is a card with a kind beside its time.
  import { tick } from 'svelte'
  import {
    addTopic,
    endOfTopic,
    insertPoint,
    parseTopicTime,
    pointsOf,
    removePoint,
    removeTopic,
    setPointDepth,
    setPointText,
    setTopic,
    topicTimeText,
    type NoteDoc,
    type PointItem,
    type Topic,
  } from '../lib/notes/format'
  import { SEGMENT_KINDS, type SegmentKind } from '../lib/project/types'
  import { logAction } from '../lib/log'
  import { count } from '../lib/words'
  import ConfirmDelete from './ConfirmDelete.svelte'
  import Icon from './Icon.svelte'

  let {
    doc,
    noteName,
    onchange,
    current = $bindable(0),
    word = 'topic',
    kinds = false,
  }: {
    doc: NoteDoc
    noteName: string
    onchange: (doc: NoteDoc) => void
    current?: number
    /** What a topic is called: `card` in a deck. */
    word?: 'topic' | 'card'
    /** Each topic has a kind (`[3m, demo]`), shown by its colour and chosen beside its time. */
    kinds?: boolean
  } = $props()

  const Word = $derived(word[0].toUpperCase() + word.slice(1))

  let box: HTMLElement | undefined = $state()
  let removing = $state<number | null>(null)

  // The lines before the first topic show as a card only when they hold points.
  const cards = $derived(doc.topics.map((topic, t) => ({ topic, t })).filter(({ topic, t }) => t > 0 || pointsOf(topic).length > 0))

  /** Puts the cursor in the field `key` once the change has rendered: at its start, its end, or all selected. */
  async function focus(key: string, caret: 'start' | 'end' | 'all' = 'end') {
    await tick()
    const el = box?.querySelector<HTMLInputElement>(`[data-f="${key}"]`)
    if (!el) return
    el.focus()
    if (caret === 'all') el.select()
    else {
      const at = caret === 'start' ? 0 : el.value.length
      el.setSelectionRange(at, at)
    }
  }

  const timeText = (topic: Topic) => topicTimeText(topic.time).replace(/^ \[|\]$/g, '')

  /** A point's last sub-point, so a new point after it goes below them. */
  function pointEnd(topic: Topic, i: number): number {
    let end = i
    while (topic.items[end + 1]?.kind === 'point' && (topic.items[end + 1] as PointItem).depth === 1) end++
    return end
  }

  function onPointKey(e: KeyboardEvent & { currentTarget: HTMLInputElement }, t: number, i: number, p: PointItem) {
    if (e.isComposing) return
    const topic = doc.topics[t]
    const input = e.currentTarget
    if (e.key === 'Enter') {
      e.preventDefault()
      const at = input.selectionStart ?? input.value.length
      const before = input.value.slice(0, at)
      const rest = input.value.slice(input.selectionEnd ?? at)
      let next = rest === '' ? doc : setPointText(doc, t, i, before)
      const after = p.depth === 0 && rest === '' ? pointEnd(topic, i) : i
      const added = insertPoint(next, t, after, p.depth, rest)
      next = added.doc
      onchange(next)
      focus(`${t}:${added.index}`, 'start')
    } else if (e.key === 'Tab') {
      e.preventDefault()
      onchange(setPointDepth(doc, t, i, e.shiftKey ? 0 : 1))
      focus(`${t}:${i}`)
    } else if (e.key === 'Backspace' && input.value === '') {
      e.preventDefault()
      const previous = topic.items.slice(0, i).findLastIndex((x) => x.kind === 'point')
      onchange(removePoint(doc, t, i))
      focus(previous >= 0 ? `${t}:${previous}` : t > 0 ? `name:${t}` : '')
    } else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      const fields = [...(box?.querySelectorAll<HTMLInputElement>('input[data-f]') ?? [])]
      const next = fields[fields.indexOf(input) + (e.key === 'ArrowUp' ? -1 : 1)]
      if (next) {
        e.preventDefault()
        next.focus()
      }
    }
  }

  function firstPoint(t: number) {
    const topic = doc.topics[t]
    const first = topic.items.findIndex((x) => x.kind === 'point')
    if (first >= 0) return focus(`${t}:${first}`)
    const added = insertPoint(doc, t, endOfTopic(topic), 0)
    onchange(added.doc)
    focus(`${t}:${added.index}`)
  }

  function addPoint(t: number) {
    const added = insertPoint(doc, t, endOfTopic(doc.topics[t]), 0)
    onchange(added.doc)
    focus(`${t}:${added.index}`)
  }

  function newTopic() {
    logAction(`${word === 'card' ? 'deck' : 'note'} add ${word}`)
    const added = addTopic(doc, doc.topics.length - 1, `New ${word}`)
    onchange(added.doc)
    current = added.index
    focus(`name:${added.index}`, 'all')
  }

  function setTime(t: number, input: HTMLInputElement) {
    const value = input.value.trim().replace(/^\[|\]$/g, '')
    const topic = doc.topics[t]
    if (value === '') {
      onchange(setTopic(doc, t, { time: null }))
      return
    }
    const parsed = parseTopicTime(value)
    if (parsed?.time) onchange(setTopic(doc, t, { time: parsed.time }))
    else input.value = timeText(topic)
  }
</script>

<div class="topics" bind:this={box}>
  {#each cards as { topic, t } (t)}
    <section
      class="topic"
      class:cur={current === t}
      class:kinded={kinds}
      style:--k={kinds ? `var(--k-${topic.segmentKind ?? 'topic'})` : null}
      onfocusin={() => (current = t)}
    >
      <div class="th">
        <span class="tnum">{cards.findIndex((c) => c.t === t) + 1}</span>
        {#if t === 0}
          <span class="tname lead">{noteName}</span>
        {:else}
          <input
            class="tname"
            data-f="name:{t}"
            value={topic.name}
            aria-label="{Word} name"
            placeholder={Word}
            oninput={(e) => onchange(setTopic(doc, t, { name: e.currentTarget.value }))}
            onkeydown={(e) => {
              if (e.key === 'Enter' && !e.isComposing) {
                e.preventDefault()
                firstPoint(t)
              }
            }}
          />
          <input
            class="ttime"
            value={timeText(topic)}
            aria-label="Time for {topic.name}"
            title="About how long: 5m, 30s, ~5m, 1:30 or open"
            placeholder={kinds ? 'no time' : 'time'}
            onchange={(e) => setTime(t, e.currentTarget)}
          />
          {#if kinds}
            <select
              class="tkind"
              value={topic.segmentKind ?? 'topic'}
              aria-label="Kind of {topic.name}"
              onchange={(e) => {
                const kind = e.currentTarget.value as SegmentKind
                onchange(setTopic(doc, t, { segmentKind: kind === 'topic' ? null : kind }))
              }}
            >
              {#each SEGMENT_KINDS as kind (kind)}<option value={kind}>{kind[0].toUpperCase() + kind.slice(1)}</option>{/each}
            </select>
          {/if}
          <button class="ibtn" title="Remove {word}…" aria-label="Remove {word} {topic.name}…" onclick={() => (removing = t)}><Icon name="trash" size={15} /></button>
        {/if}
      </div>
      {#if removing === t}
        <div class="confirm">
          <ConfirmDelete
            label="Remove"
            onconfirm={() => {
              removing = null
              logAction(`${word === 'card' ? 'deck' : 'note'} remove ${word}`)
              onchange(removeTopic(doc, t))
              current = Math.max(0, t - 1)
            }}
            oncancel={() => (removing = null)}>Remove “{topic.name || Word}” and its {count(pointsOf(topic).length, 'point')}?</ConfirmDelete
          >
        </div>
      {/if}
      <div class="pts">
        {#each topic.items as item, i (i)}
          {#if item.kind === 'point'}
            <div class="pl" class:sub={item.depth === 1}>
              <span class="bul" aria-hidden="true">{item.depth === 1 ? '–' : '•'}</span>
              <input
                data-f="{t}:{i}"
                value={item.text}
                aria-label={item.depth === 1 ? 'Sub-point' : 'Point'}
                placeholder={item.depth === 1 ? 'Sub-point' : 'Point'}
                oninput={(e) => onchange(setPointText(doc, t, i, e.currentTarget.value))}
                onkeydown={(e) => onPointKey(e, t, i, item)}
              />
            </div>
          {:else if item.line.trim() !== ''}
            <div class="kept" title="Kept as written; not shown on screen">{item.line.replace(/\r?\n$/, '')}</div>
          {/if}
        {/each}
      </div>
      <button class="add" onclick={() => addPoint(t)}><Icon name="plus" size={14} /> Add point</button>
    </section>
  {/each}
  <button class="addtopic" onclick={newTopic}><Icon name="plus" size={16} /> Add {word}</button>
  <p class="keys muted">Enter adds a point · Tab makes a sub-point · Shift+Tab undoes it · Backspace on an empty point removes it</p>
</div>

<style>
  .topic {
    border: 1px solid var(--line);
    border-radius: 14px;
    background: var(--card);
    padding: 10px 12px 8px;
    margin-bottom: 10px;
  }

  .topic.cur {
    border-color: color-mix(in srgb, var(--accent) 55%, var(--line));
  }

  /* A deck's card: its kind's colour down its left edge, as on the flashcard widget. */
  .topic.kinded {
    border-left: 3px solid var(--k);
  }

  .tkind {
    width: auto;
    font-size: 13px;
    padding: 3px 6px;
    color: var(--muted);
  }

  .th {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .tnum {
    width: 24px;
    height: 24px;
    border-radius: 7px;
    background: var(--c-note-bg);
    color: var(--c-note);
    font-weight: 700;
    font-size: 12.5px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex: none;
  }

  .tname {
    flex: 1;
    min-width: 0;
    border: 1px solid transparent;
    background: none;
    border-radius: 7px;
    padding: 4px 6px;
    font-weight: 650;
    font-size: 15.5px;
  }

  .tname.lead {
    padding: 5px 7px;
  }

  input.tname:hover,
  input.tname:focus,
  .ttime:hover,
  .ttime:focus {
    border-color: var(--line-strong);
    background: var(--bg);
  }

  .ttime {
    width: 74px;
    border: 1px solid transparent;
    background: none;
    border-radius: 7px;
    padding: 4px 6px;
    font-size: 13px;
    color: var(--muted);
    text-align: right;
  }

  .ibtn {
    border: 0;
    background: none;
    padding: 5px;
    color: var(--faint);
    display: inline-flex;
  }

  .confirm {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
    margin: 6px 0 0 30px;
  }

  .pts {
    margin: 4px 0 0 30px;
  }

  .pl {
    display: grid;
    grid-template-columns: 14px minmax(0, 1fr);
    align-items: center;
    gap: 4px;
  }

  .pl.sub {
    margin-left: 22px;
  }

  .bul {
    color: var(--faint);
    text-align: center;
  }

  .pl input {
    border: 1px solid transparent;
    background: none;
    border-radius: 7px;
    padding: 4px 6px;
    width: 100%;
  }

  .pl input:hover {
    background: var(--hover);
  }

  .pl input:focus {
    border-color: var(--line-strong);
    background: var(--bg);
  }

  .pl.sub input {
    font-size: 13.5px;
    color: var(--muted);
  }

  .kept {
    margin: 2px 0 2px 18px;
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    font-size: 12px;
    color: var(--faint);
    white-space: pre-wrap;
    overflow-wrap: anywhere;
  }

  .add {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    border: 0;
    background: none;
    color: var(--accent-text);
    font-weight: 600;
    padding: 4px 6px;
    margin-left: 30px;
    font-size: 13px;
  }

  .addtopic {
    display: inline-flex;
    align-items: center;
    gap: 6px;
  }

  .keys {
    font-size: 12px;
    margin: 10px 0 0;
  }
</style>
