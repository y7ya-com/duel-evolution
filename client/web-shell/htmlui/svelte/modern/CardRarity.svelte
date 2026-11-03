<script>
  import { CARD_RARITY_LABELS, rarityForInternalId, subscribeRarities, loadRarities, installRarityStyles } from '../../card-rarity.js';
  let { id = 0, code = null } = $props();
  let revision = $state(0);
  $effect(() => {
    installRarityStyles();
    const unsubscribe = subscribeRarities(() => revision++);
    void loadRarities();
    return unsubscribe;
  });
  const rarity = $derived((revision, Object.hasOwn(CARD_RARITY_LABELS, code) ? code : rarityForInternalId(id)));
</script>

{#if rarity}<span class="de-card-rarity" data-rarity={rarity} title={CARD_RARITY_LABELS[rarity]} aria-label="Card rarity: {CARD_RARITY_LABELS[rarity]}">{rarity}</span>{/if}
