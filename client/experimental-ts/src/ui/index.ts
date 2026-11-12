import type { DuelCardView, DuelOption, DuelView, CardView, ClientCommand, ClientController, ClientView, DeckZone, DuelPromptView, DuelResponse, Scene } from './contracts';
import { duelOptions } from './contracts';
import { sideboardDifference } from './deck';
import { FIELD_LAYOUT, fieldCardPosition, gamePoint, safeImageUrl, validatePromptResponse } from './helpers';
import { DuelPresentation } from './duel-scene';
import { cardBadges, BADGE_CSS } from './duel-counters';
import { lpPlate, LP_PLATE_CSS, type LpPlate } from './duel-plate';
import type { WorldRenderer } from './world';
import { giftItemName } from '../npcs/gift-names';
import { BrowserDisplaySettings, browserFullscreenAdapter } from './settings-browser';
import { mountPhoneStage, holdToWalk, type PhoneStage, type HoldWalk } from './phone';
import { CLIENT_CSS } from './styles';
import { SKIN_CSS } from './skin';
import { duelConfigWindow, titleOptionsWindow, DUEL_OPTIONS_TEXTS, type OptionsDeps, type OptionsUi } from './htmlui/options';
import { closeAudioPage, openAudioPage } from './htmlui/audio-page';
import { renderTagLobby, TAG_CSS } from './extra/tag';
import { changeAvatarAction, freeChoices, FIRST_CATEGORY } from './htmlui/avatar';
import { Ids } from './htmlui/snapshot';
import type { ControlHandlers, WindowSpec } from './htmlui/snapshot';
import { htmlUiLocal, htmlWindows, stockDialog, duelRequestDialog, DELETE_TEXT, DUEL_REQUEST_TEXT } from './htmlui/windows';
import { UiText, localizeSpecs } from '../features/ui-text';
import { titleConfigWindow } from './htmlui/title-config';
import { StarterPicker } from './htmlui/starter';
import { duellogQuery, duellogUi, duellogWindow, duellogServerPicker, fetchDuellogFull, replayWindow, type DuellogUi } from './htmlui/duellog';
import type { TitleConfigUi } from './htmlui/title-config';
import { bracketWindow, duelHelpStrip, eventKey, informationWindow, joinGunslingWindow, resultWindow, tournamentUi } from './htmlui/tournament';
import { discordWire } from './htmlui/discord-wire';
import { lobbyLocal, lobbyList, lobbyWindows, duelKey, moveKey, waitingMessage, LOBBY_TEXT, AREA_TEXT, WORLD_TEXT } from './htmlui/lobby';
import type { CardActions, MailBox, MenuEntry, MenuView, SocialLists } from './htmlui/windows';
import type { HtmlUiLayer } from './htmlui/layer';
import { GameCursor } from './htmlui/cursor';
import { fetchPackCompletion, npcPackOpen, npcPackSelect, npcPackUi } from './htmlui/npc-pack';
import { npcTalkWindows, npcTalkStage, npcTalkDismissable } from './htmlui/npc-talk';
import { DeckScene } from './htmlui/deck-scene';
import { DeckDom } from './htmlui/deck-dom';
import { cardShopHost } from './htmlui/card-shop';
import { pageModules } from './htmlui/page-modules';
import { sceneVeilUp, VEIL_EVENT, SCENE_LOADING_ATTR } from './htmlui/scene-loading';
import { npcClosable, npcItemGetUi, npcItemGetWindows } from './htmlui/npc-itemget';
import { CHALLENGE_UNLOCKS, challengeUnlockUi, challengeUnlockWindows } from './htmlui/challenge-unlock';
import { installLazyShim } from './htmlui/lazy-shim';
import { loadPackTexts } from './htmlui/pack-info';
import { FLAG_ATLAS, flagCell } from './nation-flag';
import { NPC_STAR_BIG, NPC_STAR_SMALL } from '../avatars/npc';
import { barReserve, onBarReserve } from '@htmlui/screens/lobby_icons.js';
import { titleName } from '../features/titles';
import { tradeLocal, tradeWindows, tradeScene, trunkOpen, partnerLeft, THINKING_FRAME_MS } from './htmlui/trade';
import { cardSwapMenu } from './htmlui/card-swap-menu';
import { TradeTrunk, isTradeTrunk } from './htmlui/trade-trunk';
import { SideSwap, isSideSwap, SIDE_SWAP_ZONES } from './htmlui/side-swap';
import { CardGetScene, isCardGet } from './htmlui/card-get';
import { npcWaistUpSet } from './npc-waistup';
import { deckBackdrop } from '@htmlui/screens/deck.js';
import { PictureArt } from './htmlui/art';
import { setPictureResolver, disposePictures } from './htmlui/pictures';
import { StartScene, PORTRAIT_AT } from './htmlui/start-scene';
import { TitleScene, TITLE_DIMMED, type TitleButton } from './htmlui/title-scene';
import { BUST_AT } from './htmlui/windows';
import { loginLocal, loginWindow } from './htmlui/login';
import { duelDialog, duelDialogCovers, duelOkDialog, loadDuelSpeed } from './htmlui/duel-dialogs';
import { NetNote } from './htmlui/net-note';
import { duelCmdWindow, duelCmdRect, menuCommand, SURRENDER_COMMAND, type DuelCmdRow, type DuelCmdUi } from './htmlui/duel-cmd';
import { DuelSpeedButton } from './htmlui/duel-speed';
import { duelResultWindows } from './htmlui/duel-result';
import { jankenScene, jankenWinner, JANKEN_CSS, type JankenView } from './janken-scene';
export type * from './contracts';

type Child = Node | string | null | undefined;
function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', ...children: Child[]): HTMLElementTagNameMap[K] {
  const n = document.createElement(tag); if (cls) n.className = cls;
  for (const child of children) if (child !== null && child !== undefined) n.append(typeof child === 'string' ? document.createTextNode(child) : child);
  return n;
}
function secretField(node: HTMLElement): boolean { const input = node as HTMLInputElement; return node.tagName === 'INPUT' && (input.type === 'password' || input.name === 'code' || input.autocomplete === 'one-time-code'); }
function note(text: string): HTMLParagraphElement { return el('p', 'de-note', text); }
function title(text: string): HTMLHeadingElement { return el('h2', 'de-panel-title', text); }
function labelled(text: string, input: HTMLElement): HTMLLabelElement { return el('label', '', el('span', '', text), input); }
function button(text: string, action: () => void, disabled = false, gold = false): HTMLButtonElement {
  const b = el('button', gold ? 'gold' : '', text); b.type = 'button'; if (text) b.dataset.key = `button:${text}`; b.disabled = disabled; b.onclick = action; return b;
}
function textField(key: string, value: string, placeholder = ''): HTMLInputElement {
  const i = el('input'); i.dataset.key = key; i.name = key; i.value = value; i.placeholder = placeholder; return i;
}
const CARD_BACK = 'data/card/0000.png', FIELD_SHEET = 'data/y/duel/field/duelfield_01_c01.png';
/** A drawing for a CSS background (fills its box as a stretched 1024 x 768 screen). */
const svgBackground = (body: string) => `url("data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="768" viewBox="0 0 1024 768" preserveAspectRatio="none">${body}</svg>`)}")`;
/** Under the world while its map art loads (or without it): the plain sky with its lattice and the notice. */
let lobbyBackdrop = '';
function lobbyBackground(): string {
  if (lobbyBackdrop) return lobbyBackdrop;
  let lines = '';
  for (let x = -768; x < 1800; x += 96) lines += `M${x} 0L${x + 768} 768M${x} 0L${x - 768} 768`;
  return lobbyBackdrop = svgBackground(`<defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#a7e4fa"/><stop offset="1" stop-color="#4a93b0"/></linearGradient></defs>`
    + `<rect width="1024" height="768" fill="url(#g)"/><path d="${lines}" stroke="#e2f8ff" stroke-opacity="${0x55 / 255}" stroke-width="1" fill="none"/>`
    + `<text x="512" y="345" fill="#07519b" font-family="Arial" font-size="16" text-anchor="middle">Map artwork is not loaded</text>`);
}
/** Under the original field art (shown while it loads, or without it): the zone outlines of the original sheet. */
let fieldBackdrop = '';
function fieldBackground(): string {
  if (fieldBackdrop) return fieldBackdrop;
  // each outline its own stroke, as strokeRect drew them (neighbours' shared edges painted twice)
  let zones = '';
  for (const side of [0, 1] as const) {
    const rect = (x: number, y: number, w: number, h: number) => { zones += `<rect x="${x}" y="${y}" width="${w}" height="${h}" stroke="${side ? '#ff4f7b' : '#1d7cf2'}" stroke-width="3" fill="none"/>`; };
    for (const row of ['monster', 'spell'] as const) for (let k = 0; k < 5; k++) {
      const x = side ? 1024 - FIELD_LAYOUT.cellX(k) : FIELD_LAYOUT.cellX(k), y = FIELD_LAYOUT.rows[row][side];
      rect(x - 38, y - 52, 76, 104);
    }
    for (const pile of Object.values(FIELD_LAYOUT.piles)) { const [x, y] = pile[side]; rect(x - 28, y - 39, 56, 78); }
  }
  return fieldBackdrop = svgBackground(`<defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#07315b"/><stop offset=".5" stop-color="#176e8c"/><stop offset="1" stop-color="#0b426a"/></linearGradient></defs>`
    + `<rect width="1024" height="768" fill="url(#g)"/>${zones}`);
}
const lpWidth = (lp: number) => `${Math.max(0, Math.min(100, lp / 80))}%`;
/** A face-down card on the player's own field whose identity the server gave its owner. */
const isOwnSetCard = (c: DuelCardView) => !c.faceUp && c.controller === 0 && c.passcode !== undefined && ['monster', 'spell', 'field'].includes(c.zone);
function cardTile(card: CardView, showName = true, faceUp = true, load?: (card: CardView, image: HTMLImageElement) => void, back?: (image: HTMLImageElement) => void): HTMLElement {
  const tile = el('div', 'de-card' + (faceUp ? '' : ' de-card-back'));
  if (!faceUp && back) { const image = el('img'); image.alt = ''; image.decoding = 'async'; image.draggable = false; image.style.visibility = 'hidden'; image.onload = () => { image.style.visibility = ''; }; tile.append(image); back(image); }
  tile.setAttribute('aria-label', faceUp ? card.name : 'Face-down card');
  if (faceUp) {
    const url = safeImageUrl(card.image);
    if (url) {
      const image = el('img'); image.src = url; image.alt = card.name; image.loading = 'lazy'; image.decoding = 'async';
      image.onerror = () => { image.remove(); tile.prepend(el('span', 'de-card-unknown', 'Artwork unavailable')); };
      tile.append(image);
    } else {
      tile.append(el('span', 'de-card-unknown', card.name || 'Unknown card'));
      if (load && card.passcode !== undefined) {
        const image = el('img'); image.alt = card.name; image.loading = 'lazy'; image.decoding = 'async'; image.style.opacity = '0';
        image.onload = () => { image.style.opacity = '1'; for (const node of Array.from(image.parentElement?.querySelectorAll('.de-card-unknown') ?? [])) node.remove(); };
        image.onerror = () => { image.style.opacity = '0'; }; tile.append(image); load(card, image);
      }
    }
    if (showName) tile.append(el('span', 'de-card-name', card.name));
  }
  return tile;
}
interface LocalState {
  /** The last duel information box the player closed. */
  noticeSeen: number;
  /** The duel log's scroll position while the reader is not at the bottom (null: follow new lines). */
  logScroll: number | null;
  /** The card whose command list (CWindowModelListDuelCmd) is open, and whether the duel log strip is open. */
  duelCmd: string | null;
  /** The duel help line's text and when it began running across the bar (a render keeps its place). */
  helpText: string; helpFrom: number;
  tradeSearch: string;
  message: string; inspected: CardView | null; inspectedFrom: DeckZone | 'collection' | 'duel';
  promptInspection: CardView | null; promptId: string | null; selected: Set<string>;
  roomOptions: { style?: 3 | 4; allowSurrender?: boolean; timeLimit?: boolean; allowWatch?: boolean }; roomPassword: string; username: string; characterName: string; characterSlot: number; 
}
/** main's HTML UI windows as the rewrite builds them (src/ui/htmlui), driven by data-key without a DOM: the same
 * handlers the DOM's buttons and inputs call. */
export interface HtmlUiDriver { windows(): WindowSpec[]; press(key: string): boolean; type(key: string, value: string): boolean; enter(key: string): boolean; text(): string;
  /** The deck editor's cards and buttons as DOM (deck-dom.ts), for tests and assistive tools. */
  deck(): HTMLElement | null }
export interface MountedClient { dispose(): void; render(): void; htmlUi: HtmlUiDriver; }

/** A fully disposable view. Networking, game rules and persistence are injected by the controller. */
export function mountClient(root: HTMLElement, controller: ClientController): MountedClient {
  let disposed = false, rendering = false, queued = false, resetDraftsNextRender = false;
  let state = controller.getState();
  const local: LocalState = { message: '', inspected: null, inspectedFrom: 'collection', promptInspection: null, promptId: null, selected: new Set(), roomOptions: {}, roomPassword: '', username: '', characterName: '', characterSlot: 0, noticeSeen: 0, tradeSearch: '', logScroll: null, duelCmd: null, helpText: '', helpFrom: 0 };
  const host = el('section', 'de-client'); host.setAttribute('aria-label', 'Duel Evolution');
  const css = el('style'); css.textContent = CLIENT_CSS + TAG_CSS + SKIN_CSS + BADGE_CSS + LP_PLATE_CSS + JANKEN_CSS;
  const header = el('header', 'de-top'), stage = el('main', 'de-stage'), nav = el('nav', 'de-nav'); nav.setAttribute('aria-label', 'Game menu');
  host.append(css, header, stage, nav); root.append(host);
  // phones and tablets: live's stage.js (the frame fitted to the visible viewport, the rotate prompt, first-tap fullscreen)
  // a mouse button (or a finger) held on the world walks toward it, steered by moving, as live
  // on the stage, which outlives the lobby's redraws, so a long walk survives them
  const walkTo = (x: number, y: number): void => {
    const current = controller.getState(), lobby = current.lobby, map = stage.querySelector('[data-key="lobby-map"]') as HTMLElement | null;
    if (current.scene !== 'lobby' || !lobby?.connected || current.busy || !map) return;
    const useScene = !!worldRenderer && lobby.mapId !== undefined; if (useScene && !worldRenderer!.ready) return;
    const p = useScene ? gamePoint(x, y, worldRenderer!.element.getBoundingClientRect()) : gamePoint(x, y, map.getBoundingClientRect(), lobby.width ?? 1024, lobby.height ?? 768);
    if (p) { const target = useScene ? worldRenderer!.screenToWorld(p) : p; send({ type: 'move', x: Math.round(target.x), y: Math.round(target.y) }); }
  };
  let worldWalk: HoldWalk | null = null;
  // main's Legacy HTML UI screens (src/ui/htmlui): Select Player, the chat ... drawn by main's own modules from
  // snapshots the rewrite builds; browser only (the layer needs a real document)
  const htmlUiState = htmlUiLocal(), htmlIds = new Ids(), lobbyUi = lobbyLocal();
  /** The last duel request refusal ("Duel Request was refused.") the player closed with OK. */
  let refusedSeen = 0;
  let startScene: StartScene | null = null, portraitScene: StartScene | null = null;
  let titleScene: TitleScene | null = null;
  let htmlUi: HtmlUiLayer | null = null;
  let gameCursor: GameCursor | null = null;
  let menuView: MenuView | null = null;
  // the bar's own buttons (main's Wardrobe / Missions launchers) taking or leaving their slots: the message field moves
  let reserveSeen = 0;
  const offReserve = onBarReserve(() => { const r = barReserve(); if (r !== reserveSeen) { reserveSeen = r; requestRender(); } });
  // (after htmlUi: the first fit runs at once and re-places the layer)
  const phone: PhoneStage | null = typeof document !== 'undefined' && document.body && typeof matchMedia === 'function' ? mountPhoneStage({ host, stage, onFit: () => htmlUi?.relayout() }) : null;
  const profileActions = (): { label: string; key: string; run(): void; disabled?: boolean }[] => {
    const p = state.profileDetail; if (!p || p.selectedPid === null) return [];
    const pid = p.selectedPid;
    // live's own profile has OK alone: Create Comment is the Main Menu's, a new look the Wardrobe's
    if (p.selfPid === pid) return [];
    return [];
  };
  /** Change Avatar from the game: the server's look (one for both worlds), its owned parts, saved on Confirm. */
  const openChangeAvatar = () => {
    const self = state.lobby?.avatars.find(a => a.self), look = state.online?.cosmetics?.appearance.parts ?? (self?.parts?.length === 16 ? Array.from(self.parts) : null);
    send({ type: 'onlineAction', action: { type: 'refresh' } });
    if (!look) { local.message = 'Your avatar has not loaded yet.'; requestRender(); return; }
    htmlUiState.dialog = { kind: 'avatar', slot: null, look: [...look], category: FIRST_CATEGORY, page: 0 }; showHtml();
  };
  const changeAvatar = () => ({ busy: !!state.online?.pending,
    choices: (index: number, look: number[]) => {
      if (index === 0) return freeChoices(0, look[0] === 1);
      const data = state.online?.cosmetics, world = (data?.appearance.world ? 1 : 0) as 0 | 1;
      const option = data?.appearanceOptionsByWorld[String(world) as '0' | '1']?.find(o => o.index === index);
      return option && data!.appearance.gender === (look[0] === 1 ? 'female' : 'male') ? option.choices : freeChoices(index, look[0] === 1);
    },
    confirm: (look: number[]) => {
      const data = state.online?.cosmetics; htmlUiState.dialog = null;
      send({ type: 'onlineAction', action: changeAvatarAction(look, data?.appearance) });
      showHtml();
    } });
  // another player's card: the rewrite's social and duel commands for that player
  const cardActions = (): CardActions => {
    const p = state.profileDetail, lobby = state.lobby; if (!p || p.selectedPid === null || p.selectedPid === p.selfPid) return {};
    const pid = p.selectedPid, avatar = lobby?.avatars.find(a => a.id === pid), name = p.summary?.name ?? p.details?.name ?? avatar?.name ?? '';
    const close = () => send({ type: 'profileAction', action: { type: 'close' } });
    const social = (type: 'inviteFriend' | 'inviteTrade' | 'inviteTeam' | 'ignore') => () => { send({ type: 'socialAction', action: { type, pid } }); close(); };
    const watchable = !!avatar?.duelling && !lobby?.rooms?.some(r => (r.owner === pid || r.opponent === pid) && r.watch === false);
    return {
      ...(!avatar?.duelling ? { duel: () => {
        close();
        // a player waiting in a duel they created: their room (its password first, main's prompt); else a challenge
        const room = lobby?.rooms?.find(r => r.owner === pid && !r.opponent);
        if (room?.password) { lobbyUi.join = { roomId: room.id, password: '' }; showHtml(); }
        else if (room) send({ type: 'challengeRoom', roomId: room.id });
        else send({ type: 'duelChallenge', playerId: pid });
      } } : {}),
      ...(watchable ? { watch: () => { close(); send({ type: 'spectate', pid }); } } : {}),
      ...(state.socialDetail ? { friend: social('inviteFriend'), trade: social('inviteTrade'), ignore: social('ignore') } : {}),
      ...(name ? { whisper: () => { htmlUiState.chatDraft = `/w ${name} `; close(); } } : {}),
      // Invite to Team: a team's leader, to a player not in it (CPlayerListMenu: inTeam, authority, no team name)
      ...(socialLists()?.team?.leader && !state.socialDetail?.teamMembers.some(m => m.pid === pid) ? { team: social('inviteTeam') } : {}),
      // Go to the same Area (CPlayerListMenu::pressJump): to the player's side, where the server says they stand
      jump: () => { const at = p.location ?? (avatar ? { x: avatar.x, y: avatar.y } : null); close(); if (at && state.scene === 'lobby') send({ type: 'move', x: Math.round(at.x) + 32, y: Math.round(at.y) }); },
    };
  };
  // the list windows' content: the rewrite's social state (an ignored player's name from the players the client sees)
  // the Friend List's presence, asked as it opens: the original's online query, and the server's friend list for places
  const loadPresence = () => { send({ type: 'socialAction', action: { type: 'refreshOnline' } }); send({ type: 'refreshFriends' }); };
  const socialLists = (): SocialLists | null => {
    const sd = state.socialDetail; if (!sd) return null;
    const known = (pid: number) => state.lobby?.avatars.find(a => a.id === pid)?.name ?? sd.friends.find(f => f.pid === pid)?.name ?? `Player ${pid}`;
    const social = (action: import('../features/social').SocialAction) => send({ type: 'socialAction', action });
    return {
      // presence: online as the original's 0x3604 answers it; the place the server's friend list names (GET /api/de/friends)
      friends: sd.friends.map(f => {
        if (!sd.online) return { ...f };
        const here = sd.online[f.pid], http = state.social?.friends.find(x => x.id === f.pid && x.online);
        return { ...f, online: !!here, ...(here ? { place: http?.status ?? (here.kind === 12 ? 'My Room' : 'Online') } : {}) };
      }), ignored: sd.ignored.map(pid => ({ pid, name: known(pid) })),
      team: sd.team ? { name: sd.team.name, members: sd.teamMembers.map(m => ({ pid: m.pid, name: m.name })), leader: sd.teamMembers.some(m => m.pid === state.player?.id && (m.authority & 2) !== 0) } : null,
      unignore: pid => social({ type: 'unignore', pid }), formTeam: name => social({ type: 'createTeam', name }),
      leaveTeam: () => social({ type: 'leaveTeam' }), disbandTeam: () => social({ type: 'disbandTeam' }),
      removeFriend: pid => social({ type: 'removeFriend', pid }),
      // Ignore by name (CWindowModelBlacklistInput), the invitations' Yes / No
      lookup: sd.lookup?.name !== undefined ? { name: sd.lookup.name, pid: sd.lookup.result === 0 && sd.lookup.pid ? sd.lookup.pid : null } : null, error: sd.error,
      offers: sd.friendOffers.map(o => ({ pid: o.pid, name: o.name, level: o.level })), teamInvites: sd.teamInvites.map(t => ({ teamId: t.teamId, teamName: t.teamName, inviterPid: t.inviterPid, inviterName: t.inviterName })),
      canTrade: ['idle', 'finished', 'closing'].includes(sd.trade.phase),
      find: name => social({ type: 'findPlayer', name }), inviteFriend: pid => social({ type: 'inviteFriend', pid }),
      replyFriend: (pid, accept) => social({ type: 'replyFriend', pid, accept }), inviteTeam: pid => social({ type: 'inviteTeam', pid }),
      inviteTrade: (pid, name) => social({ type: 'inviteTrade', pid, name }), ignore: pid => social({ type: 'ignore', pid }),
      replyTeam: (teamId, inviterPid, accept) => social({ type: 'replyTeam', teamId, inviterPid, accept }),
      whisper: name => { htmlUiState.chatDraft = `/w ${name} `; if (state.scene !== 'lobby') open('lobby'); },
      duel: pid => send({ type: 'duelChallenge', playerId: pid }),
    };
  };
  // D-Mail: the rewrite's mail, sent through its social controller
  const mailBox = (): MailBox | null => {
    const sd = state.socialDetail; if (!sd) return null;
    return { mail: sd.mail.map(m => ({ from: m.fromName, fromPid: m.fromPid, subject: m.subject, body: m.body })),
      send: (toPid, subject, body) => send({ type: 'socialAction', action: { type: 'sendMail', toPid, subject, body } }),
      delete: index => send({ type: 'socialAction', action: { type: 'deleteMail', index } }) };
  };
  // the deck editor: main's deck screen (src/ui/htmlui/deck-scene.ts), its engine side on the layer (deck-stage.ts)
  let deckDom: DeckDom | null = null;
  let deckFromTitle = false;
  const deckScene = new DeckScene({ state: () => state, send: command => send(command), rerender: () => showHtml(), leave: () => { if (deckFromTitle) { deckFromTitle = false; send({ type: 'disconnect' }); } else open('lobby'); },
    notice: message => { local.message = message; requestRender(); },
    ...(controller.readGameFile ? { packTexts: () => loadPackTexts(path => controller.readGameFile!(path), state.settings?.language ?? 'E') } : {}) });
  // the shop is main's card shop (htmlui/card-shop.ts: shop/index.js mountCardShop, which calls the server's /api/de/shop
  // itself; its packs' reveal and its Cosmetic Boxes tab are its own); free mode has no shop (the scene is unavailable).
  // Back on the card shop leaves at once; while the app is still busy (opening the shop refreshes the catalogue, the wallet
  // and the cosmetics behind the shop, which draws itself from /api/de/shop first) it leaves as soon as that finishes,
  // rather than refusing the player with "Wait for the current action to finish."
  let leaveShop = false;
  const leaveCardShop = () => { if (state.busy) { leaveShop = true; requestRender(); } else open('lobby'); };
  const cardShop = cardShopHost(globalThis.document, leaveCardShop, e => { local.message = e instanceof Error ? e.message : 'The card shop could not be loaded.'; requestRender(); });
  // main's Wardrobe and Missions buttons on the menu bar and the trade's Cosmetics panel (htmlui/page-modules.ts), online
  // online: the world server's connection (state.online is the HTTP account's presence, unset in the overworld)
  const pageMods = pageModules({ online: () => !!state.player && state.connection === 'online' && state.mode !== 'free',
    overworld: () => state.scene === 'lobby' && !!state.player && htmlUiState.dialog?.kind !== 'avatar',
    trade: () => !!state.socialDetail && tradeScene(state.socialDetail.trade) && !['title', 'characters'].includes(state.scene), veil: sceneVeilUp,
    free: () => !!state.player && state.connection === 'online' && state.mode === 'free' });
  // main's card shop talks HTTP itself (bridge.js mounts it on onYo2ShopOpen): it opens before the cosmetics state has
  // loaded or the app's own catalogue fetch answered (a failed one is its own "Couldn't open the shop" / Try again), and
  // a tunnel resume underneath (reconnecting) keeps it, its tab and an open pack reveal in place.
  const useCardShop = () => state.scene === 'shop' && state.mode !== 'free';
  const pictureArt = new PictureArt({ ...(controller.loadArchiveImage ? { loadArchiveImage: controller.loadArchiveImage.bind(controller) } : {}), ...(controller.loadCardImage ? { loadCardImage: controller.loadCardImage.bind(controller) } : {}) });
  setPictureResolver(pictureArt.resolve);
  // main's Wardrobe previews and card shop faces read the game's files through lazyfs's Module.yo2Lazy on live
  if (controller.readGameFile) installLazyShim(controller.readGameFile.bind(controller), controller.readCardArt?.bind(controller), controller.gameArchiveUrl, controller.passcodeTableUrl);
  // the nation flag before a name over the head (nation-flag.ts: CNationFlag's small atlas cell), the atlas from the archive
  let flagAtlas: Promise<string | null> | null = null;
  const nationFlag = (cell: readonly [number, number]): HTMLElement => {
    const f = el('i', 'de-avatar-flag'); f.setAttribute('aria-hidden', 'true'); f.style.backgroundPosition = `${-cell[0]}px ${-cell[1]}px`;
    flagAtlas ??= pictureArt.resolve({ archive: FLAG_ATLAS }, new AbortController().signal).catch(() => null);
    void flagAtlas.then(url => { if (url) f.style.backgroundImage = `url("${url}")`; else flagAtlas = null; });
    return f;
  };
  // the trade (src/ui/htmlui/trade.ts): main's trade windows and dialogs over any scene but the title and Select Player
  const tradeUi = tradeLocal();
  // the trade's trunk: the deck screen's CWindowModelKaban (htmlui/trade-trunk.ts), its rows through their own card layer
  const tradeTrunk = new TradeTrunk({ card: passcode => socialOptions().card(passcode), dispatch: action => send({ type: 'socialAction', action }), rerender: () => showHtml(),
    editable: () => { const t = controller.getState().socialDetail?.trade; return !!t && t.phase === 'open' && !t.view.ready && !t.view.otherReady && !t.pendingMove && t.ownOffer.length < 10; } });
  let tradeDom: DeckDom | null = null;
  // Card Swap between a match's games (htmlui/side-swap.ts) and its own card layer
  let swapNotice = '';
  const sideSwap = new SideSwap({
    card: pc => { const pool = state.deckEditor?.allCards ?? state.deckEditor?.collection ?? []; return pool.find(c => c.passcode === pc) ?? controller.cardView?.(pc) ?? { id: String(pc), passcode: pc, name: `Card ${pc}` }; },
    move: (passcode, from, index) => send({ type: 'sideboardMove', passcode, from, to: from === 'main' ? 'side' : 'main', index }),
    submit: () => send({ type: 'submitSideboard' }), rerender: () => showHtml(),
    notice: text => { swapNotice = text; showHtml(); },
  });
  let swapDom: DeckDom | null = null;
  let cardGetDom: DeckDom | null = null;
  const swapSpecs = (): WindowSpec[] => {
    const side = state.scene === 'duel' && !endPhase() ? state.sideboarding ?? null : null, out = sideSwap.windows(htmlIds, side);
    if (!side) { swapNotice = ''; return out; }
    const say = swapNotice || side.error || '';
    if (say) out.push(stockDialog({ ids: htmlIds }, 'swap-notice', 'ok', say, [{ from: 'OK', key: 'swap-notice-ok', click: () => { swapNotice = ''; showHtml(); } }]));
    else if (side.ready) { const wait = stockDialog({ ids: htmlIds }, 'swap-wait', 'ok', 'Waiting for your opponent…', []); for (const c of wait.win.controls) if (c.cls === 'CWindowTaskTextSwitch') c.shown = false; out.push(wait); }
    return out;
  };
  let thinkingTimer: ReturnType<typeof setInterval> | null = null;
  const tradeSpecs = (): WindowSpec[] => {
    const sd = state.socialDetail; if (!sd || sd.trade.phase === 'idle' || ['title', 'characters'].includes(state.scene)) { if (thinkingTimer !== null) { clearInterval(thinkingTimer); thinkingTimer = null; } return []; }
    const reason = tradeReason();
    // the partner's thinking lamp: its bubble's dots fill in turn (a redraw per frame while it shows)
    const thinking = !sd.trade.view.otherReady && sd.trade.phase === 'open';
    if (thinking && thinkingTimer === null) thinkingTimer = setInterval(() => { if (!disposed) showHtml(); }, THINKING_FRAME_MS);
    else if (!thinking && thinkingTimer !== null) { clearInterval(thinkingTimer); thinkingTimer = null; }
    const out = tradeWindows({ trade: sd.trade, ui: tradeUi, ids: htmlIds, dispatch: action => send({ type: 'socialAction', action }), rerender: showHtml, thinking: Math.floor(Date.now() / THINKING_FRAME_MS),
      name: passcode => socialOptions().card?.(passcode).name ?? `Card ${passcode}`, status: sd.status, ...(reason ? { reason } : {}) });
    // Card Swap's columns: the menu (CARD SWAP, EXIT) and the card detail at the left, the trunk at the right (open while
    // this side may offer, and after the partner left, as live), over the trade's scene windows, under its dialogs
    const scene = tradeScene(sd.trade), left = partnerLeft({ trade: sd.trade, status: sd.status, ...(reason ? { reason } : {}) });
    const trunk = tradeTrunk.window(htmlIds, sd.trade, scene && (trunkOpen(sd.trade) || left));
    const columns = scene ? [cardSwapMenu(htmlIds, { exit: () => send({ type: 'socialAction', action: { type: 'cancelTrade' } }), disabled: !!state.busy }), tradeTrunk.detail(htmlIds), ...trunk ? [trunk] : []] : [];
    out.splice(out.findIndex(w => w.win.cls === 'CWindowTaskCardArea') + 1 || out.length, 0, ...columns);
    return out;
  };
  // the title's sign-in, signed out: live's CWindowLogin (rt/session.cpp's panel, htmlui/login.ts)
  const loginUi = loginLocal();
  const showsLogin = () => !!htmlUi && state.scene === 'title' && !!state.auth && !state.auth.signedIn && (!!loginUi.open || !controller.loadArchiveImage);
  const loginSpecs = (): WindowSpec[] => showsLogin() ? [loginWindow({ state, ui: loginUi, ids: htmlIds, send, rerender: () => showHtml(),
    discord: () => { globalThis.location.href = '/api/auth/sign-in/discord?return=/'; },
    open: url => { globalThis.open?.(url, '_blank', 'noopener,noreferrer'); } })] : [];
  let titleUi: TitleConfigUi | null = null;
  const titleSpecs = (): WindowSpec[] => {
    if (!titleUi || !state.player || !state.titles || state.scene === 'duel' || state.scene === 'title') { titleUi = null; return []; }
    const p = state.profileDetail;
    return [titleConfigWindow(htmlIds, titleUi, { titles: state.titles, current: p?.details && p.selfPid === p.details.pid ? titleName(p.details.titleId) || undefined : undefined, busy: !!state.busy || p?.pending != null,
      wear: bit => send({ type: 'profileAction', action: { type: 'setTitle', bit } }), close: () => { titleUi = null; showHtml(); }, rerender: () => showHtml() })];
  };
  // Duel Log (CWindowModelDuellogTop / List / Operation / Search, live's flow) over the scene, opened from the Main Menu:
  // main's duel archive (Server Duel Logs, GET /api/de/replays, read once per opening) and this browser's duel records
  // (Latest Duel Logs); the Collection is kept in this browser
  let duellog: DuellogUi | null = null, duellogAsk = 0;
  const loadDuellog: (search: DuellogUi['search'], page: number) => void = (search, page) => {
    const ui = duellog; if (!ui) return;
    const cut = () => { ui.data = duellogQuery(ui.all ?? [], state.player?.name ?? '', search, page); ui.page = ui.data.page; };
    if (ui.all) { cut(); showHtml(); return; }
    const ask = ++duellogAsk; ui.loading = true; ui.error = null; showHtml();
    void Promise.all([fetchDuellogFull(), controller.duelRecords?.().catch(() => []) ?? Promise.resolve([])]).then(([out, local]) => {
      if (duellog !== ui || ask !== duellogAsk) return;
      ui.loading = false; ui.local = [...local];
      if ('error' in out) ui.error = out.error; else { ui.all = out.rows; ui.capped = out.capped; cut(); }
      showHtml();
    });
  };
  const openUrl = (url: string, download: boolean) => {
    if (download) { const a = document.createElement('a'); a.href = url; a.download = ''; a.rel = 'noopener'; document.body.append(a); a.click(); a.remove(); }
    else globalThis.open?.(url, '_blank', 'noopener');
  };
  const duellogSpecs = (): WindowSpec[] => {
    if (!duellog || !state.player || state.scene === 'duel' || state.scene === 'title' || state.connection !== 'online') { duellog = null; return []; }
    const deps = { load: loadDuellog, close: () => { duellog = null; showHtml(); }, rerender: () => showHtml(),
      open: openUrl, play: (key: string) => { duellog = null; send({ type: 'replayPlay', key }); } };
    const servers = duellogServerPicker(htmlIds, duellog, deps);
    return [duellogWindow(htmlIds, duellog, deps), ...(servers ? [servers] : [])];
  };
  // the NPC reward pack pick in main's pack picker (htmlui/npc-pack.ts: CWindowPackSelect) over the lobby or the duel
  const npcPack = npcPackUi();
  // the rows' completion (the original's packCompletionLine): the server's shop pack view (GET /api/de/shop/pack, its
  // `collected`), online only; a pack the shop does not list stays without one
  const packDone = new Map<number, number | null>();
  const packCompletion = (id: number): number | undefined => {
    if (!packDone.has(id) && state.online && state.connection === 'online' && typeof fetch === 'function') {
      packDone.set(id, null);
      void fetchPackCompletion(id).then(pct => { packDone.set(id, pct); if (pct !== null && npcPackOpen(controller.getState().npc)) showHtml(); });
    }
    return packDone.get(id) ?? undefined;
  };
  // what a pack holds (main's screens/pack-contents.js), over the layer: the NPC pack picker's Contents key
  let packSheet: { close(): void } | null = null;
  const openContents = (id: number, name: string): void => {
    const layerHost = htmlUi?.host; if (!layerHost) return;
    packSheet?.close();
    void import('@htmlui/screens/pack-contents.js').then(m => { if (disposed) return; packSheet = m.openPackContents(layerHost, { id, name, onClose: () => { packSheet = null; } }); }).catch((e: unknown) => console.warn('htmlui: pack contents', e));
  };
  // the NPC's talk (htmlui/npc-talk.ts: its picture, balloon, card and Start Duel?) over the lobby; after a duel it
  // speaks once main's result boards are left (Next) and the lobby is back (not under the scene-loading veil), as live.
  // Then the reward pack pick (npc-pack.ts) and what the duel gave (npc-itemget.ts), each over everything.
  const npcTalkSpecs = (): WindowSpec[] => {
    const npc = state.npc; if (state.scene !== 'lobby' || !npcTalkStage(npc) || sceneVeilUp() || rewardScene()) return [];
    const parts = state.lobby?.avatars.find(a => a.npc && Math.abs(a.id) === npc!.npc!.id)?.parts ?? state.lobby?.avatars.find(a => a.npc && a.name === npc!.npc!.name)?.parts ?? null;
    return npcTalkWindows(npc, { ids: htmlIds, busy: !!state.busy, parts, send: command => { if (controller.getState().npc === npc) send(command); } });
  };
  const npcEscape = (e: KeyboardEvent): boolean => {
    if (e.key !== 'Escape' || state.scene !== 'lobby' || !htmlUi || !npcTalkDismissable(state.npc)) return false;
    e.preventDefault(); send({ type: 'npcDismiss' }); return true;
  };
  // live's reward scenes come first after the result board (Next): the pack pick (CCardGetPackScene: the checker backdrop,
  // the pack's cover, the list, the pack described in the bar's help line), then the card get scene for each card the
  // pack gave (card-get.ts, Back), and only then the lobby with the NPC's lines
  const cardGet = new CardGetScene({ card: pc => cardGetViews().find(c => c.passcode === pc), rerender: () => showHtml() });
  const cardGetViews = (): CardView[] => (state.npc?.packStatus === 'confirmed' ? state.npc.cards : []).flatMap(c => state.npcCardViews?.[c.id] ?? []);
  const cardGetKey = () => `${state.npc?.npc?.id}:${state.npc?.result}:${state.npc?.cards.map(c => c.id).join(',')}`;
  const cardGetUp = (): boolean => { const v = cardGetViews(); return v.length > 0 && cardGet.pending(cardGetKey(), v.flatMap(c => c.passcode ?? [])); };
  const rewardScene = (): boolean => state.scene === 'lobby' && (npcPackOpen(state.npc) || state.npc?.packStatus === 'pending' || cardGetUp());
  const cardGetSpecs = (): WindowSpec[] => state.scene !== 'lobby' || sceneVeilUp() ? [] : state.npc?.packStatus === 'pending' ? cardGet.waiting(htmlIds) : !cardGetUp() ? [] : cardGet.windows(htmlIds, cardGetKey(), cardGetViews().flatMap(c => c.passcode ?? []));
  const npcPackSpecs = (): WindowSpec[] => { if (state.scene !== 'lobby' || sceneVeilUp()) return [];
    const spec = npcPackSelect(state.npc, { ids: htmlIds, ui: npcPack, packName: id => state.packNames?.[id], packImage: id => state.packInfo?.[id]?.image, completion: packCompletion, busy: !!state.busy, rerender: () => showHtml(), contents: openContents,
      send: command => { if (npcPackOpen(controller.getState().npc)) send(command); } });
    return spec ? [spec] : []; };
  const npcItems = npcItemGetUi();
  const npcItemSpecs = (): WindowSpec[] => {
    if (state.scene !== 'lobby' || sceneVeilUp()) return [];
    return npcItemGetWindows(state.npc, { ids: htmlIds, ui: npcItems, rerender: () => showHtml(), cardName: id => state.npcCardViews?.[id]?.name,
      itemName: bit => giftItemName(bit, { recipeName: b => state.npcGiftRecipes?.[b], cosmetics: state.online?.cosmetics ?? null }),
      close: () => { if (!npcClosable(controller.getState().npc)) return false; send({ type: 'npcClose' }); return true; } });
  };
  // the challenge rights the world's ITEMGET(1) just gave (live's item window with the NPC's picture), once the world
  // is up; one at a time, each OK goes on
  const unlockUi = challengeUnlockUi();
  const unlockSpecs = (): WindowSpec[] => {
    const e = state.npc?.eligibility;
    if (state.scene !== 'lobby' || state.location !== 'world' || sceneVeilUp() || !e || e.status !== 'confirmed') return [];
    return challengeUnlockWindows(e, e.bits, { ids: htmlIds, ui: unlockUi, text: id => gameTexts.get(id), rerender: () => showHtml() });
  };
  // the NPC's windows wait for the scene-loading veil (the lobby reloading after the duel): they come as it lifts
  const onVeil = (): void => { if (!disposed && state.npc?.npc) showHtml(); };
  globalThis.addEventListener?.(VEIL_EVENT, onVeil);
  // Tournaments (htmlui/tournament.ts): JoinGunsling from the Main Menu, the bracket while joined, the end result once;
  // the server's event state (EVENTINFO) in the Information window until closed. Over the lobby only (a pairing is a duel).
  const tourUi = tournamentUi();
  const tournamentSpecs = (): WindowSpec[] => {
    if (!state.player || state.scene !== 'lobby' || state.mode === 'free') return [];
    const t = state.tournament ?? null, out: WindowSpec[] = [], refresh = () => send({ type: 'tournamentRefresh' });
    const e = state.eventInfo; if (e && tourUi.eventSeen !== eventKey(e)) out.push(informationWindow(htmlIds, e, t, () => { tourUi.eventSeen = eventKey(e); showHtml(); }));
    if (tourUi.join) out.push(joinGunslingWindow(htmlIds, t, { join: () => { tourUi.join = false; tourUi.joined = tourUi.bracket = true; refresh(); showHtml(); }, cancel: () => { tourUi.join = false; showHtml(); } }));
    else if (tourUi.bracket && t) out.push(bracketWindow(htmlIds, tourUi, t, { selfPid: state.player.id, refresh, close: () => { tourUi.bracket = false; showHtml(); }, rerender: showHtml }));
    if (t?.result && tourUi.joined && tourUi.resultSeen !== t.result) { const r = t.result; const spec = resultWindow(htmlIds, t, () => { tourUi.resultSeen = r; showHtml(); }); if (spec) out.push(spec); }
    return out;
  };
  // DUEL OPTIONS / Audio (htmlui/options.ts, the original's COptionDlg) over the scene, opened from the Main Menu
  let optionsUi: OptionsUi | null = null;
  let trackedActionsFor: string | null = null;
  const optionsSpecs = (): WindowSpec[] => {
    if (!optionsUi) return languageError([]);
    const display = browserDisplay.state, ui = optionsUi;
    const deps: OptionsDeps = { settings: state.settings, busy: !!state.busy, languageReady: !!state.languageStatus?.available && !state.languageStatus.loading,
      fullscreen: { active: display.active, supported: display.supported, pending: display.pending, toggle: () => { void browserDisplay.toggle(); } },
      text: id => gameTexts.get(id), rerender: showHtml,
      set: settings => send({ type: 'settings', settings }), close: () => { optionsUi = null; showHtml(); } };
    // DUEL OPTIONS (the Main Menu's) or the title's OPTIONS
    return languageError([ui.kind === 'title' ? titleOptionsWindow(htmlIds, ui, deps) : duelConfigWindow(htmlIds, ui, deps)]);
  };
  // a language that could not load (CSystemConfigManager::applyLanguage refused, after the title's OPTIONS OK): main's
  // error dialog over the title (and over an OPTIONS window); the previous language stays and its flag chooses it again
  const languageError = (out: WindowSpec[]): WindowSpec[] => {
    const refused = state.languageStatus?.error;
    if (refused && refused !== languageErrorSeen) {
      const dialog = stockDialog({ ids: htmlIds }, 'language-error', 'error', refused, [{ from: 'OK', key: 'language-error-ok', click: () => { languageErrorSeen = refused; showHtml(); } }]);
      Object.assign(dialog.win, { z: 51503 }); out.push(dialog);   // over DUEL OPTIONS (51453)
    }
    else if (!refused) languageErrorSeen = '';
    return out;
  };
  let languageErrorSeen = '';
  const sceneWindows = (): WindowSpec[] => { duelSpeedButton.show(state.scene === 'duel' && (!!state.duel || !!state.preparation)); return [...loginSpecs(), ...tradeSpecs(), ...swapSpecs(), ...npcTalkSpecs(), ...npcPackSpecs(), ...cardGetSpecs(), ...npcItemSpecs(), ...unlockSpecs(), ...titleSpecs(), ...optionsSpecs(), ...duellogSpecs(), ...tournamentSpecs(), ...duelSpecs()]; };
  // The duel's question dialogs (main's screens/duel.js: htmlui/duel-dialogs.ts) and the duel speed button (main's
  // duelspeed.js) while the layer is up; card lists, free number entry and declarations stay the duel screen's panel.
  // live's duel speed button (main's duelspeed.js) is the page's, in its top right corner beside the game, not a window
  const duelSpeedButton = new DuelSpeedButton({ stage: () => stage, changed: speed => { duelScene.fx.speed = speed; } });
  let duelHover: { selected: Set<string>; hover?: string | null; draft?: string; page?: number } = { selected: new Set(), hover: null };
  const htmlDuelPrompt = (prompt: DuelPromptView | null | undefined): boolean => !!prompt && duelDialogCovers(prompt) && !state.preparation;
  // Rock-paper-scissors and who goes first: live's own scene (janken-scene.ts) in place of the field; the step after
  // the hands goes straight on into the duel (live has no Start Duel: the app begins it, app.ts autoBeginDuel)
  let jankenMine: number | null = null;
  // live's reveal of each round's hands (janken-scene.ts): both in the middle, then the winner's; after a tie the hands again
  const REVEAL_BOTH_MS = 1200, REVEAL_WINNER_MS = 1000;
  let revealRound = 0, revealAt = 0, tieDone = 0, revealed: { mine: number; theirs: number } | null = null;
  const jankenView = (): JankenView | null => {
    const prep = state.preparation;
    // the duel may start as the hands are shown (the server's NPC picks at once): the reveal plays out first, as live's
    if (!prep && !state.sideboarding && revealed && !state.settings.reducedMotion && Date.now() - revealAt < REVEAL_BOTH_MS + REVEAL_WINNER_MS) {
      const mineWins = jankenWinner(revealed.mine, revealed.theirs), elapsed = Date.now() - revealAt;
      return { phase: 'wait', mine: revealed.mine, theirs: revealed.theirs, busy: true, thinking: false, reveal: { stage: elapsed < REVEAL_BOTH_MS ? 'both' : 'winner', ...revealed, mineWins } };
    }
    // (each duel's hands anew: the last duel's pick is forgotten once its preparation is over)
    if (!prep || state.sideboarding) { jankenMine = null; revealRound = tieDone = 0; revealed = null; return null; }
    const phase = prep.phase.toLowerCase(), theirs = prep.opponentHand ?? null, busy = !!state.busy;
    if (prep.role === 'partner' || prep.role === 'spectator') return { phase: 'wait', mine: null, theirs, busy, thinking: false, message: prep.role === 'partner' ? 'Your captain is preparing the duel…' : 'Waiting for duel preparation…' };
    const hands = prep.hands ?? null;
    if (hands && hands.round !== revealRound) {
      revealRound = hands.round; revealAt = Date.now(); revealed = { mine: hands.mine, theirs: hands.theirs };
      for (const ms of [REVEAL_BOTH_MS, REVEAL_BOTH_MS + REVEAL_WINNER_MS]) setTimeout(() => { if (!disposed) requestRender(); }, ms + 20);
    }
    if (hands) {
      const mineWins = jankenWinner(hands.mine, hands.theirs), elapsed = Date.now() - revealAt, reduced = state.settings.reducedMotion;
      if (!reduced && elapsed < REVEAL_BOTH_MS + (mineWins === null ? 0 : REVEAL_WINNER_MS))
        return { phase: 'wait', mine: hands.mine, theirs: hands.theirs, busy, thinking: false, reveal: { stage: elapsed < REVEAL_BOTH_MS ? 'both' : 'winner', mine: hands.mine, theirs: hands.theirs, mineWins } };
      // a tie shown: the hands again (once per round: the next pick waits for its own answer)
      if (mineWins === null && tieDone !== hands.round) { tieDone = hands.round; jankenMine = null; }
      // decided: the winner's card stays while the winner chooses who goes first (the winner's own plates replace it)
      if (mineWins !== null && !(/first|order|turn/.test(phase) && !/wait|result/.test(phase)))
        return { phase: 'wait', mine: hands.mine, theirs: hands.theirs, busy, thinking: false, reveal: { stage: 'winner', mine: hands.mine, theirs: hands.theirs, mineWins } };
    }
    if (/ready|begin|confirm|invitation/.test(phase)) return { phase: 'wait', mine: jankenMine, theirs, busy, thinking: false };
    if (/rps|hand|rock|scissors/.test(phase) && !/wait|result/.test(phase)) {
      return { phase: 'hand', mine: jankenMine, theirs: null, busy, thinking: true };
    }
    if (/first|order|turn/.test(phase) && !/wait|result/.test(phase)) return { phase: 'first', mine: jankenMine, theirs, busy, thinking: false };
    return { phase: 'wait', mine: jankenMine, theirs, busy, thinking: /first/.test(phase) };
  };
  // A card's open command menu (live's CUSummonDialogSp, htmlui/duel-cmd.ts): what renderDuel gathered for it; the row
  // under the pointer is the menu's own. As live (CUSummonDialogSp::onMain) it closes when the pointer leaves the card
  // and the menu, goes below the field (y 600), or a click lands elsewhere; Escape closes it too.
  let duelCmdView: { at: { x: number; top: number; hand: boolean }; rows: DuelCmdRow[]; name: string; owner: string } | null = null;
  const duelCmdUi: DuelCmdUi = { hover: 0 };
  const openCmd = (id: string | null) => { local.duelCmd = id; duelCmdUi.hover = 0; requestRender(); };
  const closeCmd = () => { if (local.duelCmd === null) return; local.duelCmd = null; duelCmdView = null; requestRender(); };
  const cmdKeepsOpen = (e: PointerEvent | MouseEvent): boolean => {
    const view = duelCmdView, box = stage.getBoundingClientRect(); if (!view || !box.width) return false;
    const k = box.width / 1024, x = (e.clientX - box.left) / k, y = (e.clientY - box.top) / k;
    if (y > 600 && !view.at.hand) return false;
    const menu = duelCmdRect(view.at, view.rows.length), card = fieldNodes.get(view.owner)?.getBoundingClientRect() ?? host.querySelector('[data-key="field-deck:0"]')?.getBoundingClientRect();
    const c = card && card.width ? { x: (card.left - box.left) / k, y: (card.top - box.top) / k, w: card.width / k, h: card.height / k } : { x: menu.x, y: menu.y + menu.h, w: menu.w, h: 0 };
    // the card and the menu with the gap between them (a hand card's menu ends above its top edge)
    const left = Math.min(menu.x, c.x), right = Math.max(menu.x + menu.w, c.x + c.w), top = menu.y, bottom = Math.max(menu.y + menu.h, c.y + c.h);
    return x >= left && x < right && y >= top && y < bottom;
  };
  const cmdPointer = (e: PointerEvent) => { if (local.duelCmd !== null && duelCmdView && e.pointerType !== 'touch' && !cmdKeepsOpen(e)) closeCmd(); };
  const cmdPress = (e: PointerEvent) => {
    if (local.duelCmd === null || !duelCmdView) return;
    const t = e.target as Element | null;
    if (t?.closest?.('.win[data-window-class="CUSummonDialogSp"]') || t?.closest?.(`[data-key="field-card:${duelCmdView.owner}"]`) || duelCmdView.owner === 'deck:0' && t?.closest?.('[data-key="field-deck:0"]')) return;
    closeCmd();
  };
  globalThis.addEventListener?.('pointermove', cmdPointer, true); globalThis.addEventListener?.('pointerdown', cmdPress, true);
  let referenceShown: string | null = null;
  // The duel's end as live plays it: "YOU WIN" / "YOU LOSE" / "DRAW" over the dimmed field (data/y/duel_end), then
  // between a match's games its score board (data/y/duel/match), then the result board or Card Swap
  const END_BANNER_MS = 2200, END_BOARD_MS = 3200;
  let endSeq: { key: string; at: number } | null = null, matchMarks: string[] = [], matchMarked = '';
  const endPhase = (): 'banner' | 'board' | null => {
    const duel = state.scene === 'duel' ? state.duel : null;
    if (!duel?.ended || state.replay || duel.spectating) { endSeq = null; return null; }
    const key = `${duel.ended}:${duel.turn}:${duel.players.map(p => p.lp).join('/')}`;
    if (endSeq?.key !== key) {
      endSeq = { key, at: Date.now() };
      // this game's mark on the match board (O won, X lost, triangle drawn), once
      if (state.match && matchMarked !== key) { matchMarked = key; matchMarks = [...matchMarks, duel.ended === 'Victory' ? 'O' : duel.ended === 'Defeat' ? 'X' : 'D'].slice(-3); }
      for (const ms of [END_BANNER_MS, END_BANNER_MS + END_BOARD_MS]) setTimeout(() => { if (!disposed) requestRender(); }, ms + 20);
    }
    const t = Date.now() - endSeq.at, between = !!state.match && (!!state.sideboarding || !state.match.complete);
    return t < END_BANNER_MS ? 'banner' : between && t < END_BANNER_MS + END_BOARD_MS ? 'board' : null;
  };
  const netNote = new NetNote();
  const duelSpecs = (): WindowSpec[] => {
    const duel = state.duel; if (state.scene !== 'duel' || !duel) return [];
    const out: WindowSpec[] = [];
    // the end: main's result.js records and its Next plate (back to the lobby once the duel or the match is over); a
    // match's sideboarding (the original's Card Swap) replaces the game's result, as the result screen gives way to it there
    const npcRec = state.npc?.npc && state.npc.record && state.npc.result && !['idle', 'duel'].includes(state.npc.stage) ? { name: state.npc.npc.name, record: state.npc.record } : undefined;
    if (duel.ended && !state.sideboarding && !state.replay && !endPhase()) out.push(...duelResultWindows({ ids: htmlIds, duel, match: state.match, npc: npcRec, ...(!state.match || state.match.complete ? { next: () => open('lobby') } : {}) }));
    if (state.replay) out.push(replayWindow(htmlIds, state.replay, action => send({ type: 'replayControl', action })));
    if (duelCmdView && local.duelCmd === duelCmdView.owner) out.push(duelCmdWindow({ ids: htmlIds, ...duelCmdView, ui: duelCmdUi, rerender: showHtml }));
    // the duel's information box (a refused surrender, a lost opponent, time up): live's CUOkDialog, until OK; it stands
    // over the question the server re-sends after it
    if (!duel.notice) local.noticeSeen = 0;
    const notice = duel.notice;
    if (notice && notice.id > local.noticeSeen) out.push(duelOkDialog(htmlIds, String(notice.id), notice.text, () => { local.noticeSeen = Math.max(local.noticeSeen, notice.id); showHtml(); }, /ran out of time|Time is up|disconnected|lost the connection/i.test(notice.text)));
    const prompt = duel.prompt;
    if (prompt && htmlDuelPrompt(prompt)) {
      if (local.promptId !== prompt.id) { local.promptId = prompt.id; local.selected.clear(); local.promptInspection = null; duelHover = { selected: local.selected, hover: null }; }
      duelHover.selected = local.selected;
      const spec = duelDialog({ ids: htmlIds, busy: !!state.busy, local: duelHover, respond: response => respondToPrompt(prompt.id, response), rerender: showHtml,
        inspect: id => { const card = prompt.candidates?.find(c => c.id === id)?.card; if (card) inspect(card, 'duel'); } }, prompt);
      if (spec) out.push(spec);
    } else if (prompt && !state.preparation) {
      // a choice on the field (a zone, a card): the help strip (CWindowModelHelp) says what to choose, the field's zones
      // and cards take it, the right button cancels (when the server allows)
      const help = duelHelpStrip(htmlIds, prompt.text); if (help) out.push(help);
    }
    // the card a question is about shows in the card information box, as it opens
    if (prompt && prompt.id !== referenceShown) { referenceShown = prompt.id; const card = prompt.kind !== 'cards' && prompt.kind !== 'announce' ? prompt.candidates?.find(c => c.card)?.card : undefined; if (card) duelScene.showCard(card); }
    return out;
  };
  // the original's UI strings main's dialogs say (yo2text_?: Delete's prompts), read once the original data is there
  const gameTexts = new Map<number, string>(); let gameTextsFor: string | null = null;
  const askGameTexts = () => {
    const language = state.settings.language ?? 'E'; if (gameTextsFor === language || !controller.gameText) return;
    gameTextsFor = language;
    void controller.gameText([...Object.values(DELETE_TEXT), ...Object.values(DUEL_REQUEST_TEXT), ...Object.values(LOBBY_TEXT), ...Object.values(AREA_TEXT), ...Object.values(WORLD_TEXT), ...DUEL_OPTIONS_TEXTS, ...Object.values(CHALLENGE_UNLOCKS).map(u => u.text)], new AbortController().signal)
      .then(m => { if (gameTextsFor !== language) return; gameTexts.clear(); for (const [k, v] of m) gameTexts.set(k, v); showHtml(); }, () => { if (gameTextsFor === language) gameTextsFor = null; });
    // every label main's screens show, in the chosen language: the English table names each label's id (features/ui-text.ts)
    if (language === 'E') { uiText.install([], null, 'E'); return; }
    if (controller.gameTextTable) void Promise.all([controller.gameTextTable('E'), controller.gameTextTable(language)])
      .then(([english, local]) => { if (gameTextsFor !== language) return; uiText.install(english, local, language); showHtml(); }, () => {});
  };
  const uiText = new UiText();
  const checkPassword = controller.checkPassword?.bind(controller);
  const lobbyDeps = () => ({ ui: lobbyUi, friends: state.socialDetail?.friends.map(f => f.pid) ?? [] });
  // main's Duel menu's Tag Duel (screens/duelsetup.js tagRow) asks the page for its tag lobby: the rewrite's
  const onTagDuel = () => { if (!state.tagLobby || state.scene !== 'lobby' || !state.lobby?.connected || state.busy) return; lobbyUi.open = null; send({ type: 'tagAction', action: { type: 'open' } }); showHtml(); };
  globalThis.addEventListener?.('yo2-tag-lobby-open', onTagDuel);
  const buildHtml = () => localized(htmlWindows({ state, ui: htmlUiState, ids: htmlIds, send, rerender: showHtml, changeAvatar: changeAvatar(), menu: menuView, social: socialLists(), mailBox: mailBox(), profileActions: profileActions(), cardActions: cardActions(), openPlayer: pid => send({ type: 'interact', playerId: pid }),
    deckWindows: () => deckScene.windows(), deckChat: deckScene.chat(), scene: sceneWindows(), prompts: duelPrompts(), covered: !!state.socialDetail && tradeScene(state.socialDetail.trade), rewardScene: rewardScene(),
    text: id => gameTexts.get(id), lobby: { list: ctx => lobbyList(ctx, lobbyDeps(), pid => send({ type: 'interact', playerId: pid })), windows: ctx => lobbyWindows(ctx, lobbyDeps()) },
    ...(checkPassword ? { checkPassword: (password: string) => checkPassword(password, new AbortController().signal) } : {}) }));
  const localized = (specs: WindowSpec[]): WindowSpec[] => { localizeSpecs(specs, uiText); return specs; };
  // the engine's scene ids main's page modules read (src/System/yo2SceneManager.h: 7 Select Player, 11 the lobby,
  // 12 Free Duel's lobby, 14 the shop, 0x24 the deck editor)
  const engineScene = () => ({ characters: 7, lobby: state.mode === 'free' ? 12 : 11, shop: 14, deck: 0x24 } as Partial<Record<Scene, number>>)[state.scene] ?? 0;
  // the chat's Duels tab, the Players window's Discord rows, the ?duel= auto-join (htmlui/discord-wire.ts)
  const discord = discordWire({ ui: htmlUiState, state: () => state, send: command => send(command), rerender: () => showHtml(), search: globalThis.location?.search ?? '' });
  // the card pictures and archive art of the deck windows' card layers (deck-dom.ts)
  const cardArt = () => ({ ...(controller.loadCardImage ? { card: (pc: number, signal: AbortSignal) => controller.loadCardImage!(pc, signal) } : {}), ...(controller.loadArchiveImage ? { archive: (path: string, signal: AbortSignal) => controller.loadArchiveImage!(path, signal) } : {}) });
  const showHtml = () => {
    askGameTexts(); syncStartScene(); discord.tick();
    if (disposed) return;
    if (!deckDom && state.scene === 'deck' && typeof globalThis.document !== 'undefined') deckDom = new DeckDom(host, deckScene, { art: '/ui/', ...cardArt(), owns: w => !isTradeTrunk(w) && !isSideSwap(w) && !isCardGet(w) });
    const trading = !!state.socialDetail && tradeScene(state.socialDetail.trade);
    if (!tradeDom && trading && typeof globalThis.document !== 'undefined') tradeDom = new DeckDom(htmlUi?.host ?? host, tradeTrunk, { art: htmlUi ? new URL('/ui/', location.href).href : '/ui/', ...cardArt(), owns: isTradeTrunk });
    const swapping = state.scene === 'duel' && !!state.sideboarding;
    if (!swapDom && swapping && typeof globalThis.document !== 'undefined') swapDom = new DeckDom(htmlUi?.host ?? host, sideSwap, { art: htmlUi ? new URL('/ui/', location.href).href : '/ui/', ...cardArt(), owns: isSideSwap, zones: SIDE_SWAP_ZONES, sideButtons: [] });
    const gettingCard = cardGetUp();
    if (!cardGetDom && gettingCard && typeof globalThis.document !== 'undefined') cardGetDom = new DeckDom(htmlUi?.host ?? host, cardGet, { art: htmlUi ? new URL('/ui/', location.href).href : '/ui/', ...cardArt(), owns: isCardGet, zones: {}, sideButtons: [] });
    if (!htmlUi) { const specs = deckDom || tradeDom || swapDom ? buildHtml() : []; if (deckDom) { const d = deckScene.stageView(); deckDom.show(specs, d.detail, d.drag); } tradeDom?.show(specs, tradeTrunk.detailView(), null); swapDom?.show(specs, sideSwap.detailView(), sideSwap.dragView()); syncPortrait(); return; }
    const specs = buildHtml(), deck = deckScene.stageView();
    // the title under its OPTIONS window: the movie and the backdrop at kTitleDimmed, the movie's buttons inactive
    const titleDialog = state.scene === 'title' && optionsUi?.kind === 'title';
    titleScene?.setActive(!titleDialog);
    htmlUi.show(specs, ['title', 'characters'].includes(state.scene), engineScene(), titleDialog ? TITLE_DIMMED : 1);
    deckDom?.show(specs, deck.detail, deck.drag);
    tradeDom?.show(specs, tradeTrunk.detailView(), null);
    swapDom?.show(specs, sideSwap.detailView(), sideSwap.dragView());
    cardGetDom?.show(specs, gettingCard ? cardGet.detailView() : null, null);
    syncPortrait();
  };
  /** The waist-up portraits the game draws under its windows outside Select Player (src/ui/htmlui/start-scene.ts's
   * canvas, under the HTML layer): Change Avatar from the game shows the look being made where first dressing does
   * (CChangeAvatarPack, PORTRAIT_AT), and a Discord duelist's card their bust (live 2020bff: BUST_AT, 530, 0). */
  function syncPortrait(): void {
    const d = htmlUiState.dialog, dc = htmlUiState.discordCard;
    const avatar = d?.kind === 'avatar' && state.scene !== 'characters' ? d : null;
    // a duel request's other duelist (live keeps their bust at the right while its box is up: asked, asking, refused)
    const lobby = state.scene === 'lobby' ? state.lobby : undefined, refused = lobby?.refused && lobby.refused.id > refusedSeen ? lobby.refused : undefined;
    const request = lobby?.invitation?.parts ?? lobby?.outgoing?.parts ?? refused?.parts ?? null;
    // a player's card: live shows that player's bust where the Discord card's stands (BUST_AT)
    const card = state.scene === 'lobby' && state.profileDetail && state.profileDetail.selectedPid !== null && state.profileDetail.selectedPid !== state.profileDetail.selfPid
      ? state.lobby?.avatars.find(a => a.id === state.profileDetail!.selectedPid)?.parts : null;
    const look = avatar ? avatar.look : dc && state.scene === 'lobby' ? dc.parts : request ?? (card ? Array.from(card) : null);
    if (!look || look.length !== 16 || !controller.loadArchiveImage) { portraitScene?.show({ logo: false, portrait: null, reducedMotion: true }); portraitScene?.element.remove(); return; }
    portraitScene ??= new StartScene(controller.loadArchiveImage.bind(controller));
    portraitScene.show({ logo: false, portrait: Uint8Array.from(look), reducedMotion: state.settings.reducedMotion, at: avatar ? PORTRAIT_AT : BUST_AT });
    if (portraitScene.element.parentElement !== stage) stage.append(portraitScene.element);
  }
  const htmlHandler = (key: string): ControlHandlers | undefined => { for (const spec of buildHtml()) for (const h of spec.handlers.values()) if (h.key === key) return h; return undefined; };
  const htmlDriver: HtmlUiDriver = {
    windows: buildHtml,
    press: key => { const h = htmlHandler(key); h?.click?.(); return !!h?.click; },
    type: (key, value) => { const h = htmlHandler(key); h?.text?.(value); return !!h?.text; },
    enter: key => { const h = htmlHandler(key); h?.enter?.(); return !!h?.enter; },
    text: () => buildHtml().flatMap(s => s.win.controls.flatMap(c => [c.label, c.text, ...(Array.isArray(c.items) ? c.items : [])].filter(v => typeof v === 'string'))).join('\n'),
    deck: () => deckDom?.el ?? null,
  };
  if (typeof document !== 'undefined' && document.body && typeof ResizeObserver === 'function') {
    void import('./htmlui/layer').then(m => {
      if (disposed) return;
      const art = new URL('/ui/', location.href).href;
      htmlUi = new m.HtmlUiLayer({ art, stage: () => stage, frame: snap => pageMods.frame(snap), chatAvatars: () => {
        // All Chat's bubbles (main's chat-bubbles.js) over each shown avatar's top, in game px of the stage
        const lobby = controller.getState().scene === 'lobby' ? controller.getState().lobby : null, box = stage?.getBoundingClientRect();
        if (!lobby || !box?.width || !box.height) return [];
        const anchors = worldRenderer?.chatAnchors() ?? [], scale = 1;
        return lobby.avatars.filter(a => !a.npc && avatarNodes.has(a.id)).flatMap(a => { const p = anchors.find(h => h.id === a.id); return p ? [{ pid: a.id, name: a.name, x: p.x * scale, y: p.y * scale }] : []; });
      } });
      // live's HD game cursor (main's cursor.js) and its click ripple, the busy hand while the app waits
      gameCursor?.dispose();
      gameCursor = new GameCursor({ art, stage: () => stage, busy: () => !!controller.getState().busy });
      if (deckDom) deckDom.dispose();
      deckDom = new DeckDom(htmlUi.host, deckScene, { art, ...cardArt(), owns: w => !isTradeTrunk(w) && !isSideSwap(w) && !isCardGet(w) });
      if (tradeDom) { tradeDom.dispose(); tradeDom = null; }
      if (swapDom) { swapDom.dispose(); swapDom = null; }
      if (cardGetDom) { cardGetDom.dispose(); cardGetDom = null; }
      // what the editor holds, for tests and assistive tools (main's yo2Html.snapshot() has the windows only)
      const g = globalThis as { yo2Html?: Record<string, unknown> };
      if (g.yo2Html) {
        g.yo2Html.deckState = () => deckScene.inspect();
        // the trade trunk's whole list (its window shows eleven rows), and a row scrolled into view
        g.yo2Html.tradeTrunk = () => tradeTrunk.list();
        g.yo2Html.tradeTrunkReveal = (row: number) => tradeTrunk.reveal(row);
        // main's right-click / double-click moves wait on the game's drag (screens/deck.js quickInstall: deckDrag.state)
        const base = g.yo2Html.snapshot as (() => object | null) | undefined;
        if (base) g.yo2Html.snapshot = () => { const s = base(); return s && { ...s, deckDrag: { state: deckScene.ui.drag ? 1 : 0 } }; };
      }
      showHtml();
      // signed out, the title's sign-in is the layer's window (live's CWindowLogin): the title's own form goes
      if (state.scene === 'title') requestRender();
      // a duel prompt the layer now shows leaves the duel screen's own panel
      if (state.scene === 'duel' && htmlDuelPrompt(state.duel?.prompt)) requestRender();
    })
      .catch((e: unknown) => console.warn('htmlui', e));
  }
  interface ArtEntry { code: string; load: (signal: AbortSignal) => Promise<{ url: string; release(): void }>; abort: AbortController; images: Set<HTMLImageElement>; used: boolean; pending: boolean; failed: boolean; lease: { url: string; release(): void } | null; }
  const fieldNodes = new Map<string, HTMLElement>();
  const duelScene = new DuelPresentation(controller.loadArchiveImage?.bind(controller) ?? null);
  // a famous NPC (Yami Yugi, Alexis Rhodes...) stands in its own picture in the janken, the duel and the result, as live
  const duelNpcSets = (): void => { const id = state.npc?.stage === 'duel' || state.npc?.stage === 'after-duel' ? state.npc.npc?.id : undefined; duelScene.npcSets = [null, id === undefined ? null : npcWaistUpSet(id)]; };
  duelScene.fx.speed = loadDuelSpeed();
  const avatarNodes = new Map<number, HTMLElement>();
  let effectsLayer: HTMLElement | null = null;
  let sideboardClock: ReturnType<typeof setInterval> | null = null;
  // The turn clock runs down between the server's readings; only its text changes each second.
  let duelClock: ReturnType<typeof setInterval> | null = null, duelClockNode: HTMLElement | null = null;
  const clockText = (timer: NonNullable<DuelView['timer']>) => { const left = Math.max(0, timer.paused || !timer.at ? timer.seconds : timer.seconds - Math.floor((Date.now() - timer.at) / 1000)); return `${timer.paused ? 'Paused · ' : ''}${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`; };
  /** The TIME gauge's fraction left: the clock's seconds at `at` run down between redraws (the plate's whole is 180 s,
   * or the clock's own start when longer). */
  const timeFraction = (timer: NonNullable<DuelView['timer']>) => { const left = Math.max(0, timer.paused || !timer.at ? timer.seconds : timer.seconds - (Date.now() - timer.at) / 1000); return left / Math.max(180, timer.seconds); };
  const lpNodes: Partial<Record<0 | 1, HTMLElement>> = {}, lpBars: Partial<Record<0 | 1, HTMLElement>> = {}, lpPlates: Partial<Record<0 | 1, LpPlate>> = {};
  const positionAvatars = (lobby: NonNullable<ClientView['lobby']>) => {
    if (worldRenderer && lobby.mapId !== undefined) {
      // the NPC whose card or talk is open stands still (its wandering held)
      const talking = state.npc?.npc?.id ?? null;
      worldRenderer.setBusyNpc(talking === null ? null : -talking); worldRenderer.setAvatars(lobby.avatars); return;
    }
    for (const avatar of lobby.avatars) { const node = avatarNodes.get(avatar.id); if (!node) continue; node.style.left = `${avatar.x / (lobby.width ?? 1024) * 100}%`; node.style.top = `${avatar.y / (lobby.height ?? 768) * 100}%`; }
  };
  // the overworld on PixiJS (ui/world.ts): map, objects, avatars, names and flags on one canvas under the HTML UI. PixiJS
  // loads when the lobby first opens (its own chunk): until then the lobby draws its plain backdrop
  let worldRenderer: WorldRenderer | null = null, worldLoading = false;
  const ensureWorld = () => {
    if (worldRenderer || worldLoading || !controller.loadWorldScene || disposed) return;
    worldLoading = true;
    void import('./world').then(m => {
      if (disposed) return;
      const renderer = new m.WorldRenderer({ loadScene: (id, signal) => controller.loadWorldScene!(id, signal),
        ...(controller.loadAvatar ? { loadAvatar: (parts: Uint8Array, options: import('../avatars').AvatarLoadOptions) => controller.loadAvatar!(parts, options) } : {}),
        loadFlagAtlas: async signal => m.pictureTexture(await pictureArt.resolve({ archive: FLAG_ATLAS }, signal), signal),
        loadStarArt: async signal => {
          const [big, small] = await Promise.allSettled([NPC_STAR_BIG, NPC_STAR_SMALL].map(async path => m.pictureTexture(await pictureArt.resolve({ archive: path }, signal), signal)));
          if (big!.status === 'fulfilled' && small!.status === 'fulfilled') return { big: big!.value, small: small!.value };
          for (const r of [big!, small!]) if (r.status === 'fulfilled') r.value.release();
          throw (big!.status === 'rejected' ? big!.reason : (small as PromiseRejectedResult).reason) as Error;
        },
        // My Room's shelf and TV (world-room.ts), from the game's own files
        ...(controller.readGameFile ? { room: { loadArt: async (path: string, signal: AbortSignal) => m.pictureTexture(await pictureArt.resolve({ archive: path }, signal), signal),
          readText: async (path: string, signal: AbortSignal) => new TextDecoder().decode(await controller.readGameFile!(path, signal)), language: controller.getState().settings.language ?? 'E' } } : {}),
        // the name tags' glyphs: main's table of the engine's DejaVu Sans 16 (ui/, beside live's game files)
        loadGlyphs: async (px, signal) => { const r = await fetch(new URL(`/ui/glyphs-dejavu${px}.json`, location.href).href, { signal }); if (!r.ok) throw new Error(`glyphs ${r.status}`); return await r.json() as import('../world/name-tag').GlyphAtlas; },
        reducedMotion: () => !!controller.getState().settings.reducedMotion });
      worldRenderer = renderer;
      (globalThis as { __deWorld?: () => unknown }).__deWorld = () => renderer.inspect();
      requestRender();
    }).catch((e: unknown) => { worldLoading = false; console.warn('world renderer', e); });
  };
  worldWalk = typeof stage.addEventListener === 'function' ? holdToWalk(stage, walkTo, t => { const e = t as Element | null; if (!e?.closest || e.closest('button, input, textarea, a, [data-key^="avatar:"]')) return false; return !!e.closest('[data-key="lobby-map"]') || !!worldRenderer?.element.contains(e); }) : null;
  const drafts = new Map<string, string>();
  const expanded = new Map<string, boolean>();
  let renderedIdentity = '';
  let renderedNpcIdentity = '';
  const art = new Map<string, ArtEntry>();
  const imageEntries = new WeakMap<Element, ArtEntry>();
  const startArt = (entry: ArtEntry) => {
    if (disposed || entry.pending || entry.failed || entry.lease) return;
    entry.pending = true;
    let pending: Promise<{ url: string; release(): void }>;
    try { pending = entry.load(entry.abort.signal); } catch { entry.pending = false; entry.failed = true; return; }
    void pending.then(lease => {
      if (disposed || entry.abort.signal.aborted || art.get(entry.code) !== entry) { lease.release(); return; }
      const url = safeImageUrl(lease.url); if (!url) { lease.release(); entry.failed = true; return; }
      entry.lease = lease;
      for (const image of entry.images) image.src = url;
    }).catch(() => { entry.failed = true; }).finally(() => { entry.pending = false; });
  };
  const observer = typeof IntersectionObserver === 'function' ? new IntersectionObserver(entries => {
    for (const observed of entries) if (observed.isIntersecting) { const entry = imageEntries.get(observed.target); if (entry) startArt(entry); observer?.unobserve(observed.target); }
  }, { root: stage, rootMargin: '120px' }) : null;
  const loadArt = (card: CardView, image: HTMLImageElement) => {
    const passcode = card.passcode, load = controller.loadCardImage?.bind(controller);
    if (!load || passcode === undefined || !Number.isSafeInteger(passcode) || passcode <= 0) return;
    attachArt(`card:${passcode}`, signal => load(passcode, signal), image);
  };
  const loadArchiveArt = (path: string, image: HTMLImageElement) => {
    const load = controller.loadArchiveImage?.bind(controller); if (load) attachArt(`shop:${path}`, signal => load(path, signal), image);
  };
  const attachArt = (code: string, load: ArtEntry['load'], image: HTMLImageElement) => {
    let entry = art.get(code);
    if (!entry) { entry = { code, load, abort: new AbortController(), images: new Set(), used: true, pending: false, failed: false, lease: null }; art.set(code, entry); }
    entry.used = true; entry.images.add(image);
    const previousError = image.onerror; image.onerror = event => { previousError?.call(image, event); observer?.unobserve(image); entry!.images.delete(image); entry!.failed = true; image.remove(); image.removeAttribute('src'); if (!entry!.images.size) { entry!.lease?.release(); entry!.lease = null; } };
    if (entry.lease) image.src = entry.lease.url;
    else if (observer) { imageEntries.set(image, entry); observer.observe(image); }
    else startArt(entry);
  };
  const drawCard = (card: CardView, showName = true, faceUp = true) => cardTile(card, showName, faceUp, controller.loadCardImage ? loadArt : undefined, controller.loadArchiveImage ? image => loadArchiveArt(CARD_BACK, image) : undefined);
  const placeFieldCard = (node: HTMLElement, card: DuelCardView, handCount: number) => {
    const p = fieldCardPosition(card, handCount), motion = card.motion;
    node.style.left = `${(motion?.x ?? p.x) / 1024 * 100}%`; node.style.top = `${(motion?.y ?? p.y) / 768 * 100}%`;
    node.style.width = `${p.width / 1024 * 100}%`; node.style.height = `${p.height / 768 * 100}%`;
    node.style.transform = motion ? `translate(-50%,-50%) rotate(${motion.rotation}deg) scaleX(${motion.scaleX})` : '';
    node.style.zIndex = motion?.zIndex === undefined ? '' : String(motion.zIndex);
    node.style.opacity = motion?.opacity === undefined ? '' : String(Math.max(0, Math.min(1, motion.opacity)));
    // The original draws a card's badges upright whatever the card's position: turn them back.
    const badges = node.querySelector?.<HTMLElement>('.de-card-badges');
    if (badges) badges.style.transform = `rotate(${-(motion?.rotation ?? (p.rotate ? 90 : 0))}deg)`;
    // and a pile's count reads upright too (the opponent's piles stand upside down)
    const count = node.querySelector?.<HTMLElement>('.de-card-count');
    if (count && (card.zone === 'deck' || card.zone === 'extra')) count.style.transform = `translate(-50%,-50%) rotate(${-(motion?.rotation ?? 0)}deg)`;
  };
  const canSkipRender = (previous: ClientView, next: ClientView) => {
    if (previous.scene !== next.scene || previous.status !== next.status || previous.connection !== next.connection || previous.error !== next.error || previous.busy !== next.busy || previous.settings !== next.settings || previous.relay !== next.relay || previous.sideboarding !== next.sideboarding || previous.match !== next.match || previous.preparation !== next.preparation || previous.unavailable?.[previous.scene] !== next.unavailable?.[next.scene]) return false;
    if (previous.player?.id !== next.player?.id || previous.player?.name !== next.player?.name || previous.player?.level !== next.player?.level) return false;
    // Unrelated world packets must not replace open mail/trade confirmations or audio controls.
    if (next.scene === 'shop') return previous.shop === next.shop && previous.online === next.online;
    return false;
  };
  const canPresentLobby = (previous: ClientView, next: ClientView) => {
    const a = previous.lobby, b = next.lobby;
    if (previous.scene !== 'lobby' || next.scene !== 'lobby' || !a || !b || previous.status !== next.status || previous.connection !== next.connection || previous.error !== next.error || previous.busy !== next.busy || previous.settings !== next.settings || previous.relay !== next.relay || previous.sideboarding !== next.sideboarding || previous.match !== next.match || previous.preparation !== next.preparation || previous.starter !== next.starter || previous.online !== next.online || previous.tagLobby !== next.tagLobby || previous.profileDetail !== next.profileDetail || previous.matchmaking !== next.matchmaking || previous.mode !== next.mode || previous.npc !== next.npc || previous.npcCardViews !== next.npcCardViews || previous.packNames !== next.packNames || previous.socialDetail !== next.socialDetail || previous.social !== next.social) return false;
    if (previous.player?.id !== next.player?.id || previous.player?.name !== next.player?.name || previous.player?.level !== next.player?.level || a.mapId !== b.mapId || a.name !== b.name || a.width !== b.width || a.height !== b.height || a.mapImage !== b.mapImage || a.connected !== b.connected || a.chat !== b.chat || a.rooms !== b.rooms || a.areas !== b.areas || a.npcs !== b.npcs || a.invitation !== b.invitation || a.outgoing !== b.outgoing || a.avatars.length !== b.avatars.length) return false;
    return a.avatars.every((p, i) => { const n = b.avatars[i]; return p.id === n.id && p.name === n.name && p.self === n.self && p.npc === n.npc && p.image === n.image && p.duelling === n.duelling; });
  };
  const presentLobby = (lobby: NonNullable<ClientView['lobby']>) => {
    if (worldRenderer && lobby.mapId !== undefined) { const self = lobby.avatars.find(a => a.self); worldRenderer.show(lobby.mapId, self ?? { x: (lobby.width ?? 1024) / 2, y: (lobby.height ?? 768) / 2 }); }
    positionAvatars(lobby);
  };
  const canPresent = (previous: ClientView, next: ClientView) => {
    const a = previous.duel, b = next.duel;
    if (previous.scene !== 'duel' || next.scene !== 'duel' || !a || !b || previous.status !== next.status || previous.connection !== next.connection || previous.error !== next.error || previous.busy !== next.busy || previous.settings !== next.settings || previous.relay !== next.relay || previous.sideboarding !== next.sideboarding || previous.match !== next.match || previous.preparation !== next.preparation || previous.npc !== next.npc || previous.npcCardViews !== next.npcCardViews || previous.packNames !== next.packNames || previous.socialDetail !== next.socialDetail || previous.social !== next.social) return false;
    if (a.prompt !== b.prompt || a.actions !== b.actions || a.log !== b.log || a.turn !== b.turn || a.phase !== b.phase || a.turnPlayer !== b.turnPlayer || a.ended !== b.ended || a.waiting !== b.waiting || a.spectating !== b.spectating || a.timer !== b.timer || a.notice !== b.notice || a.cards.length !== b.cards.length) return false;
    if (a.players.some((p, i) => p.name !== b.players[i].name || p.turnCounters !== b.players[i].turnCounters)) return false;
    return a.cards.every((c, i) => { const n = b.cards[i]; return c.id === n.id && c.passcode === n.passcode && c.name === n.name && c.description === n.description && c.image === n.image && c.controller === n.controller && c.zone === n.zone && c.index === n.index && c.faceUp === n.faceUp && c.position === n.position && c.attack === n.attack && c.defense === n.defense && c.counters === n.counters && c.turnCounter === n.turnCounter; });
  };
  const presentEffects = (duel: DuelView) => {
    for (const node of fieldNodes.values()) delete node.dataset.effect;
    if (!effectsLayer) return;
    effectsLayer.replaceChildren();
    for (const effect of (duel.effects ?? []).slice(-24)) {
      const node = el('span', `de-effect de-effect-${effect.type}`), progress = Math.max(0, Math.min(1, effect.progress));
      const card = effect.cardId ? duel.cards.find(c => c.id === effect.cardId) : undefined;
      if (effect.cardId) { const target = fieldNodes.get(effect.cardId); if (target) target.dataset.effect = effect.type; }
      if (controller.loadArchiveImage) continue; // the original art's effects layer (duel-fx.ts) draws these
      node.textContent = effect.type === 'damage' ? `−${effect.value ?? ''}` : effect.type === 'recover' ? `+${effect.value ?? ''}` : effect.type === 'chain' ? 'Chain' : effect.type === 'attack' ? 'Attack' : 'Effect';
      const handCount = card ? duel.cards.filter(c => c.controller === card.controller && c.zone === 'hand').length : 0;
      const p = card ? fieldCardPosition(card, handCount) : { x: effect.player === 0 ? 150 : 874, y: 95 };
      node.style.left = `${(card?.motion?.x ?? p.x) / 1024 * 100}%`; node.style.top = `${(card?.motion?.y ?? p.y) / 768 * 100}%`;
      node.style.opacity = String(1 - progress); node.style.transform = `translate(-50%,${-progress * 30}px)`;
      effectsLayer.append(node);
    }
  };
  const present = (duel: DuelView) => {
    const handCounts: [number, number] = [0, 0]; for (const card of duel.cards) if (card.zone === 'hand') handCounts[card.controller]++;
    for (const card of duel.cards) { const node = fieldNodes.get(card.id); if (node) placeFieldCard(node, card, handCounts[card.controller]); }
    for (const i of [0, 1] as const) { if (lpNodes[i]) lpNodes[i]!.textContent = duel.players[i].lp.toLocaleString(); if (lpBars[i]) lpBars[i]!.style.width = lpWidth(duel.players[i].lp); lpPlates[i]?.setLp(duel.players[i].lp); }
    presentEffects(duel); duelNpcSets(); duelScene.update(duel, state.settings.reducedMotion);
  };
  const pruneArt = () => {
    for (const [code, entry] of art) if (!entry.used) { entry.abort.abort(); for (const image of entry.images) image.removeAttribute('src'); entry.images.clear(); entry.lease?.release(); entry.lease = null; art.delete(code); }
  };
  // A full render replaces the stage's controls. Between a press and its release that would swallow the click, so
  // renders wait until the pointer is released (or 1.5 s pass, e.g. a release outside the window).
  let pointerHeld = false, deferredRender = false, pointerTimer: ReturnType<typeof setTimeout> | null = null;
  const releasePointer = () => { pointerHeld = false; if (pointerTimer) { clearTimeout(pointerTimer); pointerTimer = null; } if (deferredRender) { deferredRender = false; requestRender(); } };
  const holdPointer = () => { pointerHeld = true; if (pointerTimer) clearTimeout(pointerTimer); pointerTimer = setTimeout(releasePointer, 1500); };
  host.addEventListener?.('pointerdown', holdPointer, true);
  globalThis.addEventListener?.('pointerup', releasePointer, true); globalThis.addEventListener?.('pointercancel', releasePointer, true);
  const requestRender = () => { if (pointerHeld) { deferredRender = true; return; } if (!queued && !disposed) { queued = true; queueMicrotask(() => { queued = false; if (!disposed) render(); }); } };
  const browserDisplay = new BrowserDisplaySettings(browserFullscreenAdapter(globalThis.document?.documentElement && typeof globalThis.document.documentElement.requestFullscreen === 'function' ? globalThis.document.documentElement : host), () => { if (!disposed && optionsUi) showHtml(); });
  const send = (command: ClientCommand) => {
    if (disposed) return;
    local.message = '';
    if (command.type === 'move') { const current = controller.getState(); if (current.scene !== 'lobby') return; if (current.npc && !['idle', 'done'].includes(current.npc.stage)) { local.message = 'Finish the NPC interaction before moving.'; requestRender(); return; } }
    if (['duelRespond', 'duelAction', 'surrender'].includes(command.type) && controller.getState().relay?.canAct === false) { local.message = 'Your tag partner is playing this turn.'; requestRender(); return; }
    try {
      const result = controller.dispatch(command);
      // An aborted command belongs to a session or screen the player already left: nothing to report.
      // A failed shop catalogue under main's card shop is the shop's own to say ("Couldn't open the shop", Try again).
      if (result && typeof result.then === 'function') void result.catch((e: unknown) => { if (!disposed && !(e instanceof DOMException && e.name === 'AbortError') && !shopOwnsFailure(command)) { local.message = e instanceof Error ? e.message : 'The action could not be completed.'; requestRender(); } });
    } catch (e) { local.message = e instanceof Error ? e.message : 'The action could not be completed.'; requestRender(); }
  };
  const shopOwnsFailure = (command: ClientCommand) => (command.type === 'openScene' || command.type === 'refresh') && command.scene === 'shop' && useCardShop();
  const available = (scene: Scene) => !state.unavailable?.[scene];
  const open = (scene: Scene) => { local.message = ''; send({ type: 'openScene', scene }); };
  const sceneRoot = (heading: string): HTMLElement => {
    const n = el('section', 'de-scene'); n.setAttribute('aria-label', heading); stage.append(n); return n;
  };
  // A scene whose data has not come yet (the deck editor's decks, the duel's first state, the lobby's world, the shop's
  // catalogue): live's loader veil stays over it until it has (htmlui/scene-loading.ts SCENE_LOADING_ATTR), as over a
  // scene the runtime is loading. A load that failed is main's error dialog (duelPrompts); its OK leaves the scene.
  const loadingScene = (scene: Scene, heading: string) => {
    const n = sceneRoot(heading), failed = !state.busy && (state.error || local.message);
    if (!failed) { n.setAttribute(SCENE_LOADING_ATTR, 'true'); n.setAttribute('aria-busy', 'true'); return; }
    if (failed === errorSeen && scene !== 'lobby') queueMicrotask(() => { if (!disposed && controller.getState().scene === scene) open(state.player ? 'lobby' : 'title'); });
  };
  // a scene this mode lacks (Free Duel's shop door): the reason in main's error dialog, its OK back to the lobby
  let unavailableShown: Scene | null = null;
  const unavailableScene = (scene: Scene, heading: string) => {
    sceneRoot(heading);
    const reason = state.unavailable?.[scene] ?? 'This feature is unavailable.';
    if (unavailableShown !== scene) { unavailableShown = scene; local.message = reason; return; }
    if (errorSeen === reason) queueMicrotask(() => { if (!disposed && controller.getState().scene === scene) { unavailableShown = null; open(state.player ? 'lobby' : 'title'); } });
  };
  // the title's movie buttons (htmlui/title-scene.ts), as live: ONLINE signs in (the sign-in window, signed out) and
  // goes online, OPTIONS opens its OPTIONS window (COptionDlg), DECK EDITOR and FREE DUEL start free mode (ovr/freemode.c)
  let freeTarget: 'deck' | null = null;
  // the deck editor opened by the title's DECK EDITOR: its EXIT goes back to the title (live), not into the free lobby
  const titlePress = (name: TitleButton) => {
    if (state.busy) return;
    // signed out, every way online starts at the sign-in window (free mode goes online too); an error from before it
    // is not its own (it says only what happens in it)
    if (!state.auth?.signedIn && state.auth && name !== 'options') { loginUi.open = true; loginUi.stale = state.error ?? null; requestRender(); return; }
    if (name === 'online') {
      if (state.connection === 'online' && state.mode !== 'free') open('characters'); else send({ type: 'connect', freeMode: false });
    } else if (name === 'options') { optionsUi = { kind: 'title' }; showHtml(); }
    else {
      freeTarget = name === 'deck' ? 'deck' : null;
      if (state.connection === 'online' && state.mode === 'free') { if (freeTarget) { freeTarget = null; deckFromTitle = true; open('deck'); } else open(state.player ? 'lobby' : 'characters'); }
      else send({ type: 'connect', freeMode: true });
    }
  };
  function renderTitle(): void {
    const n = sceneRoot('Title'), panel = el('section', 'de-panel de-center de-stack');
    // the engine's title movie and its buttons (htmlui/title-scene.ts), over the 2008 backdrop; signed out, ONLINE
    // leaves the title as live: the movie goes, the start screens' ring turns on the backdrop and live's sign-in window
    // (loginSpecs) stands over it, with no way back to the title (live's CWindowLogin has no Cancel; Esc and clicks
    // outside it do nothing)
    if (controller.loadArchiveImage && loginUi.open && showsLogin()) {
      titleScene?.hide(); titleScene?.element.remove(); titleScene?.controls.remove();
      startScene ??= new StartScene(controller.loadArchiveImage.bind(controller));
      n.append(startScene.element); startScene.show({ logo: true, portrait: null, reducedMotion: false });
      return;
    }
    if (controller.loadArchiveImage) {
      titleScene ??= new TitleScene(controller.loadArchiveImage.bind(controller));
      n.append(titleScene.element, titleScene.controls); titleScene.show(!!state.settings.reducedMotion);
      titleScene.wire(titlePress, name => !state.busy && (name === 'options' || name === 'online' || !(state.connection === 'online' && state.mode !== 'free')));
      return;
    }
    // without the game's art: the sign-in window over a plain title
    if (showsLogin()) return;
    panel.append(title('Duel Evolution'), el('p', '', 'Welcome to Duel Academy.'));
    if (state.auth?.signedIn) {
      panel.append(el('p', '', `Signed in${state.auth.name ? ` as ${state.auth.name}` : ''}.`), button(state.connection === 'online' ? 'Continue' : 'Go Online', () => state.connection === 'online' ? open('characters') : send({ type: 'connect', freeMode: false }), !!state.busy, true), button('Sign Out', () => send({ type: 'signOut' }), !!state.busy));
    } else if (state.auth) {
      const form = el('form', 'de-stack'), username = textField('username', local.username, 'Username'), password = textField('password', '', 'Password');
      username.autocomplete = 'username'; username.maxLength = 64; password.type = 'password'; password.autocomplete = 'current-password'; password.maxLength = 128;
      username.required = password.required = true; username.oninput = () => { local.username = username.value; };
      const submit = el('button', 'gold', 'Sign In'); submit.type = 'submit'; submit.disabled = !!state.busy;
      form.append(labelled('User ID', username), labelled('Password', password), submit);
      form.onsubmit = e => { e.preventDefault(); if (!username.value.trim() || !password.value) return; send({ type: 'signIn', username: username.value.trim(), password: password.value }); password.value = ''; };
      const discord = el('a', '', 'Sign in with Discord'); discord.href = '/api/auth/sign-in/discord?return=/';
      panel.append(form, discord);
    } else panel.append(button('Go Online', () => send({ type: 'connect', freeMode: false }), !!state.busy, true));
    if (!state.auth || state.auth.signedIn) panel.append(button('Free Duel & Deck Editor', () => send({ type: 'connect', freeMode: true }), !!state.busy || state.connection === 'online'));
    panel.append(note(state.status)); n.append(panel);
  }
  // Select Player is main's (src/ui/htmlui: its window over the 2008 backdrop); under it the engine's own drawing, the
  // ring logo and the selected character's waist-up portrait (src/ui/htmlui/start-scene.ts)
  function renderCharacters(): void {
    const n = sceneRoot('Select Player');
    if (!controller.loadArchiveImage) return;
    startScene ??= new StartScene(controller.loadArchiveImage.bind(controller));
    n.append(startScene.element); syncStartScene();
  }
  /** The start scene's drawing for the current state (each HTML redraw: the row under the pointer changes it). */
  function syncStartScene(): void {
    if (state.scene !== 'characters') { htmlUiState.selected = null; return; }
    if (!startScene) return;
    // the account prompts stand alone (main's game hides Select Player, and with it the portrait, under them)
    const d = htmlUiState.dialog, alone = !!d && (['create', 'delete', 'delpw', 'deleting'].includes(d.kind) || d.kind === 'ok' && !!d.at);
    const ch = alone ? undefined : state.characters.find(c => c.slot === htmlUiState.selected);
    // first dressing: Change Avatar's portrait of the look being made (CChangeAvatarPack), no ring logo
    if (d?.kind === 'avatar') { startScene.show({ logo: false, portrait: Uint8Array.from(d.look), reducedMotion: state.settings.reducedMotion }); return; }
    // live's Select Player: the swirl backdrop, the turning ring and the waist-up portrait of the character last under
    // the pointer (CWindowPlayerSelect::onMain; main's select.js leaves the engine's bust to show through); the ring
    // turns as live's engine turns it, whatever the reduced-motion setting
    startScene.show({ logo: true, portrait: ch?.parts?.length === 16 ? Uint8Array.from(ch.parts) : null, reducedMotion: false });
  }
  function renderLobby(): void {
    if (!state.lobby) return loadingScene('lobby', 'Lobby');
    const lobby = state.lobby;
    // the world's press target (a click walks there, a held button walks on: phone.ts holdToWalk), under the PixiJS world
    const map = el('div', 'de-lobby-map'); map.setAttribute('role', 'application'); map.setAttribute('aria-label', 'Lobby map'); map.tabIndex = 0; map.dataset.key = 'lobby-map';
    map.style.backgroundImage = lobbyBackground(); stage.append(map);
    ensureWorld(); const world = worldRenderer, useScene = !!world && lobby.mapId !== undefined;
    if (useScene) { stage.append(world!.element); world!.avatars.replaceChildren(); const self = lobby.avatars.find(a => a.self); world!.show(lobby.mapId!, self ?? { x: (lobby.width ?? 1024) / 2, y: (lobby.height ?? 768) / 2 }); }
    const mapUrl = safeImageUrl(lobby.mapImage);
    if (mapUrl && !useScene) { const image = el('img', 'de-stage-layer'); image.src = mapUrl; image.alt = lobby.name; image.style.width = '100%'; image.style.height = '100%'; image.style.objectFit = 'fill'; image.style.pointerEvents = 'none'; stage.append(image); }
    const worldW = lobby.width ?? 1024, worldH = lobby.height ?? 768;
    map.onclick = e => { if (worldWalk?.consumeClick()) return; const card = state.profileDetail; if (card && card.selectedPid !== null && card.selectedPid !== card.selfPid) { send({ type: 'profileAction', action: { type: 'close' } }); return; } if (lobby.connected && !state.busy) { if (useScene && !world!.ready) { local.message = 'Map artwork is still loading.'; requestRender(); return; } const p = useScene ? gamePoint(e.clientX, e.clientY, world!.element.getBoundingClientRect()) : gamePoint(e.clientX, e.clientY, map.getBoundingClientRect(), worldW, worldH); if (p) { const target = useScene ? world!.screenToWorld(p) : p; send({ type: 'move', x: Math.round(target.x), y: Math.round(target.y) }); } } };
    map.onkeydown = e => {
      const currentLobby = controller.getState().lobby, self = currentLobby?.avatars.find(a => a.self); if (!self || !currentLobby?.connected) return;
      const delta: Record<string, [number, number]> = { ArrowLeft: [-32, 0], ArrowRight: [32, 0], ArrowUp: [0, -32], ArrowDown: [0, 32] };
      const d = delta[e.key]; if (!d) return; e.preventDefault(); send({ type: 'move', x: Math.max(0, Math.min(worldW, self.x + d[0])), y: Math.max(0, Math.min(worldH, self.y + d[1])) });
    };
    for (const avatar of lobby.avatars) {
      // an NPC standing on the map starts its talk at once, its card beside it (live: CNpcTalk, its record, deck and
      // biography, and "Start Duel?" after its lines); a player's opens the player card
      const b = button('', () => { if (avatar.npc && state.profileDetail?.selectedPid != null) send({ type: 'profileAction', action: { type: 'close' } }); send({ type: 'interact', playerId: avatar.id }); }, !lobby.connected);
      b.className = 'de-avatar' + (avatar.self ? ' self' : ''); b.style.left = `${avatar.x / worldW * 100}%`; b.style.top = `${avatar.y / worldH * 100}%`; b.setAttribute('aria-label', `${avatar.name}${avatar.npc ? ', NPC' : ''}`);
      const art = safeImageUrl(avatar.image);
      if (art) { const img = el('img', 'de-avatar-sprite'); img.src = art; img.alt = ''; b.append(img); } else b.append(el('span', 'de-avatar-placeholder'));
      const nameTag = el('span', 'de-avatar-name', avatar.name), cell = useScene ? null : flagCell(avatar.country); if (cell) nameTag.prepend(nationFlag(cell)); b.append(nameTag); b.dataset.key = `avatar:${avatar.id}`; avatarNodes.set(avatar.id, b); if (useScene) world!.avatars.append(b); else stage.append(b);
    }
    if (useScene) world!.bindHits(avatarNodes);
    positionAvatars(lobby);
    // a player's card is main's (src/ui/htmlui: CPlayerListMenu), opened from the avatar or the player list; the chat,
    // the Duel menu, the Move list, the player list's search and an NPC's card are main's (src/ui/htmlui/lobby.ts)
    // the duel request (waiting, Cancel) and the invitation (Yes / No) are main's stock dialogs: duelPrompts()
  }
  /** A Yes / No question: main's CWindowModelDialogYesNo (dialog.js) over the scene, `yes` on Yes. */
  function confirmAction(message: string, yes: () => void, key = 'confirm'): void { htmlUiState.dialog = { kind: 'confirm', text: message, yes, key }; showHtml(); }
  // The original's duel request (CNetDuelRequestTask): the challenger waits in an Ok dialog whose one button is Cancel;
  // the one challenged answers a Yes / No (main's dialog.js: CWindowModelDialogOk / YesNo). The error dialog
  // (CWindowModelDialogError, orange, topmost) shows a refusal or a lost connection until OK.
  let errorSeen = '';
  // main's starter deck picker (htmlui/starter.ts); its claim is the rewrite's, whose refusal it shows itself
  const starterPicker = new StarterPicker({
    host: () => stage,
    claim: async id => {
      // the lobby's own entry requests (the NPC list, the starter offer) may still be running when the player takes a
      // deck: the claim waits for them, as main's picker (its own POST) never meets the app's busy lock
      for (const until = Date.now() + 30000; controller.getState().busy && Date.now() < until;) await new Promise(r => setTimeout(r, 100));
      try { await controller.dispatch({ type: 'claimStarter', id }); return { ok: true }; }
      catch (e) { errorSeen = controller.getState().error ?? errorSeen; return { ok: false, message: e instanceof Error ? e.message : 'That didn\'t work. Try again in a moment.' }; }
    },
    later: () => {},
    ...(controller.loadCardImage ? { coverUrl: (pc: number, signal: AbortSignal) => controller.loadCardImage!(pc, signal).then(r => { signal.addEventListener('abort', () => r.release(), { once: true }); return r.url; }) } : {}),
  });
  function duelPrompts(): WindowSpec[] {
    const out: WindowSpec[] = [], lobby = state.scene === 'lobby' ? state.lobby : undefined, busy = !!state.busy;
    // live's request boxes (htmlui/windows.ts duelRequestDialog), the other duelist's portrait beside them (syncPortrait)
    const ctx = { ids: htmlIds, text: (id: number) => gameTexts.get(id) };
    if (lobby?.outgoing) { if (lobby.refused) refusedSeen = Math.max(refusedSeen, lobby.refused.id);   // an older refusal is not this request's
      out.push(duelRequestDialog(ctx, { kind: 'requesting', cancel: () => { if (!busy) send({ type: 'cancelChallenge' }); } })); }
    else if (lobby?.refused && lobby.refused.id > refusedSeen) out.push(duelRequestDialog(ctx, { kind: 'refused', ok: () => { refusedSeen = Math.max(refusedSeen, lobby.refused!.id); showHtml(); } }));
    if (lobby?.invitation) { const inv = lobby.invitation; out.push(duelRequestDialog(ctx, { kind: 'received', name: inv.name, ...(inv.level !== undefined ? { level: inv.level } : {}), ...(inv.title !== undefined ? { title: titleName(inv.title) } : {}),
      yes: () => { if (!busy) send({ type: 'replyChallenge', accept: true }); }, no: () => { if (!busy) send({ type: 'replyChallenge', accept: false }); } })); }
    // a duel the server called off before it began (the other duelist gone): live's box over the janken scene; OK leaves
    const off = state.scene === 'duel' ? state.duelCalledOff : undefined;
    if (off) out.push(duelRequestDialog(ctx, { kind: 'calledOff', text: off.text, ok: () => { if (!busy) send({ type: 'leaveDuel' }); } }));
    // main's card shop says its own failures in its page ("Couldn't open the shop", Try again): the app's catalogue
    // refresh behind it failing is no dialog of its own (one would sit under the shop, out of reach)
    // (the deck screen says its refusals in its own OK dialog: not before it is drawn, a failed load of its decks is this one)
    const message = state.scene === 'deck' && state.deckEditor || useCardShop() && !local.message ? '' : state.error || local.message;
    // the sign-in window says its own refusals on its status line (live session.cpp status): no dialog over its button
    const onLogin = showsLogin() && (message === state.error || message === state.accountDetail?.error);
    if (message && message !== errorSeen && !onLogin) out.push(stockDialog({ ids: htmlIds }, 'error', 'error', message,
      [{ from: 'OK', key: 'error-ok', click: () => { errorSeen = message; if (local.message === message) local.message = ''; requestRender(); } }]));
    else if (!message) errorSeen = '';
    return out;
  }
  // a duel card's details are live's card information box (the duel screen's bottom-left box, duel-scene.ts)
  function inspect(card: CardView, from: DeckZone | 'collection' | 'duel' = 'collection'): void { if (from === 'duel') { duelScene.showCard(card); return; } local.inspected = card; local.inspectedFrom = from; requestRender(); }
  // The deck editor is main's deck screen (src/ui/htmlui/deck-scene.ts: its windows on the layer, the card pictures and
  // the mouse on the layer's engine side); the stage keeps only the scene's name, and a refusal shows in main's dialog
  function renderDeck(): void {
    const editor = state.deckEditor; if (!editor) return loadingScene('deck', 'Edit Deck');
    sceneRoot('Edit Deck');
    if (editor.error) local.message ||= editor.error;
    deckScene.notice(state.error || local.message);
  }
  // Card Swap between a match's games (htmlui/side-swap.ts): its windows on the layer, the deck screen's ground here
  function renderSideboarding(): void {
    const ground = sceneRoot('Card Swap'); deckBackdrop(ground);
  }
  function renderShop(): void {
    if (useCardShop()) sceneRoot('Card Shop').append(cardShop.node());
  }
  function relayRoster(): HTMLElement { const relay = state.relay!; const roster = el('aside', 'de-relay-roster'); roster.setAttribute('aria-label', 'Tag relay teams'); for (const team of [0, 1] as const) { const group = el('section', 'de-relay-team'); for (const slot of [0, 1] as const) { const member = relay.players[2 * team + slot], active = relay.active[team] === slot; const row = el('div', 'de-relay-member', el('strong', '', member?.name ?? 'Waiting for player'), note(active ? relay.self === 255 ? 'Team pilot' : team ? 'Opponent playing' : relay.self === slot ? 'You are playing' : 'Partner playing' : 'Tag partner')); row.dataset.active = String(active); group.append(row); } roster.append(group); } return roster; }
  function renderDuel(): void {
    // before the field: rock-paper-scissors and who goes first, live's own scene (no field, plates, bar or chat)
    const jv = jankenView();
    if (jv) {
      duelNpcSets(); const portraits = duelScene.jankenPortraits(state.duel?.players ?? null);
      stage.append(jankenScene(jv, { hand: hand => { jankenMine = hand; send({ type: 'chooseHand', hand }); }, first: first => send({ type: 'chooseFirst', first }) },
        controller.loadArchiveImage ? loadArchiveArt : null, portraits));
      if (state.relay) stage.append(relayRoster());
      return;
    }
    const duel = state.duel; if (!duel) { loadingScene('duel', 'Duel'); return; }
    // The field keeps the original 4:3 geometry on every screen; on a tall phone the log, actions and prompts sit below it.
    const board = el('div', 'de-duel-board'); stage.append(board);
    // under the original field art (while it loads, or without it): the zone outlines of the original sheet
    const field = el('div', 'de-duel-field'); field.setAttribute('role', 'img'); field.setAttribute('aria-label', 'Duel field'); field.style.backgroundImage = fieldBackground(); board.append(field);
    const archive = controller.loadArchiveImage ? (path: string, className = '') => { const image = el('img', className); image.alt = ''; image.draggable = false; image.decoding = 'async'; image.style.visibility = 'hidden'; image.onload = () => { image.style.visibility = ''; }; loadArchiveArt(path, image); return image; } : null;
    if (archive) {
      // The original backdrop, then the plain halves of the zone sheet: the opponent's red half above, the player's blue half below.
      if (duel.background) board.append(archive(duel.background, 'de-duel-bg'));
      for (const [half, top] of [[1, 50], [0, 282]] as const) { const frames = el('div', 'de-duel-frames'); frames.style.top = `${top / 768 * 100}%`; const sheet = archive(FIELD_SHEET); sheet.style.top = half ? '-100%' : '0'; frames.append(sheet); board.append(frames); }
    }
    const hud = el('div', 'de-duel-hud');
    duelClockNode = null;
    const match = state.match ? `Match ${state.match.round} · ${state.match.scores[0]}–${state.match.scores[1]}${state.match.scores[2] ? ` · ${state.match.scores[2]} drawn` : ''}` : '';
    const clock = (index: 0 | 1) => duel.timer && duel.timer.player === index ? clockText(duel.timer) : '';
    const duelist = (index: 0 | 1) => {
      const player = duel.players[index], lp = el('strong', 'de-lp-value', player.lp.toLocaleString()), bar = el('span', 'de-lp-fill'); bar.style.width = lpWidth(player.lp); lpNodes[index] = lp; lpBars[index] = bar;
      const panel = el('div', `de-duelist${duel.turnPlayer === index ? ' active' : ''}`, el('div', 'de-duelist-name', player.name), el('div', 'de-lp', el('span', 'de-lp-label', 'LP'), el('span', 'de-lp-bar', bar), lp));
      panel.setAttribute('aria-label', `${player.name}: ${player.lp} life points${duel.turnPlayer === index ? ', their turn' : ''}`);
      if (clock(index)) { const node = el('div', 'de-duel-clock', `Time ${clock(index)}`); panel.append(node); duelClockNode = node; }
      if (index === 0 && match) panel.append(el('div', 'de-duel-clock', match));
      for (const counter of (player.turnCounters ?? []).filter(c => c.turns > 0)) panel.append(note(`${counter.name}: ${counter.turns} turns`));
      return panel;
    };
    hud.append(duelist(0), duelist(1)); stage.append(hud);
    // with the game's art, live's framed LP plates (duel-plate.ts: duel_window_01, the LP / TIME gauges, the digit font);
    // the text HUD stays for assistive technology (and draws itself without the art)
    delete lpPlates[0]; delete lpPlates[1];
    if (archive) {
      hud.className += ' de-sr';
      for (const i of [0, 1] as const) {
        // (an NPC duel's TIME bar stays empty on live, though the turn still times out)
        const t = duel.timer && duel.timer.player === i && state.npc?.stage !== 'duel' ? timeFraction(duel.timer) : null;
        const plate = lpPlate({ side: i, name: duel.players[i].name, lp: duel.players[i].lp, time: t, image: archive });
        plate.root.setAttribute('aria-hidden', 'true'); board.append(plate.root); lpPlates[i] = plate;
      }
    }
    const phases = [['draw', 'DP', 'Draw Phase'], ['standby', 'SP', 'Standby Phase'], ['main1', 'M1', 'Main Phase 1'], ['battle', 'BP', 'Battle Phase'], ['main2', 'M2', 'Main Phase 2'], ['end', 'EP', 'End Phase']] as const;
    const current = phases.find(([key]) => key === duel.phase);
    const bar = el('div', `de-phase-bar${duel.turnPlayer ? ' opponent' : ''}`); bar.setAttribute('role', 'status');
    bar.setAttribute('aria-label', `Turn ${duel.turn}${current ? `, ${current[2]}` : ''}, ${duel.players[duel.turnPlayer].name}'s turn`);
    bar.append(el('div', 'de-turn-box', el('small', '', 'Turn'), el('strong', '', String(Math.max(1, duel.turn)))));   // live counts from 1, before the first draw too
    // The phase buttons are the engine's (CDuelPhaseButton): on the player's turn BP / M2 / EP are pressed to enter the
    // Battle Phase, Main Phase 2 or end the turn, as live; no separate action buttons.
    const PHASE_ACTION: Partial<Record<string, string>> = { battle: 'phase:3', main2: 'phase:4', end: 'phase:5' };
    phases.forEach(([key, short, long], row) => {
      const act = (duel.actions ?? []).find(a => a.id === PHASE_ACTION[key]);
      const cell: HTMLElement = act ? button('', () => { local.duelCmd = null; sendAction(duel, act.id); }, !!act.disabled || !!state.busy) : el('div');
      cell.className = `de-phase${key === duel.phase ? ' current' : ''}${act ? ' de-phase-go' : ''}`; cell.title = act ? act.label : long;
      if (act) { cell.dataset.key = `duel-phase:${key}`; cell.setAttribute('aria-label', act.label); }
      // duel_pbutton_01: c01 for the player's turn (yellow, the current phase lit cyan: column 3), c02 the opponent's (red),
      // as live
      if (archive) { const sheet = archive(`data/y/duel/phase/duel_pbutton_01_c0${duel.turnPlayer ? 2 : 1}.png`); sheet.style.left = key === duel.phase ? '-300%' : '0'; sheet.style.top = `-${row * 100}%`; cell.append(sheet, el('span', 'de-sr', act ? act.label : short)); }
      else cell.textContent = act ? act.label : short;
      bar.append(cell);
    });
    board.append(bar);
    // A choice made on the board itself (a target, a Tribute, a zone) says what to choose in the duel bar's help line
    // only, as live (no banner over the field)
    if (state.relay) stage.append(relayRoster());
    const cards = el('div', 'de-field-cards');
    const visibleCardIds = new Set<string>();
    // Only the topmost card of a pile is drawn; counts remain visible without allocating one DOM tree per deck card.
    const pileTop = new Map<string, number>();
    const handCounts: [number, number] = [0, 0]; for (const card of duel.cards) if (card.zone === 'hand') handCounts[card.controller]++;
    for (const c of duel.cards) if (['deck', 'graveyard', 'banished', 'extra'].includes(c.zone)) pileTop.set(`${c.controller}/${c.zone}`, c.zone === 'deck' ? Math.min(pileTop.get(`${c.controller}/${c.zone}`) ?? Infinity, c.index) : Math.max(pileTop.get(`${c.controller}/${c.zone}`) ?? -1, c.index));
    const pileOf = new Map<string, string>();
    for (const c of duel.cards) if (pileTop.has(`${c.controller}/${c.zone}`)) pileOf.set(c.id, `${c.controller}/${c.zone}`);
    const topOf = new Map<string, string>();
    for (const c of duel.cards) if (pileTop.get(`${c.controller}/${c.zone}`) === c.index && pileOf.has(c.id)) topOf.set(`${c.controller}/${c.zone}`, c.id);
    // The command list (CWindowModelListDuelCmd) of each card: its own actions, a pile's on its top card
    const commands = new Map<string, DuelOption[]>();
    // (a selection of a card under a pile's top: on that pile's list too, as no card of its own is there to click; an
    // action of no card and no zone: on the player's deck)
    const ownDeckTop = topOf.get('0/deck'), canSurrender = !duel.spectating && !duel.ended, DECK_ZONE = 'deck:0';
    for (const a of duel.actions ?? []) {
      if (a.place || a.id === 'cancel' || a.id.startsWith('phase:')) continue;
      const pile = a.cardId ? pileOf.get(a.cardId) : undefined;
      if (a.cardId && a.label.startsWith('Select:') && (!pile || topOf.get(pile) === a.cardId)) continue;
      const at = !a.cardId ? ownDeckTop ?? DECK_ZONE : pile ? topOf.get(pile) ?? a.cardId : a.cardId;
      commands.set(at, [...commands.get(at) ?? [], a]);
    }
    // A choice on the field the server asks for (a 'place' prompt: a zone, a card on either side, a card to discard or
    // tribute) is made on the zone or the card itself, as live; a card under a pile's top on that pile's list
    const fieldPrompt = duel.prompt?.kind === 'place' ? duel.prompt : null, promptChoices = new Set<string>();
    for (const o of fieldPrompt?.options ?? []) {
      if (o.place && !o.cardId) continue;
      const pile = o.cardId ? pileOf.get(o.cardId) : undefined;
      if (o.cardId && (!pile || topOf.get(pile) === o.cardId)) continue;
      const at = !o.cardId ? ownDeckTop ?? DECK_ZONE : topOf.get(pile!) ?? o.cardId;
      commands.set(at, [...commands.get(at) ?? [], o]); promptChoices.add(o.id);
    }
    const choose = (id: string) => { if (fieldPrompt) respondToPrompt(fieldPrompt.id, { optionId: id }); };
    const surrenderNow = () => { local.duelCmd = null; confirmAction('Surrender this duel?', () => send({ type: 'surrender' }), 'surrender'); };
    for (const c of duel.cards) {
      if (['deck', 'graveyard', 'banished', 'extra'].includes(c.zone) && c.index !== pileTop.get(`${c.controller}/${c.zone}`)) continue;
      visibleCardIds.add(c.id);
      const handCount = handCounts[c.controller];
      // The player's own set cards stay card backs on the field but remain readable to their owner (never the opponent's).
      const ownSet = isOwnSetCard(c);
      // A board selection (an attack target, a card to choose on either side) is made on the card itself, as in the original.
      const cardActions = (duel.actions ?? []).filter(a => a.cardId === c.id), selection = cardActions.length === 1 && !cardActions[0]!.disabled && cardActions[0]!.label.startsWith('Select:') ? cardActions[0]! : null;
      // live: a click (or a right click) on a card opens its command list; a card with none shows its details
      const listOn = (commands.get(c.id)?.length ?? 0) > 0 || (canSurrender || !!duel.spectating) && c.id === ownDeckTop || !!duel.spectating && c.zone === 'deck';
      // no name bands on the field (live draws the card pictures alone): the name is the card's label, tooltip and details
      const p = fieldCardPosition(c, handCount), tile = drawCard(c, false, c.faceUp), b = button('', () => { const target = duel.prompt?.options.find(o => o.cardId === c.id && !o.disabled); if (target && duel.prompt) respondToPrompt(duel.prompt.id, { optionId: target.id }); else if (selection) { if (!state.busy) sendAction(duel, selection.id); } else if (listOn) { openCmd(local.duelCmd === c.id ? null : c.id); } else if (c.faceUp || ownSet) { inspect(c, 'duel'); if (c.faceUp) send({ type: 'inspectCard', cardId: c.id }); } });
      b.oncontextmenu = event => { event.preventDefault(); if (listOn && !selection) openCmd(c.id); };
      if (c.faceUp || ownSet) b.title = c.name;
      if (listOn) b.setAttribute('aria-haspopup', 'menu');
      b.dataset.key = `field-card:${c.id}`; b.dataset.side = c.controller ? 'opponent' : 'your'; b.dataset.zone = c.zone; b.dataset.index = String(c.index); if (c.zone === 'monster') b.dataset.position = c.position ?? 'attack';
      const choice = fieldPrompt?.options.find(o => o.cardId === c.id && !o.disabled), target = selection ?? choice;
      // the hand card whose command menu is open stands raised over the hand's edge, as live
      b.className = `de-card de-field-card${c.faceUp ? '' : ' de-card-back'}${p.rotate ? ' defense' : ''}${target ? ' de-card-target' : ''}${c.zone === 'hand' && c.controller === 0 && local.duelCmd === c.id ? ' raised' : ''}`; b.append(...Array.from(tile.childNodes)); if (target) b.title = target.label;
      placeFieldCard(b, c, handCount); fieldNodes.set(c.id, b);
      const counters = c.faceUp ? (c.counters ?? []).filter(counter => counter.count > 0) : [], turnCounter = c.faceUp ? c.turnCounter ?? 0 : 0;
      const counterText = counters.map(counter => `${counter.kind === 0 ? 'Spell counters' : `Counter ${counter.kind}`}: ${counter.count}`).join(', ');
      // With the original art the counters are its coin and hourglass badges (duel-counters.ts); without it, text badges.
      const badges = archive ? cardBadges(c, { image: path => archive(path) }) : null;
      if (badges) { b.append(badges); placeFieldCard(b, c, handCount); }
      else {
        if (counters.length) b.append(el('span', 'de-card-counter', counters.map(counter => counter.kind === 0 ? String(counter.count) : `${counter.kind}:${counter.count}`).join(' · ')));
        if (turnCounter > 0) b.append(el('span', 'de-card-turns', `Turns ${turnCounter}`));
      }
      b.setAttribute('aria-label', (c.faceUp ? `${c.name}, ${c.controller ? 'opponent' : 'your'} ${c.zone}, ${c.position ?? ''}${counterText ? `, ${counterText}` : ''}${turnCounter ? `, ${turnCounter} turns` : ''}` : ownSet ? `${c.name} (set face-down), your ${c.zone}${c.zone === 'monster' ? `, ${c.position ?? ''}` : ''}` : `Face-down card, ${c.controller ? 'opponent' : 'your'} ${c.zone}`) + (selection ? `, ${selection.label}` : ''));
      if (pileTop.has(`${c.controller}/${c.zone}`)) { b.append(el('span', 'de-card-count', String(duel.cards.filter(x => x.controller === c.controller && x.zone === c.zone).length))); placeFieldCard(b, c, handCount); }
      cards.append(b);
    }
    // Zone selections (where to summon or set, a zone the server asks for): the empty zones themselves are the controls, as in the original.
    for (const action of [...(duel.actions ?? []), ...fieldPrompt?.options ?? []].filter(a => a.place && !a.cardId)) {
      const p = fieldCardPosition({ id: action.id, name: '', controller: action.place!.controller, zone: action.place!.zone, index: action.place!.index, faceUp: false }, 0);
      const zone = button('', () => { if (fieldPrompt?.options.includes(action)) choose(action.id); else sendAction(duel, action.id); }, !!action.disabled || !!state.busy); zone.className = 'de-zone-target'; zone.dataset.key = `zone:${action.id}`; zone.setAttribute('aria-label', action.label); zone.title = action.label;
      zone.style.left = `${p.x / 1024 * 100}%`; zone.style.top = `${p.y / 768 * 100}%`; zone.style.width = `${76 / 1024 * 100}%`; zone.style.height = `${104 / 768 * 100}%`;
      cards.append(zone);
    }
    board.append(cards); effectsLayer = el('div', 'de-duel-effects'); effectsLayer.setAttribute('aria-hidden', 'true'); board.append(effectsLayer); presentEffects(duel); duelNpcSets(); duelScene.mount(board, duel, state.settings.reducedMotion);
    // Surrender (live: the player's deck's command) with no deck card left: the empty deck zone takes the click
    const ownDeckAt = fieldCardPosition({ id: DECK_ZONE, name: '', controller: 0, zone: 'deck', index: 0, faceUp: false }, 0);
    const deckZoneOn = !ownDeckTop && (canSurrender || !!duel.spectating || commands.has(DECK_ZONE));
    if (deckZoneOn) {
      const zone = button('', () => openCmd(local.duelCmd === DECK_ZONE ? null : DECK_ZONE)); zone.className = 'de-deck-zone'; zone.dataset.key = 'field-deck:0'; zone.dataset.side = 'your'; zone.dataset.zone = 'deck';
      zone.setAttribute('aria-label', 'Your deck (empty)'); zone.setAttribute('aria-haspopup', 'menu'); zone.oncontextmenu = event => { event.preventDefault(); openCmd(DECK_ZONE); };
      zone.style.left = `${ownDeckAt.x / 1024 * 100}%`; zone.style.top = `${ownDeckAt.y / 768 * 100}%`; zone.style.width = `${ownDeckAt.width / 1024 * 100}%`; zone.style.height = `${ownDeckAt.height / 768 * 100}%`;
      cards.append(zone);
    }
    // The open command list: main's duel.js CUSummonDialogSp (htmlui/duel-cmd.ts) over the card, built in duelSpecs from
    // what is gathered here: the card's commands in menu order, Surrender on the player's own deck (as live). A spectator
    // leaves the duel through a deck's list (its Surrender command), as nothing there is theirs to play
    const cmdCard = local.duelCmd && local.duelCmd !== DECK_ZONE ? duel.cards.find(x => x.id === local.duelCmd && visibleCardIds.has(x.id)) : undefined;
    const cmdAt = cmdCard ? { card: cmdCard, at: fieldCardPosition(cmdCard, handCounts[cmdCard.controller]) } : local.duelCmd === DECK_ZONE && deckZoneOn ? { card: null, at: ownDeckAt } : null;
    const cmdRows = cmdAt ? commands.get(cmdAt.card?.id ?? DECK_ZONE) ?? [] : [];
    const onDeck = !!cmdAt && (cmdAt.card ? cmdAt.card.id === ownDeckTop || !!duel.spectating && cmdAt.card.zone === 'deck' : true);
    // the deck's Surrender is one row (the server's own Surrender command, when its mask has one, is the same row)
    const rows: DuelCmdRow[] = cmdRows.filter(a => !(onDeck && canSurrender && menuCommand(a.id) === SURRENDER_COMMAND)).map(a => ({ cmd: menuCommand(a.id), text: a.label.replace(/:.*$/, ''), key: `duel-cmd:${a.id}`, label: a.label, disabled: !!a.disabled || !!state.busy, pick: () => { closeCmd(); if (promptChoices.has(a.id)) choose(a.id); else sendAction(duel, a.id); } }));
    if (onDeck && canSurrender) rows.push({ cmd: SURRENDER_COMMAND, key: 'duel-surrender', label: 'Surrender', disabled: !!state.busy || state.relay?.canAct === false, pick: surrenderNow });
    if (onDeck && duel.spectating) rows.push({ cmd: SURRENDER_COMMAND, key: 'duel-leave', label: 'Leave Duel', disabled: !!state.busy, pick: () => { closeCmd(); send({ type: 'leaveDuel' }); } });
    if (!cmdAt || !rows.length) { local.duelCmd = null; duelCmdView = null; }
    else {
      const readable = !!cmdAt.card && (cmdAt.card.faceUp || isOwnSetCard(cmdAt.card));
      duelCmdView = { at: { x: cmdAt.at.x, top: cmdAt.at.y - cmdAt.at.height / 2, hand: cmdAt.card?.zone === 'hand' }, rows, name: `${readable ? cmdAt.card!.name : cmdAt.card ? 'Card' : 'Deck'}: commands`, owner: cmdAt.card?.id ?? DECK_ZONE };
    }
    if ((duel.actions ?? []).some(a => a.id === 'cancel')) board.oncontextmenu = event => { if ((event.target as HTMLElement).closest('.de-field-card')) return; event.preventDefault(); sendAction(duel, 'cancel'); };
    // a field choice the server lets the player back out of (or finish: a discard, tributes): the right button, as live
    else if (fieldPrompt?.cancelable) board.oncontextmenu = event => { event.preventDefault(); respondToPrompt(fieldPrompt.id, { cancel: true }); };
    // live's bottom bar (the engine's duel menu strip): the wrench (the bar's config key, menuicon row 4) at its left,
    // which opens DUEL OPTIONS (CWindowModelDuelConfig, htmlui/options.ts) over the duel as live's does, and the help
    // line, which runs across its box from the right as live's does. Live shows no duel log on the duel screen (main's
    // chat.js hides the Duel Log tab): the log is kept for assistive technology only, never drawn
    const wrench = button('', () => { optionsUi = { kind: 'options' }; showHtml(); }); wrench.className = 'de-duel-wrench'; wrench.dataset.key = 'duel-options'; wrench.setAttribute('aria-label', 'DUEL OPTIONS'); wrench.title = 'DUEL OPTIONS';
    // the key's picture is the menu bar's (data/common/window/menuicon_02_c01.png: 80×32 cells, the wrench row 4,
    // columns normal / hover / pressed), as live's bar draws it; without the art a plain wrench glyph stands in
    const wrenchArt = controller.loadArchiveImage ? el('img', 'de-duel-wrench-art') as HTMLImageElement : null;
    if (wrenchArt) { wrenchArt.alt = ''; wrenchArt.draggable = false; wrenchArt.style.visibility = 'hidden'; wrenchArt.onload = () => { wrenchArt.style.visibility = ''; }; loadArchiveArt('data/common/window/menuicon_02_c01.png', wrenchArt); wrench.append(wrenchArt); wrench.classList?.add('has-art'); }
    else wrench.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21 6.5a5 5 0 0 1-6.9 4.6l-8 8a2 2 0 0 1-2.8-2.8l8-8A5 5 0 0 1 17.5 3l-3 3 .5 3 3 .5z"/></svg>';
    const helpText = duel.instruction ?? (duel.spectating ? 'Watching the duel.' : 'Click the left mouse button to confirm selection or the right mouse button to open menu.');
    const run = el('span', 'de-duel-help-run', helpText), help = el('div', 'de-duel-help', run); help.setAttribute('aria-label', helpText);
    if (local.helpText !== helpText) { local.helpText = helpText; local.helpFrom = performance.now(); }
    run.style.animationDelay = `${-(performance.now() - local.helpFrom) / 1000}s`;
    board.append(el('div', 'de-duel-bar', wrench, duelScene.fx.ringElement, help));
    const log = el('div', 'de-duel-log de-sr'); log.setAttribute('role', 'log'); log.setAttribute('aria-label', 'Duel log');
    for (const line of duel.log.slice(-80)) log.append(el('div', '', line)); board.append(log);
    // A spectator is neither side: the result names the winner instead of Victory/Defeat.
    const endedText = duel.ended && (duel.spectating && (duel.ended === 'Victory' || duel.ended === 'Defeat') ? `${duel.players[duel.ended === 'Victory' ? 0 : 1].name} wins` : duel.ended);
    if (endedText && htmlUi) {
      // main's result screen (duel-result.ts: CWindowResult) shows it; the result is still announced (assistive technology)
      const status = el('div', 'de-duel-end de-sr', endedText); status.setAttribute('role', 'status'); status.setAttribute('aria-label', endedText); stage.append(status);
      // live dims the whole field, its plates and bar behind the result board
      if (!state.replay) { const dim = el('div', 'de-result-dim'); dim.setAttribute('aria-hidden', 'true'); board.append(dim); }
    }
    const phase = endPhase();
    if (phase === 'banner' && !duel.spectating) {
      // data/y/duel_end: the word (m01) over its glow (m02), 352 x 128 drawn twice the size, centred on 512, 288
      const kind = duel.ended === 'Victory' ? 'win' : duel.ended === 'Defeat' ? 'lose' : 'drow';
      const banner = el('div', 'de-duel-end'); banner.setAttribute('aria-hidden', 'true');
      for (const layer of kind === 'win' || kind === 'lose' ? ['m02', 'm01'] : ['m01']) { const image = el('img', `de-duel-end-${layer}`); image.alt = ''; if (controller.loadArchiveImage) loadArchiveArt(`data/y/duel_end/duel_ef_${kind}_${layer}_e.png`, image); banner.append(image); }
      board.append(banner);
    } else if (phase === 'board' && state.match) {
      // between a match's games: its board (duel_match_dai_01, 472 x 200 at 274, 186), the duelists' names on their bars,
      // each game's mark (duel_match_mark_01: O / triangle / X / -, 62 x 58 cells, row 0 the player's blue, row 1 pink)
      const mb = el('div', 'de-match-board'); mb.setAttribute('role', 'status'); mb.setAttribute('aria-label', `Match: ${matchMarks.join(' ')}`);
      const img = (path: string, cls: string) => { const i = el('img', cls); i.alt = ''; if (controller.loadArchiveImage) loadArchiveArt(path, i); return i; };
      mb.append(img('data/y/duel/match/duel_match_dai_01.png', 'de-match-dai'));
      ([0, 1] as const).forEach(side => {
        mb.append(el('div', `de-match-name side-${side}`, duel.players[side].name));
        matchMarks.forEach((m, g) => {
          const mine = m === 'D' ? 'D' : side === 0 ? m : m === 'O' ? 'X' : 'O', col = { O: 0, D: 1, X: 2 }[mine as 'O' | 'D' | 'X'] ?? 3;
          const cell = el('div', `de-match-mark game-${g} side-${side}`); const sheet = img('data/y/duel/match/duel_match_mark_01.png', 'de-match-sheet');
          sheet.style.left = `${-col * 100}%`; sheet.style.top = `${-side * 100}%`; cell.append(sheet); mb.append(cell);
        });
      });
      board.append(mb);
    }
    if (duel.issue) { const issue = el('div', 'de-error de-notice de-duel-issue', duel.issue); issue.setAttribute('role', 'alert'); stage.append(issue); }
  }
  /** Server actions are bound to the prompt they were rendered for (a press can land after a newer prompt arrived). */
  function sendAction(duel: DuelView, actionId: string): void { send({ type: 'duelAction', actionId, ...(duel.actionsFor ? { promptId: duel.actionsFor } : {}) }); }
  function respondToPrompt(promptId: string, response: DuelResponse): void {
    const currentState = controller.getState(), current = currentState.duel?.prompt;
    if (!current || current.id !== promptId) { local.message = 'This choice has expired.'; requestRender(); return; }
    if (currentState.busy) return;
    const error = validatePromptResponse(current, response); if (error) { local.message = error; requestRender(); return; }
    send({ type: 'duelRespond', promptId, response });
  }
  function tradeReason(): string | undefined { return [...(state.lobby?.chat ?? [])].reverse().find(line => /^Trade cancelled:/.test(line.text))?.text; }
  function socialOptions() {
    return {
      card: (passcode: number) => controller.cardView?.(passcode) ?? { id: String(passcode), passcode, name: `Card ${passcode}` },
      drawCard: (card: CardView) => drawCard(card),
      friendList: state.social?.friends ?? [],
      onWhisper: (name: string) => { htmlUiState.chatDraft = `/w ${name} `; open('lobby'); },
      onDuel: (pid: number) => send({ type: 'duelChallenge', playerId: pid }),
    };
  }
  function render(): void {
    if (disposed || rendering) return; rendering = true;
    try {
      state = controller.getState();
      if (!state.preparation) jankenMine = null;   // each duel's rock-paper-scissors anew
      if (!state.match) { matchMarks = []; matchMarked = ''; }
      // the starter deck chooser: main's (web-shell/starter.js), from the lobby or Edit Deck like main's My Room / lobby / deck
      starterPicker.sync(state.mode !== 'free' && state.player ? state.player.id : null, state.starter?.claimable && (state.scene === 'lobby' || state.scene === 'deck') ? state.starter.decks : undefined);
      if (state.scene !== 'lobby') { Object.assign(lobbyUi, { open: null, searching: false, npc: null, join: null, cancel: false }); worldRenderer?.hide(); }
      const restoreDrafts = !resetDraftsNextRender; resetDraftsNextRender = false;
      if (state.scene === 'duel' && state.duel?.timer && !state.duel.timer.paused && !state.duel.ended) { if (duelClock === null) duelClock = setInterval(() => { const timer = controller.getState().duel?.timer; if (duelClockNode && timer) duelClockNode.textContent = `Time ${clockText(timer)}`; if (timer) lpPlates[timer.player]?.setTime(timeFraction(timer)); }, 250); } else if (duelClock !== null) { clearInterval(duelClock); duelClock = null; }
      if (state.scene === 'duel' && state.sideboarding?.deadline && !state.sideboarding.ready) { if (sideboardClock === null) sideboardClock = setInterval(() => requestRender(), 1000); } else if (sideboardClock !== null) { clearInterval(sideboardClock); sideboardClock = null; }
      const identity = `${state.scene}/${state.player?.id ?? 'none'}`;
      if (renderedIdentity !== identity || !restoreDrafts) { drafts.clear(); expanded.clear(); renderedIdentity = identity; }
      else for (const field of Array.from(host.querySelectorAll<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>('[data-key]'))) {
        if (['INPUT', 'TEXTAREA', 'SELECT'].includes(field.tagName) && !secretField(field) && !['checkbox', 'radio', 'range', 'file', 'button', 'submit'].includes(field.type)) drafts.set(field.dataset.key!, field.value);
      }
      for (const details of Array.from(host.querySelectorAll<HTMLDetailsElement>('details'))) if (details.dataset.key) expanded.set(details.dataset.key, details.open);
      fieldNodes.clear(); avatarNodes.clear(); effectsLayer = null; delete lpNodes[0]; delete lpNodes[1]; delete lpBars[0]; delete lpBars[1];
      observer?.disconnect(); for (const entry of art.values()) { entry.used = false; for (const image of entry.images) { image.onerror = null; image.onload = null; image.removeAttribute('src'); } entry.images.clear(); }
      if (!state.duel?.prompt) { local.promptId = null; local.selected.clear(); local.promptInspection = null; }
      const previousPromptId = local.promptId;
      const npcIdentity = state.npc && !['idle', 'duel'].includes(state.npc.stage) && ['lobby', 'duel'].includes(state.scene) ? `${state.scene}/${state.npc.npc?.id}/${state.npc.stage}` : '';
      const focusNpc = !!npcIdentity && npcIdentity !== renderedNpcIdentity; renderedNpcIdentity = npcIdentity;
      const active = document.activeElement as HTMLElement | null;
      const focusKey = active && host.contains(active) ? active.dataset.key : undefined;
      const editable = restoreDrafts && active && !secretField(active) && ['INPUT', 'TEXTAREA'].includes(active.tagName) ? active as HTMLInputElement | HTMLTextAreaElement : null;
      const selection = focusKey && editable ? { start: editable.selectionStart, end: editable.selectionEnd, value: editable.value, password: editable.type === 'password' } : null;
      header.replaceChildren(el('h1', '', 'Duel Evolution'));
      const status = el('div', 'de-status', el('span', `de-connection ${state.connection}`), state.player ? `${state.player.name}${state.player.level ? ` · Lv ${state.player.level}` : ''} · ` : '', state.mode === 'free' ? 'Free Duel · ' : '', state.status);
      status.setAttribute('role', 'status');
      stage.replaceChildren(); stage.setAttribute('aria-busy', String(!!state.busy)); host.dataset.scene = state.scene; host.dataset.motion = state.settings.reducedMotion ? 'reduced' : 'full';
      if (state.scene !== 'shop') { leaveShop = false; cardShop.dispose(); }
      else if (leaveShop && !state.busy) { leaveShop = false; queueMicrotask(() => open('lobby')); }
      if (state.scene !== 'title') titleScene?.hide();
      if (state.auth?.signedIn || state.scene !== 'title') loginUi.open = false;
      if (state.scene === 'lobby' || state.scene === 'title') deckFromTitle = false;
      if (freeTarget && state.mode === 'free' && state.connection === 'online' && state.player && !state.busy && state.scene !== 'deck' && state.scene !== 'characters') { freeTarget = null; deckFromTitle = true; queueMicrotask(() => open('deck')); }
      if (!available(state.scene)) unavailableScene(state.scene, state.scene === 'deck' ? 'Edit Deck' : state.scene[0].toUpperCase() + state.scene.slice(1));
      else switch (state.scene) { case 'title': renderTitle(); break; case 'characters': renderCharacters(); break; case 'lobby': renderLobby(); break; case 'deck': renderDeck(); break; case 'shop': renderShop(); break; case 'duel': if (state.sideboarding && !endPhase()) renderSideboarding(); else renderDuel(); break; }
      // the trade scene's ground under main's trade windows (htmlui/trade.ts) and its trunk (htmlui/trade-trunk.ts)
      if (state.socialDetail && tradeScene(state.socialDetail.trade) && !['title', 'characters'].includes(state.scene)) {
        const ground = el('section', 'de-trade-scene'); ground.setAttribute('aria-label', 'Card Swap'); deckBackdrop(ground); stage.append(ground);
      }
      if (state.tagLobby?.open && state.scene === 'lobby') stage.append(renderTagLobby(state.tagLobby, action => send({ type: 'tagAction', action })));
      // a lost connection: live's note at the page's bottom right while the game reconnects (loader.js), no veil
      netNote.set(!!state.net?.reconnecting || state.connection === 'reconnecting', state.net?.what === 'duel' || state.scene === 'duel');
      const message = state.error || local.message; if (message) { const notice = el('div', 'de-error de-notice de-sr-only', message); notice.setAttribute('role', 'alert'); stage.append(notice); }
      // main's menu bar and Main Menu (src/ui/htmlui: CWindowModelMenu, CMainMenu): main's entries where the rewrite has
      // the same thing, then the way back to a duel or the lobby, and
      // Return to Title (Disconnect). Before a character is chosen the bar is its strip alone, as on Select Player.
      const blocked = !!state.busy, sideboard = !!state.sideboarding;
      const go = (scene: Scene) => () => open(scene);
      const entries: MenuEntry[] = !state.player ? [] : [
        { label: 'Edit Deck', key: 'deck', disabled: blocked || sideboard, run: go('deck') },
        ...(state.profileDetail ? [
          { label: 'My Profile', key: 'profile', disabled: blocked || sideboard, run: () => { if (state.scene !== 'lobby') open('lobby'); send({ type: 'profileAction', action: { type: 'open', pid: state.player!.id } }); } },
          // Create Comment edits the player's own profile lines: it opens over that profile (the controller's rule)
          { label: 'Create Comment', key: 'comment', disabled: blocked || sideboard, run: () => { if (state.scene !== 'lobby') open('lobby'); const p = state.profileDetail; if (p?.selectedPid !== state.player!.id) send({ type: 'profileAction', action: { type: 'open', pid: state.player!.id } }); htmlUiState.comment = [p?.selectedPid === state.player!.id ? p.comments[0] ?? '' : '', p?.selectedPid === state.player!.id ? p.comments[1] ?? '' : '']; showHtml(); } },
          // Change Title (CWindowModelTitleConfig), live's My Room menu's, after My Profile
          ...(state.location === 'my-room' && state.titles ? [{ label: 'Change Title', key: 'change-title', disabled: blocked || sideboard, run: () => { titleUi = { selected: -1, top: 0 }; showHtml(); } }] : []),
        ] : []),
        // Return to your Room (the private My Room lobby) in the world; in My Room live has no way out in the menu (its doors
        // lead out) and offers Change Title instead (after My Profile)
        ...(state.mode !== 'free' && state.location === 'world' ? [
          { label: 'Return to your Room', key: 'my-room', disabled: blocked || sideboard || !!state.duel, run: () => { if (state.scene !== 'lobby') open('lobby'); send({ type: 'myRoom', enter: true }); } },
        ] : []),
        { label: 'DUEL OPTIONS', key: 'settings', disabled: blocked, run: () => { optionsUi = { kind: 'options' }; showHtml(); } },
        // live's free mode keeps the whole menu (its D-Mail, Duel Log and lists over the free lobby's session)
        ...([
          { label: 'D-Mail', key: 'mail', disabled: blocked || sideboard || !state.socialDetail, run: () => { htmlUiState.mail = { top: 0, selected: -1 }; send({ type: 'socialAction', action: { type: 'refreshMail' } }); showHtml(); } },
          // Duel Log (CWindowModelDuellogTop): Latest / Server Duel Logs, the Duel Log Collection
          { label: 'Duel Log', key: 'duellog', disabled: blocked || sideboard, run: () => { duellog = duellogUi(); loadDuellog(duellog.search, 1); } },
          // main's Audio page (htmlui/audio-page.ts: client/recomp/web/audiopage.js over the rewrite's audio manager), as live
          { label: 'Audio', key: 'audio', disabled: blocked || !state.audio, run: () => openAudioPage() },
          // live finds players from the player list and the map (no Find a Player window)
          // main's list windows (src/ui/htmlui: CWindowModelBlacklist / Friendlist / Teamlist) over the scene
          ...(state.socialDetail ? (['ignore', 'friends', 'team'] as const).map(kind => ({ label: { ignore: 'Ignore List', friends: 'Friend List', team: 'Team List' }[kind], key: kind === 'team' ? 'teams' : kind,
            disabled: blocked || sideboard, run: () => { htmlUiState.lists = { kind, selected: -1 }; if (kind === 'team') send({ type: 'socialAction', action: { type: 'refreshTeam' } }); if (kind === 'friends') loadPresence(); showHtml(); } })) : []),
        ]),
        ...((state.duel || sideboard) && state.scene !== 'duel' ? [{ label: 'Return to Duel', key: 'duel', disabled: blocked, run: go('duel') }] : []),
        // the way back from the rewrite's own scenes; in the lobby itself there is nothing to return to (live has no entry)
        ...(state.scene !== 'lobby' ? [{ label: 'Return to Lobby', key: 'lobby', disabled: blocked || sideboard, run: go('lobby') }] : []),
        // Return to Title stays available while busy: it is how a player abandons a request that never answers. Live
        // goes straight back to the title (no question first)
        ...(state.connection === 'online' ? [{ label: 'Return to Title', key: 'title', run: () => send({ type: 'disconnect' }) }] : []),
      ];
      // live's order (main's Main Menu over the 2008 engine, top to bottom): Edit Deck, My Profile, (My Room: Change Title,) Create Comment, DUEL
      // OPTIONS, D-Mail, Audio, Duel Log, Ignore / Friend / Team List, Return to your Room, Return to Title; the
      // rewrite's own entries after the lists, before the ways out
      // (My Room's: Edit Deck, My Profile, Change Title, Create Comment, ... Team List, Return to Title)
      const LIVE_ORDER = ['deck', 'profile', 'change-title', 'comment', 'settings', 'mail', 'audio', 'duellog', 'ignore', 'friends', 'teams', 'tournament', 'find', 'shop', 'my-room', 'duel', 'lobby', 'title'];
      const rank = (e: MenuEntry) => { const i = LIVE_ORDER.indexOf(e.key); return i < 0 ? LIVE_ORDER.length - 4 : i; };
      entries.sort((a, b) => rank(a) - rank(b));
      const world = state.scene === 'lobby' && state.lobby;
      // the deck editor's bar is its strip alone, as on main (the editor's EXIT leaves it); the shop's bar is its strip (main's capture): Exit Store leaves.
      // Select Player's bar is its strip alone too, also in the moment between picking a character (its profile in) and the lobby
      // main's message field starts past the Wardrobe / Missions slots (lobby.js fieldLeft): the message moves with it
      const reserve = barReserve(), fieldShift = reserve ? Math.max(0, Math.min(1016 - 64, reserve + 8) - 391) : 0;
      // (Card Swap's bar is its strip alone, as live: EXIT leaves the trade; live's shop and its pack reveal stand over no
      // bar: the shop page runs to the strip at its foot)
      // the sign-in window stands over the bar's empty strip, as live's CWindowLogin over CWindowModelMenu
      const trading = !!state.socialDetail && tradeScene(state.socialDetail.trade) && !['title', 'characters'].includes(state.scene);
      // (the reward scenes' bar is its strip, the pack pick's help line the picked pack's description, as live)
      const reward = rewardScene(), pickedPack = reward && npcPackOpen(state.npc) ? state.npc.packs[npcPack.selected] : undefined;
      menuView = state.scene === 'title' && !showsLogin() || state.scene === 'duel' || state.scene === 'shop' ? null : { entries, fieldShift, keys: !!state.player && !['deck', 'shop', 'characters'].includes(state.scene) && !trading && !reward, room: !!world && state.location === 'my-room',
        // live's bar message is blank but for a pending request's wait (no "Online in Duel Academy.")
        message: reward ? (pickedPack !== undefined ? state.packInfo?.[pickedPack]?.description ?? '' : '') : state.player ? (world && waitingMessage({ state, text: id => gameTexts.get(id) })) || '' : '',
        mainOpen: () => { const p = state.profileDetail; return !!(htmlUiState.mail || htmlUiState.compose || htmlUiState.lists || htmlUiState.comment || optionsUi?.kind === 'options' || duellog || titleUi
          || p && p.selectedPid !== null && p.selectedPid === p.selfPid); },
        // My Room's bar has Main Menu, Wardrobe and Missions only (no Duel, no Move), as live
        ...(world && state.location !== 'my-room' ? { duel: () => { duelKey(state, lobbyUi); showHtml(); }, move: () => { moveKey(lobbyUi); showHtml(); }, duelOpen: () => ['duel', 'find', 'wait'].includes(lobbyUi.open ?? ''), moveOpen: () => lobbyUi.open === 'move' } : {}) };
      nav.replaceChildren(status);
      // Extension panels also get stable keyboard focus when their data changes.
      for (const tag of ['button', 'input', 'textarea', 'select']) for (const [i, control] of Array.from(host.querySelectorAll<HTMLElement>(tag)).entries()) {
        if (!control.dataset.key && !secretField(control)) control.dataset.key = `focus:${tag}:${i}:${control.getAttribute('aria-label') ?? control.textContent?.slice(0, 80) ?? ''}`;
      }
      const detailsKeys = new Set<string>();
      for (const [i, details] of Array.from(host.querySelectorAll<HTMLDetailsElement>('details')).entries()) {
        if (!details.dataset.key) details.dataset.key = `details:${i}:${details.querySelectorAll('summary')[0]?.textContent ?? ''}`;
        detailsKeys.add(details.dataset.key); if (expanded.has(details.dataset.key)) details.open = expanded.get(details.dataset.key)!;
      }
      for (const key of expanded.keys()) if (!detailsKeys.has(key)) expanded.delete(key);
      const retainedKeys = new Set<string>();
      for (const field of Array.from(host.querySelectorAll<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>('[data-key]'))) {
        const key = field.dataset.key!; retainedKeys.add(key);
        if (['INPUT', 'TEXTAREA', 'SELECT'].includes(field.tagName) && !secretField(field) && !['checkbox', 'radio', 'range', 'file', 'button', 'submit'].includes(field.type) && drafts.has(key)) {
          const value = drafts.get(key)!;
          if (field.tagName !== 'SELECT' || Array.from((field as HTMLSelectElement).options).some(o => o.value === value)) field.value = value;
        }
      }
      for (const key of drafts.keys()) if (!retainedKeys.has(key)) drafts.delete(key);
      if (focusKey) {
        const next = Array.from(host.querySelectorAll<HTMLElement>('[data-key]')).find(x => x.dataset.key === focusKey);
        if (next) { const field = next as HTMLInputElement | HTMLTextAreaElement; if (selection && !selection.password) field.value = selection.value; next.focus({ preventScroll: true }); if (selection?.start !== null && selection?.start !== undefined && selection.end !== null) { try { field.setSelectionRange(selection.start, selection.end); } catch { /* number inputs do not support text selection */ } } }
      }
      if (state.duel?.prompt && previousPromptId !== state.duel.prompt.id) {
        const first = Array.from(host.querySelectorAll<HTMLElement>('[data-key]')).find(x => x.dataset.key?.startsWith('prompt-') && !(x as HTMLButtonElement).disabled);
        first?.focus({ preventScroll: true });
      }
      // DUEL OPTIONS' Auto Tracking ("the cursor will automatically track any card that can be targetted or activated"):
      // a new board choice takes the focus to the first card or zone it can act on; OFF leaves the focus where it was
      const actionsFor = state.scene === 'duel' ? state.duel?.actionsFor ?? null : null;
      if (actionsFor && actionsFor !== trackedActionsFor && duelOptions(state.settings).autoTracking)
        host.querySelector<HTMLElement>('.de-card-target:not(:disabled), .de-zone-target:not(:disabled), .de-field-card[data-side="your"][aria-haspopup="menu"]')?.focus({ preventScroll: true });
      trackedActionsFor = actionsFor;
      if (focusNpc) Array.from(host.querySelectorAll<HTMLElement>('[data-key]')).find(x => x.dataset.key?.startsWith('npc:') && !(x as HTMLButtonElement).disabled)?.focus({ preventScroll: true });
    } finally { pruneArt(); rendering = false; }
    showHtml();
  }
  host.onkeydown = e => {
    if (e.key !== 'Escape') return;
    if (browserDisplay.state.active) return;
    if (htmlUiState.menu) { e.preventDefault(); htmlUiState.menu = false; showHtml(); return; }
    if (state.scene === 'duel' && local.duelCmd !== null) { e.preventDefault(); closeCmd(); return; }
    if (npcEscape(e)) return;
    // DUEL OPTIONS / Audio (a modal over the scene): its language error first, then the window
    if (optionsUi) { e.preventDefault(); const refused = state.languageStatus?.error; if (refused && refused !== languageErrorSeen) languageErrorSeen = refused; else { const before = optionsUi.kind === 'title' ? optionsUi.before?.sound : undefined; if (before !== undefined && before !== state.settings.sound) send({ type: 'settings', settings: { sound: before } }); optionsUi = null; } showHtml(); return; }
    if (state.duel?.prompt?.cancelable && state.scene === 'duel') { e.preventDefault(); respondToPrompt(state.duel.prompt.id, { cancel: true }); }
    else if (state.scene === 'lobby' && state.profileDetail?.selectedPid !== null && state.profileDetail?.selectedPid !== undefined) { e.preventDefault(); send({ type: 'profileAction', action: { type: 'close' } }); }
    else if (state.scene === 'deck' && (deckScene.ui.dialog || deckScene.ui.files)) { e.preventDefault(); deckScene.ui.dialog = null; deckScene.ui.files = null; showHtml(); }
    else if (local.inspected && state.scene === 'duel') { e.preventDefault(); local.inspected = null; requestRender(); }
    else if (state.scene !== 'duel' && !['title', 'lobby', 'characters'].includes(state.scene)) open(state.player ? 'lobby' : 'title');
  };
  // With nothing focused, keys go to <body>, outside the host: Escape still closes the topmost modal.
  const bodyKeys = (e: KeyboardEvent): void => { if (e.target === document.body || e.target === document.documentElement) host.onkeydown?.(e);
    else if (e.target instanceof Node && htmlUi?.host?.contains(e.target)) npcEscape(e); };
  globalThis.document?.addEventListener?.('keydown', bodyKeys);
  const unsubscribe = controller.subscribe(next => { if (!disposed && !queued && canSkipRender(state, next)) { state = next; return; } if (!disposed && !queued && canPresentLobby(state, next)) { state = next; presentLobby(next.lobby!); return; } if (!disposed && !queued && canPresent(state, next)) { state = next; present(next.duel!); } else requestRender(); }); render();
  return { render, htmlUi: htmlDriver, dispose() { if (disposed) return; disposed = true; netNote.dispose(); globalThis.removeEventListener?.('pointermove', cmdPointer, true); globalThis.removeEventListener?.('pointerdown', cmdPress, true); duelSpeedButton.dispose(); starterPicker.close(); discord.dispose(); cardShop.dispose(); pageMods.dispose(); offReserve(); deckDom?.dispose(); deckDom = null; tradeDom?.dispose(); tradeDom = null; swapDom?.dispose(); swapDom = null; cardGetDom?.dispose(); cardGetDom = null; deckScene.dispose(); if (thinkingTimer !== null) { clearInterval(thinkingTimer); thinkingTimer = null; } htmlUi?.dispose(); htmlUi = null; pictureArt.dispose(); setPictureResolver(null); disposePictures(); startScene?.dispose(); startScene = null; titleScene?.dispose(); titleScene = null; portraitScene?.dispose(); portraitScene = null; globalThis.removeEventListener?.('yo2-tag-lobby-open', onTagDuel); globalThis.removeEventListener?.(VEIL_EVENT, onVeil); globalThis.document?.removeEventListener?.('keydown', bodyKeys); if (duelClock !== null) { clearInterval(duelClock); duelClock = null; } host.removeEventListener?.('pointerdown', holdPointer, true); globalThis.removeEventListener?.('pointerup', releasePointer, true); globalThis.removeEventListener?.('pointercancel', releasePointer, true); if (pointerTimer) clearTimeout(pointerTimer); if (sideboardClock !== null) { clearInterval(sideboardClock); sideboardClock = null; } unsubscribe(); browserDisplay.dispose(); worldWalk?.dispose(); worldWalk = null; phone?.dispose(); duelScene.dispose(); observer?.disconnect(); worldRenderer?.dispose(); header.replaceChildren(); stage.replaceChildren(); nav.replaceChildren(); for (const entry of art.values()) { entry.abort.abort(); for (const image of entry.images) image.removeAttribute('src'); entry.images.clear(); entry.lease?.release(); entry.lease = null; } art.clear(); fieldNodes.clear(); avatarNodes.clear(); effectsLayer = null; drafts.clear(); expanded.clear(); delete lpNodes[0]; delete lpNodes[1]; delete lpBars[0]; delete lpBars[1]; closeAudioPage(); packSheet?.close(); packSheet = null; gameCursor?.dispose(); gameCursor = null; host.onkeydown = null; header.replaceChildren(); stage.replaceChildren(); nav.replaceChildren(); host.replaceChildren(); host.remove(); local.selected.clear(); local.inspected = null; local.promptInspection = null; } };
}
