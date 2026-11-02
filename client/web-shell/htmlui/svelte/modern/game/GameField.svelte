<script>
  // A game field: the shared one over a game input (../Field.svelte: the game's text, setText, its focus), in the inset
  // slot look (theme.js .mu-field). Same props as Field.
  import Field from '../Field.svelte';
  let props = $props();
</script>

<Field {...props} />
