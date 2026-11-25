<script lang="ts">
  // A session's page (ADR 0041, spec §11): the run beside the person's note and the AI review.
  // The run is when it ran, how long against the plan, where its transcript stands, and each
  // card's planned and actual time with a bar, opening to what was said while it was up. A
  // transcript is a call app's, dropped on the page or added, lined up by time and checked before
  // it is saved, or the person's own voice. The deck's name opens the deck, Show again shows it,
  // and Delete (in ⋯) takes the session and its files away, after asking. The two sides scroll
  // apart.
  import { SvelteSet } from 'svelte/reactivity'
  import { logCardWords, logPageOpened, logTopState, topState, wordsByCard } from '../lib/sessions/session-page'
  import { formatDuration } from '../lib/project/duration'
  import { decks } from '../lib/decks/store'
  import { invoke } from '@tauri-apps/api/core'
  import { open as pickFile } from '@tauri-apps/plugin-dialog'
  import { deleteDeckSession, noteDeckSession, sessionName, type DeckSession } from '../lib/decks/sessions'
  import { fileName } from '../lib/notes/drop'
  import { logAction } from '../lib/log'
  import { alignTranscript, parseCaptions, readTranscript, type Captions } from '../lib/sessions/transcript'
  import { transcriptDropped } from './drop'
  import { readReview, reviewRequest, type Review } from '../lib/sessions/review'
  import { parseInline } from '../lib/markdown'
  import Spans from '../lib/markdown-ui/Spans.svelte'
  import { VOICE_SOURCE, downloadSpeechModel, readSpeechModel, transcribeRecording, voiceWork, type SpeechModel } from '../lib/sessions/whisper'
  import { showDeckOnScreen } from '../lib/decks/show'
  import { readQuickFile } from '../lib/notes/files'
  import { parseNoteDoc } from '../lib/notes/format'
  import { showBlockedBy } from '../lib/notes/show'
  import { session as running } from '../lib/session/store'
  import { ON_TIME_SECONDS, difference, runTimes } from '../lib/sessions/runs'
  import { deckSessions, reloadDeckSessions } from '../lib/sessions/store'
  import { workspaces } from '../lib/workspaces/store'
  import { workspacesWith } from '../lib/workspaces/workspaces'
  import { showBack } from './back'
  import { sessionsPage } from '../lib/sessions/page-state'
  import { tabFor } from '../lib/sessions/views'
  import { sessionViews, settings } from '../lib/settings/store'
  import ConfirmDelete from './ConfirmDelete.svelte'
  import { attempt } from './errors'
  import Icon from './Icon.svelte'
  import { goAi, goDeck, goSessions } from './route'

  let { path, startedAt }: { path: string; startedAt: string } = $props()

  // The way back names the view the person came from: its tab (a saved view's name), else Sessions.
  const backName = $derived(tabFor($sessionsPage.filters, $sessionViews)?.name)
  $effect(() => showBack({ label: backName && backName !== 'All' ? backName : 'Sessions', go: goSessions, width: 1180, tight: true }))

  const deck = $derived(($decks ?? []).find((d) => d.path === path) ?? null)
  const runs = $derived($deckSessions?.get(path) ?? null)
  const run = $derived<DeckSession | null>(runs?.sessions.find((s) => s.startedAt === startedAt) ?? null)
  const name = $derived(run && runs ? sessionName(runs.sessions, run) : '')
  const times = $derived(run ? runTimes(run) : null)
  const total = $derived(times ? difference(times.planned, times.timed) : null)
  const inWorkspaces = $derived(deck ? workspacesWith($workspaces ?? [], deck.id) : [])
  const blocked = $derived(showBlockedBy($running))

  const clock = (iso: string) => new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
  const day = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })

  /** How many times a card came back on screen: its visits, not counting those split by a pause. */
  function shownTimes(s: DeckSession, card: number): number {
    let n = 0
    let last = -1
    for (const v of s.visits ?? []) {
      if (v.card === card && last !== card) n++
      last = v.card
    }
    return n
  }
  const cardsOver = $derived(run ? run.cards.filter((c) => c.plannedSeconds !== null && c.seconds - c.plannedSeconds >= ON_TIME_SECONDS).length : 0)

  // The note saves as it is typed, a moment after the last key (a blank note is taken off).
  let note = $state('')
  let noteFor = ''
  let saved = $state<'saved' | 'saving' | ''>('')
  let timer: ReturnType<typeof setTimeout> | null = null
  $effect(() => {
    // A different session, or the first read: start from what is kept.
    if (run && noteFor !== run.startedAt) {
      noteFor = run.startedAt
      note = run.note ?? ''
      saved = ''
    }
  })
  function typed(text: string) {
    note = text
    saved = 'saving'
    if (timer) clearTimeout(timer)
    const at = startedAt
    timer = setTimeout(() => {
      timer = null
      attempt(async () => {
        await noteDeckSession(path, at, text)
        await reloadDeckSessions(path)
        saved = 'saved'
      })
    }, 500)
  }

  let menuOpen = $state(false)
  let deleting = $state(false)
  function remove() {
    deleting = false
    attempt(async () => {
      if (timer) clearTimeout(timer)
      await deleteDeckSession(path, startedAt)
      await reloadDeckSessions(path)
      goSessions()
    })
  }

  // The transcript: the saved one, read when the session has one, or a call's file being lined up.
  let transcript = $state<ReturnType<typeof readTranscript> | null>(null)
  let reading = $state(false)
  const hasTranscript = $derived(!!name && !!runs?.files.transcripts.includes(name))
  $effect(() => {
    const [p, n, has] = [path, name, hasTranscript]
    if (!has) {
      transcript = null
      return
    }
    reading = true
    attempt(async () => {
      try {
        transcript = readTranscript(await invoke<string>('read_session_file', { path: p, kind: 'transcript', name: n }))
      } finally {
        reading = false
      }
    })
  })

  // A recording of the person's voice waiting to be transcribed: the model downloads once, after a yes.
  const hasRecording = $derived(!!name && !!runs?.files.recordings.includes(name))
  const work = $derived($voiceWork[`${path}#${name}`] ?? null)
  const download = $derived($voiceWork.model ?? null)
  let model = $state<SpeechModel | null>(null)
  let notNow = $state(false)
  $effect(() => {
    if (hasRecording && !hasTranscript) attempt(async () => void (model = await readSpeechModel()))
  })
  function transcribe() {
    notNow = false
    attempt(async () => {
      if (!model?.present) await downloadSpeechModel()
      model = await readSpeechModel()
      await transcribeRecording(path, startedAt)
    })
  }

  // The review: written by the skill in the person's agent; until then, a request to copy.
  let review = $state<Review | null>(null)
  const hasReview = $derived(!!name && !!runs?.files.reviews.includes(name))
  $effect(() => {
    const [p, n, has] = [path, name, hasReview]
    if (!has) {
      review = null
      return
    }
    attempt(async () => {
      review = readReview(await invoke<string>('read_session_file', { path: p, kind: 'review', name: n }))
    })
  })
  // Shown once asked for: copied, or to copy by hand when the clipboard can't be written.
  let copied = $state<'copied' | 'shown' | null>(null)
  const request = $derived(deck && run ? reviewRequest(deck.name, run.startedAt) : '')
  async function copyRequest() {
    try {
      await navigator.clipboard.writeText(request)
      copied = 'copied'
    } catch {
      copied = 'shown'
    }
    logAction('review request', copied)
  }

  let pending = $state<{ file: string; captions: Captions } | null>(null)
  let nudge = $state(0)
  let importError = $state('')
  const lined = $derived(pending && run && deck ? alignTranscript(pending.captions, pending.file, run, deck.name, nudge) : null)
  const preview = $derived(lined ? readTranscript(lined.markdown).cards.flatMap((c) => c.lines.slice(0, 1).map((l) => ({ card: c.title, ...l }))).slice(0, 3) : [])

  /** Reads a call's transcript file to line it up; nothing is saved until Save. */
  function take(file: string) {
    importError = ''
    attempt(async () => {
      try {
        const captions = parseCaptions(fileName(file), await invoke<string>('read_transcript_file', { path: file }))
        if ('error' in captions) importError = captions.error
        else {
          pending = { file: fileName(file), captions }
          nudge = 0
        }
      } catch (e) {
        importError = String(e)
      }
    })
  }
  $effect(() => {
    const dropped = $transcriptDropped
    if (dropped) {
      transcriptDropped.set(null)
      take(dropped)
    }
  })
  function pick() {
    attempt(async () => {
      const file = await pickFile({ multiple: false, directory: false, filters: [{ name: 'Transcripts', extensions: ['vtt', 'srt', 'txt'] }] })
      if (typeof file === 'string') take(file)
    })
  }
  function save() {
    if (!lined) return
    const markdown = lined.markdown
    attempt(async () => {
      await invoke('write_transcript', { path, name, contents: markdown })
      logAction('transcript saved', `${lined?.kept ?? 0} lines`)
      pending = null
      await reloadDeckSessions(path)
    })
  }
  // Where the top of the run stands, and the cards opened to what was said on them.
  const top = $derived(
    topState({
      checking: !!lined,
      transcript,
      reading,
      recording: hasRecording,
      download: download?.percent ?? null,
      work: work?.percent ?? null,
      askForModel: !!model && !model.present && !notNow,
    }),
  )
  const words = $derived(run && transcript && top === 'transcript' ? wordsByCard(run.cards, transcript) : null)
  const openCards = new SvelteSet<number>()
  const allOpen = $derived(!!run && run.cards.every((_, i) => openCards.has(i)))
  function toggleCard(i: number) {
    const open = !openCards.has(i)
    if (open) openCards.add(i)
    else openCards.delete(i)
    logCardWords(i, open)
  }
  function readAll() {
    const open = !allOpen
    run?.cards.forEach((_, i) => {
      if (open !== openCards.has(i)) toggleCard(i)
    })
  }

  const loggedTop = $derived(run && top !== 'loading' ? top : null)
  $effect(() => {
    if (loggedTop) logTopState(loggedTop)
  })
  let width = $state(0)
  let openedLogged = false
  $effect(() => {
    if (openedLogged || !run || !width) return
    openedLogged = true
    // The same width the two panes need (the container query below).
    logPageOpened(width > 860 ? 'wide' : 'narrow')
  })

  /** How the file was lined up, in words. */
  function offsetWords(seconds: number, clock: boolean): string {
    if (!clock) return nudge ? `Its start is ${Math.abs(nudge)} s ${nudge < 0 ? 'before' : 'after'} Start.` : 'It has no clock time, so its start is lined up with Start.'
    if (seconds === 0) return 'It starts as you pressed Start.'
    return `It starts ${Math.abs(seconds)} s ${seconds < 0 ? 'before' : 'after'} you pressed Start.`
  }

  function showAgain() {
    if (!deck) return
    const d = deck
    attempt(async () => showDeckOnScreen(parseNoteDoc(await readQuickFile('decks', d.path)), d.name, d.path))
  }
</script>

<svelte:window
  onclick={(e) => {
    if (menuOpen && !(e.target as HTMLElement).closest('.more')) menuOpen = false
  }}
  onkeydown={(e) => {
    if (menuOpen && e.key === 'Escape') menuOpen = false
  }}
/>

<div class="page" bind:clientWidth={width}>
  {#if !run || !times}
    {#if runs}
      <div class="gone">
        <p class="muted">This session isn't here any more: it was deleted, or its deck was moved.</p>
        <button onclick={goSessions}>Go to Sessions</button>
      </div>
    {/if}
  {:else}
    <div class="top">
      <header class="phead">
        <h1>
          {#if deck}<button class="deckname" title="Open the deck" onclick={() => goDeck(path)}>{deck.name}</button>{:else}A deck that has gone{/if}
        </h1>
        {#each inWorkspaces as w (w.id)}<span class="chip">{w.name}</span>{/each}
        <span class="grow"></span>
        <button class="primary" disabled={!deck || !!blocked} title={blocked ?? 'Show the deck on screen'} onclick={showAgain}
          ><Icon name="show" size={15} /> Show again</button
        >
        <div class="more">
          <button class="ibtn" aria-haspopup="menu" aria-expanded={menuOpen} aria-label="More actions for this session" onclick={() => (menuOpen = !menuOpen)}
            ><Icon name="more" size={18} /></button
          >
          {#if menuOpen}
            <div class="menu" role="menu">
              <button role="menuitem" disabled={!deck} onclick={() => goDeck(path)}><Icon name="deck" size={15} /> Open the deck</button>
              <button
                role="menuitem"
                class="danger"
                onclick={() => {
                  menuOpen = false
                  deleting = true
                }}><Icon name="trash" size={15} /> Delete session…</button
              >
            </div>
          {/if}
        </div>
      </header>
      <p class="muted when">
        {[`${day(run.startedAt)}, ${clock(run.startedAt)} to ${clock(run.endedAt)}`, deck?.audience && `for ${deck.audience}`].filter(Boolean).join(' · ')}
      </p>

      {#if deleting}
        <div class="confirm">
          <ConfirmDelete label="Delete session" onconfirm={remove} oncancel={() => (deleting = false)}
            >Delete this session? Its note goes with it, and its transcript, review and recording go to the Trash. The deck isn't changed.</ConfirmDelete
          >
        </div>
      {/if}
    </div>

    <div class="split">
      <section class="pane runpane" aria-label="The run">
        <div class="summary">
          <div><small>Ran</small><b class="num">{formatDuration(times.ran)}</b></div>
          <div><small>Planned</small><b class="num">{times.planned ? formatDuration(times.planned) : 'untimed'}{times.untimed && times.planned ? ' + untimed' : ''}</b></div>
          {#if total?.text}
            <div>
              <small>Difference{times.untimed ? ', timed cards' : ''}</small><b class="num" class:over={total.over === true} class:under={total.over === false}>{total.text}</b>
            </div>
          {/if}
          <div><small>Paused</small><b class="num">{run.pausedSeconds ? formatDuration(run.pausedSeconds) : '–'}</b></div>
          <div><small>Cards over</small><b class="num">{cardsOver} of {run.cards.length}</b></div>
        </div>

        <div class="recording">
          {#if top === 'import' && pending && lined}
            <div class="ask" aria-live="polite">
              <b>{pending.captions.source ? `${pending.captions.source} transcript` : 'Transcript'} · {pending.file}</b>
              <p>
                {offsetWords(lined.offsetSeconds, pending.captions.clockStartMs !== null)}
                {lined.kept} {lined.kept === 1 ? 'line falls' : 'lines fall'} within the session{#if lined.leftOut}; {lined.leftOut} from before Start, after Stop or while paused
                  {lined.leftOut === 1 ? 'is' : 'are'} left out{/if}.
              </p>
              {#if lined.kept === 0}
                <p class="warn">None of its lines falls within this session: it may be from another call. Move it, or cancel.</p>
              {/if}
              {#if hasTranscript}<p class="warn">Saving replaces this session's transcript.</p>{/if}
              <div class="line">
                <span class="muted">Move it</span>
                <button class="small" onclick={() => (nudge -= 5)}>−5 s</button>
                <b class="num">{nudge > 0 ? '+' : ''}{nudge} s</b>
                <button class="small" onclick={() => (nudge += 5)}>+5 s</button>
                <span class="grow"></span>
                <button onclick={() => (pending = null)}>Cancel</button>
                <button class="primary" disabled={lined.kept === 0} onclick={save}>Save transcript</button>
              </div>
              {#if preview.length}
                <p class="first">First lines: {#each preview as l, i (i)}<span><i>{l.card}</i> {l.time} {l.speaker ? `${l.speaker}: ` : ''}“{l.text}”</span>{/each}</p>
              {/if}
            </div>
          {:else if (top === 'transcript' || top === 'silent') && transcript}
            <div class="tbar">
              <b>Transcript</b>
              <span class="grow"></span>
              {#if top === 'transcript'}<button class="small" onclick={readAll}>{allOpen ? 'Close all' : 'Read it all'}</button>{/if}
            </div>
            <p class="src">
              {transcript.source ? `From ${transcript.source}` : 'Transcript'} · <button class="link" onclick={pick}>Replace…</button>
            </p>
            {#if top === 'silent'}
              <p class="faint">Nothing was heard{transcript.source === VOICE_SOURCE ? ' in the recording' : ''}.</p>
            {/if}
          {:else if top === 'downloading' && download}
            <div class="ask">
              <b>Downloading Whisper's speech model</b>
              <div class="prog"><i style:width="{download.percent}%"></i></div>
              <p class="faint">{download.percent}% · it carries on if you leave this page.</p>
            </div>
          {:else if top === 'transcribing' && work}
            <div class="ask">
              <b>Transcribing on this computer…</b>
              <div class="prog"><i style:width="{work.percent}%"></i></div>
              <p class="faint">
                {work.percent}% · {$settings.keepRecordings ? 'the recording is kept (Settings › Recordings).' : 'the recording goes to the Trash once it’s done.'}
              </p>
            </div>
          {:else if top === 'ask' && model}
            <div class="ask">
              <b><span class="dot"></span> Your voice was recorded ({formatDuration(times.ran)})</b>
              <p>
                Transcribe it on this computer? Whisper's speech model is downloaded once, the first time: <b>{Math.round(model.bytes / 1_000_000)} MB</b> from
                {model.from}, checked before it is used. Nothing you said leaves your computer.
              </p>
              <div class="line">
                <button class="primary" onclick={transcribe}>Download and transcribe</button>
                <button onclick={() => (notNow = true)}>Not now</button>
                <span class="faint">The recording is kept until you do.</span>
              </div>
            </div>
          {:else if top === 'waiting'}
            <div class="drop">
              <b><span class="dot"></span> A recording of your voice waits to be transcribed</b>
              <button class="small" onclick={transcribe}>Transcribe…</button>
            </div>
          {:else if top === 'none'}
            <div class="drop">
              <b>Drop a transcript from Zoom, Teams or Meet</b>
              <span>.vtt, .srt or .txt · it's split by card, by time</span>
              <button class="small" onclick={pick}>Add a transcript…</button>
            </div>
          {/if}
          {#if importError}<p class="error" role="alert">{importError}</p>{/if}
        </div>

        <div class="cards" role="table" aria-label="Each card's planned and actual time, and what was said on it">
          <div class="row head" role="row">
            <span></span><span role="columnheader">Card</span><span role="columnheader" class="r">Planned</span><span role="columnheader" class="r"
              >Actual</span
            ><span role="columnheader" class="r">Difference</span><span></span><span></span>
          </div>
          {#each run.cards as c, i (i)}
            {@const d = c.plannedSeconds === null ? null : difference(c.plannedSeconds, c.seconds)}
            {@const scale = Math.max(c.plannedSeconds ?? 0, c.seconds) || 1}
            {@const n = shownTimes(run, i)}
            {@const open = !!words && openCards.has(i)}
            <div class="row" class:opens={!!words} role="row">
              <span class="edge" style:background="var(--k-{c.kind})"></span>
              <span role="cell" class="name"
                >{#if words}<button class="open" aria-expanded={open} onclick={() => toggleCard(i)}>{c.name}</button>{:else}<b>{c.name}</b>{/if}{#if n > 1}<small
                    >shown {n} times</small
                  >{/if}{#if c.seconds === 0}<small>skipped</small>{/if}</span
              >
              <span role="cell" class="r num muted">{c.plannedSeconds === null ? 'untimed' : formatDuration(c.plannedSeconds)}</span>
              <span role="cell" class="r num">{formatDuration(c.seconds)}</span>
              <span role="cell" class="r num diff" class:over={d?.over === true} class:under={d?.over === false}>{d?.text ?? '–'}</span>
              <span aria-hidden="true">
                {#if c.plannedSeconds === null}
                  <span class="pa open-ended"></span>
                {:else}
                  {@const fill = (Math.min(c.seconds, c.plannedSeconds) / scale) * 100}
                  <span class="pa">
                    <i style:width="{fill}%" style:background="var(--k-{c.kind})"></i>
                    {#if d?.over}<b style:left="{fill}%" style:width="{100 - fill}%"></b>{/if}
                    <u style:left="calc({(c.plannedSeconds / scale) * 100}% - 1px)"></u>
                  </span>
                {/if}
              </span>
              <span class="chev" aria-hidden="true">{words ? (open ? '▾' : '▸') : ''}</span>
            </div>
            {#if open && words}
              <div class="said" role="row">
                <div role="cell" aria-colspan="5">{@render lines(words.byCard[i])}</div>
              </div>
            {/if}
          {/each}
          <div class="row total" role="row">
            <span></span><span role="cell">Total</span><span role="cell" class="r num">{times.planned ? formatDuration(times.planned) : '–'}</span><span
              role="cell"
              class="r num">{formatDuration(times.ran)}</span
            ><span role="cell" class="r num diff" class:over={total?.over === true} class:under={total?.over === false}>{total?.text ?? ''}</span><span></span
            ><span></span>
          </div>
        </div>
        {#each words?.extra ?? [] as c, i (i)}
          <div class="extra">
            <h3>{c.title} <small>{c.times}</small></h3>
            {@render lines(c.lines)}
          </div>
        {/each}
      </section>

      <aside class="pane side" aria-label="Your note and the AI review">
        <section class="notepart">
          <h2 class="sec">Note <span class="hint">what went wrong, what to change</span></h2>
          <textarea
            class="note"
            aria-label="Your note on this session"
            placeholder="What went wrong? What would you do differently?"
            value={note}
            oninput={(e) => typed(e.currentTarget.value)}
          ></textarea>
          <p class="saved">{saved === 'saving' ? 'Saving…' : saved === 'saved' ? 'Saved' : 'Saved as you type, with this session.'}</p>
        </section>

        <section class="reviewpart">
          <h2 class="sec">AI review</h2>
          {#if review}
            <div class="review">
              <p class="by">Written by your AI{review.madeWith ? ` with the ${review.madeWith}` : ''}. Oversay doesn't change the deck; ask your AI to make the changes.</p>
              {#each review.sections as s, i (i)}
                <h3>{s.title}</h3>
                {#if s.points.length}
                  <ul>
                    {#each s.points as p, j (j)}<li><Spans spans={parseInline(p)} /></li>{/each}
                  </ul>
                {/if}
                {#each s.lines as l, j (j)}<p><Spans spans={parseInline(l)} /></p>{/each}
              {/each}
            </div>
          {:else}
            <div class="review">
              <b>No review yet</b>
              <p class="muted">
                Your AI reads the deck, this session{run.note ? ', your note' : ''}{hasTranscript ? ' and the transcript' : ''}, and writes what ran over, what was rushed or
                skipped, and what to change in the deck. It runs in your own AI app, with the Oversay skill.
              </p>
              <button class="primary" disabled={!request} onclick={copyRequest}>✦ Review with your AI</button>
              {#if copied}
                <div class="copied" role="status">
                  {copied === 'copied' ? 'Copied. Paste it' : 'Copy it'} into Claude Code, Codex or your AI app:
                  <code>{request}</code>
                  The review shows here when it's written. No Oversay skill yet? <button class="link" onclick={goAi}>Set it up on the AI page</button>
                </div>
              {/if}
              {#if !run.note && !hasTranscript}<p class="faint">A note or a transcript makes the review much better.</p>{/if}
            </div>
          {/if}
        </section>
      </aside>
    </div>
  {/if}
</div>

{#snippet lines(said: { time: string; speaker: string; text: string }[])}
  <ul class="lines">
    {#each said as l, j (j)}
      <li><time class="num">{l.time}</time>{#if l.speaker}<b>{l.speaker}:</b>{' '}{/if}{l.text}</li>
    {:else}
      <li class="none">Nothing said while this card was up.</li>
    {/each}
  </ul>
{/snippet}

<style>
  /* The page fills the window under the search bar, so its two sides can scroll apart. */
  .page {
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
    container: session / inline-size;
  }

  .top,
  .gone {
    flex: none;
    width: 100%;
    max-width: 1180px;
    margin: 0 auto;
    padding: 18px 32px 0;
  }

  /* The run at the left; the note and the review at the right. */
  .split {
    flex: 1;
    min-height: 0;
    width: 100%;
    max-width: 1180px;
    margin: 12px auto 0;
    display: grid;
    grid-template-columns: minmax(0, 1.55fr) minmax(320px, 1fr);
    grid-template-rows: minmax(0, 1fr);
    border-top: 1px solid var(--line);
  }

  .pane {
    min-height: 0;
    overflow: auto;
    padding: 12px 18px 32px;
  }

  .runpane {
    padding-left: 32px;
  }

  .side {
    padding-right: 32px;
    border-left: 1px solid var(--line);
    background: var(--side);
  }

  .notepart .sec {
    margin-top: 0;
  }

  .recording {
    margin: 10px 0;
  }

  .tbar {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px;
    font-size: 13px;
  }

  .phead {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 8px 10px;
  }

  .phead h1 {
    margin: 0;
    min-width: 0;
  }

  .deckname {
    border: 0;
    background: none;
    padding: 0;
    font: inherit;
    color: inherit;
    text-align: left;
  }

  .deckname:hover {
    background: none;
    color: var(--accent-text);
  }

  .phead button.primary {
    display: inline-flex;
    align-items: center;
    gap: 6px;
  }

  .grow {
    flex: 1;
  }

  .chip {
    padding: 0 8px;
    border-radius: 99px;
    background: var(--accent-soft);
    color: var(--accent-text);
    font-size: 12px;
    font-weight: 600;
    line-height: 20px;
    white-space: nowrap;
  }

  .when {
    margin: 6px 0 0;
  }

  .more {
    position: relative;
  }

  .ibtn {
    border: 0;
    background: none;
    padding: 6px;
    color: var(--muted);
    border-radius: 8px;
  }

  .menu {
    position: absolute;
    top: calc(100% + 6px);
    right: 0;
    z-index: 20;
    min-width: 190px;
    padding: 6px;
    background: var(--card);
    border: 1px solid var(--line-strong);
    border-radius: 12px;
    box-shadow: 0 10px 30px rgba(0, 0, 0, 0.18);
  }

  .menu button {
    display: flex;
    align-items: center;
    gap: 10px;
    width: 100%;
    border: 0;
    background: none;
    border-radius: 8px;
    padding: 8px 10px;
    text-align: left;
    color: var(--text);
    font-weight: 500;
  }

  .menu button:hover {
    background: var(--hover);
  }

  .menu button.danger {
    color: var(--danger);
  }

  .confirm {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 8px;
    margin: 14px 0 0;
    padding: 12px 14px;
    border: 1px solid var(--line-strong);
    border-radius: 12px;
    background: var(--card);
  }

  .summary {
    display: flex;
    flex-wrap: wrap;
    gap: 8px 24px;
    margin: 14px 0 0;
    padding: 12px 16px;
    border: 1px solid var(--line);
    border-radius: 14px;
    background: var(--card);
  }

  .summary div {
    display: flex;
    flex-direction: column;
  }

  .summary small {
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.05em;
    text-transform: uppercase;
    color: var(--faint);
  }

  .summary b {
    font-size: 17px;
  }

  .sec {
    margin: 26px 0 8px;
    font-size: 12px;
    letter-spacing: 0.07em;
    text-transform: uppercase;
    color: var(--faint);
  }

  .sec .hint {
    margin-left: 6px;
    font-weight: 500;
    letter-spacing: 0;
    text-transform: none;
  }

  .cards {
    border: 1px solid var(--line);
    border-radius: 14px;
    background: var(--card);
    overflow: hidden;
  }

  .row {
    position: relative;
    display: grid;
    grid-template-columns: 4px minmax(0, 1fr) 56px 52px 92px minmax(50px, 130px) 12px;
    gap: 8px;
    align-items: center;
    margin: 0;
    padding: 9px 12px 9px 0;
    border-top: 1px solid var(--line);
  }

  .row.opens:hover {
    background: var(--hover);
  }

  /* The card's name is the button; it reaches over its whole row. */
  button.open {
    border: 0;
    background: none;
    padding: 0;
    font: inherit;
    font-weight: 700;
    color: inherit;
    text-align: left;
  }

  button.open:hover {
    background: none;
  }

  button.open::after {
    content: '';
    position: absolute;
    inset: 0;
  }

  button.open:focus-visible {
    outline: none;
  }

  button.open:focus-visible::after {
    outline: 2px solid var(--accent);
    outline-offset: -2px;
  }

  .chev {
    font-size: 11px;
    color: var(--faint);
  }

  .said {
    padding: 4px 14px 10px 18px;
    border-top: 1px dashed var(--line);
  }

  .extra {
    margin-top: 12px;
  }

  .extra h3 {
    margin: 0 0 4px;
    font-size: 14px;
  }

  .extra h3 small {
    font-weight: 500;
    color: var(--faint);
  }

  .row:first-child {
    border-top: 0;
  }

  .row.head {
    padding: 8px 12px 6px 0;
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.05em;
    text-transform: uppercase;
    color: var(--faint);
  }

  .row.total {
    background: var(--side);
    font-weight: 650;
  }

  .edge {
    align-self: stretch;
    border-radius: 0 3px 3px 0;
  }

  .name {
    min-width: 0;
  }

  .name small {
    margin-left: 6px;
    white-space: nowrap;
    color: var(--faint);
  }

  .r {
    text-align: right;
  }

  .num {
    font-variant-numeric: tabular-nums;
  }

  .diff {
    font-weight: 650;
    color: var(--muted);
  }

  .over {
    color: var(--danger);
  }

  .under {
    color: var(--ok);
  }

  /* The plan as a track with a tick at its end, what the card took filling it, overtime hatched. */
  .pa {
    position: relative;
    display: block;
    height: 10px;
    border-radius: 5px;
    background: var(--rail);
  }

  .pa i {
    position: absolute;
    left: 0;
    top: 0;
    bottom: 0;
    border-radius: 5px;
  }

  .pa b {
    position: absolute;
    top: 0;
    bottom: 0;
    border-radius: 0 5px 5px 0;
    background: repeating-linear-gradient(135deg, var(--danger) 0 2px, transparent 2px 4px);
  }

  .pa u {
    position: absolute;
    top: -3px;
    bottom: -3px;
    width: 2px;
    border-radius: 1px;
    background: var(--text);
    opacity: 0.55;
  }

  .pa.open-ended {
    background: transparent;
    border: 1.5px dashed var(--line-strong);
  }

  .note {
    width: 100%;
    min-height: 90px;
    resize: vertical;
    line-height: 1.5;
  }

  .saved {
    margin: 4px 0 0;
    font-size: 12px;
    color: var(--faint);
  }

  .ask {
    padding: 14px 16px;
    border: 1px solid color-mix(in srgb, var(--accent) 35%, var(--line));
    border-radius: 14px;
    background: var(--accent-soft);
  }

  .ask p {
    margin: 6px 0;
  }

  .ask .warn {
    color: var(--warn);
    font-weight: 600;
  }

  .line {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px;
    margin-top: 8px;
  }

  .review {
    padding: 14px 16px;
    border: 1px solid var(--line);
    border-radius: 14px;
    background: var(--card);
  }

  .review .by {
    margin: 0 0 6px;
    font-size: 12.5px;
    color: var(--faint);
  }

  .review h3 {
    margin: 14px 0 4px;
    font-size: 14.5px;
  }

  .review h3:first-of-type {
    margin-top: 6px;
  }

  .review ul {
    margin: 0;
    padding-left: 20px;
  }

  .review li {
    margin: 3px 0;
  }

  .copied {
    margin-top: 10px;
    padding: 10px 12px;
    border: 1px solid var(--line);
    border-radius: 10px;
    background: var(--side);
    font-size: 13px;
  }

  .copied code {
    display: block;
    margin: 6px 0;
    padding: 7px 9px;
    border: 1px solid var(--line);
    border-radius: 7px;
    background: var(--card);
    font: 12.5px ui-monospace, SFMono-Regular, Menlo, monospace;
  }

  .prog {
    height: 6px;
    margin: 10px 0 4px;
    border-radius: 3px;
    background: var(--rail);
    overflow: hidden;
  }

  .prog i {
    display: block;
    height: 100%;
    border-radius: 3px;
    background: var(--accent);
  }

  .faint {
    color: var(--faint);
    font-size: 12.5px;
  }

  .dot {
    display: inline-block;
    width: 9px;
    height: 9px;
    margin-right: 4px;
    border-radius: 50%;
    background: var(--danger);
  }

  .first {
    font-size: 12.5px;
    color: var(--muted);
  }

  .first span {
    margin-right: 10px;
  }

  .small {
    padding: 3px 10px;
    font-size: 12.5px;
  }

  .src {
    margin: 0 0 10px;
    font-size: 12.5px;
    color: var(--faint);
  }

  .link {
    border: 0;
    background: none;
    padding: 0;
    color: var(--accent-text);
    font-weight: 600;
    font-size: inherit;
  }

  .lines {
    list-style: none;
    margin: 0;
    padding: 0 0 0 14px;
    border-left: 2px solid var(--line);
  }

  .lines li {
    padding: 2px 0;
    font-size: 13.5px;
  }

  .lines time {
    margin-right: 8px;
    font-size: 12.5px;
    color: var(--faint);
  }

  .lines li b {
    font-weight: 650;
  }

  .lines .none {
    color: var(--faint);
    font-style: italic;
  }

  .drop {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
    padding: 18px;
    border: 1.5px dashed var(--line-strong);
    border-radius: 14px;
    color: var(--muted);
    text-align: center;
  }

  .drop b {
    color: var(--text);
  }

  .drop button {
    margin-top: 8px;
  }

  .error {
    margin: 8px 0 0;
    color: var(--danger);
  }

  /* Too narrow for two sides: one column that scrolls. */
  @container session (max-width: 860px) {
    .split {
      display: block;
      overflow: auto;
    }

    .pane {
      overflow: visible;
    }

    .side {
      padding-left: 32px;
      border-left: 0;
      background: none;
    }
  }

  /* The search bar's row narrows its padding here too, so the way back still lines up. */
  @container session (max-width: 760px) {
    .top,
    .gone {
      padding-left: 16px;
      padding-right: 16px;
    }

    .runpane,
    .side {
      padding-left: 16px;
      padding-right: 16px;
    }
  }
</style>
