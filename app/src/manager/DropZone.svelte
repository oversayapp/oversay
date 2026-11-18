<script lang="ts">
  // A note file dragged over the window: the whole
  // window says what will happen before the person lets go. Tauri's own drop event gives the
  // files' paths, which an HTML drop doesn't.
  import { onMount } from 'svelte'
  import { getCurrentWebview } from '@tauri-apps/api/webview'
  import { fileName, planDrop } from '../lib/notes/drop'
  import { dropBlocked, dropOver, dropOwner, dropTargetName, handleDrop, onSessionPage } from './drop'
  import Icon from './Icon.svelte'

  // On a workspace's page (or a deck with a workspace to go to) every file is a resource: those are listed instead.
  let resources = $state<string[] | null>(null)
  /** The workspace a drop adds to. */
  let target = $state('this workspace')
  // On a session's page the file is its transcript (ADR 0041).
  let transcript = $state<string | null>(null)

  onMount(() => {
    const stop = getCurrentWebview().onDragDropEvent((e) => {
      if (e.payload.type === 'enter') {
        const owner = dropOwner()
        transcript = onSessionPage() ? (e.payload.paths[0] ?? null) : null
        resources = owner && !transcript ? e.payload.paths : null
        target = owner ? dropTargetName(owner) : 'this workspace'
        dropOver.set(planDrop(e.payload.paths))
      }
      else if (e.payload.type === 'leave') dropOver.set(null)
      else if (e.payload.type === 'drop') handleDrop(e.payload.paths)
    })
    return () => void stop.then((unlisten) => unlisten())
  })

  const blocked = $derived($dropOver && !resources && !transcript ? dropBlocked() : null)
  const readable = $derived(!!transcript && /\.(vtt|srt|txt)$/i.test(transcript))
  const title = $derived.by(() => {
    const plan = $dropOver
    if (!plan) return ''
    if (transcript) return readable ? 'Drop to add as this session’s transcript' : 'Oversay reads .vtt, .srt and .txt transcripts'
    if (resources) return resources.length === 1 ? `Drop to add to ${target}` : `Drop to add ${resources.length} files to ${target}`
    if (blocked) return blocked
    if (plan.notes.length === 0) return 'Nothing here Oversay can add'
    return plan.notes.length === 1 ? 'Drop to add as a deck' : `Drop to add ${plan.notes.length} decks`
  })
</script>

{#if $dropOver}
  <div class="zone" aria-live="polite">
    <div class="box" class:off={transcript ? !readable : !resources && (blocked || $dropOver.notes.length === 0)}>
      <Icon name={resources || transcript ? 'file' : 'note'} size={22} />
      <b>{title}</b>
      {#if transcript}
        <p class="muted">From Zoom, Teams or Meet: it's lined up with the cards by time, and you can check it before it's saved.</p>
        <div class="files">
          <div><span class="grow">{fileName(transcript)}</span>{#if readable}<span class="ok">Transcript</span>{:else}<span class="no">Not a transcript</span>{/if}</div>
        </div>
      {:else if resources}
        <p class="muted">A copy goes into {target}’s resources folder. The files stay where they are.</p>
        <div class="files">
          {#each resources as path (path)}<div><span class="grow">{fileName(path)}</span><span class="ok">Resource</span></div>{/each}
        </div>
      {:else}
        {#if !blocked && $dropOver.notes.length > 0}
          <p class="muted">A copy goes into Documents › Oversay › Decks. The files stay where they are.</p>
        {/if}
        <div class="files">
          {#each $dropOver.notes as path (path)}<div><span class="grow">{fileName(path)}</span><span class="ok">Note</span></div>{/each}
          {#each $dropOver.left as l (l.path)}<div><span class="grow">{fileName(l.path)}</span><span class="no">{l.why}</span></div>{/each}
        </div>
      {/if}
    </div>
  </div>
{/if}

<style>
  .zone {
    position: fixed;
    inset: 0;
    z-index: 60;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 24px;
    background: color-mix(in srgb, var(--bg) 70%, transparent);
    pointer-events: none;
  }

  .box {
    border: 3px dashed var(--accent);
    border-radius: 20px;
    background: var(--accent-soft);
    padding: 32px 36px;
    text-align: center;
    max-width: 520px;
    width: 100%;
    color: var(--accent-text);
  }

  .box.off {
    border-color: var(--line-strong);
    background: var(--side);
    color: var(--muted);
  }

  b {
    display: block;
    font-size: 20px;
    margin: 8px 0 4px;
    color: var(--text);
  }

  .muted {
    margin: 0;
  }

  .files {
    display: grid;
    gap: 6px;
    margin-top: 14px;
    text-align: left;
  }

  .files div {
    display: flex;
    gap: 8px;
    align-items: center;
    background: var(--card);
    border-radius: 9px;
    padding: 6px 10px;
    font-size: 13px;
    color: var(--text);
  }

  .grow {
    flex: 1;
    min-width: 0;
    overflow-wrap: anywhere;
  }

  .ok {
    font-size: 12px;
    font-weight: 600;
    color: var(--ok);
  }

  .no {
    font-size: 12px;
    color: var(--danger);
  }
</style>
