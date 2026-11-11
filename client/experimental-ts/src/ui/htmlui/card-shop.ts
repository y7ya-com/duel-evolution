// main's new card shop (client/web-shell/htmlui/shop/index.js mountCardShop: the band, the tabs, the pack pages, the
// reveal, the Cosmetic Boxes tab), mounted unchanged as bridge.js does on onYo2ShopOpen. It talks to the server itself
// (server/src/game/shop-api.ts: GET /api/de/shop, GET /api/de/shop/pack, POST /api/de/shop/buy; cosmetics/api.js:
// /api/de/cosmetics), same-origin with the session cookie the rewrite's HttpService uses. Back is the rewrite's Exit
// Store. The host persists across renders (the stage is rebuilt every render; moving the node keeps the shop's state).
export interface CardShopHost {
  /** The shop's host, mounted on first call (the module loads on demand); re-append it into the scene each render. */
  node(): HTMLElement;
  dispose(): void;
}

export function cardShopHost(doc: Document, onBack: () => void, onError: (e: unknown) => void): CardShopHost {
  let host: HTMLElement | null = null, shop: { el: HTMLElement; destroy(): void } | null = null, dead = false;
  // the game's 1024 x 768 at the stage's origin, scaled to its width (bridge.js place(): the canvas's rect), not inside
  // the scene's padding
  const fit = () => { const h = host, p = h?.parentElement; if (h && p?.offsetWidth) h.style.transform = `scale(${p.offsetWidth / 1024})`; };
  const onResize = () => fit();
  return {
    node() {
      if (host) { queueMicrotask(fit); return host; }
      doc.defaultView?.addEventListener('resize', onResize);
      queueMicrotask(fit);
      dead = false;
      const h = host = doc.createElement('div');
      h.className = 'de-card-shop'; h.dataset.key = 'card-shop';
      Object.assign(h.style, { position: 'absolute', left: '0', top: '0', width: '1024px', height: '768px', transformOrigin: '0 0' });
      import('@htmlui/shop/index.js').then(({ mountCardShop }) => {
        if (dead || host !== h) return;
        shop = mountCardShop(h, { onBack });
        shop.el.style.height = '768px';
        shop.el.focus({ preventScroll: true });
      }, onError);
      return h;
    },
    dispose() { doc.defaultView?.removeEventListener('resize', onResize); dead = true; shop?.destroy(); shop = null; host?.remove(); host = null; },
  };
}
