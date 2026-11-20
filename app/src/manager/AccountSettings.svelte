<script lang="ts">
  // Settings › Account (ADR 0050, spec §14): the only place Oversay offers an account. Signed out,
  // Sign in and Create account open Cognito's page in the browser; signed in, the email and Sign out.
  // Tokens stay in Rust: this only shows the status it gives.
  import { onMount } from 'svelte'
  import { loadSync, sync, turnSyncOff, turnSyncOn } from '../lib/account/sync'
  import { initialOf, PRIVACY_LINE, PRIVACY_URL, syncLine, TERMS_URL } from '../lib/account/summary'
  import { openUrl } from '@tauri-apps/plugin-opener'
  import { account, cancelSignIn, deleteAccount, loadAccount, signIn, signOut } from '../lib/account/account'
  import Icon from './Icon.svelte'
  import AccountAvatar from './AccountAvatar.svelte'
  import { goLibrary } from './route'
  import { attempt } from './errors'

  let busy = $state(false)
  const line = $derived($sync ? syncLine($sync) : null)
  let deleting = $state(false)
  const run = (action: () => Promise<unknown>) =>
    attempt(async () => {
      busy = true
      try {
        await action()
      } finally {
        busy = false
      }
    })

  // Manager.svelte keeps it current from then on (ACCOUNT_EVENT).
  onMount(() => {
    void attempt(loadAccount).then(() => attempt(loadSync))
  })
  // Signed out elsewhere, or by Sign out: Rust turned saving off too.
  $effect(() => {
    if ($account?.state === 'signedOut') void attempt(loadSync)
  })
</script>

{#if $account === null}
  <p class="muted hint">&nbsp;</p>
{:else if $account.state === 'unavailable'}
  <p class="muted hint">This build of Oversay has no account.</p>
{:else if $account.state === 'signedIn'}
  <div class="who">
    <AccountAvatar initial={initialOf($account.email)} size={36} />
    <div>
      <strong>{$account.email}</strong>
      <p class="muted small">Signed in</p>
    </div>
  </div>
  {#if $sync}
    <div class="save">
      <p class="label">Cloud saving</p>
      <label class="switch">
        <input
          type="checkbox"
          role="switch"
          checked={$sync.on}
          disabled={busy || $sync.working}
          onchange={async (e) => {
            const box = e.currentTarget
            await run(box.checked ? turnSyncOn : turnSyncOff)
            // A failed turn-on leaves it off: the box says so too.
            box.checked = $sync?.on ?? false
          }}
        />
        <span class="track" aria-hidden="true"></span>
        Save decks to the cloud
      </label>
      {#if $sync.problem && !line}
        <p class="error" role="alert">{$sync.problem}</p>
      {/if}
      {#if line}
        <div class="status {line.tone}" role="status">
          <span class="statusdot"></span>
          <div>
            <b>{line.title}</b>
            {#if line.detail}<small>{line.detail}</small>{/if}
          </div>
        </div>
        {#if $sync.conflicts.length > 0}
          <div class="row"><button onclick={() => goLibrary()}>Show in Library</button></div>
        {/if}
      {/if}
      <p class="muted hint">Saves each deck's cards and sessions to your account, so they're on your other computers too. Recordings, transcripts and resources stay on this computer.</p>
    </div>
  {/if}
  {#if deleting}
    <div class="confirm" role="alertdialog" aria-label="Delete account">
      <p class="ask">Delete your account?</p>
      <ul>
        <li><b>Deleted for good:</b> your account and every deck saved under it in the cloud. This can't be undone.</li>
        <li><b>Kept:</b> every deck on this computer.</li>
      </ul>
    </div>
    <div class="row">
      <button
        class="solid"
        onclick={() => {
          deleting = false
          void run(deleteAccount)
        }}>Delete account</button
      >
      <button onclick={() => (deleting = false)}>Cancel</button>
    </div>
  {:else}
    <div class="row apart">
      <button disabled={busy} onclick={() => run(signOut)}>Sign out</button>
      <button class="danger" disabled={busy} onclick={() => (deleting = true)}>Delete account…</button>
    </div>
    <p class="muted hint">Signing out leaves every deck on this computer as it is.</p>
  {/if}
{:else if $account.state === 'signingIn'}
  <div class="waiting" role="status">
    <svg class="spin" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke-width="2.5" stroke-linecap="round" aria-hidden="true"
      ><circle cx="12" cy="12" r="9" stroke="var(--accent-soft)" /><path d="M12 3a9 9 0 0 1 9 9" stroke="var(--accent)" /></svg
    >
    <div>
      <strong>Waiting for your browser</strong>
      <p class="muted small">Finish signing in in the window that just opened. When you're done, it brings you back to Oversay.</p>
    </div>
  </div>
  <div class="row">
    <button class="primary" onclick={() => run(() => signIn('signIn'))}>Open the page again</button>
    <button onclick={() => run(cancelSignIn)}>Cancel</button>
  </div>
{:else}
  {#if $account.problem}<p class="error" role="alert">{$account.problem}</p>{/if}
  <p class="lead">Keep your decks on every computer</p>
  <ul class="perks">
    <li><span class="tick"><Icon name="check" size={12} /></span>Your cards and sessions are saved to your account and appear on your other computers</li>
    <li><span class="tick"><Icon name="check" size={12} /></span>Optional: without an account everything stays on this computer</li>
    <li><span class="tick"><Icon name="check" size={12} /></span>Sign in with Apple, Google or email. Oversay never sees your password</li>
  </ul>
  <div class="row">
    <button class="primary" disabled={busy} onclick={() => run(() => signIn('signIn'))}>Sign in</button>
    <button disabled={busy} onclick={() => run(() => signIn('signUp'))}>Create account</button>
  </div>
  <p class="muted hint">
    {PRIVACY_LINE} By signing in or creating an account, you agree to the
    <button class="link" onclick={() => attempt(() => openUrl(TERMS_URL))}>Terms</button> and the
    <button class="link" onclick={() => attempt(() => openUrl(PRIVACY_URL))}>Privacy policy</button>.
  </p>
{/if}

<style>
  .link {
    padding: 0;
    border: 0;
    background: none;
    color: var(--accent);
    font: inherit;
    cursor: pointer;
  }
  .who {
    display: flex;
    align-items: center;
    gap: 12px;
    margin: 0 0 14px;
  }
  .who :global(.av) {
    --rail: var(--card);
  }
  .small {
    margin: 0;
    font-size: 13px;
  }
  .label {
    margin: 0 0 8px;
    font-size: 12px;
    font-weight: 700;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: var(--muted);
  }
  .save {
    margin: 0 0 14px;
  }
  .switch {
    display: flex;
    align-items: center;
    gap: 10px;
    font-weight: 600;
  }
  .switch input {
    position: absolute;
    opacity: 0;
    width: 34px;
    height: 20px;
    margin: 0;
  }
  .track {
    flex: none;
    position: relative;
    width: 34px;
    height: 20px;
    border-radius: 10px;
    background: var(--line-strong);
    transition: background 0.12s;
  }
  .track::after {
    content: '';
    position: absolute;
    top: 2px;
    left: 2px;
    width: 16px;
    height: 16px;
    border-radius: 50%;
    background: #fff;
    transition: transform 0.12s;
  }
  .switch input:checked + .track {
    background: var(--accent);
  }
  .switch input:checked + .track::after {
    transform: translateX(14px);
  }
  .switch input:focus-visible + .track {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }
  .switch input:disabled + .track {
    opacity: 0.5;
  }
  .status {
    display: flex;
    gap: 10px;
    align-items: flex-start;
    margin: 12px 0;
    padding: 12px 14px;
    border-radius: 10px;
    line-height: 1.4;
  }
  .status b {
    display: block;
    font-weight: 650;
  }
  .status small {
    display: block;
    margin-top: 2px;
    font-size: 13px;
  }
  .statusdot {
    flex: none;
    width: 10px;
    height: 10px;
    border-radius: 50%;
    margin-top: 5px;
  }
  .status.ok {
    background: var(--ok-bg);
    color: var(--ok);
  }
  .status.ok .statusdot {
    background: var(--ok);
  }
  .status.busy {
    background: var(--accent-soft);
    color: var(--accent-text);
  }
  .status.busy .statusdot {
    background: var(--accent);
  }
  .status.warn {
    background: var(--warn-bg);
    color: var(--warn);
  }
  .status.warn .statusdot {
    background: var(--warn);
  }
  .apart {
    border-top: 1px solid var(--line);
    padding-top: 16px;
  }
  .confirm {
    background: var(--danger-bg);
    border: 1px solid var(--danger);
    border-radius: 10px;
    padding: 14px 16px;
    margin: 0 0 12px;
  }
  .ask {
    margin: 0 0 8px;
    font-weight: 700;
    color: var(--danger);
  }
  .confirm ul {
    margin: 0;
    padding-left: 18px;
    line-height: 1.55;
  }
  .solid {
    background: var(--danger);
    border-color: var(--danger);
    color: #fff;
  }
  .solid:hover:not(:disabled) {
    background: var(--danger);
    filter: brightness(0.92);
  }
  .waiting {
    display: flex;
    align-items: center;
    gap: 14px;
    margin: 0 0 14px;
  }
  .spin {
    flex: none;
    animation: spin 1s linear infinite;
  }
  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .spin {
      animation: none;
    }
  }
  .lead {
    margin: 0 0 10px;
    font-size: 15px;
    font-weight: 600;
  }
  .perks {
    list-style: none;
    margin: 0 0 14px;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .perks li {
    display: flex;
    gap: 10px;
    align-items: flex-start;
    line-height: 1.4;
  }
  .tick {
    flex: none;
    width: 18px;
    height: 18px;
    border-radius: 50%;
    background: var(--ok-bg);
    color: var(--ok);
    display: flex;
    align-items: center;
    justify-content: center;
    margin-top: 1px;
  }
  .error {
    margin: 0 0 10px;
    color: var(--danger);
  }
</style>
