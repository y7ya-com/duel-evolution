<script>
  import Owned from './Owned.svelte';
  import { drawControl } from '../../screens/chat.js';
  let { view } = $props();
</script>

<Owned {view} draw={drawControl} />
