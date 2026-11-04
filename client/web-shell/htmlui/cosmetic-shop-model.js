import { applyNativeAppearance } from './native-appearance.js';
// The shop controller is independent of the engine and DOM. Requests always use
// the authenticated server's balances/catalogue; a reveal never grants anything.
export const BOX_NAMES = { hair: 'Hair Box', dueldisk: 'Duel Disk Box', outfit: 'Outfit Box' };
export const RARITY_NAMES = { common: 'Common', rare: 'Rare', super: 'Super Rare', ultra: 'Ultra Rare' };
export const RARITY_ORDER = ['common', 'rare', 'super', 'ultra'];
export const shopRequest = async (path, body) => {
  const r = await fetch((globalThis.ENV?.YO2_DE_HTTP || '') + '/api/de/' + path, {
    method: body === undefined ? 'GET' : 'POST', credentials: 'same-origin', cache: 'no-store',
    ...(body === undefined ? {} : { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok || data.error) {
    const messages = {
      'not-in-game': 'Enter the game before opening the shop.', 'no-character': 'Select your character first.',
      'server-restarting': 'The server is restarting. Try again after reconnecting.', 'free-mode': 'Cosmetic boxes are available in the online world.',
      'busy': 'Finish your current duel or trade first.', 'in-duel': 'Finish your duel before changing appearance or opening boxes.',
      'insufficient-earned-mp': 'You need more earned MP. Starter MP cannot pay for cosmetic boxes.',
      'stale-request': 'The shop has changed. Refresh and confirm your purchase again.',
      'request-id-conflict': 'Refresh the shop before making a different purchase.', 'request-conflict': 'Refresh before making a different purchase.',
      'unavailable-pool': 'This box is unavailable for your current appearance.', 'not-owned': 'Unlock this appearance before equipping it.',
      'no-compatible-variant': 'This appearance cannot be worn with the selected body or world.',
      'trade-restricted': 'Cosmetic trading is unavailable for this account.', 'bad-offer': 'Choose an available player and a duplicate to offer.',
      'unavailable': 'That player is unavailable for trading right now.', 'too-many-offers': 'Close an existing offer before creating another.',
      'insufficient-duplicates': 'The extra copies needed for this trade are no longer available.', 'offer-closed': 'This trade offer has already ended.',
      'not-found': 'This trade offer is no longer available.', 'purchase-rejected': 'Purchase declined. Check your balance and refresh the shop.',
      'unavailable-item': 'This item is no longer for sale. Refresh the shop.', 'invalid-appearance': 'Choose an available appearance and try again.',
    };
    const error = new Error(messages[data.error] || data.message || 'The request could not be completed. Refresh and try again.'); error.code = data.error; throw error;
  }
  return data;
};
const requestId = () => globalThis.crypto?.randomUUID?.() || `shop-${Date.now()}-${Math.random().toString(36).slice(2)}`;
export function matchingItems(items, { query = '', rarity = 'all', kind = 'all', owned = false } = {}) {
  const q = query.trim().toLocaleLowerCase();
  return (items || []).filter(i => (!q || [i.name, i.id, ...(i.aliases || []), ...(i.variants || []).map(v => v.name)].filter(Boolean).join(' ').toLocaleLowerCase().includes(q))
    && (rarity === 'all' || i.rarity === rarity) && (kind === 'all' || i.kind === kind)
    && (!owned || i.owned || i.copies > 0));
}
export function cosmeticShopController({ request = shopRequest, changed = () => {}, newRequestId = requestId, canPurchase = () => true } = {}) {
  let generation = 0;
  const pendingOpens = new Map(), pendingBuys = new Map();
  const state = { cosmetics: null, shop: null, busy: false, loading: false, error: '', notice: '', reveal: null, lastErrorCode: '' };
  const emit = () => changed(state);
  const apply = data => { if (data?.boxes || data?.inventory) { applyNativeAppearance(data.appearance); state.cosmetics = data; } return data; };
  const action = async (path, body) => {
    if (state.busy || state.loading) return null;
    const token = generation; state.busy = true; state.error = ''; state.lastErrorCode = ''; state.notice = ''; emit();
    try {
      const data = await request(path, body);
      if (token !== generation) return null;
      return apply(data);
    } catch (e) { if (token === generation) { state.error = e.message || 'Could not complete the request.'; state.lastErrorCode = e.code || ''; } return null; }
    finally { if (token === generation) { state.busy = false; emit(); } }
  };
  return {
    state,
    reset() { generation++; pendingOpens.clear(); pendingBuys.clear(); Object.assign(state, { cosmetics: null, shop: null, busy: false, loading: false, error: '', notice: '', reveal: null, lastErrorCode: '' }); emit(); },
    async refresh({ shop = false } = {}) {
      if (state.busy || state.loading) return;
      const token = generation; state.loading = true; state.error = ''; emit();
      const results = await Promise.allSettled([request('cosmetics'), ...(shop ? [request('shop')] : [])]);
      if (token !== generation) return;
      if (results[0].status === 'fulfilled') apply(results[0].value);
      else state.error = results[0].reason?.message || 'Cosmetics could not be loaded.';
      if (shop && results[1].status === 'fulfilled') state.shop = results[1].value;
      else if (shop && results[1].status === 'rejected') state.error ||= results[1].reason?.message || 'The shop could not be loaded.';
      state.loading = false; emit();
    },
    hasPendingOpen: boxId => pendingOpens.has(boxId),
    async open(boxId) {
      if (!canPurchase()) { state.error = 'Visit the Card Shop to buy cosmetic boxes.'; emit(); return false; }
      const box = state.cosmetics?.boxes?.find(b => b.id === boxId);
      if (!box || state.cosmetics.available === false) { state.error = state.cosmetics?.reason || 'This box is unavailable right now.'; emit(); return false; }
      if (!pendingOpens.has(boxId) && (state.cosmetics.wallet?.earned ?? 0) < box.price) { state.error = 'Earn more MP from duels to open this box. Starter MP stays available for cards.'; emit(); return false; }
      const id = pendingOpens.get(boxId) || state.cosmetics.nextRequestId;
      if (!id) { state.error = 'Refresh the box catalogue before opening.'; emit(); return false; }
      pendingOpens.set(boxId, id);
      const data = await action('cosmetics/open', { boxId, requestId: id });
      if (!data && ['stale-request', 'request-conflict'].includes(state.lastErrorCode)) pendingOpens.delete(boxId);
      if (data) { pendingOpens.delete(boxId); state.reveal = data.reward || data.result || null; emit(); }
      return !!data;
    },
    dismissReveal() { state.reveal = null; emit(); },
    async equip(id, world) {
      const data = await action('cosmetics/equip', { id, ...(world === undefined ? {} : { world }) });
      if (data) { state.notice = 'Appearance equipped.'; emit(); }
      return !!data;
    },
    async appearance(body) {
      const data = await action('cosmetics/appearance', body);
      if (data) { state.notice = 'Appearance saved.'; emit(); }
      return !!data;
    },
    async buy(itemId, count = 1) {
      if (!canPurchase()) { state.error = 'Visit the Card Shop to make purchases.'; emit(); return false; }
      if (!Number.isSafeInteger(count) || count < 1 || count > 50) { state.error = 'Choose a quantity from 1 to 50.'; emit(); return false; }
      const key = `${itemId}:${count}`, id = pendingBuys.get(key) || state.shop?.nextRequestId;
      if (!id) { state.error = 'Refresh the shop before purchasing.'; emit(); return false; }
      pendingBuys.set(key, id);
      const data = await action('shop/buy', { itemId, count, requestId: id });
      if (!data) { if (['stale-request', 'request-id-conflict'].includes(state.lastErrorCode)) pendingBuys.delete(key); return false; }
      pendingBuys.delete(key);
      if (data.items) state.shop = data;
      else if (data.shop) state.shop = data.shop;
      if (data.wallet && state.cosmetics) state.cosmetics.wallet = data.wallet;
      state.notice = 'Purchase complete. Your cards are in your collection.'; emit(); return true;
    },
    async offerTrade(targetPid, give, want) {
      const data = await action('cosmetics/trade', { targetPid, give, want, requestId: newRequestId() });
      if (data) { state.notice = 'Trade offer sent. The other player must accept.'; emit(); }
      return !!data;
    },
    async tradeAction(actionName, offerId) {
      if (!['accept', 'cancel', 'decline'].includes(actionName)) return false;
      const data = await action('cosmetics/trade/' + actionName, { offerId });
      if (data) { state.notice = actionName === 'accept' ? 'Trade completed.' : 'Trade offer closed.'; emit(); }
      return !!data;
    },
  };
}
