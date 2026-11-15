<script lang="ts">
  // How the overlays look: the Timeline style, Talking Points' panel, text size and
  // what it shows, and how see-through the panels are. One look for every talk and note; the
  // Get ready page, the control panel and Settings › Overlays set the same saved choices.
  import {
    LAYOUT_OPTIONS,
    minOpacity,
    PANEL_OPTIONS,
    shownOpacity,
    TEXT_SIZE_OPTIONS,
    TIMELINE_STYLE_OPTIONS,
    type LookChange,
    type OverlaySettings,
  } from '../lib/settings/overlays'

  let { look, onchange, note = false, compact = false }: { look: OverlaySettings; onchange: (c: LookChange) => void; note?: boolean; compact?: boolean } = $props()

  const styles = TIMELINE_STYLE_OPTIONS
</script>

<div class="look" class:compact>
  <div class="row">
    <span class="ll">Timeline</span>
    <div class="seg" role="radiogroup" aria-label="Timeline style">
      {#each styles as o (o.id)}
        <button
          role="radio"
          aria-checked={look.timelineStyle === o.id}
          title={o.label}
          disabled={note}
          onclick={() => onchange({ key: 'timelineStyle', value: o.id })}>{o.label}</button
        >
      {/each}
    </div>
  </div>
  {#if note}<p class="hint">A shown note has no Timeline.</p>{/if}
  {#each [['panel', 'Panel', PANEL_OPTIONS], ['textSize', 'Text', TEXT_SIZE_OPTIONS], ['layout', 'Shows', LAYOUT_OPTIONS]] as const as [key, label, options] (key)}
    <div class="row">
      <span class="ll">{label}</span>
      <div class="seg" role="radiogroup" aria-label={label}>
        {#each options as o (o.id)}
          <button role="radio" aria-checked={look[key] === o.id} onclick={() => onchange({ key, value: o.id })}>{o.label}</button>
        {/each}
      </div>
    </div>
  {/each}
  <div class="row">
    <span class="ll">Opacity</span>
    <input
      type="range"
      min={minOpacity(look)}
      max="100"
      step="1"
      value={look.solid ? 100 : shownOpacity(look)}
      aria-label="Opacity"
      oninput={(e) => onchange({ key: 'opacityPreview', value: Number(e.currentTarget.value) })}
      onchange={(e) => onchange({ key: 'opacity', value: Number(e.currentTarget.value) })}
    />
    <span class="num">{look.solid ? 'Solid' : `${shownOpacity(look)}%`}</span>
  </div>
  <div class="row">
    <span class="ll"></span>
    <div class="seg" role="radiogroup" aria-label="See-through or solid">
      <button role="radio" aria-checked={!look.solid} onclick={() => onchange({ key: 'solid', value: false })}>See-through</button>
      <button role="radio" aria-checked={look.solid} onclick={() => onchange({ key: 'solid', value: true })}>Solid</button>
    </div>
  </div>
</div>

<style>
  .row {
    display: flex;
    align-items: center;
    gap: 10px;
    margin: 6px 0;
  }

  .ll {
    width: 64px;
    flex: none;
    font-size: 12.5px;
    color: var(--muted);
    font-weight: 600;
  }

  .compact .ll {
    width: 58px;
  }

  .seg {
    display: inline-flex;
    border: 1px solid var(--line-strong);
    border-radius: 9px;
    padding: 2px;
    gap: 2px;
    flex-wrap: wrap;
  }

  .seg button {
    border: 0;
    background: none;
    border-radius: 7px;
    padding: 4px 10px;
    font-size: 12.5px;
    font-weight: 600;
    color: var(--muted);
  }

  .seg button[aria-checked='true'] {
    background: var(--accent-soft);
    color: var(--accent-text);
  }

  .seg button:disabled {
    opacity: 0.4;
  }

  input[type='range'] {
    flex: 1;
    min-width: 80px;
    accent-color: var(--accent);
  }

  .num {
    width: 44px;
    text-align: right;
    font-size: 12.5px;
    font-variant-numeric: tabular-nums;
  }

  .hint {
    margin: 0 0 4px 74px;
    font-size: 11.5px;
    color: var(--faint);
  }
</style>
