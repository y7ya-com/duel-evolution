<script>
  import Owned from './Owned.svelte';
  import { draw, background } from '../../screens/social.js';
  let { view } = $props();
</script>

<Owned {view} {draw} {background} />
