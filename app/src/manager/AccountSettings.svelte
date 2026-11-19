<script lang="ts">
  // Settings › Account (ADR 0050, spec §14): the only place Oversay offers an account. Signed out,
  // Sign in and Create account open Cognito's page in the browser; signed in, the email and Sign out.
  // Tokens stay in Rust: this only shows the status it gives.
  import { listen } from '@tauri-apps/api/event'
  import { onMount } from 'svelte'
  import { ACCOUNT_EVENT, account, cancelSignIn, loadAccount, signIn, signOut } from '../lib/account/account'
  import { attempt } from './errors'

  let busy = $state(false)
  const run = (action: () => Promise<unknown>) =>
    attempt(async () => {
      busy = true
      try {
        await action()
      } finally {
        busy = false
      }
    })

  onMount(() => {
    void attempt(loadAccount)
    // A sign-in coming back through the browser, or a sign-out because the token was refused.
    const unlisten = listen(ACCOUNT_EVENT, () => attempt(loadAccount))
    return () => void unlisten.then((u) => u())
  })
</script>

{#if $account === null}
  <p class="muted hint">&nbsp;</p>
{:else if $account.state === 'unavailable'}
  <p class="muted hint">This build of Oversay has no account.</p>
{:else if $account.state === 'signedIn'}
  <p class="who">Signed in as <strong>{$account.email}</strong></p>
  <div class="row">
    <button disabled={busy} onclick={() => run(signOut)}>Sign out</button>
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
  .error {
    margin: 0 0 10px;
    color: var(--danger);
  }
</style>
