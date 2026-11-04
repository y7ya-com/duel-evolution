import { annotations } from './model.js';

const CSS = `
.yo2-modern-shop .yo2-shop-legacy .shop-frame{border:3px solid #98eaff;border-radius:5px;outline:1px solid #1462a5;background:linear-gradient(180deg,#d7f5ffef,#b6dff0ef);box-shadow:inset 1px 1px #f0ffff,inset -2px -2px #5ea9d0,0 3px 8px #164f7955}
.yo2-modern-shop .yo2-shop-legacy .shop-title{border:1px solid #1b62a2;border-radius:3px;background:linear-gradient(#d9faff,#72c6f1 15%,#2585d0 50%,#155bac);box-shadow:inset 0 1px #e3ffff,inset 0 -2px #124f98;font:700 24px/34px Arial,sans-serif;text-shadow:0 1px #113a70,1px 0 #195c99,-1px 0 #195c99}
.yo2-modern-shop .yo2-shop-legacy .shop-money{border:2px solid #9fe9ff;border-radius:4px;outline-color:#1b5f9f;background:linear-gradient(#6dcaf0,#288bc2 48%,#5fb9de 50%,#176395);box-shadow:inset 0 1px #d1ffff,inset 0 -2px #0d477b}
.yo2-modern-shop .yo2-shop-legacy .shop-key{border:1px solid #936b22;border-radius:4px;background:linear-gradient(#fffbd2,#fae98a 45%,#f0cc5d 50%,#e5a73c);box-shadow:inset 0 1px #ffffe7,inset 0 -2px #b2822d,0 1px #74582b}
.yo2-modern-shop .yo2-shop-legacy .shop-key[data-state=hover]{filter:brightness(1.1);box-shadow:inset 0 1px #fff,0 0 0 2px #fbefac}
.yo2-modern-shop .yo2-shop-legacy .shop-small-key{border:1px solid #467da9;border-radius:3px;background:linear-gradient(#efffff,#aeddf3 48%,#82c1e8 50%,#72add8);box-shadow:inset 0 1px #fff,inset 0 -2px #3d7baa,0 1px #31668e}
.yo2-modern-shop .yo2-shop-legacy .shop-price,.yo2-modern-shop .yo2-shop-legacy .shop-row{border-color:#5b98bf;border-radius:3px;clip-path:none;background:linear-gradient(#f0fbff,#bfdfef 48%,#9bc7e0);box-shadow:inset 0 1px #fff,inset 0 -2px #6395b3}
.yo2-modern-shop .yo2-shop-legacy .shop-price[data-state=hover],.yo2-modern-shop .yo2-shop-legacy .shop-row[data-state=hover]{background:linear-gradient(#fcffff,#90dcfa);border-color:#277bb7}
.yo2-modern-shop .yo2-shop-legacy .shop-price[data-state=pressed],.yo2-modern-shop .yo2-shop-legacy .shop-row[data-state=pressed]{background:linear-gradient(#fff9c9,#f1d26e);border-color:#b68e37;box-shadow:inset 0 1px #fffde0,inset 0 -2px #bba04f}
.yo2-modern-shop .modern-shop-labels{position:absolute;inset:0;pointer-events:none;z-index:2147483000}
.yo2-modern-shop .modern-shop-label{position:absolute;box-sizing:border-box;pointer-events:none;font-family:Arial,sans-serif}
.yo2-modern-shop .modern-shop-label.category{padding:2px 9px;border-left:3px solid #fff2a1;border-radius:2px;color:#fff;background:linear-gradient(90deg,#0b3c7ee8,#1b65a7b8,transparent);font-size:19px;font-weight:700;line-height:25px;text-shadow:0 1px #123b68}
.yo2-modern-shop .modern-shop-label.product{display:flex;align-items:flex-start;justify-content:center;padding:3px 1px 0;color:#133e64;font-size:12px;font-weight:700;line-height:15px;text-align:center;overflow:hidden;overflow-wrap:anywhere;text-shadow:0 1px #ecffff}
`;

// Modern furniture wraps the proven native-geometry HTML renderer. No DOM control
// moves away from its native hit region, and no guessed label invokes an action.
export function nativeShop(legacy) {
  return {
    ...legacy, mode: 'pass', rootInput: 'none',
    mount(win, root, api) {
      if (!document.getElementById('yo2-modern-shop-css')) {
        const style = document.createElement('style'); style.id = 'yo2-modern-shop-css'; style.textContent = CSS; document.head.append(style);
      }
      root.classList.add('yo2-modern-shop');
      const original = legacy.mount(win, root, api);
      const layer = document.createElement('div'); layer.className = 'modern-shop-labels'; root.append(layer);
      return { original, layer, nodes: new Map() };
    },
    update(win, prev, root, api, state) {
      legacy.update(win, prev, root, api, state.original);
      const live = new Set();
      for (const label of annotations(win)) {
        live.add(label.key);
        let node = state.nodes.get(label.key);
        if (!node) { node = document.createElement('div'); state.nodes.set(label.key, node); state.layer.append(node); }
        node.className = `modern-shop-label ${label.kind}`;
        if (node.textContent !== label.text) node.textContent = label.text;
        Object.assign(node.style, { left: `${label.x - win.x}px`, top: `${label.y - win.y}px`, width: `${label.w}px`, height: `${label.h}px` });
      }
      for (const [key, node] of state.nodes) if (!live.has(key)) { node.remove(); state.nodes.delete(key); }
    },
    unmount(root, state) {
      legacy.unmount(root, state.original); state.nodes.clear(); root.classList.remove('yo2-modern-shop');
    },
  };
}
