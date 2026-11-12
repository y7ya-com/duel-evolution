/** Scoped game furniture, keeping the original cyan/blue/gold visual language. */
export const CLIENT_CSS = `
.de-client { --ink:#14365b; --well:#effcff; --edge:#1476c4; color:var(--ink); font:14px/1.4 Arial,sans-serif; width:min(100%,1280px,max(640px,calc((100vh - 104px)*1.333333))); margin:0 auto; font-variant-numeric:tabular-nums; }
.de-client,.de-client * { box-sizing:border-box; }
/* main's card shop (htmlui/card-shop.ts: shop/index.js mounted unchanged) keeps live's own looks: the rewrite's keys
   stay off its buttons (its MP (i), shop/mpinfo.js .mpi, is a 16 px round plate, not a 32 px key) */
.de-client button:where(:not(.de-card-shop *)),.de-client input,.de-client select,.de-client textarea { font:inherit; }
.de-client button:where(:not(.de-card-shop *)) { cursor:pointer; color:#072b50; background:linear-gradient(#fff,#b5eaff 48%,#83cef5 51%,#5bb3e9); border:1px solid #267dbb; border-radius:3px; padding:6px 12px; min-height:32px; box-shadow:inset 0 1px #fff,0 1px #1f629a; }
.de-client button:where(:not(.de-card-shop *)):hover { filter:brightness(1.07); }
.de-client button:where(:not(.de-card-shop *)):disabled { cursor:default; opacity:.5; }
.de-client button.gold:where(:not(.de-card-shop *)) { background:linear-gradient(#fffbd0,#fae773 47%,#f2cd51 51%,#eca431); border-color:#bf7819; color:#432e08; font-weight:bold; }
.de-client button:where(:not(.de-card-shop *)):focus-visible,.de-client input:focus-visible,.de-client select:focus-visible,.de-client textarea:focus-visible { outline:3px solid #ffdc65; outline-offset:2px; }
.de-client input,.de-client textarea,.de-client select { color:#072b50; background:var(--well); border:1px solid #5d95b6; border-radius:2px; padding:7px 8px; min-width:0; }
.de-client input[type=checkbox] { min-width:18px; min-height:18px; }
.de-client label { display:flex; gap:7px; align-items:center; }
.de-client h1,.de-client h2,.de-client h3,.de-client p { margin:0; }
.de-client h1 { font-size:18px; color:#fff9b1; text-shadow:0 1px #16467f; }
.de-client h2 { font-size:17px; }
.de-client h3 { font-size:14px; }
.de-top { display:flex; justify-content:space-between; gap:12px; align-items:center; padding:9px 14px; background:linear-gradient(#65c9ff,#1761bf); border:1px solid #104eaa; color:white; }
.de-status { font-size:12px; text-align:right; }
.de-stage { position:relative; width:100%; aspect-ratio:4/3; min-height:400px; overflow:hidden; background:radial-gradient(ellipse at 48% 20%,#8ce8ff,#41a9e5 44%,#1167b3); border:1px solid #104eaa; }
.de-stage canvas { display:block; width:100%; height:100%; }
.de-world-view { position:absolute; overflow:hidden; pointer-events:none; isolation:isolate; z-index:0; }
.de-world-avatars { position:absolute; inset:0; pointer-events:none; }
.de-world-avatars .de-avatar { pointer-events:auto; }
/* the world is drawn on PixiJS's canvas (ui/world.ts); each avatar's button is its transparent hit target over it */
.de-world-view>canvas.de-world-canvas { position:absolute; inset:0; width:100%; height:100%; pointer-events:none; image-rendering:pixelated; }
.de-world-avatars .de-avatar>* { visibility:hidden; }
.de-world-status { position:absolute; top:12px; left:25%; right:25%; z-index:2147483000; color:white; background:#073e91bb; text-align:center; pointer-events:none; }
.de-world-status:empty { display:none; }
.de-world-status button { pointer-events:auto; }
.de-stage-layer { position:absolute; inset:0; }
/* under the opponent's LP plate (live's top corners are the two plates alone) */
.de-scene { position:absolute; inset:0; padding:18px; display:flex; flex-direction:column; gap:12px; }
.de-panel { border:3px solid #87e9ff; outline:1px solid #1268b2; border-radius:4px; background:linear-gradient(#e2fcff,#a9e8fb 45%,#77cff2); box-shadow:0 3px 12px #082f6755; padding:12px; }
.de-panel-title { margin:-10px -10px 12px!important; padding:5px 8px; color:white; background:linear-gradient(#a1def9,#2585dc 49%,#1761bf); text-shadow:0 1px #114d91; }
.de-center { width:min(90%,460px); margin:auto; }
.de-stack { display:flex; flex-direction:column; gap:10px; }
.de-row { display:flex; gap:8px; align-items:center; flex-wrap:wrap; }
.de-spread { justify-content:space-between; }
.de-fill { flex:1; min-height:0; min-width:0; }
.de-scroll { overflow:auto; overscroll-behavior:contain; scrollbar-width:thin; }
.de-note { color:#376384; font-size:12px; }
.de-error { padding:8px 12px; background:#fff1d4; color:#922b17; border:1px solid #c58d42; }
/* the reconnecting notice: a small strip in the Legacy windows' frame colours, never over the play area's middle */
.de-net-notice { position:fixed; top:8px; left:50%; transform:translateX(-50%); z-index:90; pointer-events:none; padding:4px 14px; font:12px/1.4 sans-serif; color:#f6ead2; background:rgba(28,22,14,.86); border:1px solid #c58d42; border-radius:3px; box-shadow:0 1px 4px rgba(0,0,0,.4); white-space:nowrap; }
.de-notice { position:absolute; top:8px; left:20%; right:20%; z-index:30; text-align:center; pointer-events:none; }
.de-nav { display:flex; gap:5px; padding:7px; background:linear-gradient(#d7ffff,#4bb9ed 20%,#247bc9); border:1px solid #104eaa; overflow:auto; }
.de-nav button[aria-current=page] { background:linear-gradient(#fffbd0,#f2cd51); }
.de-characters { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:8px; }
.de-character-slot { display:flex; flex-direction:column; gap:5px; }
.de-character-slot>button+button { min-height:26px; font-size:11px; }
.de-characters button { display:flex; flex-direction:column; align-items:center; min-height:110px; justify-content:center; }
.de-characters strong { font-size:18px; }
.de-lobby-name { z-index:5; position:absolute; left:12px; top:12px; padding:5px 12px; color:#fff; background:#075db9cc; border:1px solid #8ce8ff; }
.de-avatar { position:absolute; transform:translate(-50%,-100%); display:flex; flex-direction:column; align-items:center; gap:0; background:transparent!important; border:0!important; box-shadow:none!important; padding:0!important; min-width:50px; }
.de-avatar-sprite { display:block; width:32px; height:54px; object-fit:contain; filter:drop-shadow(0 2px 2px #1238); }
.de-avatar-placeholder { display:block; width:26px; height:44px; background:linear-gradient(#e5faff 20%,#348fe2 21%,#1761bf 72%,#173f79 73%); border:2px solid #cdf5ff; border-radius:11px 11px 5px 5px; }
.de-avatar.self .de-avatar-placeholder { border-color:#ffe56d; }
.de-avatar-name { display:block; color:white; background:#073e91bb; padding:1px 5px; border-radius:2px; font-size:11px; white-space:nowrap; }
.de-avatar.has-original { width:12.5%; height:auto; aspect-ratio:4/5; min-width:0; transform:translate(-50%,-90%); }
.de-avatar-canvas { position:absolute; inset:0; width:100%; height:100%; pointer-events:none; }
/* the name over the head as the game draws it (main's live lobby: its left edge on the avatar's centre line, where the
 * flag ends; its middle about 21 px over the head's top, 13% of the 160-px box) */
.de-avatar.has-original .de-avatar-name { position:absolute; top:13%; left:50%; transform:translateY(-50%); }
.de-avatar.has-original .de-avatar-placeholder { position:absolute; bottom:10%; left:50%; transform:translateX(-50%); }
.de-avatar-canvas[data-avatar-painted="true"]~.de-avatar-placeholder { visibility:hidden; }
.de-lobby-places { z-index:6; position:absolute; right:12px; top:65px; width:205px; max-height:40%; overflow:auto; }
.de-room-row { border-top:1px solid #75a8c5; padding-top:5px; margin-top:5px; }
.de-room-row>strong { display:block; }
.de-lobby-places details button { width:100%; margin-top:4px; }
.de-context { position:absolute; right:230px; top:65px; width:200px; z-index:9; }
.de-sideboard-columns { display:grid; grid-template-columns:2fr 1fr 1fr; gap:10px; min-height:0; }
.de-sideboard-columns .de-card[aria-pressed=true] { outline:3px solid #f4ce46; }
.de-deck-tools { flex:none; background:#effcff; padding:4px 8px; border:1px solid #75a8c5; max-height:150px; overflow:auto; }
.de-deck-tools>summary,.de-deck-filters>summary { cursor:pointer; font-weight:bold; }
.de-deck-filters { flex:none; background:#effcff; padding:4px; max-height:220px; overflow:auto; }
.de-deck-filters .de-row input[type=number] { width:46%; }
.de-deck-columns { display:grid; grid-template-columns:180px 1fr 34%; gap:10px; min-height:0; flex:1; }
.de-mobile-details { display:none; }
.de-card-inspector { overflow:auto; }
.de-card-inspector .de-card { width:100%; aspect-ratio:0.7; }
.de-card { position:relative; display:flex; flex-direction:column; align-items:center; justify-content:center; overflow:hidden; background:linear-gradient(135deg,#bd864d,#e2bc82 25%,#a76d38); color:#fff; border:2px solid #e4c497; border-radius:3px; padding:2px; box-shadow:0 2px 4px #1238; }
button.de-card { padding:2px; min-height:0; color:#fff; background:linear-gradient(135deg,#bd864d,#e2bc82 25%,#a76d38); }
.de-card img { width:100%; height:100%; object-fit:contain; }
.de-card-name { position:absolute; bottom:0; left:0; right:0; padding:3px; color:white; background:#082b4bd9; font-size:10px; line-height:1.2; text-align:center; overflow-wrap:anywhere; }
.de-card-back { background:repeating-radial-gradient(ellipse at center,#322018,#322018 3px,#a76624 5px,#261811 7px)!important; }
.de-card-back .de-card-name { display:none; }
.de-card-unknown { padding:5px; font-size:11px; text-align:center; color:#3c2e1e; }
.de-card-grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(62px,1fr)); gap:5px; align-content:start; padding:3px; }
.de-card-grid .de-card { aspect-ratio:0.7; }
.de-card-counter,.de-card-turns { position:absolute; top:2px; left:2px; color:#fff; background:#07519be8; border:1px solid #ffe877; padding:1px 3px; font:bold 10px Arial; border-radius:2px; }
.de-card-turns { top:19px; }
.de-card-count { position:absolute; right:1px; top:1px; font:bold 11px Arial; color:#092f58; background:#fff3a2; padding:1px 4px; border-radius:2px; }
.de-zone-title { padding:3px 7px; background:#075db9; color:white; display:flex; justify-content:space-between; }
.de-deck-zone { background:#effcffaa; margin-bottom:6px; min-height:70px; }
.de-collection { display:flex; flex-direction:column; gap:7px; min-height:0; }
.de-relay-roster { position:absolute; top:70px; left:12px; right:12px; display:flex; justify-content:space-between; pointer-events:none; z-index:4; }
.de-relay-team { width:180px; display:flex; flex-direction:column; gap:4px; }
.de-relay-team:last-child { text-align:right; }
.de-relay-member { padding:4px 8px; background:#073e91c9; color:#fff; border:1px solid #5bb7e4; opacity:.7; }
.de-relay-member .de-note { color:#e2f8ff; font-size:10px; }
.de-relay-member[data-active=true] { opacity:1; border-color:#ffeb7a; background:#126bb9; }
.de-duel-hud { position:absolute; left:0; right:0; top:0; display:flex; justify-content:space-between; gap:10px; pointer-events:none; z-index:5; }
.de-duelist { width:24.5%; padding:3px 10px 5px; color:#fff; background:linear-gradient(#5fc4ffee,#1761bfee); border:1px solid #9ae8ff; border-top:0; border-radius:0 0 10px 0; box-shadow:0 2px 8px #0005; }
.de-duelist+.de-duelist { border-radius:0 0 0 10px; background:linear-gradient(#ff8fb7ee,#c8285eee); border-color:#ffc4d8; text-align:right; }
.de-duelist.active { box-shadow:0 0 0 2px #fff27c,0 2px 10px #ffe36b99; }
.de-duelist-name { font-weight:bold; text-shadow:0 1px #0006; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.de-lp { display:flex; align-items:center; gap:6px; }
.de-duelist+.de-duelist .de-lp { flex-direction:row-reverse; }
.de-lp-label { font:bold 12px Arial; color:#fff79a; }
.de-lp-bar { flex:1; height:9px; background:#06234acc; border:1px solid #ffffffaa; border-radius:5px; overflow:hidden; display:flex; }
.de-duelist+.de-duelist .de-lp-bar { justify-content:flex-end; }
.de-lp-fill { display:block; height:100%; background:linear-gradient(#b8ff9a,#2fc843); transition:width .4s; }
.de-lp-value { color:#fff79a; font-size:17px; min-width:52px; text-align:right; text-shadow:0 1px #0008; }
.de-duel-clock { font-size:11px; color:#e6f8ff; }
.de-janken { justify-content:center; gap:14px; }
.de-client button.de-janken-card { display:flex; flex-direction:column; align-items:center; gap:4px; padding:6px; background:none; border:0; box-shadow:none; font-weight:bold; color:#13406e; }
.de-janken-card img { width:clamp(64px,10vw,110px); aspect-ratio:200/290; transition:transform .15s; filter:drop-shadow(0 3px 5px #0006); }
.de-janken-card:hover img,.de-janken-card:focus-visible img { transform:translateY(-6px) scale(1.04); }
.de-client button.de-janken-order { padding:0; background:none; border:0; box-shadow:none; }
.de-janken-plate { display:block; position:relative; overflow:hidden; width:clamp(150px,22vw,264px); aspect-ratio:352/64; }
.de-janken-plate img { position:absolute; left:0; width:100%; height:400%; max-width:none; }
.de-janken-order:hover .de-janken-plate img,.de-janken-order:focus-visible .de-janken-plate img { margin-top:calc(clamp(150px,22vw,264px) * -64 / 352); }
.de-duel-notice { position:absolute; left:50%; top:22%; transform:translateX(-50%); width:min(90%,420px); z-index:11; display:flex; flex-direction:column; align-items:center; gap:10px; text-align:center; font-weight:bold; }
.de-duel-end { position:absolute; left:50%; top:48%; width:min(70%,560px); aspect-ratio:352/128; transform:translateX(-50%); z-index:9; display:grid; place-items:center; pointer-events:none; }
.de-duel-end>* { grid-area:1/1; }
.de-duel-end img { width:100%; height:100%; }
.de-duel-end-m02 { animation:de-end-glow 1.6s ease-in-out infinite alternate; }
.de-duel-end-text { font:900 clamp(28px,6vw,64px)/1 Arial Black,Arial,sans-serif; color:#ffe14a; -webkit-text-stroke:2px #b3260e; text-shadow:0 0 18px #ffde5a; }
.de-duel-end.has-art .de-duel-end-text { visibility:hidden; }
@keyframes de-end-glow { from { opacity:.35; transform:scale(.98); } to { opacity:1; transform:scale(1.03); } }
.social-feature { display:grid; grid-template-columns:repeat(auto-fit,minmax(300px,1fr)); gap:10px; align-content:start; }
.de-social-card { background:#effcffd9; border:1px solid #75a8c5; border-radius:4px; padding:8px 10px; display:flex; flex-direction:column; gap:6px; min-width:0; }
.de-social-card h3 { color:#0d4f8c; border-bottom:1px solid #9fd2ec; padding-bottom:3px; }
.de-social-card h4 { margin:4px 0 0; font-size:13px; }
.de-social-card form { display:flex; flex-direction:column; gap:5px; }
.de-social-card form.de-row { flex-direction:row; align-items:flex-end; }
.de-social-card label { flex-direction:column; align-items:stretch; gap:2px; font-size:12px; flex:1; }
.de-social-card textarea { min-height:70px; resize:vertical; }
.de-social-row { display:flex; align-items:center; gap:6px; padding:3px 0; border-bottom:1px dotted #b6dcef; flex-wrap:wrap; }
.de-social-row button,.de-social-found button { min-height:26px; padding:3px 8px; font-size:12px; }
.de-social-found { display:flex; flex-direction:column; gap:5px; padding:6px; background:#fffbe0; border:1px solid #e3c45d; border-radius:3px; }
.de-social-request { background:#fff6d6; }
.de-presence { width:9px; height:9px; border-radius:50%; background:#9aa9b5; flex:none; }
.de-presence.online { background:#38c75a; box-shadow:0 0 4px #38c75a; }
.de-mail-item summary { cursor:pointer; font-weight:bold; }
.de-mail-body { white-space:pre-wrap; padding:4px 8px; }
.de-confirm { display:inline-flex; gap:6px; align-items:center; flex-wrap:wrap; }
.de-trade-scene { position:absolute; inset:0; z-index:20; overflow:hidden; }
.de-trade-trunk-panel { position:absolute; left:${736 / 10.24}%; top:0; width:${288 / 10.24}%; height:${608 / 7.68}%; display:flex; flex-direction:column; box-sizing:border-box; padding:4px 6px; gap:4px;
  background:linear-gradient(#cfd6e6,#a9b4cc); border:1px solid #f4f8ff; box-shadow:inset 0 0 0 1px #6f7fa3; font:13px/1.2 Arial,sans-serif; color:#0d1d33; }
.de-trade-trunk-panel header { display:flex; justify-content:space-between; align-items:center; }
.de-trade-trunk-panel h3 { margin:0; font:italic 900 22px/1 Arial Black,Arial,sans-serif; color:#ffe14a; -webkit-text-stroke:1px #6b3c00; letter-spacing:.02em; }
.de-trade-count { padding:1px 8px; border-radius:6px; background:linear-gradient(#5a5f6b,#2c2f36); color:#fff; font-weight:bold; }
.de-trade-trunk-panel input[type=search] { width:100%; box-sizing:border-box; }
.de-trade-trunk { flex:1; min-height:0; overflow:auto; display:flex; flex-direction:column; gap:1px; background:#9aa6bf; }
.de-trade-card { display:grid; grid-template-columns:38px 1fr auto; align-items:center; gap:6px; min-height:56px; padding:2px 4px; background:#e6fbf0; border-left:6px solid #35d36a; }
.de-trade-card:nth-child(even) { background:#d8f4e6; }
.de-trade-thumb { width:38px; height:52px; display:block; }
.de-trade-thumb>.de-card { width:100%; height:100%; }
.de-trade-name { font-size:13px; overflow:hidden; text-overflow:ellipsis; }
.de-trade-card button { min-height:22px; padding:1px 4px; font-size:11px; }
.de-trade-result { font-weight:bold; color:#16733a; }
.de-client button.de-zone-target { position:absolute; transform:translate(-50%,-50%); pointer-events:auto; min-height:0; padding:0; background:#fff59a55; border:2px solid #ffe14a; border-radius:3px; box-shadow:0 0 12px #ffe14a, inset 0 0 10px #fff7b0; animation:de-zone-pulse 1s ease-in-out infinite alternate; z-index:3; }
.de-client button.de-zone-target:hover { background:#fff59a99; }
button.de-field-card.de-card-target { outline:3px solid #ffe14a; animation:de-zone-pulse 1s ease-in-out infinite alternate; z-index:3; }
@keyframes de-zone-pulse { from { box-shadow:0 0 6px #ffe14a; } to { box-shadow:0 0 18px #fff38a; } }
.de-duel-board { position:absolute; left:0; top:0; width:100%; aspect-ratio:4/3; overflow:hidden; }
.de-duel-board>canvas { position:absolute; inset:0; }
.de-duel-bg { position:absolute; inset:0; width:100%; height:100%; object-fit:cover; pointer-events:none; }
.de-duel-frames { position:absolute; left:25%; width:50%; height:33.3333%; overflow:hidden; pointer-events:none; }
.de-duel-frames img { position:absolute; left:-100%; width:200%; height:200%; max-width:none; }
.de-phase-bar { position:absolute; left:25%; top:35.807%; width:43.75%; height:5.2083%; display:grid; grid-template-columns:13.84% repeat(6,14.36%); grid-template-rows:100%; z-index:3; pointer-events:none; }
.de-phase-bar>* { min-width:0; min-height:0; box-sizing:border-box; }
.de-phase-bar>.de-phase:nth-child(2) { grid-column-start:2; }
/* the turn plate under the phase bar's left end, over the gap between the left column's zones (live: 262, 322, 52 x 28) */
.de-turn-box { position:absolute; left:1.34%; top:117.5%; width:11.6%; height:70%; display:flex; flex-direction:column; align-items:center; justify-content:center; margin:0; line-height:1; color:#fff; background:#2a3d58e6; border:1px solid #c8d8ee; border-radius:3px; }
.de-turn-box small { font-size:9px; }
.de-turn-box strong { font-size:15px; }
.de-phase { position:relative; overflow:hidden; display:flex; align-items:center; justify-content:center; font:bold 13px Arial; color:#4a2e00; }
.de-phase:not(:has(img)) { margin:5px 4px; background:linear-gradient(#fff6a8,#f0b52d); border:1px solid #c27a12; border-radius:4px; opacity:.75; }
.de-phase-bar.opponent .de-phase:not(:has(img)) { background:linear-gradient(#ffc0cf,#ec4a6d); border-color:#a31f43; color:#fff; }
.de-phase.current:not(:has(img)) { opacity:1; box-shadow:0 0 8px #fff9a5; }
.de-phase img { position:absolute; left:0; top:0; width:400%; height:600%; max-width:none; }
.de-sr { position:absolute; width:1px; height:1px; overflow:hidden; clip:rect(0 0 0 0); }
.de-card-back>img { position:absolute; inset:0; width:100%; height:100%; object-fit:cover; }
.de-field-cards { position:absolute; inset:0; pointer-events:none; }
.de-field-card { position:absolute; transform:translate(-50%,-50%); pointer-events:auto; }
.de-duel-effects { position:absolute; inset:0; pointer-events:none; z-index:6; }
.de-effect { position:absolute; font:bold 25px Arial,sans-serif; color:#fff49d; text-shadow:0 2px #082b4b,1px 0 #082b4b,-1px 0 #082b4b; white-space:nowrap; }
.de-effect-damage { color:#ffb2a3; }
.de-effect-recover { color:#a1ffc8; }
.de-field-card[data-effect=chain] { outline:3px solid #ffeb69; box-shadow:0 0 16px #ffe87b; }
.de-field-card[data-effect=attack] { outline:3px solid #ff9d6b; box-shadow:0 0 14px #ff854b; }
.de-field-card.defense { transform:translate(-50%,-50%) rotate(90deg); }
.de-duel-inspector { position:absolute; left:10px; top:90px; bottom:60px; width:180px; overflow:auto; z-index:12; }
.de-duel-inspector>.de-card { width:100%; aspect-ratio:.7; flex:none; }
.de-duel-actions { display:flex; gap:4px; flex-wrap:nowrap; }
.de-duel-actions button { padding:1px 8px; font-size:11px; }
.de-duel-bar { position:absolute; left:0; right:0; bottom:0; height:4.1667%; display:flex; align-items:center; gap:6px; z-index:8; background:linear-gradient(#cdefff,#5fb6e8 55%,#2f86c4); border-top:1px solid #e8fbff; }
.de-duel-wrench { width:7.8125%; height:100%; padding:0; display:grid; place-items:center; background:linear-gradient(#ffe48a,#f6a313); border:1px solid #b06a00; border-radius:0 6px 0 0; cursor:pointer; }
.de-duel-wrench.has-art { position:absolute; left:${4 / 1024 * 100}%; top:0; width:${80 / 1024 * 100}%; height:100%; background:none; border:0; border-radius:0; overflow:hidden; display:block; }
.de-duel-wrench-art { position:absolute; left:0; top:-400%; width:300%; height:600%; pointer-events:none; }
.de-duel-wrench.has-art:hover .de-duel-wrench-art { left:-100%; } .de-duel-wrench.has-art:active .de-duel-wrench-art { left:-200%; }
.de-duel-wrench svg { width:20px; height:20px; fill:#1d5fa8; stroke:#fff; stroke-width:.8; }
.de-duel-help { position:absolute; left:${388 / 1024 * 100}%; right:${8 / 1024 * 100}%; top:0; bottom:0; overflow:hidden; white-space:nowrap; font:15px Arial,sans-serif; letter-spacing:.04em; color:#0b1f3a; display:flex; align-items:center; }
/* the ring keeps its own 64 px box: .de-stage canvas (every stage canvas at 100%) stretched it 1024 wide across the bar */
/* the bar's own keys (a spectator's Leave Duel, Surrender with no deck left) between the ring and the help line, clear of
   the wrench, which now stands at the bar's left edge as live's */
.de-duel-bar>.de-duel-actions { position:absolute; left:${300 / 1024 * 100}%; top:0; bottom:0; align-items:center; z-index:1; }
.de-duel-bar>.de-duel-ring { position:absolute; left:${232 / 1024 * 100}%; top:${-16 / 32 * 100}%; width:${64 / 1024 * 100}%; height:200%; pointer-events:none; }
.de-duel-help-run { display:inline-block; padding-left:100%; animation:de-help-run 16s linear infinite; }
@keyframes de-help-run { from { transform:translateX(0); } to { transform:translateX(-100%); } }
@media (prefers-reduced-motion: reduce) { .de-duel-help-run { padding-left:8px; animation:none; } }
.de-duel-cmd { position:absolute; width:15.625%; z-index:14; padding:6px; background:#f2d64a99; border:1px solid #c9a21acc; border-radius:2px; box-shadow:inset 1px 1px 0 #fff7c0cc,inset -1px -1px 0 #9a7a10aa,0 2px 6px #0005; display:flex; flex-direction:column; gap:0; }
/* live's CWindowModelListDuelCmd (de-scratch/visual/live/x-duel-cmd.png): a translucent gold frame 6 px wide, each command a
   19 px blue row (the cursor row lighter), the command's dark text in Arial after its small white mark */
.de-client button.de-duel-cmd-row { display:block; min-height:0; box-shadow:none; filter:none; width:100%; height:19px; padding:0 6px 0 22px; text-align:left; font:15px/19px Arial,"Liberation Sans",sans-serif; letter-spacing:.06em; color:#0b1830; border:0; border-radius:0; cursor:pointer; position:relative; background:#1a7fe0e0; }
.de-client button.de-duel-cmd-row:nth-of-type(even) { background:#2a8ae6e0; }
.de-client button.de-duel-cmd-row::before { content:''; position:absolute; left:6px; top:4px; width:9px; height:10px; background:#fff; clip-path:polygon(0 0,100% 20%,100% 70%,25% 60%,25% 100%,0 100%); }
.de-client button.de-duel-cmd-row:hover:not(:disabled),.de-client button.de-duel-cmd-row:focus-visible { background:#5ab0ff; color:#04122a; outline:none; }
.de-client button.de-duel-cmd-row:disabled { color:#5d7a9e; cursor:default; opacity:1; }
.de-duel-cmd-close { position:absolute; right:-9px; top:-9px; width:18px; height:18px; padding:0; border-radius:50%; font:bold 12px/16px Arial; color:#6b4a00; background:#ffe48a; border:1px solid #b06a00; cursor:pointer; }
.de-phase-bar>button.de-phase { pointer-events:auto; cursor:pointer; padding:0; border:0; background:none; }
.de-phase-bar>button.de-phase:hover img { filter:brightness(1.2); }
.de-phase-bar>button.de-phase:disabled { cursor:default; }
.de-duel-prompt { position:absolute; left:20%; right:20%; top:35%; max-height:52%; z-index:10; display:flex; flex-direction:column; gap:10px; }
.de-target-prompt { top:65px; max-height:110px; }
.de-prompt-inspector { overflow:auto; max-height:160px; background:#effcff; padding:7px; }
.de-prompt-inspector>.de-card { float:left; width:67px; height:95px; margin-right:10px; }
.de-prompt-options { display:flex; gap:6px; flex-wrap:wrap; }
.de-prompt-candidates { display:grid; grid-template-columns:repeat(auto-fill,minmax(90px,1fr)); gap:6px; overflow:auto; }
.de-prompt-candidates button[aria-pressed=true] { background:linear-gradient(#fffbd0,#f2cd51); outline:2px solid #a36a18; }
.de-language-flags button[aria-pressed=true] { background:linear-gradient(#fffbd0,#f2cd51); box-shadow:0 0 0 3px #f4ce46,0 0 0 4px #a36a18; font-weight:700; }
.de-prompt-candidates .de-card { height:95px; width:67px; margin:auto; }
.de-social-grid { display:grid; grid-template-columns:1fr 1fr; gap:12px; min-height:0; flex:1; }
.de-shop-cosmetics { flex:none; max-height:40%; overflow:auto; background:#effcff; border:1px solid #75a8c5; padding:7px; }
.de-shop-cosmetics>summary { font-weight:bold; cursor:pointer; }
.de-receipt-cards { display:grid; grid-template-columns:repeat(auto-fill,minmax(80px,1fr)); gap:5px; }
.de-profile-panel { position:absolute; z-index:9; left:50%; top:70px; transform:translateX(-50%); width:min(92%,440px); max-height:calc(100% - 90px); overflow:auto; padding:12px; }
.profile-feature { display:flex; flex-direction:column; gap:9px; }
.de-profile-head { display:flex; justify-content:space-between; align-items:center; gap:8px; margin:-12px -12px 0; padding:6px 8px 6px 12px; color:#fff; background:linear-gradient(#a1def9,#2585dc 49%,#1761bf); text-shadow:0 1px #114d91; }
.de-profile-head h3 { font-size:17px; }
.de-profile-head button { min-height:26px; padding:3px 10px; }
.de-profile-stats { display:grid; grid-template-columns:repeat(3,1fr); gap:6px; margin:0; }
.de-profile-stats dt { font-size:11px; color:#376384; }
.de-profile-stats dd { margin:0; font-size:16px; font-weight:bold; }
.de-profile-stat { padding:4px 6px; background:#effcff99; border-radius:3px; }
.de-profile-comments { padding:8px 10px; background:#effcffd9; border:1px solid #8cc9e6; border-radius:3px; }
.de-profile-title { font-weight:bold; color:#a0560c; }
.de-profile-edit { display:flex; gap:6px; align-items:flex-end; }
.de-profile-edit label { flex:1; flex-direction:column; align-items:stretch; gap:2px; font-size:12px; }
.de-npc-panel { position:absolute; z-index:15; left:25%; right:18%; top:12%; max-height:76%; overflow:auto; }
.de-npc-dialogue { white-space:pre-wrap; background:#effcff; padding:10px; border:1px solid #75a8c5; }
.de-feature-panel { min-height:0; }
.social-feature>section,.online-feature>section { background:#effcffbb; padding:8px; margin:7px 0; border:1px solid #75a8c5; }
.social-feature form { display:flex; flex-wrap:wrap; align-items:end; gap:7px; padding:7px 0; }
.social-feature form label { flex-direction:column; align-items:start; }
.online-feature form { display:flex; gap:7px; flex-wrap:wrap; }
.de-account-details { max-height:360px; overflow:auto; background:#effcff; padding:7px; border:1px solid #75a8c5; }
.de-account-details>summary { cursor:pointer; font-weight:bold; }
.de-title-foot { position:absolute; left:50%; bottom:12px; transform:translateX(-50%); width:min(92%,560px); display:flex; flex-direction:column; gap:6px; align-items:center; z-index:2; }
.de-title-foot>.de-account-details { width:100%; box-sizing:border-box; }
.account-feature nav { display:flex; flex-wrap:wrap; gap:4px; margin:8px 0; }
.account-feature form { display:flex; flex-direction:column; gap:8px; }
.de-audio-details { max-height:300px; overflow:auto; background:#effcff; padding:7px; border:1px solid #75a8c5; }
.de-audio-details>summary { font-weight:bold; cursor:pointer; }
.de-audio-details fieldset { border:1px solid #75a8c5; margin:6px 0; }
.de-audio-details input[type=file] { width:100%; font-size:11px; }
.de-settings-row { display:flex; flex-direction:column; gap:5px; padding:6px 0; }
.de-connection { display:inline-block; width:8px; height:8px; border-radius:50%; background:#fbd56b; margin-right:5px; }
.de-connection.online { background:#95f19a; }
.de-connection.error,.de-connection.offline { background:#ffb3a2; }
.de-busy { opacity:.7; }
@media(max-width:700px) { .de-client { font-size:12px; width:100%; } .de-stage { min-height:480px; aspect-ratio:auto; height:75vh; max-height:850px; } .de-scene { padding:10px; } .de-deck-columns { grid-template-columns:1fr 1fr; } .de-sideboard-columns { grid-template-columns:2fr 1fr; } .de-sideboard-columns>section:last-child { grid-column:1/-1; max-height:100px; } .de-card-inspector { display:none; } .de-mobile-details { display:block; max-height:170px; overflow:auto; background:#effcff; padding:5px; } .de-mobile-details summary { cursor:pointer; font-weight:bold; } .de-duel-prompt { left:5%; right:5%; top:30%; } .de-target-prompt { top:60px; max-height:110px; } .de-duelist { min-width:0; padding:4px 7px; } .de-duelist strong { font-size:17px; } .de-duel-log { width:30%; max-height:100px; } .de-duel-inspector { position:absolute; left:10px; top:90px; bottom:60px; width:180px; overflow:auto; z-index:12; }
.de-duel-inspector>.de-card { width:100%; aspect-ratio:.7; flex:none; }
.de-duel-actions { max-width:65%; } .de-duelist { width:40%; font-size:11px; } .de-duel-board .de-card-name { display:none; } .de-context { left:12px; right:12px; width:auto; top:auto; bottom:215px; } .de-duel-board { width:160%; left:-30%; top:58px; } .de-duelist { border-radius:0; } .de-duel-log { left:8px; right:auto; width:calc(100% - 16px); bottom:52px; max-height:22%; } .de-lp-value { font-size:13px; min-width:40px; } .de-social-grid { grid-template-columns:1fr; } .de-top { padding:7px; } }
@media(prefers-reduced-motion:reduce) { .de-client * { animation:none!important; transition:none!important; } }
.de-client[data-motion=reduced] * { animation:none!important; transition:none!important; }
.de-client:is(:fullscreen,html:fullscreen .de-client:not(.de-phone)) { --de-fullscreen-width:min(100%,calc((100vh - 120px)*1.333333)); width:100vw; max-width:none; height:100vh; margin:0; padding:8px; display:flex; flex-direction:column; align-items:center; justify-content:center; overflow:auto; background:#093d6a; }
.de-client:is(:fullscreen,html:fullscreen .de-client:not(.de-phone))>.de-stage,.de-client:is(:fullscreen,html:fullscreen .de-client:not(.de-phone))>.de-top,.de-client:is(:fullscreen,html:fullscreen .de-client:not(.de-phone))>.de-nav { width:var(--de-fullscreen-width); flex:none; }
.de-client:is(:fullscreen,html:fullscreen .de-client:not(.de-phone))>.de-stage { min-height:0; height:auto; aspect-ratio:4/3; max-height:none; }
@supports(height:100dvh) { .de-client:is(:fullscreen,html:fullscreen .de-client:not(.de-phone)) { --de-fullscreen-width:min(100%,calc((100dvh - 120px)*1.333333)); height:100dvh; } }
`;
