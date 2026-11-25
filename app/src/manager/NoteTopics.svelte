<script lang="ts">
  // A quick note's Edit tab: one card per
  // topic, its points typed like a list. Enter adds a point (splitting at the cursor), Tab makes it
  // a sub-point and Shift+Tab a point again, Backspace on an empty point removes it, and the arrow
  // keys move between points. Lines the editor doesn't show are listed, read-only, where they are.
  // The deck editor uses it too, where a topic is a card with a kind beside its time.
  // A topic with its own heading is dragged into another place by its grip, or moved one place
  // with Alt+↑ / Alt+↓ while the grip has focus. A point is dragged by its own grip, or moved with
  // those keys from the point or its grip, among the points it can trade places with.
  import { onDestroy, tick } from 'svelte'
  import {
    addTopic,
    endOfTopic,
    insertPoint,
    movePoint,
    movePointBy,
    moveTopic,
    moveTopicBy,
    parseTopicTime,
    pointBlockEnd,
    pointSiblings,
    pointsOf,
    removePoint,
    removeTopic,
    setPointDepth,
    setPointText,
    setTopic,
    topicTimeText,
    writeNoteDoc,
    type NoteDoc,
    type PointItem,
    type Topic,
  } from '../lib/notes/format'
  import { SEGMENT_KINDS, type SegmentKind } from '../lib/project/types'
  import { dropIndex } from '../lib/project/lists'
  import { moveStep, edgeScrollStep } from '../lib/decks/reorder'
  import type { Change, Focus } from '../lib/notes/history'
  import { logAction } from '../lib/log'
  import { isMac, shortcutText } from '../lib/session/shortcuts'
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
    /** The cards changed, and how, for undo. */
    onchange: (doc: NoteDoc, how?: Change) => void
    current?: number
    /** What a topic is called: `card` in a deck. */
    word?: 'topic' | 'card'
    /** Each topic has a kind (`[3m, demo]`), shown by its colour and chosen beside its time. */
    kinds?: boolean
  } = $props()

  const Word = $derived(word[0].toUpperCase() + word.slice(1))
  const moveKeys = `${shortcutText('Alt+ArrowUp', isMac())} ${shortcutText('Alt+ArrowDown', isMac())}`

  let box: HTMLElement | undefined = $state()
  let removing = $state<number | null>(null)

  // The lines before the first topic show as a card only when they hold points.
  const cards = $derived(doc.topics.map((topic, t) => ({ topic, t })).filter(({ topic, t }) => t > 0 || pointsOf(topic).length > 0))

  /** Puts the cursor in the field `key` once the change has rendered: at its start, its end, a place in it, or all selected. */
  async function focus(key: string, caret: 'start' | 'end' | 'all' | number = 'end') {
    await tick()
    const el = box?.querySelector<HTMLInputElement>(`[data-f="${key}"]`)
    if (!el) return
    el.focus()
    if (caret === 'all') el.select()
    else {
      const at = typeof caret === 'number' ? caret : caret === 'start' ? 0 : el.value.length
      el.setSelectionRange(at, at)
    }
  }

  /** The field `key` as a place undo can put focus back: the cursor at `select`, or at its end. */
  const inField = (key: string, select: [number, number] | null = null): Focus => ({ field: `[data-f="${key}"]`, select })

  type Selection = [number, number]
  const selectionOf = (input: HTMLInputElement): Selection => [input.selectionStart ?? input.value.length, input.selectionEnd ?? input.value.length]

  /** A move grip, and a field with no key of its own, as places undo can put focus back. */
  const grip = (t: number): Focus => ({ field: `[data-grip="${t}"]`, select: null })
  const pointGrip = (t: number, i: number): Focus => ({ field: `[data-pgrip="${t}:${i}"]`, select: null })
  const control = (t: number, name: 'ttime' | 'tkind'): Focus => ({ field: `[data-card="${t}"] .${name}`, select: null })

  /** What was selected before the keystroke under way, in the field it is typed in. */
  let selected: Selection = [0, 0]

  /** A keystroke in the field `key` of card `t`: a run of them is undone in one step. */
  function typed(doc: NoteDoc, t: number, key: string, input: HTMLInputElement) {
    onchange(doc, { what: 'typing', card: t, before: inField(key, selected), after: inField(key, selectionOf(input)) })
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
    const step = moveStep(e)
    if (step !== null) {
      e.preventDefault()
      if (!drag) keyMovePoint(t, i, step, input.selectionStart ?? input.value.length)
    } else if (e.key === 'Enter') {
      e.preventDefault()
      const cut = input.selectionStart ?? input.value.length
      const before = input.value.slice(0, cut)
      const rest = input.value.slice(input.selectionEnd ?? cut)
      let next = rest === '' ? doc : setPointText(doc, t, i, before)
      const after = p.depth === 0 && rest === '' ? pointEnd(topic, i) : i
      const added = insertPoint(next, t, after, p.depth, rest)
      next = added.doc
      onchange(next, { card: t, before: inField(`${t}:${i}`, selectionOf(input)), after: inField(`${t}:${added.index}`, [0, 0]) })
      focus(`${t}:${added.index}`, 'start')
    } else if (e.key === 'Tab') {
      e.preventDefault()
      const kept = inField(`${t}:${i}`, selectionOf(input))
      onchange(setPointDepth(doc, t, i, e.shiftKey ? 0 : 1), { card: t, before: kept, after: kept })
      focus(`${t}:${i}`)
    } else if (e.key === 'Backspace' && input.value === '') {
      e.preventDefault()
      deletePoint(t, i)
    } else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      const fields = [...(box?.querySelectorAll<HTMLInputElement>('input[data-f]') ?? [])]
      const next = fields[fields.indexOf(input) + (e.key === 'ArrowUp' ? -1 : 1)]
      if (next) {
        e.preventDefault()
        next.focus()
      }
    }
  }

  /** Removes a point, and puts the cursor at the end of the one before, or in the card's name. */
  function deletePoint(t: number, i: number) {
    const previous = doc.topics[t].items.slice(0, i).findLastIndex((x) => x.kind === 'point')
    refused = ''
    const next = previous >= 0 ? `${t}:${previous}` : t > 0 ? `name:${t}` : ''
    onchange(removePoint(doc, t, i), { what: 'delete-point', card: t, before: inField(`${t}:${i}`), after: next ? inField(next) : undefined })
    focus(next)
  }

  /** Alt+↑ / Alt+↓ on a point or its grip: one place among its siblings, with focus, and the cursor, kept. */
  async function keyMovePoint(t: number, i: number, step: -1 | 1, caret: number | 'grip') {
    const siblings = pointSiblings(doc.topics[t], i)
    const to = siblings.indexOf(i) + step
    // The first and last stay where they are.
    if (to < 0 || to >= siblings.length) return
    const moved = movePointBy(doc, t, i, step)
    const place = (n: number) => (caret === 'grip' ? pointGrip(t, n) : inField(`${t}:${n}`, [caret, caret]))
    const how = { card: t, before: place(i), after: place(moved.index) }
    if (await pointMoved(moved, 'keyboard', `card=${t} item=${i} to=${moved.index} check=epic-042/V2`, how)) {
      if (caret === 'grip') focusPointGrip(t, moved.index)
      else focus(`${t}:${moved.index}`, caret)
    }
  }

  function onPointGripKey(e: KeyboardEvent, t: number, i: number) {
    const step = moveStep(e)
    if (step === null || drag) return
    e.preventDefault()
    keyMovePoint(t, i, step, 'grip')
  }

  /** Writes a point's move, or says why it didn't happen; true when it moved. */
  async function pointMoved(moved: { doc: NoteDoc; index: number }, by: 'keyboard' | 'drag', ids: string, how: Change): Promise<boolean> {
    if (moved.doc === doc) {
      logAction('deck.point_move_refused', `by=${by} ${ids}`)
      await refuse('That point can’t move there: a line would read as part of the point above it. Change it in Markdown.')
      return false
    }
    refused = ''
    logAction('deck.point_moved', `by=${by} ${ids}`)
    onchange(moved.doc, how)
    return true
  }

  /** Says why a move didn't happen. The note is after the last card, which may be below the fold. */
  async function refuse(why: string) {
    refused = why
    await tick()
    box?.querySelector('.refused')?.scrollIntoView({ block: 'nearest' })
  }

  function firstPoint(t: number) {
    const topic = doc.topics[t]
    const first = topic.items.findIndex((x) => x.kind === 'point')
    if (first >= 0) return focus(`${t}:${first}`)
    const added = insertPoint(doc, t, endOfTopic(topic), 0)
    onchange(added.doc, { card: t, before: inField(`name:${t}`), after: inField(`${t}:${added.index}`) })
    focus(`${t}:${added.index}`)
  }

  function addPoint(t: number) {
    const added = insertPoint(doc, t, endOfTopic(doc.topics[t]), 0)
    onchange(added.doc, { card: t, after: inField(`${t}:${added.index}`) })
    focus(`${t}:${added.index}`)
  }

  function newTopic() {
    logAction(`${word === 'card' ? 'deck' : 'note'} add ${word}`)
    const added = addTopic(doc, doc.topics.length - 1, `New ${word}`)
    const name = added.doc.topics[added.index].name
    onchange(added.doc, { card: current, to: added.index, after: inField(`name:${added.index}`, [0, name.length]) })
    current = added.index
    focus(`name:${added.index}`, 'all')
  }

  /** A point being dragged: its topic, its index there, and its siblings' indexes (`pointSiblings`). */
  type DraggedPoint = { t: number; i: number; siblings: number[] }

  // Reordering (pointer events, ADR 0010): what is dragged and where it would land, counted as
  // moveTopic counts topics, or movePoint a point's siblings (`point` set). The text is kept to
  // tell if the file changed under the drag.
  let drag = $state<{ pointer: number; point: DraggedPoint | null; from: number; position: number; text: string } | null>(null)
  /** Why the last move didn't happen. */
  let refused = $state('')
  let pointerY = 0
  let frame = 0
  let view: HTMLElement | null = null
  let scrolledTo = 0

  const dragMoves = $derived(drag !== null && drag.position !== drag.from && drag.position !== drag.from + 1)

  /**
   * The insertion position under the pointer. Only topics with a heading have places between them;
   * a point has places only among its siblings, and the card drag never measures a point's rows.
   */
  function positionAt(y: number, point: DraggedPoint | null): number {
    const middle = (top: Element | null | undefined, bottom: Element | null | undefined = top) =>
      top && bottom ? (top.getBoundingClientRect().top + bottom.getBoundingClientRect().bottom) / 2 : 0
    if (!point) return 1 + dropIndex([...(box?.querySelectorAll('[data-card]') ?? [])].map((card) => middle(card)), y)
    const row = (n: number) => box?.querySelector(`[data-point="${point.t}:${n}"]`)
    return dropIndex(
      point.siblings.map((n) => middle(row(n), row(pointBlockEnd(doc.topics[point.t], n)))),
      y,
    )
  }

  /** Where the drop line goes beside point row `i` of topic `t`, while a point is dragged. */
  function pointDrop(t: number, i: number): 'before' | 'after' | null {
    const point = drag?.point
    if (!dragMoves || !drag || !point || point.t !== t) return null
    if (point.siblings[drag.position] === i) return 'before'
    const last = point.siblings.at(-1)!
    return drag.position === point.siblings.length && i === pointBlockEnd(doc.topics[t], last) ? 'after' : null
  }

  /** Whether point row `i` of topic `t` is being dragged: the point or one of its sub-points. */
  const pointDragged = (t: number, i: number) => !!drag?.point && drag.point.t === t && i >= drag.point.i && i <= pointBlockEnd(doc.topics[t], drag.point.i)

  /** The nearest part of the page that scrolls the cards. */
  function scroller(): HTMLElement | null {
    for (let el = box?.parentElement ?? null; el; el = el.parentElement) {
      if (/auto|scroll/.test(getComputedStyle(el).overflowY) && el.scrollHeight > el.clientHeight) return el
    }
    return null
  }

  function followPointer() {
    if (drag) drag = { ...drag, position: positionAt(pointerY, drag.point) }
  }

  // Each frame of a drag: what is held near the top or bottom edge scrolls the cards under it, and
  // however they scrolled (the wheel too), the place under the pointer is found again.
  function followScroll() {
    if (!drag) return
    if (view) {
      const box = view.getBoundingClientRect()
      const step = edgeScrollStep(pointerY, box.top, box.bottom)
      // Written only at an edge: writing it every frame would cut off a trackpad's momentum.
      if (step) view.scrollTop += step
      if (view.scrollTop !== scrolledTo) {
        scrolledTo = view.scrollTop
        followPointer()
      }
    }
    frame = requestAnimationFrame(followScroll)
  }

  /** Starts dragging topic `t`, or its point `i`. */
  function startDrag(e: PointerEvent & { currentTarget: HTMLButtonElement }, t: number, i?: number) {
    if (e.button !== 0 || drag) return
    e.preventDefault()
    e.currentTarget.focus({ preventScroll: true })
    try {
      e.currentTarget.setPointerCapture(e.pointerId)
    } catch {
      // No capture for this pointer: the drag still follows its moves.
    }
    refused = ''
    pointerY = e.clientY
    view = scroller()
    scrolledTo = view?.scrollTop ?? 0
    const point = i === undefined ? null : { t, i, siblings: pointSiblings(doc.topics[t], i) }
    const from = point ? point.siblings.indexOf(point.i) : t
    drag = { pointer: e.pointerId, point, from, position: positionAt(pointerY, point), text: writeNoteDoc(doc) }
    frame = requestAnimationFrame(followScroll)
  }

  // The pointer is followed on the window: the grip can be gone before the card is let go.
  function dragTo(e: PointerEvent) {
    if (drag?.pointer !== e.pointerId) return
    pointerY = e.clientY
    followPointer()
  }

  function letGo(e: PointerEvent, commit: boolean) {
    if (drag?.pointer === e.pointerId) endDrag(commit)
  }

  function endDrag(commit: boolean) {
    const d = drag
    drag = null
    cancelAnimationFrame(frame)
    // A drop where the card already is changes nothing.
    if (!commit || !d || d.position === d.from || d.position === d.from + 1) return
    // The position counts what was there: if the file changed outside Oversay while it was held,
    // nothing moves.
    if (writeNoteDoc(doc) !== d.text) return
    if (d.point) dropPoint(d.point, d.position)
    else move(d.from, moveTopic(doc, d.from, d.position), 'drag-card-order/V1')
  }

  const focusPointGrip = async (t: number, i: number) => {
    await tick()
    box?.querySelector<HTMLElement>(`[data-pgrip="${t}:${i}"]`)?.focus()
  }

  async function dropPoint({ t, i }: DraggedPoint, position: number) {
    const moved = movePoint(doc, t, i, position)
    const how = { card: t, before: pointGrip(t, i), after: pointGrip(t, moved.index) }
    if (await pointMoved(moved, 'drag', `card=${t} item=${i} to=${moved.index} check=epic-042/V1`, how)) focusPointGrip(t, moved.index)
  }

  function onGripKey(e: KeyboardEvent, t: number) {
    const step = moveStep(e)
    if (step === null || drag) return
    e.preventDefault()
    // The first and last cards stay where they are.
    if (t + step < 1 || t + step >= doc.topics.length) return
    move(t, moveTopicBy(doc, t, step), 'keyboard-move-card/V4')
  }

  async function move(from: number, moved: { doc: NoteDoc; index: number }, check: string) {
    if (moved.doc === doc) {
      logAction(`${word === 'card' ? 'deck' : 'note'} move ${word} refused`)
      await refuse(`That ${word} can’t move there: a code block that isn’t closed would take in the ${word}s after it. Close it in Markdown.`)
      return
    }
    refused = ''
    removing = null
    logAction(`${word === 'card' ? 'deck' : 'note'} move ${word}`, `${from} to ${moved.index} check=${check}`)
    onchange(moved.doc, { card: from, to: moved.index, before: grip(from), after: grip(moved.index) })
    current = moved.index
    await tick()
    box?.querySelector<HTMLElement>(`[data-grip="${moved.index}"]`)?.focus()
  }

  onDestroy(() => cancelAnimationFrame(frame))

  /** Undo or redo changed the cards: a question or a note about them as they were goes. */
  export function settle() {
    removing = null
    refused = ''
  }

  function setTime(t: number, input: HTMLInputElement) {
    const value = input.value.trim().replace(/^\[|\]$/g, '')
    const topic = doc.topics[t]
    if (value === '') {
      onchange(setTopic(doc, t, { time: null }), { card: t, before: control(t, 'ttime'), after: control(t, 'ttime') })
      return
    }
    const parsed = parseTopicTime(value)
    if (parsed?.time) onchange(setTopic(doc, t, { time: parsed.time }), { card: t, before: control(t, 'ttime'), after: control(t, 'ttime') })
    else input.value = timeText(topic)
  }
</script>

<svelte:window
  onpointermove={dragTo}
  onpointerup={(e) => letGo(e, true)}
  onpointercancel={(e) => letGo(e, false)}
  onkeydown={(e) => {
    if (drag && e.key === 'Escape') {
      e.preventDefault()
      endDrag(false)
    }
  }}
/>

<div class="topics" class:moving={drag !== null} bind:this={box}>
  {#each cards as { topic, t } (t)}
    <section
      class="topic"
      class:cur={current === t}
      class:kinded={kinds}
      class:dragging={!drag?.point && drag?.from === t}
      class:drop-before={dragMoves && !drag?.point && drag?.position === t}
      class:drop-after={dragMoves && !drag?.point && t === doc.topics.length - 1 && drag?.position === doc.topics.length}
      data-card={t > 0 ? t : undefined}
      style:--k={kinds ? `var(--k-${topic.segmentKind ?? 'topic'})` : null}
      onfocusin={() => (current = t)}
    >
      <div class="th">
        {#if t > 0}
          <button
            class="grip"
            data-grip={t}
            aria-label="Move {word} {topic.name || Word}"
            title="Drag to reorder, or press {moveKeys}"
            onkeydown={(e) => onGripKey(e, t)}
            onpointerdown={(e) => startDrag(e, t)}><Icon name="grip" size={14} /></button
          >
        {/if}
        <span class="tnum">{cards.findIndex((c) => c.t === t) + 1}</span>
        {#if t === 0}
          <span class="tname lead">{noteName}</span>
        {:else}
          <input
            class="tname"
            data-f="name:{t}"
            data-undo="deck"
            value={topic.name}
            aria-label="{Word} name"
            placeholder={Word}
            onbeforeinput={(e) => (selected = selectionOf(e.currentTarget))}
            oninput={(e) => typed(setTopic(doc, t, { name: e.currentTarget.value }), t, `name:${t}`, e.currentTarget)}
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
            data-committed={timeText(topic)}
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
                onchange(setTopic(doc, t, { segmentKind: kind === 'topic' ? null : kind }), { card: t, before: control(t, 'tkind'), after: control(t, 'tkind') })
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
              const left = Math.max(0, t - 1)
              onchange(removeTopic(doc, t), { card: t, to: left, before: inField(`name:${t}`), after: left > 0 ? inField(`name:${left}`) : undefined })
              current = left
            }}
            oncancel={() => (removing = null)}>Remove “{topic.name || Word}” and its {count(pointsOf(topic).length, 'point')}?</ConfirmDelete
          >
        </div>
      {/if}
      <div class="pts">
        {#each topic.items as item, i (i)}
          {#if item.kind === 'point'}
            {@const drop = pointDrop(t, i)}
            <div
              class="pl"
              class:sub={item.depth === 1}
              class:dragging={pointDragged(t, i)}
              class:drop-before={drop === 'before'}
              class:drop-after={drop === 'after'}
              data-point="{t}:{i}"
            >
              <button
                class="pgrip"
                data-pgrip="{t}:{i}"
                tabindex="-1"
                aria-label="Move {item.depth === 1 ? 'sub-point' : 'point'}: drag, or press {moveKeys}"
                title="Drag to reorder, or press {moveKeys}"
                onkeydown={(e) => onPointGripKey(e, t, i)}
                onpointerdown={(e) => startDrag(e, t, i)}><Icon name="grip" size={13} /></button
              >
              <span class="bul" aria-hidden="true">{item.depth === 1 ? '–' : '•'}</span>
              <input
                data-f="{t}:{i}"
                data-undo="deck"
                value={item.text}
                aria-label={item.depth === 1 ? 'Sub-point' : 'Point'}
                placeholder={item.depth === 1 ? 'Sub-point' : 'Point'}
                onbeforeinput={(e) => (selected = selectionOf(e.currentTarget))}
                oninput={(e) => typed(setPointText(doc, t, i, e.currentTarget.value), t, `${t}:${i}`, e.currentTarget)}
                onkeydown={(e) => onPointKey(e, t, i, item)}
              />
              <!-- Not in the Tab order: Tab and Shift+Tab in a point make and undo a sub-point. -->
              <button
                class="pdel"
                tabindex="-1"
                aria-label="Delete {item.depth === 1 ? 'sub-point' : 'point'}"
                title="Delete {item.depth === 1 ? 'sub-point' : 'point'}"
                onclick={() => {
                  logAction('deck.point_deleted', `card=${t} item=${i} check=epic-042/V3`)
                  deletePoint(t, i)
                }}><Icon name="trash" size={14} /></button
              >
            </div>
          {:else if item.line.trim() !== ''}
            <div class="kept" title="Kept as written; not shown on screen">{item.line.replace(/\r?\n$/, '')}</div>
          {/if}
        {/each}
      </div>
      <button class="add" onclick={() => addPoint(t)}><Icon name="plus" size={14} /> Add point</button>
    </section>
  {/each}
  {#if refused}<p class="refused" role="status">{refused}</p>{/if}
  <button class="addtopic" onclick={newTopic}><Icon name="plus" size={16} /> Add {word}</button>
  <p class="keys muted">Drag a handle to reorder a {word} or a point, or press {moveKeys} on it or in the point · Enter adds a point · Tab makes a sub-point · Shift+Tab undoes it · Backspace on an empty point removes it</p>
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

  .grip {
    border: 0;
    background: none;
    padding: 4px 2px;
    margin: 0 -2px 0 -4px;
    color: var(--faint);
    display: inline-flex;
    flex: none;
    cursor: grab;
    touch-action: none;
  }

  .grip:hover {
    color: var(--text);
  }

  .moving,
  .moving .grip,
  .moving .pgrip {
    cursor: grabbing;
    user-select: none;
  }

  .topic {
    position: relative;
  }

  .topic.dragging {
    opacity: 0.5;
  }

  /* Where the dragged card will land: a line in the gap between cards. */
  .topic.drop-before::before,
  .topic.drop-after::after {
    content: '';
    position: absolute;
    left: -3px;
    right: 0;
    height: 3px;
    border-radius: 3px;
    background: var(--accent);
  }

  .topic.drop-before::before {
    top: -7px;
  }

  .topic.drop-after::after {
    bottom: -7px;
  }

  .refused {
    margin: 0 0 10px;
    padding: 8px 12px;
    border-radius: 10px;
    background: var(--warn-bg);
    color: var(--warn);
    font-size: 13px;
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
    margin: 4px 0 0 26px;
  }

  .pl {
    display: grid;
    grid-template-columns: 18px 14px minmax(0, 1fr) 26px;
    position: relative;
    align-items: center;
    gap: 4px;
  }

  /* A point's controls show on its row under the pointer or with the cursor in it. They always take
     their space, so the text never moves. */
  .pgrip,
  .pdel {
    border: 0;
    background: none;
    padding: 0;
    height: 24px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border-radius: 6px;
    color: var(--faint);
    /* Hidden, a button takes no taps either: on a touch screen it can't be pressed unseen. */
    opacity: 0;
    pointer-events: none;
  }

  .pl:hover > button,
  .pl:focus-within > button {
    opacity: 1;
    pointer-events: auto;
  }

  .pgrip {
    width: 18px;
    cursor: grab;
    touch-action: none;
  }

  .pgrip:hover {
    background: var(--hover);
    color: var(--text);
  }

  .pdel:hover {
    background: var(--danger-bg);
    color: var(--danger);
  }

  /* While something is dragged, only the dragged point keeps its handle. */
  .moving .pl > button {
    opacity: 0;
  }

  .moving .pl.dragging > .pgrip {
    opacity: 1;
  }

  .moving .pl:hover input:not(:focus) {
    background: none;
  }

  .pl.dragging {
    opacity: 0.5;
  }

  /* Where the dragged point will land, indented for a sub-point. */
  .pl.drop-before::before,
  .pl.drop-after::after {
    content: '';
    position: absolute;
    left: 0;
    right: 0;
    height: 2px;
    border-radius: 2px;
    background: var(--accent);
  }

  .pl.sub.drop-before::before,
  .pl.sub.drop-after::after {
    left: 22px;
  }

  .pl.drop-before::before {
    top: -1px;
  }

  .pl.drop-after::after {
    bottom: -1px;
  }

  .pl.sub {
    grid-template-columns: 40px 14px minmax(0, 1fr) 26px;
  }

  .pl.sub .pgrip {
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

  .pl:hover input {
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
    margin: 2px 0 2px 40px;
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
    margin-left: 48px;
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
