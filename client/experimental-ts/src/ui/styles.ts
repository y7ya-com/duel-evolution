/** Scoped game furniture, keeping the original cyan/blue/gold visual language. */
export const CLIENT_CSS = `
.de-client { --ink:#14365b; --well:#effcff; --edge:#1476c4; color:var(--ink); font:14px/1.4 Arial,sans-serif; width:min(100%,1280px); margin:0 auto; font-variant-numeric:tabular-nums; }
.de-client,.de-client * { box-sizing:border-box; }
.de-client button,.de-client input,.de-client select,.de-client textarea { font:inherit; }
.de-client button { cursor:pointer; color:#072b50; background:linear-gradient(#fff,#b5eaff 48%,#83cef5 51%,#5bb3e9); border:1px solid #267dbb; border-radius:3px; padding:6px 12px; min-height:32px; box-shadow:inset 0 1px #fff,0 1px #1f629a; }
.de-client button:hover { filter:brightness(1.07); }
.de-client button:disabled { cursor:default; opacity:.5; }
.de-client button.gold { background:linear-gradient(#fffbd0,#fae773 47%,#f2cd51 51%,#eca431); border-color:#bf7819; color:#432e08; font-weight:bold; }
.de-client button:focus-visible,.de-client input:focus-visible,.de-client select:focus-visible,.de-client textarea:focus-visible { outline:3px solid #ffdc65; outline-offset:2px; }
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
.de-stage-layer { position:absolute; inset:0; }
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
.de-notice { position:absolute; top:8px; left:20%; right:20%; z-index:30; text-align:center; pointer-events:none; }
.de-nav { display:flex; gap:5px; padding:7px; background:linear-gradient(#d7ffff,#4bb9ed 20%,#247bc9); border:1px solid #104eaa; overflow:auto; }
.de-nav button[aria-current=page] { background:linear-gradient(#fffbd0,#f2cd51); }
.de-characters { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:8px; }
.de-character-slot { display:flex; flex-direction:column; gap:5px; }
.de-character-slot>button+button { min-height:26px; font-size:11px; }
.de-characters button { display:flex; flex-direction:column; align-items:center; min-height:110px; justify-content:center; }
.de-characters strong { font-size:18px; }
.de-chat { position:absolute; left:12px; bottom:12px; width:min(65%,540px); max-height:230px; display:flex; flex-direction:column; padding:8px; }
.de-chat-log { height:115px; overflow:auto; background:#effcffd9; padding:6px; font-size:13px; }
.de-chat-line { overflow-wrap:anywhere; }
.de-chat form { display:flex; gap:5px; margin-top:5px; }
.de-chat input { flex:1; }
.de-chat select { max-width:110px; }
.de-lobby-name { position:absolute; left:12px; top:12px; padding:5px 12px; color:#fff; background:#075db9cc; border:1px solid #8ce8ff; }
.de-avatar { position:absolute; transform:translate(-50%,-100%); display:flex; flex-direction:column; align-items:center; gap:0; background:transparent!important; border:0!important; box-shadow:none!important; padding:0!important; min-width:50px; }
.de-avatar-sprite { display:block; width:32px; height:54px; object-fit:contain; filter:drop-shadow(0 2px 2px #1238); }
.de-avatar-placeholder { display:block; width:26px; height:44px; background:linear-gradient(#e5faff 20%,#348fe2 21%,#1761bf 72%,#173f79 73%); border:2px solid #cdf5ff; border-radius:11px 11px 5px 5px; }
.de-avatar.self .de-avatar-placeholder { border-color:#ffe56d; }
.de-avatar-name { display:block; color:white; background:#073e91bb; padding:1px 5px; border-radius:2px; font-size:11px; white-space:nowrap; }
.de-lobby-places { position:absolute; right:12px; top:65px; width:205px; max-height:40%; overflow:auto; }
.de-room-row { border-top:1px solid #75a8c5; padding-top:5px; margin-top:5px; }
.de-room-row>strong { display:block; }
.de-lobby-places details button { width:100%; margin-top:4px; }
.de-context { position:absolute; right:12px; top:12px; width:200px; z-index:5; }
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
.de-card-grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(54px,1fr)); gap:5px; align-content:start; padding:3px; }
.de-card-grid .de-card { aspect-ratio:0.7; }
.de-card-count { position:absolute; right:1px; top:1px; font:bold 11px Arial; color:#092f58; background:#fff3a2; padding:1px 4px; border-radius:2px; }
.de-zone-title { padding:3px 7px; background:#075db9; color:white; display:flex; justify-content:space-between; }
.de-deck-zone { background:#effcffaa; margin-bottom:6px; min-height:70px; }
.de-collection { display:flex; flex-direction:column; gap:7px; min-height:0; }
.de-shop-grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(160px,1fr)); gap:10px; align-content:start; }
.de-shop-item { background:#effcff; border:1px solid #75a8c5; padding:10px; display:flex; flex-direction:column; gap:8px; }
.de-shop-item img { height:85px; object-fit:contain; }
.de-duel-hud { position:absolute; left:12px; right:12px; top:10px; display:flex; justify-content:space-between; gap:10px; pointer-events:none; }
.de-duelist { background:#073e91d9; border:1px solid #83eaff; color:#fff; padding:5px 12px; min-width:155px; }
.de-duelist strong { color:#fff79a; font-size:22px; }
.de-duel-phase { background:#073e91d9; color:white; padding:5px 10px; text-align:center; }
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
.de-duel-actions { position:absolute; bottom:8px; left:12px; display:flex; gap:5px; max-width:75%; flex-wrap:wrap; z-index:4; }
.de-duel-log { position:absolute; right:8px; bottom:8px; width:22%; max-height:150px; background:#e7faffdf; border:1px solid #5e9ebf; padding:5px; font-size:11px; overflow:auto; }
.de-duel-prompt { position:absolute; left:20%; right:20%; top:35%; max-height:52%; z-index:10; display:flex; flex-direction:column; gap:10px; }
.de-target-prompt { top:65px; max-height:110px; }
.de-prompt-options { display:flex; gap:6px; flex-wrap:wrap; }
.de-prompt-candidates { display:grid; grid-template-columns:repeat(auto-fill,minmax(90px,1fr)); gap:6px; overflow:auto; }
.de-prompt-candidates button[aria-pressed=true] { background:linear-gradient(#fffbd0,#f2cd51); outline:2px solid #a36a18; }
.de-prompt-candidates .de-card { height:95px; width:67px; margin:auto; }
.de-social-grid { display:grid; grid-template-columns:1fr 1fr; gap:12px; min-height:0; flex:1; }
.de-shop-cosmetics { flex:none; max-height:40%; overflow:auto; background:#effcff; border:1px solid #75a8c5; padding:7px; }
.de-shop-cosmetics>summary { font-weight:bold; cursor:pointer; }
.de-feature-panel { min-height:0; }
.social-feature>section,.online-feature>section { background:#effcffbb; padding:8px; margin:7px 0; border:1px solid #75a8c5; }
.social-feature form { display:flex; flex-wrap:wrap; align-items:end; gap:7px; padding:7px 0; }
.social-feature form label { flex-direction:column; align-items:start; }
.online-feature form { display:flex; gap:7px; flex-wrap:wrap; }
.de-social-row { display:flex; gap:7px; align-items:center; padding:6px; border-bottom:1px solid #75a8c5; }
.de-account-details { max-height:360px; overflow:auto; background:#effcff; padding:7px; border:1px solid #75a8c5; }
.de-account-details>summary { cursor:pointer; font-weight:bold; }
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
@media(max-width:700px) { .de-client { font-size:12px; } .de-stage { min-height:480px; aspect-ratio:auto; height:75vh; max-height:850px; } .de-scene { padding:10px; } .de-deck-columns { grid-template-columns:1fr 1fr; } .de-card-inspector { display:none; } .de-mobile-details { display:block; max-height:170px; overflow:auto; background:#effcff; padding:5px; } .de-mobile-details summary { cursor:pointer; font-weight:bold; } .de-chat { width:calc(100% - 24px); max-height:190px; } .de-chat-log { height:95px; } .de-duel-prompt { left:5%; right:5%; top:30%; } .de-target-prompt { top:60px; max-height:110px; } .de-duelist { min-width:0; padding:4px 7px; } .de-duelist strong { font-size:17px; } .de-duel-log { width:30%; max-height:100px; } .de-duel-inspector { position:absolute; left:10px; top:90px; bottom:60px; width:180px; overflow:auto; z-index:12; }
.de-duel-inspector>.de-card { width:100%; aspect-ratio:.7; flex:none; }
.de-duel-actions { max-width:65%; } .de-duel-phase { font-size:10px; } .de-social-grid { grid-template-columns:1fr; } .de-top { padding:7px; } }
@media(prefers-reduced-motion:reduce) { .de-client * { animation:none!important; transition:none!important; } }
`;
