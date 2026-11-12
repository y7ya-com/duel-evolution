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
/* main's 2008 backdrop (its backdrop.js, src/ui/htmlui) shows through on the screens that have it */
.de-client[data-scene=characters] .de-stage { background:transparent; }
/* main's menu bar (CWindowModelMenu) stands on the stage's bottom 32 of 768 px outside the title and the duel, as in
   the game: the rewrite's own scenes end above it */
.de-client:not([data-scene=title]):not([data-scene=duel]):not([data-scene=shop]) .de-stage>.de-scene { bottom:4.1667%; overflow:auto; }
/* live's card shop and its reveal fill the screen: no bar under them (its page and the strip at its foot down to 768) */

/* Keys: the original's blue bevelled key; gold for the primary. Metrics stay the layout's. */
.de-client button:where(:not(.de-card,.de-avatar,.de-zone-target,.de-janken-card,.de-janken-order,.de-field-card,.de-card-shop *)) { color:#072b50; font-weight:bold; text-shadow:0 1px #f0ffff; border:1px solid #267dbb; border-radius:3px;
  background:linear-gradient(180deg,#fff 0%,#e7fbff 12%,#b5eaff 48%,#83cef5 51%,#5bb3e9 100%); box-shadow:inset 0 1px #fff,inset 1px 0 #d9ffff,inset 0 -2px #2d83b74d,0 1px 0 #1f629a; transition:filter .1s,box-shadow .1s; }
.de-client button:where(:not(.de-card,.de-avatar,.de-zone-target,.de-janken-card,.de-janken-order,.de-field-card,.de-card-shop *)):hover:not(:disabled) { filter:none; background:linear-gradient(180deg,#fff,#d7ffff 50%,#a3edff 52%,#7acdf5); box-shadow:inset 0 1px #fff,0 0 0 1px #bcffff,0 1px 0 #1e659a; }
.de-client button:where(:not(.de-card,.de-avatar,.de-zone-target,.de-janken-card,.de-janken-order,.de-field-card,.de-card-shop *)):active:not(:disabled) { transform:translateY(1px); box-shadow:inset 0 2px 3px #12538455,0 0 0 1px #efffff; }
.de-client button:where(:not(.de-card-shop *)):disabled { opacity:.5; filter:saturate(.35); }
.de-client button.gold:where(:not(.de-card-shop *)) { color:#432e08; text-shadow:0 1px #fffddd; border-color:#bf7819; background:linear-gradient(180deg,#fffbd0 0%,#fffba1 12%,#fae773 47%,#f2cd51 51%,#eca431 100%); box-shadow:inset 0 1px #ffffe6,inset 1px 0 #fff8bc,inset 0 -2px #be7c2440,0 1px #9e6117; }
.de-client button.gold:where(:not(.de-card-shop *)):hover:not(:disabled) { background:linear-gradient(180deg,#fffbd0 0%,#fffba1 12%,#fae773 47%,#f2cd51 51%,#eca431 100%); filter:brightness(1.08); box-shadow:inset 0 1px #fff,0 0 0 1px #fffeb8,0 1px #a36a18; }
.de-client :is(button,input,select,textarea,summary,canvas):where(:not(.de-card-shop *)):focus-visible { outline:2px solid #ffdc65; outline-offset:2px; }

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

/* Inset wells and list rows. */
.de-client .de-prompt-inspector { background:#effcff; border:1px solid #6299bd; border-radius:2px; box-shadow:inset 0 1px 3px #164c7738,0 1px 0 #e3ffff; }
.de-client .de-zone-title { color:#fff; ${OUTLINE}; font-weight:bold; border-radius:2px 2px 0 0; padding:3px 8px; background:linear-gradient(180deg,#e6ffd9,#7fdc63 14%,#2ea33a 70%,#16852c); border:1px solid #0d6420; }
.de-client .de-deck-zone { background:#effcffcc; border:1px solid #6299bd; border-top:0; border-radius:0 0 2px 2px; }

/* The menu bar and Main Menu are main's (src/ui/htmlui); the nav keeps only the status, for assistive technology. */
.de-client .de-nav { position:absolute; width:1px; height:1px; padding:0; overflow:hidden; clip-path:inset(50%); white-space:nowrap; border:0; }

/* the name over a head as live's engine draws it: dark letters in a white rim */
.de-client .de-avatar-name { color:#1c2733; background:none; padding:0 2px; font:16px/18px Arial,sans-serif; letter-spacing:.04em; text-shadow:1px 0 #fff,-1px 0 #fff,0 1px #fff,0 -1px #fff,1px 1px #fff,-1px -1px #fff; }
/* the nation flag (CNationFlag's small cell, 22 x 15) ends where the name starts: on the avatar's centre line */
.de-client .de-avatar-flag { position:absolute; right:100%; top:50%; margin-top:-8px; width:22px; height:15px; background-repeat:no-repeat; }

/* Dialogs: the yellow box (OK, Yes / No, invitations, notices) round a white reading surface. */
.de-client :is(.de-duel-notice,.de-notice) { color:#111; font-weight:normal; letter-spacing:.03em; border:0; border-radius:2px; padding:14px 16px 12px; background:linear-gradient(#fff,#fff) 5px 5px / calc(100% - 10px) calc(100% - 46px) no-repeat,#ffbf44; box-shadow:${DIALOG},0 4px 14px #0005; }
.de-client .de-notice { padding:10px 16px; background:#fff; box-shadow:${DIALOG}; }
.de-client .de-notice.de-sr-only { position:absolute; width:1px; height:1px; padding:0; margin:-1px; overflow:hidden; clip:rect(0 0 0 0); white-space:nowrap; border:0; box-shadow:none; }
.de-client .de-duel-notice button { min-width:110px; color:#111; font-weight:normal; text-shadow:none; border:1px solid #011434; border-radius:0; box-shadow:none; background:${PLATE}; }
.de-client .de-duel-notice button:hover:not(:disabled) { background:${PLATE_HOVER}; box-shadow:none; }
.de-client .de-duel-prompt[role=dialog][aria-label='Duel Invitation'] { box-shadow:${DIALOG},0 4px 14px #0005; border:0; background:#fff; }
.de-client .de-duel-prompt[role=dialog][aria-label='Duel Invitation']>.de-panel-title { margin:-7px -7px 10px!important; }

/* Title and character select. */
/* the title: main's 2008 backdrop (backdrop.js, the layer's) shows through, as on live; and as live's stage.js the 4:3
   stage fills the window, letterboxed on black, with no bars (phones: ui/phone.ts frames it) */
.de-client[data-scene=title] .de-stage { background:transparent; }
html:has(.de-client[data-scene=title]:not(.de-phone)), html:has(.de-client[data-scene=title]:not(.de-phone)) body { background:#000; overflow:hidden; margin:0; }
.de-client[data-scene=title]:not(.de-phone) { width:min(100vw,calc(100vh*4/3)); margin:calc((100vh - min(100vh,calc(100vw*3/4)))/2) auto 0; }
.de-client[data-scene=title]:not(.de-phone)>.de-stage { min-height:0; max-height:none; height:auto; aspect-ratio:4/3; border:0; }
.de-client[data-scene=title]:not(.de-phone)>.de-nav { display:none; }
/* every scene as live's stage.js frames them ([data-scene]: every client has one once drawn): the 4:3 stage fills the window (no 40 px kept
   for a status strip, which put every window ~20 px off live's), the status line kept for assistive technology only */
html:has(.de-client[data-scene]:not(.de-phone)), html:has(.de-client[data-scene]:not(.de-phone)) body { overflow:hidden; margin:0; }
.de-client[data-scene]:not(.de-phone) { width:min(100vw,calc(100vh*4/3)); margin:calc((100vh - min(100vh,calc(100vw*3/4)))/2) auto 0; }
.de-client[data-scene]:not(.de-phone)>.de-stage { min-height:0; max-height:none; height:auto; aspect-ratio:4/3; }
.de-client[data-scene]:not(.de-phone)>.de-nav { position:absolute; width:1px; height:1px; overflow:hidden; clip-path:inset(50%); white-space:nowrap; }
/* where live's sign-in panel stands: CWindowLogin at 256, 256, 464 wide (rt/session.cpp), under the title movie's logo */
.de-client[data-scene=title] .de-scene>.de-panel { position:absolute; z-index:1; left:25%; top:33.333%; width:45.3125%; margin:0; box-sizing:border-box; }
.de-client[data-scene=title] .de-scene .de-panel>button { min-height:36px; font:italic bold 16px Arial,sans-serif; letter-spacing:.05em; clip-path:polygon(14px 0,100% 0,calc(100% - 14px) 100%,0 100%); padding:0 24px; }
.de-client[data-scene=title] .de-scene .de-panel>button.gold { min-height:44px; font-size:20px; color:#fff; text-shadow:1px 0 #a35a00,-1px 0 #a35a00,0 1px #a35a00,0 -1px #a35a00,0 2px 2px #7a4400; }
.de-client[data-scene=title] .de-scene .de-panel>.de-panel-title:first-child { font:italic 900 22px/30px "Arial Black",Arial,sans-serif; letter-spacing:.04em; min-height:34px; }

`;
