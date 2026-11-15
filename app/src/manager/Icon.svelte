<script lang="ts">
  import { ICONS, type IconName } from './icons'

  let { name, size = 18 }: { name: IconName; size?: number } = $props()
</script>

<svg
  width={size}
  height={size}
  viewBox="0 0 24 24"
  fill="none"
  stroke="currentColor"
  stroke-width="1.7"
  stroke-linecap="round"
  stroke-linejoin="round"
  aria-hidden="true"
  style="flex: none"
>
  <!-- eslint-disable-next-line svelte/no-at-html-tags -- ICONS is constant SVG markup in icons.ts, never data -->
  {@html ICONS[name]}
</svg>
