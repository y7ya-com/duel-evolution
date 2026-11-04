/** The original game's window skin over the client's layout (styles.ts): loaded after it, it changes how windows,
 * keys, fields and lists look, not where they are. Every piece is CSS with colours sampled from the original art
 * (data/common/window/*, the engine's own renders; htmlui controls/skin.js and svelte/modern/theme.js cite the
 * texels), so it stays sharp at any DPR; only real pictures (the menubar keys' icons) are bitmaps, loaded from the
 * player's own archive at run time (menu.ts). Text is Arial DOM text. */

// The blue title bar (22 px; window_base / main_win title rows): white caption with a thin dark edge.
const OUTLINE = 'text-shadow:1px 0 #3a4a5a,-1px 0 #3a4a5a,0 1px #3a4a5a,0 -1px #3a4a5a';
const TITLE_BAR = 'linear-gradient(to bottom,#e5f1f4 0,#cae7f3 9%,#a3d7f3 18%,#9dd3f4 27%,#5fa4f5 79%,#4e93f5 84%,#336deb 88%,#234cdb 92%,#234cdb 100%)';
// The window frame (window_base_01_c01): a 3 px cyan bevel, light on the top and left, deeper on the right and bottom.
const FRAME = 'inset 3px 0 #76ffff,inset 0 3px #a7ffff,inset -3px 0 #41abef,inset 0 -3px #329be5,inset 4px 0 #68e8ff,inset 0 4px #79ffff,inset -4px 0 #4db9f7,inset 0 -4px #46b1f2';
// The yellow menu key (main_btn_01_c01, columns normal / hover / pressed): rows and columns as hard stops.
const MENU_KEY = 'linear-gradient(to right,#f1b757 0 1px,#ffff95 1px 2px,transparent 2px calc(100% - 2px),#f2cc51 calc(100% - 2px) calc(100% - 1px),#f0bd45 calc(100% - 1px)),linear-gradient(to bottom,#f1b780 0 1px,#ffffc8 1px 2px,#fff97f 2px 3px,#f9e45f 3px 4px,#f4d558 4px calc(100% - 3px),#f3d054 calc(100% - 3px) calc(100% - 2px),#f0be45 calc(100% - 2px) calc(100% - 1px),#eca430 calc(100% - 1px))';
const MENU_KEY_HOVER = 'linear-gradient(to bottom,#fffec8 0 1px,#fff 1px 2px,#ffffe2 2px 3px,#fcf4b8 3px 4px,#faeaac 4px calc(100% - 3px),#f9e4a4 calc(100% - 3px) calc(100% - 2px),#f6d086 calc(100% - 2px) calc(100% - 1px),#f2b55e calc(100% - 1px))';
const MENU_KEY_PRESSED = 'linear-gradient(to bottom,#fada68 0 1px,#f8c550 1px 2px,#fce473 2px 3px,#fef98c 3px 4px,#ffff93 4px calc(100% - 3px),#ffff9e calc(100% - 3px) calc(100% - 2px),#ffffd2 calc(100% - 2px) calc(100% - 1px),#fffffe calc(100% - 1px))';
// The cream plate key (swich_01_c00 columns normal / hover / pressed; html-ui ui.js PLATE): the player menu's and
// dialogs' buttons.
const PLATE = 'linear-gradient(to right,#f7f4ef 0 1px,#f6f2eb 1px 2px,transparent 2px calc(100% - 2px),#e9e2d7 calc(100% - 2px) calc(100% - 1px),#d3c9b9 calc(100% - 1px)),linear-gradient(to bottom,#fefdfc 0 1px,#f8f4ef 1px 2px,transparent 2px calc(100% - 2px),#f1ede7 calc(100% - 2px) calc(100% - 1px),#c6bba7 calc(100% - 1px)),repeating-linear-gradient(to bottom,transparent 0 3px,#faf7f3 3px 4px),#f4efe7';
const PLATE_HOVER = 'linear-gradient(to bottom,#ffe8b1 0 1px,#ffe9c3 1px 2px,transparent 2px calc(100% - 2px),#fff1d0 calc(100% - 2px) calc(100% - 1px),#ffb85b calc(100% - 1px)),repeating-linear-gradient(to bottom,transparent 0 3px,#ffffef 3px 4px),#fff';
const PLATE_PRESSED = 'linear-gradient(to bottom,#838383 0 1px,#d4d4d4 1px 2px,transparent 2px calc(100% - 2px),#d0d0d0 calc(100% - 2px) calc(100% - 1px),#f0f0f0 calc(100% - 1px)),repeating-linear-gradient(to bottom,transparent 0 3px,#e0e0e0 3px 4px),#c0c0c0';
// The yellow dialog frame (the OK / Yes-No boxes, sampled from the engine's render): #ffff80 rim, #ffef56, #ffbf44
// body, #e57a26 lower edge.
const DIALOG = 'inset 0 0 0 1px #ffff80,inset 0 0 0 2px #ffef56,inset 0 0 0 5px #ffbf44,inset -1px -1px 0 5px #f09733';

export const SKIN_CSS = `
.de-client { position:relative; font:13px/1.4 Arial,"Helvetica Neue",Helvetica,sans-serif; color:#14365b; width:min(100%,1280px,max(640px,calc((100vh - 40px)*1.333333))); }
.de-client * { scrollbar-width:thin; scrollbar-color:#378bd0 #c2eaf8; }
.de-client ::selection { background:#91d6ff; color:#092f58; }
/* The page title stays for assistive technology; the game has no page header. */
.de-top { position:absolute; width:1px; height:1px; padding:0; overflow:hidden; clip-path:inset(50%); white-space:nowrap; border:0; }
.de-stage { border:0; background:radial-gradient(ellipse at 48% 20%,#8ce8ff 0%,#41a9e5 44%,#1167b3 100%); }

/* Keys: the original's blue bevelled key; gold for the primary. Metrics stay the layout's. */
.de-client button:where(:not(.de-card,.de-avatar,.de-zone-target,.de-janken-card,.de-janken-order,.de-field-card)) { color:#072b50; font-weight:bold; text-shadow:0 1px #f0ffff; border:1px solid #267dbb; border-radius:3px;
  background:linear-gradient(180deg,#fff 0%,#e7fbff 12%,#b5eaff 48%,#83cef5 51%,#5bb3e9 100%); box-shadow:inset 0 1px #fff,inset 1px 0 #d9ffff,inset 0 -2px #2d83b74d,0 1px 0 #1f629a; transition:filter .1s,box-shadow .1s; }
.de-client button:where(:not(.de-card,.de-avatar,.de-zone-target,.de-janken-card,.de-janken-order,.de-field-card)):hover:not(:disabled) { filter:none; background:linear-gradient(180deg,#fff,#d7ffff 50%,#a3edff 52%,#7acdf5); box-shadow:inset 0 1px #fff,0 0 0 1px #bcffff,0 1px 0 #1e659a; }
.de-client button:where(:not(.de-card,.de-avatar,.de-zone-target,.de-janken-card,.de-janken-order,.de-field-card)):active:not(:disabled) { transform:translateY(1px); box-shadow:inset 0 2px 3px #12538455,0 0 0 1px #efffff; }
.de-client button:disabled { opacity:.5; filter:saturate(.35); }
.de-client button.gold { color:#432e08; text-shadow:0 1px #fffddd; border-color:#bf7819; background:linear-gradient(180deg,#fffbd0 0%,#fffba1 12%,#fae773 47%,#f2cd51 51%,#eca431 100%); box-shadow:inset 0 1px #ffffe6,inset 1px 0 #fff8bc,inset 0 -2px #be7c2440,0 1px #9e6117; }
.de-client button.gold:hover:not(:disabled) { background:linear-gradient(180deg,#fffbd0 0%,#fffba1 12%,#fae773 47%,#f2cd51 51%,#eca431 100%); filter:brightness(1.08); box-shadow:inset 0 1px #fff,0 0 0 1px #fffeb8,0 1px #a36a18; }
.de-client :is(button,input,select,textarea,summary,canvas):focus-visible { outline:2px solid #ffdc65; outline-offset:2px; }

/* Fields: the pale inset well. */
.de-client :is(input:not([type=checkbox],[type=radio],[type=range],[type=file]),select,textarea) { color:#072b50; border:1px solid #5d95b6; border-radius:2px; background:linear-gradient(180deg,#d5eaf2 0,#f9ffff 5px,#effbff); box-shadow:inset 1px 1px 2px #16476a30,0 1px #e3ffff; }
.de-client :is(input,select,textarea):focus { background:#faffff; }
.de-client input::placeholder,.de-client textarea::placeholder { color:#52758f; }
.de-client input[type=checkbox],.de-client input[type=radio],.de-client input[type=range] { accent-color:#168cf0; }
.de-client select { appearance:none; padding-right:24px; background:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 10 6'%3E%3Cpath d='M0 0h10L5 6z' fill='%230864b7'/%3E%3C/svg%3E") right 8px center / 10px 6px no-repeat,linear-gradient(180deg,#d5eaf2 0,#f9ffff 5px,#effbff); }
.de-client a { color:#004fb1; font-weight:bold; }

/* Windows: the cyan glass frame and its blue title bar. */
.de-client .de-panel { border:1px solid #1268b2; outline:0; border-radius:4px; box-shadow:${FRAME},0 2px 0 #07549b80,0 5px 12px #082f6755; background:linear-gradient(180deg,#ffffff4d,transparent 34px),linear-gradient(180deg,rgba(226,252,255,.94),rgba(169,232,251,.92) 45%,rgba(132,222,250,.93)); }
.de-client .de-panel-title { position:relative; display:block; min-height:24px; padding:2px 30px 2px; font:bold 15px/20px Arial,sans-serif; letter-spacing:.02em; color:#fff; ${OUTLINE}; text-align:center; background:${TITLE_BAR}; border-radius:2px 2px 0 0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.de-client .de-panel>.de-panel-title:first-child { margin:-9px -9px 10px!important; }
.de-client .de-panel-title:not(.de-panel>.de-panel-title:first-child) { margin:4px 0 6px!important; padding:2px 8px; border-radius:2px; font-size:13px; white-space:normal; }
.de-client .de-scene>.de-panel-title { margin:0!important; border:1px solid #1268b2; border-bottom:0; border-radius:4px 4px 0 0; font-size:15px; }
.de-client .de-scene>.de-panel-title+.de-panel { margin-top:-12px; border-top:0; border-top-left-radius:0; border-top-right-radius:0; }
.de-client .de-panel h3 { color:#0d4f8c; }
.de-client .de-note { color:#376384; }
.de-client .de-error { color:#922b17; background:#fff3dc; border:1px solid #d79a42; border-radius:2px; }

/* Collapsible groups: a blue bar row over an inset well, like the original's list headers. */
.de-client details>summary { list-style:none; display:flex; align-items:center; gap:6px; min-height:24px; padding:2px 8px; cursor:pointer; color:#fff; font-weight:bold; ${OUTLINE}; border:1px solid #104eaa; border-radius:2px;
  background:linear-gradient(180deg,#d8faff,#79d6fc 12%,#2189e4 70%,#145ec9); box-shadow:inset 0 1px #e5ffff; }
.de-client details>summary::-webkit-details-marker { display:none; }
.de-client details>summary::before { content:''; width:0; height:0; border:5px solid transparent; border-left:7px solid #fffc9b; border-right:0; filter:drop-shadow(0 1px #0b4189); transition:transform .1s; }
.de-client details[open]>summary::before { transform:rotate(90deg); }
.de-client details>summary:hover { filter:brightness(1.08); }
.de-client details[open]>summary { margin-bottom:5px; }
.de-client :is(.de-account-details,.de-audio-details,.de-deck-tools,.de-deck-filters,.de-shop-cosmetics,.de-shop-receipt) { background:#effcffd9; border:1px solid #6299bd; border-radius:2px; box-shadow:inset 0 1px 3px #164c7738; }

/* Inset wells and list rows. */
.de-client :is(.de-social-card,.de-trade-side,.de-trade-picker,.de-shop-item,.de-profile-comments,.de-npc-dialogue,.de-prompt-inspector) { background:#effcff; border:1px solid #6299bd; border-radius:2px; box-shadow:inset 0 1px 3px #164c7738,0 1px 0 #e3ffff; }
.de-client .de-social-card h3 { margin:-8px -10px 4px; padding:3px 10px; color:#fff; ${OUTLINE}; font-size:13px; background:linear-gradient(180deg,#d8faff,#79d6fc 12%,#2189e4 70%,#145ec9); border-bottom:1px solid #104eaa; }
.de-client .de-social-row { border-bottom:1px solid #b3d9ec; padding:3px 4px; }
.de-client .de-social-row:nth-child(even) { background:#d8eff966; }
.de-client .de-social-row:hover { background:#bceaff; }
.de-client .de-room-row { border-top:1px solid #9fcbe2; padding:5px 4px 2px; }
.de-client .de-zone-title { color:#fff; ${OUTLINE}; font-weight:bold; border-radius:2px 2px 0 0; padding:3px 8px; background:linear-gradient(180deg,#e6ffd9,#7fdc63 14%,#2ea33a 70%,#16852c); border:1px solid #0d6420; }
.de-client .de-collection>.de-zone-title,.de-client .de-collection .de-zone-title { background:linear-gradient(180deg,#fff0d8,#ffc466 14%,#f0861e 70%,#d6680c); border-color:#9b4a06; }
.de-client .de-deck-zone { background:#effcffcc; border:1px solid #6299bd; border-top:0; border-radius:0 0 2px 2px; }

/* The menu bar (CMenubar, menuber_01_c01): light cyan glass on the left deepening to blue, the message strip on the
 * right; the Menu, Duel and Move keys (menuicon_02_c01). Joined to the game frame above it. */
.de-client .de-nav { position:relative; z-index:40; display:flex; align-items:center; gap:10px; height:32px; padding:0 6px 0 8px; overflow:visible; border:0; border-top:1px solid #0132d3;
  background:linear-gradient(to bottom,#ffffff8c 0 2px,#ffffff33 3px,transparent 4px calc(100% - 4px),#00285a33 calc(100% - 3px),#00285a59 100%),
    linear-gradient(to right,#74ffff 0,#82e2ff 6%,#cafcff 15%,#b4feff 24%,#6cc2fe 38%,#3c8efd 59%,#0054fb 99%,#0041d5 100%); }
.de-menubar-keys { display:flex; gap:0; flex:none; height:32px; }
.de-client button.de-menubar-key { position:relative; width:80px; height:32px; min-height:0; padding:0; border:0; border-radius:0; background:none; box-shadow:none; text-shadow:none; filter:none; transform:none; }
.de-client button.de-menubar-key::after { content:attr(data-caption); position:absolute; inset:4px 6px; display:grid; place-items:center; border:1px solid #e36f08; border-radius:8px; color:#fff; font:bold 13px Arial,sans-serif; ${OUTLINE}; background:${MENU_KEY}; }
.de-client button.de-menubar-key:hover:not(:disabled)::after { background:${MENU_KEY_HOVER}; border-color:#ffd04a; }
.de-client button.de-menubar-key:is(:active,[data-open=true]):not(:disabled)::after { background:linear-gradient(#ffc4e6,#ff4fb0 55%,#e0218e); border-color:#c9177a; }
.de-client button.de-menubar-key:hover:not(:disabled),.de-client button.de-menubar-key:active:not(:disabled) { background:none; box-shadow:none; transform:none; }
.de-client[data-menu-art=true] button.de-menubar-key::after { content:''; inset:0; border:0; border-radius:0; background:var(--de-menu-icons) 0 calc(var(--y) * -1px) / 240px 192px no-repeat; }
.de-client[data-menu-art=true] button.de-menubar-key:hover:not(:disabled)::after { background:var(--de-menu-icons) -80px calc(var(--y) * -1px) / 240px 192px no-repeat; }
.de-client[data-menu-art=true] button.de-menubar-key:is(:active,[data-open=true]):not(:disabled)::after { background:var(--de-menu-icons) -160px calc(var(--y) * -1px) / 240px 192px no-repeat; }
.de-menubar-key[data-kind=menu] { --y:0; } .de-menubar-key[data-kind=duel] { --y:32; } .de-menubar-key[data-kind=move] { --y:96; }
.de-menubar-message { flex:1; min-width:0; height:18px; margin-left:auto; max-width:62%; border:1px solid #fff; background:#f2fbffd9; display:flex; align-items:center; padding:0 6px; overflow:hidden; }
.de-menubar-message .de-status { flex:1; min-width:0; text-align:left; font-size:12px; line-height:16px; color:#14365b; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }

/* The Main Menu window (CMainMenu: 282 wide, the frame with a bottom band, 24 px yellow keys every 26 px). */
.de-main-menu { position:absolute; left:0; bottom:calc(100% + 2px); width:282px; max-height:min(560px,calc(100vh - 60px)); overflow:auto; padding:27px 12px 14px; border-radius:2px;
  background:linear-gradient(transparent calc(100% - 13px),#e5e5e5 calc(100% - 13px) calc(100% - 7px),transparent calc(100% - 7px)),rgba(132,244,255,.82);
  box-shadow:inset 3px 0 #76ffff,inset 0 3px #a7ffff,inset -3px 0 #41abef,inset 0 -3px #329be5,inset 4px 0 #68e8ff,inset 0 4px #79ffff,inset -4px 0 #4db9f7,inset 0 -4px #46b1f2,inset 7px 0 #59c6ff,inset -7px 0 #59c6ff,inset 0 -7px #59c6ff,0 4px 14px #082f6766; }
.de-main-menu[hidden] { display:none; }
.de-window-title { position:absolute; left:0; right:0; top:0; height:22px; background:${TITLE_BAR}; }
.de-window-title h2 { margin:0; font:15px/21px Arial,sans-serif; letter-spacing:.04em; color:#fff; ${OUTLINE}; text-align:center; }
.de-client button.de-close-box { position:absolute; top:4px; right:4px; width:16px; height:13px; min-height:0; padding:0; border:0; border-left:1px solid #fff; border-radius:0; box-shadow:none;
  background:linear-gradient(to right,transparent calc(100% - 2.5px),#f5cf00 calc(100% - 1.5px),#f7dc80 calc(100% - .5px)),linear-gradient(to bottom,#fffec2 .5px,#fffd63 1.5px,#fffc00 3px,#fffc00 calc(100% - 2.5px),#f1bb00 calc(100% - 1.5px),#f5cf80 calc(100% - .5px)); }
.de-client button.de-close-box::before,.de-client button.de-close-box::after { content:''; position:absolute; left:1px; top:5.5px; width:12px; height:2px; background:#005fea; border-radius:1px; transform:rotate(42deg); }
.de-client button.de-close-box::after { transform:rotate(-42deg); }
.de-client button.de-close-box:hover { filter:brightness(1.08); background:linear-gradient(to bottom,#fffec2 .5px,#fffd63 1.5px,#fffc00 3px,#fffc00 calc(100% - 2.5px),#f1bb00 calc(100% - 1.5px),#f5cf80 calc(100% - .5px)); box-shadow:none; }
.de-main-menu-keys { display:flex; flex-direction:column; gap:2px; }
.de-client .de-main-menu button.de-menu-key { width:100%; height:24px; min-height:0; padding:0 8px; border:1px solid; border-color:#e36f08 #e99223 #e68317 #e36f08; border-radius:3px; color:#fff; font:15px/22px Arial,sans-serif; letter-spacing:.04em; ${OUTLINE}; box-shadow:none; background:${MENU_KEY}; text-align:center; }
.de-client .de-main-menu button.de-menu-key:hover:not(:disabled),.de-client .de-main-menu button.de-menu-key:focus-visible { background:${MENU_KEY_HOVER}; border-color:#fffe92; box-shadow:none; filter:none; }
.de-client .de-main-menu button.de-menu-key:active:not(:disabled) { background:${MENU_KEY_PRESSED}; border-color:#fffe92; transform:none; box-shadow:none; padding-top:2px; }
.de-client .de-main-menu button.de-menu-key[aria-current=page] { border-color:#fff9b0; box-shadow:0 0 0 1px #ff9c1a,inset 0 0 6px #fff7; }
.de-client .de-main-menu button.de-menu-key:disabled { filter:grayscale(.8) brightness(.92); color:#e8e8e8; opacity:1; }

/* Lobby: the place plate (lobbyname_win_01_c01: a gold rim round a blue to cyan glass), names in white with a dark
 * edge (no plate), the chat window (iconbar over a translucent plane), the player menu (yellow-green frame, cream
 * plate keys). */
.de-client .de-lobby-name { left:8px; top:8px; min-width:250px; padding:5px 18px 5px 14px; font:16px/22px Arial,sans-serif; letter-spacing:.06em; color:#fff; ${OUTLINE}; border:2px solid #f2b42a; border-radius:5px;
  background:linear-gradient(to right,#1f7cf7,#4aa6fb 55%,#8ff3ff); box-shadow:inset 0 0 0 1px #ffe57a,0 1px 3px #0005; }
.de-client .de-avatar-name { color:#fff; background:none; padding:0 2px; font-size:12px; letter-spacing:.04em; ${OUTLINE}; }
.de-client .de-avatar.self .de-avatar-name { color:#fffc9b; }
.de-client .de-chat { left:0; bottom:0; width:min(76%,780px); max-height:none; padding:26px 8px 8px; border:0; border-radius:5px 0 0 0; outline:0; box-shadow:inset 3px 0 #76ffffb3,inset -3px 0 #41abefb3,inset 0 -3px #329be5b3;
  background:linear-gradient(to bottom,#ffffffb3 0 3px,#beffffb3 4px,#86d9ffb3 5px,#226cffb3 19px,#0132d3 19px 20px,#59c6ffb3 20px 24px,transparent 24px),rgba(255,255,255,.42); }
.de-client .de-chat::before { content:'Chat'; position:absolute; left:8px; top:1px; height:19px; padding:0 14px 0 20px; font:13px/20px Arial,sans-serif; color:#0b2a4a; background:linear-gradient(to bottom,#fafeff 5px,#dcfaff 9px,#b3f4ff 13px,#81edff 19px); clip-path:polygon(17px 0,100% 0,100% 100%,0 100%); pointer-events:none; }
.de-client .de-chat-log { height:96px; background:rgba(255,255,255,.62); border:1px solid #ffffffcc; padding:3px 6px; font-size:13px; color:#0b1d30; }
.de-client .de-chat-line strong { color:#004fb1; }
.de-client .de-chat form { margin-top:4px; gap:4px; }
.de-client .de-chat select { position:absolute; top:1px; left:62px; height:19px; min-height:0; padding:0 22px 0 8px; font-size:12px; border:1px solid #0132d3; border-bottom:0; border-radius:0; background:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 10 6'%3E%3Cpath d='M0 0h10L5 6z' fill='%23fff'/%3E%3C/svg%3E") right 6px center / 9px 5px no-repeat,linear-gradient(to bottom,#39a6d3 0,#4690d5 2px,#3d98ec 9px,#379dfd 100%); color:#fff; ${OUTLINE}; box-shadow:inset 0 1px #dbdbdb; }
.de-client .de-chat input { height:26px; padding:3px 6px; background:#fff; }
.de-client .de-chat button { min-height:26px; padding:2px 14px; }
.de-client .de-context { border:0; outline:0; border-radius:2px; padding:10px 14px 12px; background:rgba(255,255,255,.78); box-shadow:inset 0 0 0 1px #ecf481,inset 0 0 0 3px #ebf368,inset 0 0 0 5px #e9ea54,inset -1px -1px 0 5px #e2cf32,0 3px 10px #0004; }
.de-client .de-context>.de-panel-title:first-child { margin:-10px -14px 8px!important; padding:4px 10px; color:#e8202a; text-shadow:none; background:#c8c8d0b3; border-radius:0; text-align:left; letter-spacing:.04em; }
.de-client .de-context button:where(:not(:disabled)),.de-client .de-context button:disabled { color:#111; text-shadow:none; font-weight:normal; letter-spacing:.04em; border:1px solid #011434; border-radius:0; box-shadow:none; background:${PLATE}; }
.de-client .de-context button:hover:not(:disabled) { background:${PLATE_HOVER}; box-shadow:none; }
.de-client .de-context button:active:not(:disabled) { background:${PLATE_PRESSED}; transform:none; }
.de-client .de-lobby-places { top:8px; right:8px; max-height:calc(100% - 190px); }
.de-client [data-key=lobby-npcs]>button { width:100%; display:block; text-align:left; font-weight:normal; text-shadow:none; color:#14365b; min-height:26px; padding:3px 9px; margin-top:0; border:0; border-bottom:1px solid #b3d9ec; border-radius:0; box-shadow:none; background:#effcff; }
.de-client [data-key=lobby-npcs]>button:nth-of-type(even) { background:#dcf1fa; }
.de-client [data-key=lobby-npcs]>button:hover:not(:disabled) { color:#fff; ${OUTLINE}; background:linear-gradient(180deg,#61c7ff 0%,#258ee8 45%,#0963c7 52%,#0752a9 100%); box-shadow:inset 3px 0 #fff098; }

/* Dialogs: the yellow box (OK, Yes / No, invitations, notices) round a white reading surface. */
.de-client :is(.de-duel-notice,.de-notice) { color:#111; font-weight:normal; letter-spacing:.03em; border:0; border-radius:2px; padding:14px 16px 12px; background:linear-gradient(#fff,#fff) 5px 5px / calc(100% - 10px) calc(100% - 46px) no-repeat,#ffbf44; box-shadow:${DIALOG},0 4px 14px #0005; }
.de-client .de-notice { padding:10px 16px; background:#fff; box-shadow:${DIALOG}; }
.de-client .de-duel-notice button { min-width:110px; color:#111; font-weight:normal; text-shadow:none; border:1px solid #011434; border-radius:0; box-shadow:none; background:${PLATE}; }
.de-client .de-duel-notice button:hover:not(:disabled) { background:${PLATE_HOVER}; box-shadow:none; }
.de-client .de-duel-prompt[role=dialog][aria-label='Duel Invitation'] { box-shadow:${DIALOG},0 4px 14px #0005; border:0; background:#fff; }
.de-client .de-duel-prompt[role=dialog][aria-label='Duel Invitation']>.de-panel-title { margin:-7px -7px 10px!important; }

/* Title and character select. */
.de-client[data-scene=title] .de-stage { background:radial-gradient(ellipse at 50% 30%,#bff4ff 0%,#4fb6ee 40%,#0f5fb0 100%); }
.de-client[data-scene=title] .de-scene .de-panel>button { min-height:36px; font:italic bold 16px Arial,sans-serif; letter-spacing:.05em; clip-path:polygon(14px 0,100% 0,calc(100% - 14px) 100%,0 100%); padding:0 24px; }
.de-client[data-scene=title] .de-scene .de-panel>button.gold { min-height:44px; font-size:20px; color:#fff; text-shadow:1px 0 #a35a00,-1px 0 #a35a00,0 1px #a35a00,0 -1px #a35a00,0 2px 2px #7a4400; }
.de-client[data-scene=title] .de-scene .de-panel>.de-panel-title:first-child { font:italic 900 22px/30px "Arial Black",Arial,sans-serif; letter-spacing:.04em; min-height:34px; }
.de-client .de-characters { grid-template-columns:1fr; gap:6px; }
.de-client .de-character-slot { flex-direction:row; gap:8px; align-items:stretch; }
.de-client .de-characters button { flex-direction:row; justify-content:space-between; min-height:32px; padding:0 12px; text-align:left; color:#111; text-shadow:none; font-weight:normal; letter-spacing:.04em; border:1px solid #011434; border-radius:0; box-shadow:none; background:${PLATE}; }
.de-client .de-characters button:hover:not(:disabled) { background:${PLATE_HOVER}; box-shadow:none; }
.de-client .de-characters button:active:not(:disabled) { background:${PLATE_PRESSED}; }
.de-client .de-characters button.gold { background:${PLATE_HOVER}; border-color:#ff9c1a; }
.de-client .de-characters strong { font-size:14px; font-weight:normal; }
.de-client .de-character-slot>button:first-child { flex:1; }
.de-client .de-character-slot>button+button { flex:none; min-height:32px; padding:0 12px; font-size:12px; justify-content:center; }

/* Profile: the duel-style window (CWindowTaskFrameDuel, sampled in htmlui controls/skin.js): a grey title bar and
 * slate body, the record in a light well with alternate rows darker, grey bevelled keys. */
.de-client .de-profile-panel { color:#111; border:0; border-radius:0; background:#9999a9;
  box-shadow:inset 3px 0 #c8c9d2,inset 0 -2px #485064,inset -2px 0 #797f8f,inset 4px 0 #c5c6cf,inset 0 -3px #5c6275,inset -3px 0 #898d9c,inset 5px 0 #bbbcc6,inset 0 -4px #848697,inset -4px 0 #a7a8b5,0 4px 14px #0006; }
.de-client .de-profile-head { margin:-12px -12px 0; min-height:27px; padding:2px 6px 2px 12px; border-radius:0;
  background:linear-gradient(to bottom,#f5f5f7 0,#e0e0e5 2px,#c9c9d2 3px,#b0b0bc 5px,#9999a9 8px,#727288 calc(100% - 7px),#66677d calc(100% - 5px),#4b4e5e calc(100% - 3px),#9fa1a9 calc(100% - 3px) calc(100% - 2px),#f2f2f4 calc(100% - 2px) calc(100% - 1px),#c9c9d6 calc(100% - 1px)); }
.de-client .de-profile-head h3 { color:#fff; font-weight:normal; letter-spacing:.04em; ${OUTLINE}; }
.de-client .de-profile-panel :is(.de-note,label,dt) { color:#22263a; }
.de-client .de-profile-stats { gap:0; border:1px solid #4b4f77; border-radius:0; background:linear-gradient(#c9cad2,#dee3e9); box-shadow:inset 1px 1px #5c5c84,inset -1px -1px #8589a3; }
.de-client .de-profile-stat { border-radius:0; background:transparent; }
.de-client .de-profile-stat:nth-child(6n+4),.de-client .de-profile-stat:nth-child(6n+5),.de-client .de-profile-stat:nth-child(6n+6) { background:#3c3c503b; }
.de-client .de-profile-comments { background:linear-gradient(#c9cad2,#dee3e9); border:1px solid #4b4f77; box-shadow:inset 1px 1px #5c5c84; }
.de-client .de-profile-title { color:#c0181f; }
.de-client .de-profile-panel button:where(:not(:disabled)),.de-client .de-profile-panel button:disabled { color:#000; text-shadow:none; font-weight:normal; letter-spacing:.03em; border:1px solid; border-color:#323232 #656565 #4f4f4f #323232; border-radius:2px; background:#c9c9c9;
  box-shadow:inset 1px 1px #989898,inset -1px -1px #7f7f7f,inset 2px 2px #fff,inset -2px -2px #a6a6a6,inset 3px 3px #f1f1f1,inset -3px -3px #c1c1c1; }
.de-client .de-profile-panel button:hover:not(:disabled) { background:#d6d6d6; box-shadow:inset 1px 1px #989898,inset -1px -1px #7f7f7f,inset 2px 2px #fff,inset -2px -2px #a6a6a6,inset 3px 3px #f1f1f1,inset -3px -3px #c1c1c1; }
.de-client .de-profile-panel button:active:not(:disabled) { box-shadow:inset 1px 1px #7f7f7f,inset 2px 2px #a6a6a6,inset -1px -1px #fff,inset 3px 3px #c1c1c1; }

/* Shop: pack plates in wells; MP in gold. */
.de-client .de-shop-item h3 { color:#0d4f8c; }
.de-client .de-shop-item>strong { color:#a0560c; }

@media(max-width:700px) { .de-client .de-chat { width:100%; } .de-client .de-chat select { left:58px; } .de-main-menu { width:min(282px,calc(100vw - 16px)); } .de-menubar-message { max-width:none; } .de-client .de-lobby-places { max-height:calc(100% - 200px); } }
`;
