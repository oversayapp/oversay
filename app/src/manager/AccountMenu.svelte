<script lang="ts">
  import { account, signIn, signOut } from '../lib/account/account'
  import { initialOf, railAccount, syncLine } from '../lib/account/summary'
  import { sync } from '../lib/account/sync'
  import { attempt } from './errors'
  import AccountAvatar from './AccountAvatar.svelte'
  import { goSettings } from './route'

  // The rail's account item (epic 036): signed out it is Sign in; signed in it shows who, with a dot for
  // how saving is going, and opens a small menu with Sign out. Everything else lives in Settings › Account.
  const item = $derived(railAccount($account, $sync))
  const line = $derived($sync ? syncLine($sync) : null)
  let open = $state(false)
  let root: HTMLDivElement | undefined = $state()

  function click() {
    if (!$account) return
    if ($account.state === 'signedOut') void attempt(() => signIn('signIn'))
    else if ($account.state === 'signingIn') goSettings('account')
    else open = !open
  }
  function outside(e: MouseEvent) {
    if (open && root && !root.contains(e.target as Node)) open = false
  }
  // Signed out elsewhere: nothing left to show.
  $effect(() => {
    if ($account?.state !== 'signedIn') open = false
  })
</script>

<svelte:window onmousedown={outside} onkeydown={(e) => e.key === 'Escape' && (open = false)} />

{#if item}
  <div class="wrap" bind:this={root}>
    <button class="acct" class:active={open} aria-haspopup={$account?.state === 'signedIn' ? 'menu' : undefined} aria-expanded={$account?.state === 'signedIn' ? open : undefined} onclick={click}>
      <AccountAvatar initial={item.initial} tone={item.tone} />
      <span>{item.label}</span>
    </button>
    {#if open && $account?.state === 'signedIn'}
      <div class="menu" role="menu" aria-label="Account">
        <div class="head">
          <AccountAvatar initial={initialOf($account.email)} size={34} />
          <div>
            <strong>{$account.email}</strong>
            <small>Signed in</small>
          </div>
        </div>
        {#if line}<div class="line {line.tone}"><span class="d"></span><b>{line.title}</b></div>{/if}
        <div class="items">
          <button role="menuitem" onclick={() => { open = false; goSettings('account') }}>Account settings</button>
          <button role="menuitem" onclick={() => { open = false; void attempt(signOut) }}>Sign out</button>
        </div>
      </div>
    {/if}
  </div>
{/if}

<style>
  .wrap {
    position: relative;
    display: flex;
    justify-content: center;
  }
  .acct {
    width: 58px;
    border: 0;
    background: none;
    border-radius: 12px;
    padding: 8px 0 6px;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 3px;
    font-size: 11px;
    font-weight: 400;
    color: var(--muted);
  }
  .acct.active {
    background: var(--card);
    box-shadow: 0 1px 3px rgba(20, 30, 60, 0.12);
  }
  .menu {
    position: fixed;
    left: 80px;
    bottom: 12px;
    z-index: 30;
    width: 260px;
    background: var(--card);
    border: 1px solid var(--line);
    border-radius: 12px;
    box-shadow: var(--shadow);
    padding: 14px;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .head {
    display: flex;
    gap: 10px;
    align-items: center;
  }
  .head :global(.av) {
    --rail: var(--card);
  }
  .head div {
    min-width: 0;
  }
  .head strong {
    display: block;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .head small {
    color: var(--muted);
  }
  .line {
    display: flex;
    gap: 8px;
    align-items: center;
    padding: 8px 10px;
    border-radius: 8px;
    font-size: 13px;
  }
  .d {
    width: 8px;
    height: 8px;
    border-radius: 50%;
  }
  .line.ok {
    background: var(--ok-bg);
    color: var(--ok);
  }
  .line.ok .d {
    background: var(--ok);
  }
  .line.busy {
    background: var(--accent-soft);
    color: var(--accent-text);
  }
  .line.busy .d {
    background: var(--accent);
  }
  .line.warn {
    background: var(--warn-bg);
    color: var(--warn);
  }
  .line.warn .d {
    background: var(--warn);
  }
  .items {
    border-top: 1px solid var(--line);
    padding-top: 6px;
    display: flex;
    flex-direction: column;
  }
  .items button {
    border: 0;
    background: none;
    text-align: left;
    padding: 8px 10px;
    font-weight: 500;
  }
</style>
