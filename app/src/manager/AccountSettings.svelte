<script lang="ts">
  // Settings › Account (ADR 0050, spec §14): the only place Oversay offers an account. Signed out,
  // Sign in and Create account open Cognito's page in the browser; signed in, the email and Sign out.
  // Tokens stay in Rust: this only shows the status it gives.
  import { onMount } from 'svelte'
  import { account, cancelSignIn, loadAccount, signIn, signOut } from '../lib/account/account'
  import { loadSync, outcomeText, sync, turnSyncOff, turnSyncOn } from '../lib/account/sync'
  import { account, cancelSignIn, deleteAccount, loadAccount, signIn, signOut } from '../lib/account/account'
  import ConfirmDelete from './ConfirmDelete.svelte'
  import { attempt } from './errors'

  let busy = $state(false)
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
  onMount(() => void attempt(loadAccount).then(() => attempt(loadSync)))
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
  <p class="who">Signed in as <strong>{$account.email}</strong></p>
  {#if $sync}
    <div class="save">
      <label class="check">
        <input
          type="checkbox"
          checked={$sync.on}
          disabled={busy || $sync.working}
          onchange={async (e) => {
            const box = e.currentTarget
            await run(box.checked ? turnSyncOn : turnSyncOff)
            // A failed turn-on leaves it off: the box says so too.
            box.checked = $sync?.on ?? false
          }}
        />
        Save decks to the cloud
      </label>
      {#if $sync.working}
        <p class="muted hint" role="status">Saving your decks…</p>
      {:else if $sync.problem}
        <p class="error" role="alert">{$sync.problem}</p>
      {:else if $sync.last}
        <p class="muted hint" role="status">{outcomeText($sync.last)}</p>
      {/if}
      <p class="muted hint">Saves each deck's cards and sessions to your account, so they're on your other computers too. Recordings, transcripts and resources stay on this computer.</p>
    </div>
  {/if}
  <div class="row">
    {#if deleting}
      <ConfirmDelete
        label="Delete account"
        onconfirm={() => {
          deleting = false
          void run(deleteAccount)
        }}
        oncancel={() => (deleting = false)}
        >Delete your account? Your account and every deck saved under it in the cloud are deleted for good, and this can't be undone. Decks on this computer stay.</ConfirmDelete
      >
    {:else}
      <button disabled={busy} onclick={() => run(signOut)}>Sign out</button>
      <button class="danger" disabled={busy} onclick={() => (deleting = true)}>Delete account…</button>
    {/if}
  </div>
  <p class="muted hint">Signing out leaves every deck on this computer as it is.</p>
{:else if $account.state === 'signingIn'}
  <p class="who" role="status">Finish signing in in your browser.</p>
  <div class="row">
    <button onclick={() => run(cancelSignIn)}>Cancel</button>
    <button onclick={() => run(() => signIn('signIn'))}>Open the page again</button>
  </div>
  <p class="muted hint">When you're done, your browser brings you back to Oversay.</p>
{:else}
  {#if $account.problem}<p class="error" role="alert">{$account.problem}</p>{/if}
  <div class="row">
    <button class="primary" disabled={busy} onclick={() => run(() => signIn('signIn'))}>Sign in</button>
    <button disabled={busy} onclick={() => run(() => signIn('signUp'))}>Create account</button>
  </div>
  <p class="muted hint">
    An account is optional. With one, Oversay can save your decks to the cloud, so they're on your other computers too; without one, everything stays on
    this computer. Your browser opens to sign in with Apple, Google, or an email and password, and Oversay never sees your password.
  </p>
{/if}

<style>
  .who {
    margin: 0 0 10px;
  }
  .save {
    margin: 0 0 14px;
  }
  .check {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .error {
    margin: 0 0 10px;
    color: var(--danger);
  }
</style>
