<script lang="ts">
  // Templates (epic 036 (#54)): the picker's layout as a page. Starting a deck from one opens it in the editor.
  import { attempt } from './errors'
  import { startDeckFromTemplate } from './new'
  import TemplateBrowser from './TemplateBrowser.svelte'
</script>

<div class="page">
  <TemplateBrowser mode="page" onstart={(t) => attempt(() => startDeckFromTemplate(t))} />
</div>

<style>
  .page {
    height: 100%;
  }
</style>
