<script lang="ts">
  import { closeOverlay, openOverlay } from '../lib/windows'
  import { plugins } from '../plugins/registry'
  import { formatElapsed, sessionClock, ticking } from '../lib/session/clock'
  import { closeSession, openSession, session, sessionCommands } from '../lib/session/store'
  import type { Talk } from '../lib/project/types'
  import { attempt } from './errors'
  import { checkApi } from '../lib/account/account'

  // Temporary: lets us exercise overlay windows until sessions exist (006).
  // `does-not-exist` checks the unknown-plugin error.
  const testOverlays = [
    ...plugins.map((p) => ({ id: p.id, name: p.name, ...p.window })),
    { id: 'does-not-exist', name: 'Unknown', width: 260, height: 100 },
  ]

  // A short test talk, for trying the session engine without a project open.
  const testTalk: Talk = {
    id: 't_devtest',
    name: 'Test talk',
    sessions: [],
    segments: ['Intro', 'Topic', 'Close'].map((name, i) => ({
      id: `s_devtest${i}`,
      name,
      kind: i === 0 ? 'intro' : i === 2 ? 'outro' : 'topic',
      plannedSeconds: 20,
      openEnded: false,
      points: [`Point for ${name}`],
      hints: [],
    })),
  }
  const now = ticking()
  const clock = $derived($session ? sessionClock($session, $now) : null)
  // Shows that the account's token works (ADR 0050). Signed out, Rust makes no request.
  let apiResult = $state('')
  const callApi = () =>
    attempt(async () => {
      apiResult = ''
      apiResult = await checkApi()
    })
</script>

<section>
  <h2>Overlay test</h2>
  {#each testOverlays as overlay (overlay.id)}
    <div class="row">
      <code>{overlay.id}</code>
      <button onclick={() => attempt(() => openOverlay(overlay.id, overlay.name, { width: overlay.width, height: overlay.height }))}>Open</button>
      <button onclick={() => attempt(() => closeOverlay(overlay.id))}>Close</button>
    </div>
  {/each}
</section>

<section>
  <h2>Account API</h2>
  <div class="row">
    <button onclick={callApi}>Call GET /decks</button>
    {#if apiResult}<span class="muted" role="status">{apiResult}</span>{/if}
  </div>
</section>

<section>
  <h2>Session test</h2>
  <div class="row">
    <button onclick={() => attempt(() => openSession(testTalk))}>Open test session (3 × 0:20)</button>
    <button onclick={() => attempt(sessionCommands.previous)}>Previous</button>
    <button onclick={() => attempt(sessionCommands.next)}>Next</button>
    <button onclick={() => attempt(sessionCommands.end)}>End</button>
    <button onclick={() => attempt(closeSession)}>Close</button>
  </div>
  <p class="muted">
    {#if !$session}
      No session.
    {:else if clock?.current}
      {$session.status}: {clock.current.name}, {formatElapsed(clock.inSegment)} in segment,
      {formatElapsed(clock.inTalk)} in talk{clock.overrun ? ', overrunning' : ''}, ends
      {new Date(clock.projectedEnd!).toLocaleTimeString()}
    {:else}
      {$session.status}{$session.status === 'finished' ? ` after ${formatElapsed(clock?.inTalk ?? 0)}` : ''},
      {$session.events.length} events
    {/if}
  </p>
</section>
