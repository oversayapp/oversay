<script lang="ts">
  // Settings → Shortcuts (006/03): the session
  // hotkeys, each changeable by pressing the new keys. A clash with another of these, or with
  // another app, shows straight away.
  import { invoke } from '@tauri-apps/api/core'
  import { logAction } from '../lib/log'
  import {
    NOT_YET,
    SHORTCUT_ACTIONS,
    SHORTCUT_LABELS,
    acceleratorFromKey,
    effectiveShortcuts,
    isMac,
    shortcutKeys,
    shortcutText,
    type ShortcutAction,
  } from '../lib/session/shortcuts'
  import { resetShortcuts, setShortcut, settings } from '../lib/settings/store'
  import { attempt } from './errors'

  const mac = isMac()
  const current = $derived(effectiveShortcuts($settings.shortcuts, mac))
  const customised = $derived(Object.keys($settings.shortcuts ?? {}).length > 0)

  let recording = $state<ShortcutAction | null>(null)
  let problem = $state<{ action: ShortcutAction; message: string } | null>(null)

  function record(action: ShortcutAction) {
    logAction('shortcut change', action)
    problem = null
    recording = recording === action ? null : action
  }

  async function onKey(e: KeyboardEvent) {
    if (!recording) return
    e.preventDefault()
    e.stopPropagation()
    if (e.key === 'Escape') {
      recording = null
      return
    }
    const action = recording
    const accelerator = acceleratorFromKey(e)
    if (!accelerator) {
      if (!/^(Control|Alt|Shift|Meta|OS)/.test(e.code)) {
        problem = { action, message: `Hold ${mac ? 'Control, Option or Command' : 'Ctrl, Alt or Windows'} as well, so ordinary typing isn't taken.` }
      }
      return
    }
    recording = null
    const other = SHORTCUT_ACTIONS.find((a) => a !== action && current[a] === accelerator)
    if (other) {
      problem = { action, message: `${shortcutText(accelerator, mac)} is already used for ${SHORTCUT_LABELS[other]}.` }
      return
    }
    try {
      await invoke('check_shortcut', { accelerator })
    } catch (error) {
      problem = { action, message: `${shortcutText(accelerator, mac)} can't be used: ${String(error).replace(accelerator, 'it')}. Choose different keys.` }
      return
    }
    await setShortcut(action, accelerator)
  }
</script>

<svelte:window onkeydowncapture={(e) => void onKey(e)} />

<p class="muted hint">
  These work while another app (your slides, a browser, Zoom) is in front, and only while a session is open. A
  change applies from the next session.
</p>
<table>
  <tbody>
    {#each SHORTCUT_ACTIONS as action (action)}
      <tr>
        <td>
          {SHORTCUT_LABELS[action]}
          {#if NOT_YET[action]}<span class="faint">· {NOT_YET[action]}</span>{/if}
          {#if problem?.action === action}<div class="err" role="alert">{problem.message}</div>{/if}
        </td>
        <td class="keys-cell">
          {#if recording === action}
            <span class="recording">Press the new keys… <span class="faint">Esc to cancel</span></span>
          {:else}
            <span class="keys" aria-label={shortcutText(current[action], mac)}>
              {#each shortcutKeys(current[action], mac) as k, i (i)}<kbd>{k}</kbd>{/each}
            </span>
          {/if}
        </td>
        <td class="end">
          <button onclick={() => record(action)}>{recording === action ? 'Cancel' : 'Change'}</button>
        </td>
      </tr>
    {/each}
  </tbody>
</table>
<div class="row">
  <button disabled={!customised} onclick={() => attempt(resetShortcuts)}>Restore default shortcuts</button>
</div>
{#if !mac}
  <p class="muted hint">The defaults add Shift: some graphics drivers rotate the screen on Ctrl+Alt+arrow.</p>
{/if}

<style>
  table {
    width: 100%;
    border-collapse: collapse;
    margin: 4px 0 10px;
  }

  td {
    padding: 8px 6px;
    border-bottom: 1px solid var(--line);
  }

  .keys-cell {
    white-space: nowrap;
  }

  .end {
    text-align: right;
    width: 1%;
  }

  .keys {
    display: inline-flex;
    gap: 3px;
  }

  kbd {
    font: 600 12px/1 ui-monospace, Menlo, monospace;
    border: 1px solid var(--line-strong);
    border-bottom-width: 2px;
    border-radius: 5px;
    padding: 4px 6px;
    color: var(--muted);
    background: var(--bg);
  }

  .recording {
    display: inline-flex;
    gap: 8px;
    border: 1.5px dashed var(--accent);
    border-radius: 8px;
    padding: 3px 10px;
    color: var(--accent-text);
    font-size: 13px;
  }

  .faint {
    color: var(--faint);
    font-size: 12.5px;
  }

  .err {
    color: var(--danger);
    font-size: 12.5px;
    margin-top: 4px;
  }

  .hint {
    font-size: 13px;
  }
</style>
