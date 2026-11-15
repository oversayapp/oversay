<script lang="ts">
  // Settings › Recordings (ADR 0041): Auto record,
  // whether this computer lets Oversay use the microphone, where recordings go (shown, not chosen),
  // whether a recording is kept once it is transcribed, and Whisper's speech model, downloaded once
  // on this computer, which can be removed here.
  import { invoke } from '@tauri-apps/api/core'
  import { onMount } from 'svelte'
  import { recording } from '../lib/sessions/recording'
  import { settings, setAutoRecord, setKeepRecordings } from '../lib/settings/store'
  import { removeSpeechModel, readSpeechModel, type SpeechModel } from '../lib/sessions/whisper'
  import { attempt } from './errors'

  let model = $state<SpeechModel | null>(null)
  onMount(() => attempt(async () => void (model = await readSpeechModel())))
  const mb = (bytes: number) => `${Math.round(bytes / 1_000_000)} MB`

  // `granted`, `refused`, `ask` (asked the first time) or `unknown` (Windows says only when recording),
  // asked again whenever a recording changes, since a refusal shows then.
  let microphone = $state('unknown')
  $effect(() => {
    void $recording
    invoke<string>('microphone_status')
      .then((s) => (microphone = s))
      .catch(() => {})
  })
  const refused = $derived(microphone === 'refused' || $recording?.state === 'refused')
  const onWindows = typeof navigator !== 'undefined' && /Windows/.test(navigator.userAgent)
  const auto = $derived(!!$settings.autoRecord)
</script>

<label class="switch"
  ><input type="checkbox" role="switch" checked={auto} onchange={(e) => attempt(() => setAutoRecord(e.currentTarget.checked))} /> Auto record</label
>
<p class="muted hint">
  {auto
    ? 'On: every deck records your voice from Start, until you stop it with the record button on the deck widget or the deck ends.'
    : 'Off: a deck doesn’t record until you press the record button on the deck widget. Turn it on to record every deck from Start.'}
  Only your voice, from this computer’s microphone: never the call’s audio or anyone else’s. It is transcribed here, card by card.
</p>

<h3>Microphone</h3>
{#if refused}
  <p class="mic"><span class="dot warn"></span>Refused.</p>
  <p class="warnbox">
    <b>Oversay can’t use the microphone.</b> Decks still run, without recording. To allow it: {onWindows
      ? 'Settings › Privacy & security › Microphone, then let desktop apps use it.'
      : 'System Settings › Privacy & Security › Microphone › Oversay.'}
  </p>
{:else if microphone === 'granted'}
  <p class="mic"><span class="dot ok"></span>Oversay may use this computer’s microphone.</p>
{:else}
  <p class="mic"><span class="dot"></span>Not asked yet. The first recording asks for it.</p>
{/if}

<h3>Where recordings go</h3>
<p class="where"><code>Documents/Oversay/Decks/&lt;deck&gt;/recordings/&lt;session&gt;.wav</code></p>
<p class="muted hint">Beside each deck, with its sessions, transcripts and reviews. This can’t be changed.</p>

<label class="chk"
  ><input type="checkbox" checked={!!$settings.keepRecordings} onchange={(e) => attempt(() => setKeepRecordings(e.currentTarget.checked))} /> Keep recordings</label
>
<p class="muted hint">
  {$settings.keepRecordings
    ? 'On: a recording stays in its deck’s recordings folder once it is transcribed.'
    : 'Off: a recording is moved to the Trash once it is transcribed.'}
</p>
<div class="row model">
  <span>
    <b>Speech model</b>
    <span class="muted">
      {#if !model}
        &nbsp;
      {:else if model.present}
        Whisper, small English, {mb(model.bytes)}, on this computer.
      {:else}
        Not downloaded. The first recording to transcribe asks before downloading it ({mb(model.bytes)}).
      {/if}
    </span>
  </span>
  <button
    disabled={!model?.present}
    onclick={() =>
      attempt(async () => {
        await removeSpeechModel()
        model = await readSpeechModel()
      })}>Remove</button
  >
</div>

<style>
  .switch,
  .chk {
    display: flex;
    align-items: center;
    gap: 8px;
    font-weight: 600;
  }

  .chk {
    margin-top: 16px;
  }

  .mic {
    display: flex;
    align-items: center;
    gap: 10px;
    margin: 4px 0 0;
  }

  .dot {
    width: 9px;
    height: 9px;
    border-radius: 50%;
    flex: none;
    background: var(--faint);
  }

  .dot.ok {
    background: var(--ok);
  }

  .dot.warn {
    background: var(--warn);
  }

  .warnbox {
    margin: 8px 0 0;
    padding: 9px 12px;
    border-radius: 10px;
    background: var(--warn-bg);
    color: var(--warn);
    font-size: 13px;
  }

  .where {
    margin: 4px 0 0;
    overflow-x: auto;
    white-space: nowrap;
  }

  .model {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    margin-top: 16px;
  }

  .model > span {
    display: flex;
    flex-direction: column;
  }
</style>
