<script lang="ts">
  // Renaming in place: a name field with Rename and Cancel. Enter renames, Escape cancels.
  // Its parts sit in the parent's row (display: contents).
  let {
    initial,
    label,
    onrename,
    oncancel,
  }: { initial: string; label: string; onrename: (name: string) => void; oncancel: () => void } = $props()
</script>

<form
  onsubmit={(e) => {
    e.preventDefault()
    onrename(String(new FormData(e.currentTarget).get('name') ?? ''))
  }}
>
  <!-- svelte-ignore a11y_autofocus -->
  <input
    name="name"
    value={initial}
    aria-label={label}
    autofocus
    onkeydown={(e) => {
      if (e.key === 'Escape') oncancel()
    }}
  />
  <button type="submit" class="primary">Rename</button>
  <button type="button" onclick={oncancel}>Cancel</button>
</form>

<style>
  form {
    display: contents;
  }

  input {
    flex: 1 1 160px;
    min-width: 0;
  }
</style>
