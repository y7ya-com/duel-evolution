import type { DuelCardView, DuelView, CardView, ClientCommand, ClientController, ClientView, DeckZone, DuelPromptView, DuelResponse, Scene } from './contracts';
import { sideboardDifference } from './deck';
import { FIELD_LAYOUT, fieldCardPosition, filterCollection, sortCollection, gamePoint, safeImageUrl, validatePromptResponse } from './helpers';
import { DuelPresentation } from './duel-scene';
import { AnnouncePanel, ANNOUNCE_CSS } from './duel-announce';
import { cardBadges, BADGE_CSS } from './duel-counters';
import { WorldRenderer } from './world';
import { AvatarView } from './avatar';
import { renderNpcFeature } from './npc';
import { giftItemName } from '../npcs/gift-names';
import { BrowserDisplaySettings, browserFullscreenAdapter } from './settings-browser';
import { mountPhoneStage, holdToWalk, type PhoneStage, type HoldWalk } from './phone';
import { CLIENT_CSS } from './styles';
import { SKIN_CSS } from './skin';
import { renderAccountFeature } from './extra/account';
import { renderAudioFeature } from './extra/audio';
import { audioWindow, optionsWindow, type AudioUi, type OptionsDeps, type OptionsUi } from './htmlui/options';
import { isAudioPackItem, readAudioPack } from '../features/audio-pack';
import { AUDIO_FILE_LIMITS } from '../features/audio';
const AUDIO_ACCEPT = 'audio/*,.mp3,.m4a,.aac,.wav,.flac,.aiff,.aif,.ogg,.opus';
const AUDIO_PACK_ACCEPT = `.zip,application/zip,${AUDIO_ACCEPT},.json`;
import type { AudioAction } from '../features/audio';
import { renderLanguageSettings } from './extra/language';
import { renderTradeTrunk } from './extra/social';
import { renderTagLobby, TAG_CSS } from './extra/tag';
import { renderCardGet, cardGetClosed, CARD_GET_CSS } from './extra/card-get';
import { accessoryName } from './extra/wallet';
import { renderCosmeticsShop, COSMETICS_CSS } from './extra/cosmetics';
import { freeChoices } from './htmlui/avatar';
import { Ids } from './htmlui/snapshot';
import type { ControlHandlers, WindowSpec } from './htmlui/snapshot';
import { htmlUiLocal, htmlWindows, stockDialog, DELETE_TEXT } from './htmlui/windows';
import { UiText, localizeSpecs } from '../features/ui-text';
import { titleConfigWindow } from './htmlui/title-config';
import { StarterPicker } from './htmlui/starter';
import { duellogUi, duellogWindow, fetchDuellog, type DuellogUi } from './htmlui/duellog';
import type { TitleConfigUi } from './htmlui/title-config';
import { bracketWindow, duelHelpStrip, eventKey, informationWindow, joinGunslingWindow, resultWindow, tournamentUi } from './htmlui/tournament';
import { discordWire } from './htmlui/discord-wire';
import { lobbyLocal, lobbyList, lobbyWindows, duelKey, moveKey, waitingMessage, LOBBY_TEXT, AREA_TEXT } from './htmlui/lobby';
import type { CardActions, MailBox, MenuEntry, MenuView, SocialLists } from './htmlui/windows';
import type { HtmlUiLayer } from './htmlui/layer';
import { GameCursor } from './htmlui/cursor';
import { fetchPackCompletion, npcPackOpen, npcPackSelect, npcPackUi } from './htmlui/npc-pack';
import { DeckScene } from './htmlui/deck-scene';
import { DeckDom } from './htmlui/deck-dom';
import { shopLocal, shopWindows } from './htmlui/shop';
import { cardShopHost } from './htmlui/card-shop';
import { pageModules } from './htmlui/page-modules';
import { tradeLocal, tradeWindows, tradeScene, trunkOpen } from './htmlui/trade';
import { deckBackdrop } from '@htmlui/screens/deck.js';
import { PictureArt } from './htmlui/art';
import { setPictureResolver, disposePictures } from './htmlui/pictures';
import { StartScene } from './htmlui/start-scene';
import { duelDialog, duelDialogCovers, duelSpeedWindow, loadDuelSpeed, nextDuelSpeed } from './htmlui/duel-dialogs';
import { duelResultWindows, preparationDialog, type PrepChoice } from './htmlui/duel-result';
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
  tradeSearch: string;
  message: string; inspected: CardView | null; inspectedFrom: DeckZone | 'collection' | 'duel';
  promptInspection: CardView | null; promptId: string | null; selected: Set<string>;
  sideboardRound: number | null; sideboardMain: number | null; sideboardSide: number | null; roomOptions: { style?: 3 | 4; allowSurrender?: boolean; timeLimit?: boolean; allowWatch?: boolean }; roomPassword: string; username: string; characterName: string; characterSlot: number; 
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
  const local: LocalState = { message: '', inspected: null, inspectedFrom: 'collection', promptInspection: null, promptId: null, selected: new Set(), sideboardRound: null, sideboardMain: null, sideboardSide: null, roomOptions: {}, roomPassword: '', username: '', characterName: '', characterSlot: 0, noticeSeen: 0, tradeSearch: '', logScroll: null };
  const host = el('section', 'de-client'); host.setAttribute('aria-label', 'Duel Evolution');
  const css = el('style'); css.textContent = CLIENT_CSS + TAG_CSS + SKIN_CSS + ANNOUNCE_CSS + BADGE_CSS;
  const header = el('header', 'de-top'), stage = el('main', 'de-stage'), nav = el('nav', 'de-nav'); nav.setAttribute('aria-label', 'Game menu');
  const extraCss = el('style'); extraCss.textContent = CARD_GET_CSS + COSMETICS_CSS;
  host.append(css, extraCss, header, stage, nav); root.append(host);
  // phones and tablets: live's stage.js (the frame fitted to the visible viewport, the rotate prompt, first-tap fullscreen)
  // a finger held on the world (or the right button) walks toward it, steered by moving (live: the held right button);
  // on the stage, which outlives the lobby's redraws, so a long walk survives them
  const walkTo = (x: number, y: number): void => {
    const current = controller.getState(), lobby = current.lobby, canvas = stage.querySelector('canvas[data-key="lobby-map"]') as HTMLCanvasElement | null;
    if (current.scene !== 'lobby' || !lobby?.connected || current.busy || !canvas) return;
    const useScene = !!worldRenderer && lobby.mapId !== undefined; if (useScene && !worldRenderer!.ready) return;
    const p = useScene ? gamePoint(x, y, worldRenderer!.element.getBoundingClientRect()) : gamePoint(x, y, canvas.getBoundingClientRect(), lobby.width ?? 1024, lobby.height ?? 768);
    if (p) { const target = useScene ? worldRenderer!.screenToWorld(p) : p; send({ type: 'move', x: Math.round(target.x), y: Math.round(target.y) }); }
  };
  let worldWalk: HoldWalk | null = null;
  // main's Legacy HTML UI screens (src/ui/htmlui): Select Player, the chat ... drawn by main's own modules from
  // snapshots the rewrite builds; browser only (the layer needs a real document)
  const htmlUiState = htmlUiLocal(), htmlIds = new Ids(), lobbyUi = lobbyLocal();
  let startScene: StartScene | null = null;
  let htmlUi: HtmlUiLayer | null = null;
  let gameCursor: GameCursor | null = null;
  let menuView: MenuView | null = null;
  // (after htmlUi: the first fit runs at once and re-places the layer)
  const phone: PhoneStage | null = typeof document !== 'undefined' && document.body && typeof matchMedia === 'function' ? mountPhoneStage({ host, stage, onFit: () => htmlUi?.relayout() }) : null;
  const profileActions = (): { label: string; key: string; run(): void; disabled?: boolean }[] => {
    const p = state.profileDetail; if (!p || p.selectedPid === null) return [];
    const pid = p.selectedPid;
    if (p.selfPid === pid) return [
      { label: 'Comment', key: 'comment', disabled: p.pending !== null, run: () => { htmlUiState.comment = [p.comments[0] ?? '', p.comments[1] ?? '']; showHtml(); } },
      { label: 'Clear Title', key: 'clear-title', disabled: p.pending !== null, run: () => send({ type: 'profileAction', action: { type: 'setTitle', bit: 224 } }) },
      // Change Avatar (main's screens/avatar.js, htmlui/avatar.ts) on the player's own look; cosmetic items are main's Wardrobe's
      ...(state.mode !== 'free' && state.online ? [{ label: 'Change Avatar', key: 'appearance', run: () => { send({ type: 'profileAction', action: { type: 'close' } }); openChangeAvatar(); } }] : []),
    ];
    return [];
  };
  /** Change Avatar from the game: the server's look (one for both worlds), its owned parts, saved on Confirm. */
  const openChangeAvatar = () => {
    const self = state.lobby?.avatars.find(a => a.self), look = state.online?.cosmetics?.appearance.parts ?? (self?.parts?.length === 16 ? Array.from(self.parts) : null);
    send({ type: 'onlineAction', action: { type: 'refresh' } });
    if (!look) { local.message = 'Your avatar has not loaded yet.'; requestRender(); return; }
    htmlUiState.dialog = { kind: 'avatar', slot: null, look: [...look], category: 0, page: 0 }; showHtml();
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
      const gender = look[0] === 1 ? 'female' : 'male';
      // a body change first (the server re-dresses the other body), the parts after it
      if (data && data.appearance.gender !== gender) send({ type: 'onlineAction', action: { type: 'appearance', gender } });
      else send({ type: 'onlineAction', action: { type: 'appearance', world: data?.appearance.world ?? 0, parts: look } });
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
      ...(state.socialDetail ? { friend: social('inviteFriend'), trade: social('inviteTrade'), team: social('inviteTeam'), ignore: social('ignore'),
        mail: () => { close(); htmlUiState.compose = { toPid: pid, toName: name, subject: '', body: '' }; showHtml(); } } : {}),
      ...(name ? { whisper: () => { htmlUiState.chatDraft = `/w ${name} `; close(); } } : {}),
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
      // Find a Player (CWindowModelFriendEnum) and Ignore by name (CWindowModelBlacklistInput)
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
  let deckDom: DeckDom | null = null, deckFile: HTMLInputElement | null = null;
  const deckScene = new DeckScene({ state: () => state, send: command => send(command), rerender: () => showHtml(), leave: () => open('lobby'),
    notice: message => { local.message = message; requestRender(); },
    pickFile: (accept, then) => {
      deckFile ??= Object.assign(el('input'), { type: 'file' }); deckFile.accept = accept; deckFile.setAttribute('aria-label', 'Import YDC, YDK or JSON deck');
      deckFile.hidden = true; if (!deckFile.isConnected) host.append(deckFile);
      deckFile.onchange = () => { const file = deckFile?.files?.[0]; if (deckFile) deckFile.value = ''; if (file) then(file); };
      deckFile.click();
    } });
  // the shop (src/ui/htmlui/shop.ts): main's CShop* windows over the rewrite's pictures (htmlui/art.ts); the card-get
  // reveal and the rewrite's own cosmetic departments are the rewrite's panels over the scene, the windows set aside
  const shopUi = shopLocal(); let shopCosmetics: 'boxes' | 'wardrobe' | null = null, shopScene = false;
  // online, the shop is main's new card shop (htmlui/card-shop.ts: shop/index.js mountCardShop, which calls the server's
  // /api/de/shop itself); offline (the local catalogue) keeps main's older CShop* windows below
  // Back on the card shop leaves at once; while the app is still busy (opening the shop refreshes the catalogue, the wallet
  // and the cosmetics behind the shop, which draws itself from /api/de/shop first) it leaves as soon as that finishes,
  // rather than refusing the player with "Wait for the current action to finish."
  let leaveShop = false;
  const leaveCardShop = () => { if (state.busy) { leaveShop = true; requestRender(); } else open('lobby'); };
  const cardShop = cardShopHost(globalThis.document, leaveCardShop, e => { local.message = e instanceof Error ? e.message : 'The card shop could not be loaded.'; requestRender(); });
  // main's Wardrobe and Missions buttons on the menu bar and the trade's Cosmetics panel (htmlui/page-modules.ts), online
  const pageMods = pageModules({ online: () => !!state.online && state.connection === 'online' && state.mode !== 'free',
    overworld: () => state.scene === 'lobby' && !!state.player && htmlUiState.dialog?.kind !== 'avatar',
    trade: () => !!state.socialDetail && tradeScene(state.socialDetail.trade) && !['title', 'characters'].includes(state.scene) });
  const useCardShop = () => state.scene === 'shop' && !!state.online && state.connection === 'online' && !(globalThis as { YO2_LEGACY_SHOP?: boolean }).YO2_LEGACY_SHOP;
  const pictureArt = new PictureArt({ ...(controller.loadArchiveImage ? { loadArchiveImage: controller.loadArchiveImage.bind(controller) } : {}), ...(controller.loadCardImage ? { loadCardImage: controller.loadCardImage.bind(controller) } : {}) });
  setPictureResolver(pictureArt.resolve);
  // the trade (src/ui/htmlui/trade.ts): main's trade windows and dialogs over any scene but the title and Select Player
  const tradeUi = tradeLocal();
  const tradeSpecs = (): WindowSpec[] => {
    const sd = state.socialDetail; if (!sd || sd.trade.phase === 'idle' || ['title', 'characters'].includes(state.scene)) return [];
    const reason = tradeReason();
    return tradeWindows({ trade: sd.trade, ui: tradeUi, ids: htmlIds, dispatch: action => send({ type: 'socialAction', action }), rerender: showHtml,
      name: passcode => socialOptions().card?.(passcode).name ?? `Card ${passcode}`, status: sd.status, ...(reason ? { reason } : {}) });
  };
  // Change Title (CWindowModelTitleConfig) over the scene, opened from the Main Menu
  let titleUi: TitleConfigUi | null = null;
  const titleSpecs = (): WindowSpec[] => {
    if (!titleUi || !state.player || !state.titles || state.scene === 'duel' || state.scene === 'title') { titleUi = null; return []; }
    const p = state.profileDetail;
    return [titleConfigWindow(htmlIds, titleUi, { titles: state.titles, current: p?.selfPid === p?.selectedPid ? p?.comments[1] ?? undefined : undefined, busy: !!state.busy || p?.pending != null,
      wear: bit => send({ type: 'profileAction', action: { type: 'setTitle', bit } }), close: () => { titleUi = null; showHtml(); }, rerender: () => showHtml() })];
  };
  // Duel Log (CWindowModelDuellogTop / List / Search) over the scene, opened from the Main Menu: GET /api/de/duellog
  let duellog: DuellogUi | null = null, duellogAsk = 0;
  const loadDuellog: (search: DuellogUi['search'], page: number) => void = (search, page) => {
    const ui = duellog; if (!ui) return;
    const ask = ++duellogAsk; ui.loading = true; ui.error = null; showHtml();
    void fetchDuellog(search, page).then(out => {
      if (duellog !== ui || ask !== duellogAsk) return;
      ui.loading = false;
      if ('error' in out) ui.error = out.error; else { ui.data = out; ui.page = out.page; }
      showHtml();
    });
  };
  const duellogSpecs = (): WindowSpec[] => {
    if (!duellog || !state.player || state.scene === 'duel' || state.scene === 'title' || state.connection !== 'online') { duellog = null; return []; }
    return [duellogWindow(htmlIds, duellog, { load: loadDuellog, close: () => { duellog = null; showHtml(); }, rerender: () => showHtml() })];
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
  const npcPackSpecs = (): WindowSpec[] => { if (!htmlUi || !['lobby', 'duel'].includes(state.scene)) return [];
    const spec = npcPackSelect(state.npc, { ids: htmlIds, ui: npcPack, packName: id => state.packNames?.[id], completion: packCompletion, busy: !!state.busy, rerender: () => showHtml(), contents: openContents,
      send: command => { if (npcPackOpen(controller.getState().npc)) send(command); } });
    return spec ? [spec] : []; };
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
  const optionsSpecs = (): WindowSpec[] => {
    if (!optionsUi || state.scene === 'title' || state.scene === 'settings') { optionsUi = null; return []; }
    const display = browserDisplay.state, a = state.audio;
    const deps: OptionsDeps = { settings: state.settings, busy: !!state.busy, languageReady: !!state.languageStatus?.available && !state.languageStatus.loading,
      fullscreen: { active: display.active, supported: display.supported, pending: display.pending, toggle: () => { void browserDisplay.toggle(); } },
      ...(a ? { audio: { music: a.music, sound: a.sound, activated: a.activated, slots: a.slots }, audioAction: (action: AudioAction) => send({ type: 'audioAction', action }) } : {}),
      set: settings => send({ type: 'settings', settings }), more: () => { optionsUi = null; open('settings'); }, close: () => { optionsUi = null; showHtml(); } };
    const out = [optionsUi.kind === 'audio' ? audioWindow(htmlIds, { ...deps, ui: audioUi, rerender: showHtml, pickPack: () => pickFiles(AUDIO_PACK_ACCEPT, openAudioPack),
      pickSlotFiles: slot => pickFiles(AUDIO_ACCEPT, files => { audioUi.message = undefined; send({ type: 'audioAction', action: { type: 'set-slot-files', slot, files: files.slice(0, AUDIO_FILE_LIMITS.perSlot) } }); }) }) : optionsWindow(htmlIds, deps)];
    // a language that could not load (CSystemConfigManager::applyLanguage refused): main's error dialog over DUEL
    // OPTIONS; the previous language stays and < / > choose it again
    const refused = state.languageStatus?.error;
    if (refused && refused !== languageErrorSeen) {
      const dialog = stockDialog({ ids: htmlIds }, 'language-error', 'error', refused, [{ from: 'OK', key: 'language-error-ok', click: () => { languageErrorSeen = refused; showHtml(); } }]);
      Object.assign(dialog.win, { z: 51503 }); out.push(dialog);   // over DUEL OPTIONS (51453)
    }
    else if (!refused) languageErrorSeen = '';
    return out;
  };
  let languageErrorSeen = '';
  // The Audio window's pack flow (live's audiopage.js): a pack picked or dropped anywhere on the game is read
  // (features/audio-pack.ts) and reviewed in the Audio window; nothing changes until the player uses it.
  const audioUi: AudioUi = { page: 0 };
  let packDragOver: ((event: Event) => void) | null = null, packDropped: ((event: Event) => void) | null = null;
  const pickFiles = (accept: string, done: (files: File[]) => void) => {
    const input = document.createElement('input'); input.type = 'file'; input.multiple = true; input.accept = accept;
    input.onchange = () => { const files = [...(input.files ?? [])]; if (files.length) done(files); };
    input.click();
  };
  const openAudioPack = (files: File[]) => {
    audioUi.message = 'Reading the pack…'; audioUi.review = null; optionsUi = { kind: 'audio' }; showHtml();
    void readAudioPack(files).then(plan => { audioUi.review = plan; audioUi.message = undefined; }, error => { audioUi.message = error instanceof Error ? error.message : String(error); })
      .finally(() => { if (optionsUi?.kind === 'audio') showHtml(); });
  };
  if (typeof document !== 'undefined' && typeof document.addEventListener === 'function') {
    const packDrop = (event: DragEvent) => [...(event.dataTransfer?.files ?? [])].some(file => /\.zip$/i.test(file.name) || /zip/.test(file.type));
    packDragOver = event => { if (state.audio && htmlUi && packDrop(event as DragEvent)) event.preventDefault(); };
    packDropped = event => {
      const e = event as DragEvent;
      if (!state.audio || !htmlUi || !state.player || !packDrop(e)) return;
      e.preventDefault(); openAudioPack([...(e.dataTransfer?.files ?? [])].filter(file => isAudioPackItem(file.name, file.type)));
    };
    document.addEventListener('dragover', packDragOver); document.addEventListener('drop', packDropped);
  }
  const sceneWindows = (): WindowSpec[] => [...shopSpecs(), ...tradeSpecs(), ...npcPackSpecs(), ...titleSpecs(), ...optionsSpecs(), ...duellogSpecs(), ...tournamentSpecs(), ...duelSpecs(), ...prepSpecs()];
  // The duel's question dialogs (main's screens/duel.js: htmlui/duel-dialogs.ts) and the duel speed button (main's
  // duelspeed.js) while the layer is up; card lists, free number entry and declarations stay the duel screen's panel.
  let duelSpeed = loadDuelSpeed(), duelHover: { selected: Set<string>; hover?: string | null; draft?: string; page?: number } = { selected: new Set(), hover: null };
  const htmlDuelPrompt = (prompt: DuelPromptView | null | undefined): boolean => !!htmlUi && !!prompt && duelDialogCovers(prompt) && !state.preparation;
  // Janken, who goes first, Start Duel: main's duel.js dialog look (htmlui/duel-result.ts preparationDialog)
  const prepChoice = (): PrepChoice | null => {
    const prep = state.preparation; if (!prep || state.sideboarding) return null;
    const phase = prep.phase.toLowerCase(), seen = prep.opponentHand !== undefined && prep.opponentHand !== null ? ` Opponent chose ${['Rock', 'Scissors', 'Paper'][prep.opponentHand!] ?? 'an unknown hand'}.` : '';
    if (prep.role === 'partner' || prep.role === 'spectator') return { text: prep.role === 'partner' ? 'Your captain is preparing the duel…' : 'Waiting for duel preparation…', buttons: [] };
    if (/rps|hand|rock|scissors/.test(phase) && !/wait|result/.test(phase)) return { text: `Choose your hand.${seen}`, buttons: (['Rock', 'Scissors', 'Paper'] as const).map((label, hand) => ({ id: label.toLowerCase(), label, act: () => send({ type: 'chooseHand', hand: hand as 0 | 1 | 2 }) })) };
    if (/first|order|turn/.test(phase) && !/wait|result/.test(phase)) return { text: `You won! Choose who goes first.${seen}`, buttons: [{ id: 'first', label: 'Go First', act: () => send({ type: 'chooseFirst', first: true }) }, { id: 'second', label: 'Go Second', act: () => send({ type: 'chooseFirst', first: false }) }] };
    if (/ready|begin|confirm|invitation/.test(phase)) return { text: `Duel Preparation${seen}`, buttons: [{ id: 'start', label: 'Start Duel', act: () => send({ type: 'beginDuel' }) }] };
    return { text: `Waiting for the other duelist…${seen}`, buttons: [] };
  };
  const prepSpecs = (): WindowSpec[] => { const c = prepChoice(); return c ? [preparationDialog(htmlIds, !!state.busy, c)] : []; };
  const duelSpecs = (): WindowSpec[] => {
    const duel = state.duel; if (state.scene !== 'duel' || !duel) return [];
    const out: WindowSpec[] = [];
    // the end: main's result.js records and its Next plate ('Return to Lobby' once the duel or the match is over)
    const npcRec = state.npc?.npc && state.npc.record && state.npc.result && !['idle', 'duel'].includes(state.npc.stage) ? { name: state.npc.npc.name, record: state.npc.record } : undefined;
    if (duel.ended) out.push(...duelResultWindows({ ids: htmlIds, duel, match: state.match, npc: npcRec, ...(!state.match || state.match.complete ? { next: () => open('lobby') } : {}) }));
    if (!duel.ended || state.match && !state.match.complete) out.push(duelSpeedWindow(htmlIds, duelSpeed, () => { duelSpeed = nextDuelSpeed(duelSpeed); duelScene.fx.speed = duelSpeed; showHtml(); }));
    const prompt = duel.prompt;
    if (prompt && htmlDuelPrompt(prompt)) {
      if (local.promptId !== prompt.id) { local.promptId = prompt.id; local.selected.clear(); local.promptInspection = null; duelHover = { selected: local.selected, hover: null }; }
      duelHover.selected = local.selected;
      const spec = duelDialog({ ids: htmlIds, busy: !!state.busy, local: duelHover, respond: response => respondToPrompt(prompt.id, response), rerender: showHtml,
        inspect: id => { const card = prompt.candidates?.find(c => c.id === id)?.card; if (card) { inspect(card, 'duel'); requestRender(); } } }, prompt);
      if (spec) out.push(spec);
    } else if (prompt && htmlUi && !state.preparation) {
      // the help strip (CWindowModelHelp) over the field while the duel screen's own panel asks (cards, places, declarations)
      const help = duelHelpStrip(htmlIds, prompt.text); if (help) out.push(help);
    }
    return out;
  };
  const shopSpecs = (): WindowSpec[] => {
    const shop = state.shop;
    if (state.scene !== 'shop' || !shop || useCardShop() || shopCosmetics || shop.opening && !cardGetClosed(shop.opening)) return [];
    const self = state.lobby?.avatars.find(a => a.self), error = local.message || (state.error && !state.busy ? state.error : '');
    return shopWindows({ shop, ui: shopUi, ids: htmlIds, busy: !!state.busy, world: self?.world ?? 1, portrait: self?.parts?.length === 16 ? `portrait:${Array.from(self.parts).join('.')}` : null,
      name: item => accessoryName(item, state.online?.cosmetics ?? null), rerender: showHtml, error,
      buy: (itemId, count) => send({ type: 'buy', itemId, count }), exit: () => open('lobby'),
      ...(state.online ? { cosmetics: () => { shopCosmetics = 'boxes'; send({ type: 'onlineAction', action: { type: 'refresh' } }); requestRender(); } } : {}) });
  };
  // the original's UI strings main's dialogs say (yo2text_?: Delete's prompts), read once the original data is there
  const gameTexts = new Map<number, string>(); let gameTextsFor: string | null = null;
  const askGameTexts = () => {
    const language = state.settings.language ?? 'E'; if (gameTextsFor === language || !controller.gameText) return;
    gameTextsFor = language;
    void controller.gameText([...Object.values(DELETE_TEXT), ...Object.values(LOBBY_TEXT), ...Object.values(AREA_TEXT)], new AbortController().signal)
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
    deckWindows: () => deckScene.windows(), scene: sceneWindows(), prompts: duelPrompts(), covered: !!state.socialDetail && tradeScene(state.socialDetail.trade),
    text: id => gameTexts.get(id), lobby: { list: ctx => lobbyList(ctx, lobbyDeps(), pid => send({ type: 'interact', playerId: pid })), windows: ctx => lobbyWindows(ctx, lobbyDeps()) },
    ...(checkPassword ? { checkPassword: (password: string) => checkPassword(password, new AbortController().signal) } : {}) }));
  const localized = (specs: WindowSpec[]): WindowSpec[] => { localizeSpecs(specs, uiText); return specs; };
  // the engine's scene ids main's page modules read (src/System/yo2SceneManager.h: 7 Select Player, 11 the lobby,
  // 12 Free Duel's lobby, 14 the shop, 0x24 the deck editor)
  const engineScene = () => ({ characters: 7, lobby: state.mode === 'free' ? 12 : 11, shop: 14, deck: 0x24 } as Partial<Record<Scene, number>>)[state.scene] ?? 0;
  // the chat's Duels tab, the Players window's Discord rows, the ?duel= auto-join (htmlui/discord-wire.ts)
  const discord = discordWire({ ui: htmlUiState, state: () => state, send: command => send(command), rerender: () => showHtml(), search: globalThis.location?.search ?? '' });
  const showHtml = () => {
    askGameTexts(); syncStartScene(); discord.tick();
    if (disposed) return;
    if (!deckDom && state.scene === 'deck' && typeof globalThis.document !== 'undefined') deckDom = new DeckDom(host, deckScene, { art: '/ui/', ...(controller.loadCardImage ? { card: (pc: number, signal: AbortSignal) => controller.loadCardImage!(pc, signal) } : {}), ...(controller.loadArchiveImage ? { archive: (path: string, signal: AbortSignal) => controller.loadArchiveImage!(path, signal) } : {}) });
    if (!htmlUi) { if (deckDom) { const d = deckScene.stageView(); deckDom.show(buildHtml(), d.detail, d.drag); } return; }
    const specs = buildHtml(), deck = deckScene.stageView();
    htmlUi.show(specs, ['title', 'characters'].includes(state.scene), engineScene());
    deckDom?.show(specs, deck.detail, deck.drag);
  };
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
        return lobby.avatars.filter(a => !a.npc && avatarNodes.has(a.id)).flatMap(a => { const r = avatarNodes.get(a.id)!.getBoundingClientRect(); if (!r.width && !r.height) return [];
          return [{ pid: a.id, name: a.name, x: (r.left + r.width / 2 - box.left) / box.width * 1024, y: (r.top - box.top) / box.height * 768 }]; });
      } });
      // live's HD game cursor (main's cursor.js) and its click ripple, the busy hand while the app waits
      gameCursor?.dispose();
      gameCursor = new GameCursor({ art, stage: () => stage, busy: () => !!controller.getState().busy });
      if (deckDom) deckDom.dispose();
      deckDom = new DeckDom(htmlUi.host, deckScene, { art, ...(controller.loadCardImage ? { card: (pc: number, signal: AbortSignal) => controller.loadCardImage!(pc, signal) } : {}), ...(controller.loadArchiveImage ? { archive: (path: string, signal: AbortSignal) => controller.loadArchiveImage!(path, signal) } : {}) });
      // what the editor holds, for tests and assistive tools (main's yo2Html.snapshot() has the windows only)
      const g = globalThis as { yo2Html?: Record<string, unknown> };
      if (g.yo2Html) {
        g.yo2Html.deckState = () => deckScene.inspect();
        // main's right-click / double-click moves wait on the game's drag (screens/deck.js quickInstall: deckDrag.state)
        const base = g.yo2Html.snapshot as (() => object | null) | undefined;
        if (base) g.yo2Html.snapshot = () => { const s = base(); return s && { ...s, deckDrag: { state: deckScene.ui.drag ? 1 : 0 } }; };
      }
      showHtml();
      // a duel prompt the layer now shows leaves the duel screen's own panel
      if (state.scene === 'duel' && htmlDuelPrompt(state.duel?.prompt)) requestRender();
    })
      .catch((e: unknown) => console.warn('htmlui', e));
  }
  interface ArtEntry { code: string; load: (signal: AbortSignal) => Promise<{ url: string; release(): void }>; abort: AbortController; images: Set<HTMLImageElement>; used: boolean; pending: boolean; failed: boolean; lease: { url: string; release(): void } | null; }
  const fieldNodes = new Map<string, HTMLElement>();
  const announce = new AnnouncePanel();
  const duelScene = new DuelPresentation(controller.loadArchiveImage?.bind(controller) ?? null);
  duelScene.fx.speed = loadDuelSpeed();
  const avatarNodes = new Map<number, HTMLElement>();
  const avatarViews = new Map<number, AvatarView>();
  let effectsLayer: HTMLElement | null = null;
  let sideboardClock: ReturnType<typeof setInterval> | null = null;
  // The turn clock runs down between the server's readings; only its text changes each second.
  let duelClock: ReturnType<typeof setInterval> | null = null, duelClockNode: HTMLElement | null = null;
  const clockText = (timer: NonNullable<DuelView['timer']>) => { const left = Math.max(0, timer.paused || !timer.at ? timer.seconds : timer.seconds - Math.floor((Date.now() - timer.at) / 1000)); return `${timer.paused ? 'Paused · ' : ''}${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`; };
  const lpNodes: Partial<Record<0 | 1, HTMLElement>> = {}, lpBars: Partial<Record<0 | 1, HTMLElement>> = {};
  const positionAvatars = (lobby: NonNullable<ClientView['lobby']>) => {
    for (const avatar of lobby.avatars) { const node = avatarNodes.get(avatar.id); if (!node) continue;
      if (worldRenderer && lobby.mapId !== undefined) { const point = worldRenderer.worldToScreen(avatar); node.style.left = `${point.x / 1024 * 100}%`; node.style.top = `${point.y / 768 * 100}%`; }
      else { node.style.left = `${avatar.x / (lobby.width ?? 1024) * 100}%`; node.style.top = `${avatar.y / (lobby.height ?? 768) * 100}%`; }
    }
  };
  const worldRenderer = controller.loadWorldScene ? new WorldRenderer({ loadScene: (id, signal) => controller.loadWorldScene!(id, signal), onViewport: () => { const current = controller.getState(); if (current.scene === 'lobby' && current.lobby) positionAvatars(current.lobby); } }) : null;
  worldWalk = typeof stage.addEventListener === 'function' ? holdToWalk(stage, walkTo, t => { const e = t as Element | null; if (!e?.closest || e.closest('button, input, textarea, a, [data-key^="avatar:"]')) return false; return !!e.closest('canvas[data-key="lobby-map"]') || !!worldRenderer?.element.contains(e); }) : null;
  const showAvatarViews = (lobby: NonNullable<ClientView['lobby']>) => {
    const self = lobby.avatars.find(a => a.self), origin = self ?? { x: 512, y: 384 }, viewport = worldRenderer?.viewport;
    const candidates = controller.loadAvatar ? lobby.avatars.filter(a => a.parts?.length === 16 && (!viewport || a.x >= viewport.x - 128 && a.x <= viewport.x + viewport.width + 128 && a.y >= viewport.y - 160 && a.y <= viewport.y + viewport.height + 160)).sort((a, b) => Number(!!b.self) - Number(!!a.self) || Math.hypot(a.x - origin.x, a.y - origin.y) - Math.hypot(b.x - origin.x, b.y - origin.y) || a.id - b.id).slice(0, 24) : [];
    const retained = new Set(candidates.map(a => a.id));
    for (const [id, view] of avatarViews) if (!retained.has(id)) { view.dispose(); avatarViews.delete(id); const button = avatarNodes.get(id); if (button) button.className = button.className.replace(' has-original', ''); }
    for (const actor of candidates) {
      const button = avatarNodes.get(actor.id); if (!button) continue;
      let view = avatarViews.get(actor.id); if (!view) { view = new AvatarView({ sourceOrigin: true, loadAvatar: (parts, options) => controller.loadAvatar!(parts, options), reducedMotion: () => controller.getState().settings.reducedMotion }); avatarViews.set(actor.id, view); }
      button.className = button.className.replace(' has-original', '') + ' has-original'; button.prepend(view.element);
      try { view.show(actor.parts!, actor.world ?? 0, actor.motion ?? 'stand', actor.direction ?? 0); } catch (error) { view.element.dataset.avatarError = error instanceof Error ? error.message.slice(0, 256) : 'Invalid avatar appearance'; }
    }
  };
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
  // The wardrobe and Appearance previews: the player's own avatar wearing a draft look.
  const previewAvatars = new Map<string, AvatarView>();
  const avatarPreview = controller.loadAvatar ? (parts: number[], world: 0 | 1, key: string): HTMLElement | null => {
    let view = previewAvatars.get(key); if (!view) { view = new AvatarView({ sourceOrigin: true, loadAvatar: (p, o) => controller.loadAvatar!(p, o), reducedMotion: () => controller.getState().settings.reducedMotion }); previewAvatars.set(key, view); }
    try { view.show(Uint8Array.from(parts), world, 'stand', 0); } catch { return null; } return view.element;
  } : null;
  const cosmeticsDeps = () => ({ dispatch: (action: import('../features/online').OnlineAction) => send({ type: 'onlineAction', action }), avatar: avatarPreview, rerender: requestRender });
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
  };
  const canSkipRender = (previous: ClientView, next: ClientView) => {
    if (previous.scene !== next.scene || previous.status !== next.status || previous.connection !== next.connection || previous.error !== next.error || previous.busy !== next.busy || previous.settings !== next.settings || previous.relay !== next.relay || previous.sideboarding !== next.sideboarding || previous.match !== next.match || previous.preparation !== next.preparation || previous.unavailable?.[previous.scene] !== next.unavailable?.[next.scene]) return false;
    if (previous.player?.id !== next.player?.id || previous.player?.name !== next.player?.name || previous.player?.level !== next.player?.level) return false;
    // Unrelated world packets must not replace open mail/trade confirmations or audio controls.
    if (next.scene === 'shop') return previous.shop === next.shop && previous.online === next.online;
    if (next.scene === 'settings') return previous.audio === next.audio && previous.capture === next.capture && previous.dataStatus === next.dataStatus;
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
    showAvatarViews(lobby);
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
    for (const i of [0, 1] as const) { if (lpNodes[i]) lpNodes[i]!.textContent = duel.players[i].lp.toLocaleString(); if (lpBars[i]) lpBars[i]!.style.width = lpWidth(duel.players[i].lp); }
    presentEffects(duel); duelScene.update(duel, state.settings.reducedMotion);
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
  const browserDisplay = new BrowserDisplaySettings(browserFullscreenAdapter(globalThis.document?.documentElement && typeof globalThis.document.documentElement.requestFullscreen === 'function' ? globalThis.document.documentElement : host), () => { if (!disposed && controller.getState().scene === 'settings') requestRender(); });
  const send = (command: ClientCommand) => {
    if (disposed) return;
    local.message = '';
    if (command.type === 'move') { const current = controller.getState(); if (current.scene !== 'lobby') return; if (current.npc && !['idle', 'done'].includes(current.npc.stage)) { local.message = 'Finish the NPC interaction before moving.'; requestRender(); return; } }
    if (['duelRespond', 'duelAction', 'surrender'].includes(command.type) && controller.getState().relay?.canAct === false) { local.message = 'Your tag partner is playing this turn.'; requestRender(); return; }
    try {
      const result = controller.dispatch(command);
      // An aborted command belongs to a session or screen the player already left: nothing to report.
      if (result && typeof result.then === 'function') void result.catch((e: unknown) => { if (!disposed && !(e instanceof DOMException && e.name === 'AbortError')) { local.message = e instanceof Error ? e.message : 'The action could not be completed.'; requestRender(); } });
    } catch (e) { local.message = e instanceof Error ? e.message : 'The action could not be completed.'; requestRender(); }
  };
  const available = (scene: Scene) => !state.unavailable?.[scene];
  const open = (scene: Scene) => { local.message = ''; send({ type: 'openScene', scene }); };
  const sceneRoot = (heading: string): HTMLElement => {
    const n = el('section', 'de-scene'); n.setAttribute('aria-label', heading); stage.append(n); return n;
  };
  const emptyPanel = (scene: Scene, heading: string, message: string) => {
    const n = sceneRoot(heading), panel = el('section', 'de-panel de-center de-stack', title(heading), el('p', '', state.unavailable?.[scene] || message));
    if (!state.unavailable?.[scene]) panel.append(button('Refresh', () => send({ type: 'refresh', scene }), !!state.busy));
    panel.append(button('Back', () => open(state.player ? 'lobby' : 'title'))); n.append(panel);
  };
  function renderTitle(): void {
    const n = sceneRoot('Title'), panel = el('section', 'de-panel de-center de-stack');
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
    if (state.accountDetail) { const account = el('details', 'de-account-details'); account.dataset.key = `title-account:${state.accountDetail.panel}`; account.open = state.accountDetail.panel !== 'overview'; account.append(el('summary', '', 'Registration, password recovery & account options'), renderAccountFeature(state.accountDetail, action => send({ type: 'accountAction', action }))); panel.append(account); }
    panel.append(button('Options', () => open('settings')), note(state.status)); n.append(panel);
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
    startScene.show({ logo: true, portrait: ch?.parts?.length === 16 ? Uint8Array.from(ch.parts) : null, reducedMotion: state.settings.reducedMotion });
  }
  function drawLobby(canvas: HTMLCanvasElement): void {
    const ctx = canvas.getContext('2d'); if (!ctx) return;
    ctx.fillStyle = '#77b6ca'; ctx.fillRect(0, 0, 1024, 768);
    const g = ctx.createLinearGradient(0, 0, 0, 768); g.addColorStop(0, '#a7e4fa'); g.addColorStop(1, '#4a93b0'); ctx.fillStyle = g; ctx.fillRect(0, 0, 1024, 768);
    ctx.strokeStyle = '#e2f8ff55'; ctx.lineWidth = 1;
    for (let x = -768; x < 1800; x += 96) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x + 768, 768); ctx.stroke(); ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x - 768, 768); ctx.stroke(); }
    ctx.fillStyle = '#07519b'; ctx.font = '16px Arial'; ctx.textAlign = 'center';
    ctx.fillText('Map artwork is not loaded', 512, 345);
  }
  function renderLobby(): void {
    if (!state.lobby) return emptyPanel('lobby', 'Lobby', 'Waiting for the online world.');
    const lobby = state.lobby;
    const canvas = el('canvas'); canvas.width = 1024; canvas.height = 768; canvas.setAttribute('aria-label', 'Lobby map'); canvas.tabIndex = 0; canvas.dataset.key = 'lobby-map';
    stage.append(canvas); drawLobby(canvas);
    const useScene = worldRenderer && lobby.mapId !== undefined;
    if (useScene) { stage.append(worldRenderer.element); worldRenderer.avatars.replaceChildren(); const self = lobby.avatars.find(a => a.self); worldRenderer.show(lobby.mapId!, self ?? { x: (lobby.width ?? 1024) / 2, y: (lobby.height ?? 768) / 2 }); }
    const mapUrl = safeImageUrl(lobby.mapImage);
    if (mapUrl && !useScene) { const image = el('img', 'de-stage-layer'); image.src = mapUrl; image.alt = lobby.name; image.style.width = '100%'; image.style.height = '100%'; image.style.objectFit = 'fill'; image.style.pointerEvents = 'none'; stage.append(image); }
    const worldW = lobby.width ?? 1024, worldH = lobby.height ?? 768;
    canvas.onclick = e => { if (worldWalk?.consumeClick()) return; const card = state.profileDetail; if (card && card.selectedPid !== null && card.selectedPid !== card.selfPid) { send({ type: 'profileAction', action: { type: 'close' } }); return; } if (lobby.connected && !state.busy) { if (useScene && !worldRenderer.ready) { local.message = 'Map artwork is still loading.'; requestRender(); return; } const p = useScene ? gamePoint(e.clientX, e.clientY, worldRenderer.element.getBoundingClientRect()) : gamePoint(e.clientX, e.clientY, canvas.getBoundingClientRect(), worldW, worldH); if (p) { const target = useScene ? worldRenderer.screenToWorld(p) : p; send({ type: 'move', x: Math.round(target.x), y: Math.round(target.y) }); } } };
    canvas.onkeydown = e => {
      const currentLobby = controller.getState().lobby, self = currentLobby?.avatars.find(a => a.self); if (!self || !currentLobby?.connected) return;
      const delta: Record<string, [number, number]> = { ArrowLeft: [-32, 0], ArrowRight: [32, 0], ArrowUp: [0, -32], ArrowDown: [0, 32] };
      const d = delta[e.key]; if (!d) return; e.preventDefault(); send({ type: 'move', x: Math.max(0, Math.min(worldW, self.x + d[0])), y: Math.max(0, Math.min(worldH, self.y + d[1])) });
    };
    for (const avatar of lobby.avatars) {
      const b = button('', () => send({ type: 'interact', playerId: avatar.id }), !lobby.connected);
      b.className = 'de-avatar' + (avatar.self ? ' self' : ''); b.style.left = `${avatar.x / worldW * 100}%`; b.style.top = `${avatar.y / worldH * 100}%`; b.setAttribute('aria-label', `${avatar.name}${avatar.npc ? ', NPC' : ''}`);
      const art = safeImageUrl(avatar.image);
      if (art) { const img = el('img', 'de-avatar-sprite'); img.src = art; img.alt = ''; b.append(img); } else b.append(el('span', 'de-avatar-placeholder'));
      b.append(el('span', 'de-avatar-name', avatar.name)); b.dataset.key = `avatar:${avatar.id}`; avatarNodes.set(avatar.id, b); if (useScene) worldRenderer.avatars.append(b); else stage.append(b);
    }
    positionAvatars(lobby);
    showAvatarViews(lobby);
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
      try { await controller.dispatch({ type: 'claimStarter', id }); return { ok: true }; }
      catch (e) { errorSeen = controller.getState().error ?? errorSeen; return { ok: false, message: e instanceof Error ? e.message : 'That didn\'t work. Try again in a moment.' }; }
    },
    later: () => {},
    ...(controller.loadCardImage ? { coverUrl: (pc: number, signal: AbortSignal) => controller.loadCardImage!(pc, signal).then(r => { signal.addEventListener('abort', () => r.release(), { once: true }); return r.url; }) } : {}),
  });
  function duelPrompts(): WindowSpec[] {
    const out: WindowSpec[] = [], lobby = state.scene === 'lobby' ? state.lobby : undefined, busy = !!state.busy;
    if (lobby?.outgoing) out.push(stockDialog({ ids: htmlIds }, 'duel-request', 'ok', `Request sent to ${lobby.outgoing.name}: waiting for an answer…`,
      [{ from: 'OK', label: 'Cancel', key: 'duel-request-cancel', click: () => { if (!busy) send({ type: 'cancelChallenge' }); } }]));
    if (lobby?.invitation) out.push(stockDialog({ ids: htmlIds }, 'duel-invitation', 'yesno', `${lobby.invitation.name} challenges you to a duel. Accept?`,
      [{ from: 'Yes', key: 'duel-accept', aria: 'Accept Duel', click: () => { if (!busy) send({ type: 'replyChallenge', accept: true }); } },
        { from: 'No', key: 'duel-decline', aria: 'Decline', click: () => { if (!busy) send({ type: 'replyChallenge', accept: false }); } }]));
    const message = state.scene === 'deck' ? '' : state.error || local.message;
    if (message && message !== errorSeen) out.push(stockDialog({ ids: htmlIds }, 'error', 'error', message,
      [{ from: 'OK', key: 'error-ok', click: () => { errorSeen = message; if (local.message === message) local.message = ''; requestRender(); } }]));
    else if (!message) errorSeen = '';
    return out;
  }
  function inspect(card: CardView, from: DeckZone | 'collection' | 'duel' = 'collection'): void { local.inspected = card; local.inspectedFrom = from; requestRender(); }
  // The deck editor is main's deck screen (src/ui/htmlui/deck-scene.ts: its windows on the layer, the card pictures and
  // the mouse on the layer's engine side); the stage keeps only the scene's name, and a refusal shows in main's dialog
  function renderDeck(): void {
    const editor = state.deckEditor; if (!editor) return emptyPanel('deck', 'Edit Deck', 'Loading your decks and collection.');
    sceneRoot('Edit Deck');
    if (editor.error) local.message ||= editor.error;
    deckScene.notice(state.error || local.message);
  }
  function renderSideboarding(): void {
    const side = state.sideboarding; if (!side) return;
    if (local.sideboardRound !== side.round) { local.sideboardRound = side.round; local.sideboardMain = null; local.sideboardSide = null; }
    const n = sceneRoot('Match Sideboarding'), panel = el('section', 'de-panel de-stack de-fill', title(`Match · Sideboard for Game ${side.round}`));
    panel.append(el('p', '', `Match score: ${side.scores[0]} wins · ${side.scores[1]} losses · ${side.scores[2]} draws`));
    if (side.deadline) { const seconds = Math.max(0, Math.ceil((side.deadline - Date.now()) / 1000)); panel.append(note(`Sideboarding clock: ${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`)); }
    if (side.error) panel.append(el('p', 'de-error', side.error));
    const sideboardIssue = sideboardDifference(side.deck, side.original), exact = sideboardIssue === null;
    const pool = state.deckEditor?.allCards ?? state.deckEditor?.collection ?? [], lookup = new Map(pool.map(c => [c.passcode, c]));
    const columns = el('div', 'de-sideboard-columns de-fill');
    for (const zone of ['main', 'side', 'extra'] as const) {
      const section = el('section', 'de-deck-zone de-scroll'), grid = el('div', 'de-card-grid'); section.append(el('h3', 'de-zone-title', `${zone === 'extra' ? 'Fusion' : zone === 'main' ? 'Main' : 'Side'} Deck · ${side.deck[zone].length}/${side.original[zone].length}`));
      for (const [index, passcode] of side.deck[zone].entries()) {
        const card = lookup.get(passcode) ?? { id: String(passcode), passcode, name: `Card ${passcode}` }, tile = drawCard(card, state.settings.showCardNames);
        const selected = zone === 'main' ? local.sideboardMain === index : zone === 'side' && local.sideboardSide === index;
        const b = button('', () => { local.inspected = card; if (zone === 'main') local.sideboardMain = index; else if (zone === 'side') local.sideboardSide = index; requestRender(); }, side.ready || !!state.busy);
        b.className = tile.className; b.dataset.key = `sideboard:${side.round}:${zone}:${index}`; b.setAttribute('aria-label', `${card.name}, ${zone} deck`); b.setAttribute('aria-pressed', String(selected)); b.append(...Array.from(tile.childNodes)); grid.append(b);
      }
      section.append(grid); columns.append(section);
    }
    panel.append(columns);
    const move = (from: 'main' | 'side') => { const index = from === 'main' ? local.sideboardMain : local.sideboardSide; if (index === null || side.deck[from][index] === undefined) return; send({ type: 'sideboardMove', passcode: side.deck[from][index], from, to: from === 'main' ? 'side' : 'main', index }); local.sideboardMain = null; local.sideboardSide = null; };
    panel.append(el('div', 'de-row', button('Main → Side', () => move('main'), local.sideboardMain === null || side.ready || !!state.busy), button('Side → Main', () => move('side'), local.sideboardSide === null || side.ready || !!state.busy), button('Swap Selected Cards', () => { if (local.sideboardMain !== null && local.sideboardSide !== null) { send({ type: 'sideboardSwap', mainIndex: local.sideboardMain, sideIndex: local.sideboardSide }); local.sideboardMain = null; local.sideboardSide = null; } }, local.sideboardMain === null || local.sideboardSide === null || side.ready || !!state.busy, true)));
    panel.append(note('Only Main and Side cards may be exchanged. The original card pool and each section size must be restored before submitting. Fusion cards stay in the Fusion Deck.'));
    if (sideboardIssue) panel.append(el('p', 'de-error', sideboardIssue));
    if (local.inspected) panel.append(el('p', '', `${local.inspected.name}: ${local.inspected.description ?? 'Card description unavailable.'}`));
    panel.append(button(side.ready ? 'Deck Submitted · Waiting for Opponent' : 'Submit Sideboard', () => send({ type: 'submitSideboard' }), !exact || side.ready || !!state.busy, true)); n.append(panel);
  }
  function renderShop(): void {
    if (useCardShop()) { sceneRoot('Card Shop').append(cardShop.node()); return; }
    cardShop.dispose();
    const shop = state.shop; if (!shop) return emptyPanel('shop', 'Card Shop', state.error && !state.busy ? 'The shop catalogue could not be loaded. Refresh to try again.' : 'Loading the shop catalogue.');
    // entering the shop: Item Selection, an empty cart (the windows themselves are main's: htmlui/shop.ts)
    if (!shopScene) { Object.assign(shopUi, shopLocal()); shopCosmetics = null; shopScene = true; }
    const n = sceneRoot('Card Shop');
    if (shopCosmetics && state.online) {
      // the rewrite's own cosmetic departments (extra/cosmetics.ts), kept as they are while cosmetics are redesigned
      const panel = el('section', 'de-panel de-stack de-fill de-shop-cosmetics-panel', title('Cosmetics')), tabs = el('div', 'de-row');
      for (const [tab, label] of [['boxes', 'Cosmetic Boxes']] as const) { const b = button(label, () => { shopCosmetics = tab; requestRender(); }, shopCosmetics === tab); b.dataset.key = `shop-cosmetics:${tab}`; tabs.append(b); }
      tabs.append(button('Back to the Shop', () => { shopCosmetics = null; requestRender(); }));
      panel.append(tabs, renderCosmeticsShop(state.online, shopCosmetics, cosmeticsDeps())); n.append(panel);
    }
    if (shop.opening) { const opening = renderCardGet(shop.opening, { drawCard, art: controller.loadArchiveImage ? (path, className = '') => { const image = el('img', className); image.alt = ''; image.draggable = false; loadArchiveArt(path, image); return image; } : null, reducedMotion: state.settings.reducedMotion, rerender: requestRender }); if (opening) n.append(opening); }
  }
  /** Fallback field without original art: the same zone geometry as the original sheet. */
  function drawField(canvas: HTMLCanvasElement): void {
    const ctx = canvas.getContext('2d'); if (!ctx) return;
    const g = ctx.createLinearGradient(0, 0, 0, 768); g.addColorStop(0, '#07315b'); g.addColorStop(.5, '#176e8c'); g.addColorStop(1, '#0b426a'); ctx.fillStyle = g; ctx.fillRect(0, 0, 1024, 768);
    ctx.lineWidth = 3;
    for (const side of [0, 1] as const) {
      ctx.strokeStyle = side ? '#ff4f7b' : '#1d7cf2';
      for (const row of ['monster', 'spell'] as const) for (let k = 0; k < 5; k++) {
        const x = side ? 1024 - FIELD_LAYOUT.cellX(k) : FIELD_LAYOUT.cellX(k), y = FIELD_LAYOUT.rows[row][side];
        ctx.strokeRect(x - 38, y - 52, 76, 104);
      }
      for (const pile of Object.values(FIELD_LAYOUT.piles)) { const [x, y] = pile[side]; ctx.strokeRect(x - 28, y - 39, 56, 78); }
    }
  }
  function renderDuel(): void {
    const duel = state.duel; if (!duel) return emptyPanel('duel', 'Duel', 'Waiting for duel state.');
    // The field keeps the original 4:3 geometry on every screen; on a tall phone the log, actions and prompts sit below it.
    const board = el('div', 'de-duel-board'); stage.append(board);
    const canvas = el('canvas'); canvas.width = 1024; canvas.height = 768; canvas.setAttribute('aria-label', 'Duel field'); board.append(canvas); drawField(canvas);
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
    const phases = [['draw', 'DP', 'Draw Phase'], ['standby', 'SP', 'Standby Phase'], ['main1', 'M1', 'Main Phase 1'], ['battle', 'BP', 'Battle Phase'], ['main2', 'M2', 'Main Phase 2'], ['end', 'EP', 'End Phase']] as const;
    const current = phases.find(([key]) => key === duel.phase);
    const bar = el('div', `de-phase-bar${duel.turnPlayer ? ' opponent' : ''}`); bar.setAttribute('role', 'status');
    bar.setAttribute('aria-label', `Turn ${duel.turn}${current ? `, ${current[2]}` : ''}, ${duel.players[duel.turnPlayer].name}'s turn`);
    bar.append(el('div', 'de-turn-box', el('small', '', 'Turn'), el('strong', '', String(duel.turn))));
    phases.forEach(([key, short, long], row) => {
      const cell = el('div', `de-phase${key === duel.phase ? ' current' : ''}`); cell.title = long;
      // duel_pbutton_01: c01 for the player's turn, c00 the opponent's; column 2 is the lit current phase.
      if (archive) { const sheet = archive(`data/y/duel/phase/duel_pbutton_01_c0${duel.turnPlayer ? 0 : 1}.png`); sheet.style.left = key === duel.phase ? '-200%' : '0'; sheet.style.top = `-${row * 100}%`; cell.append(sheet, el('span', 'de-sr', short)); }
      else cell.textContent = short;
      bar.append(cell);
    });
    board.append(bar);
    // A choice made on the board itself (a target, a Tribute, a zone) says what to choose, without covering the board.
    if (duel.instruction) { const line = el('div', 'de-duel-instruction', duel.instruction); line.setAttribute('role', 'status'); board.append(line); }
    if (state.relay) { const roster = el('aside', 'de-relay-roster'); roster.setAttribute('aria-label', 'Tag relay teams'); for (const team of [0, 1] as const) { const group = el('section', 'de-relay-team'); for (const slot of [0, 1] as const) { const member = state.relay.players[2 * team + slot], active = state.relay.active[team] === slot; const row = el('div', 'de-relay-member', el('strong', '', member?.name ?? 'Waiting for player'), note(active ? state.relay.self === 255 ? 'Team pilot' : team ? 'Opponent playing' : state.relay.self === slot ? 'You are playing' : 'Partner playing' : 'Tag partner')); row.dataset.active = String(active); group.append(row); } roster.append(group); } stage.append(roster); }
    const cards = el('div', 'de-field-cards');
    const visibleCardIds = new Set<string>();
    // Only the topmost card of a pile is drawn; counts remain visible without allocating one DOM tree per deck card.
    const pileTop = new Map<string, number>();
    const handCounts: [number, number] = [0, 0]; for (const card of duel.cards) if (card.zone === 'hand') handCounts[card.controller]++;
    for (const c of duel.cards) if (['deck', 'graveyard', 'banished', 'extra'].includes(c.zone)) pileTop.set(`${c.controller}/${c.zone}`, c.zone === 'deck' ? Math.min(pileTop.get(`${c.controller}/${c.zone}`) ?? Infinity, c.index) : Math.max(pileTop.get(`${c.controller}/${c.zone}`) ?? -1, c.index));
    for (const c of duel.cards) {
      if (['deck', 'graveyard', 'banished', 'extra'].includes(c.zone) && c.index !== pileTop.get(`${c.controller}/${c.zone}`)) continue;
      visibleCardIds.add(c.id);
      const handCount = handCounts[c.controller];
      // The player's own set cards stay card backs on the field but remain readable to their owner (never the opponent's).
      const ownSet = isOwnSetCard(c);
      // A board selection (an attack target, a card to choose on either side) is made on the card itself, as in the original.
      const cardActions = (duel.actions ?? []).filter(a => a.cardId === c.id), selection = cardActions.length === 1 && !cardActions[0]!.disabled && cardActions[0]!.label.startsWith('Select:') ? cardActions[0]! : null;
      const p = fieldCardPosition(c, handCount), tile = drawCard(c, state.settings.showCardNames, c.faceUp), b = button('', () => { const target = duel.prompt?.options.find(o => o.cardId === c.id && !o.disabled); if (target && duel.prompt) respondToPrompt(duel.prompt.id, { optionId: target.id }); else if (selection) { if (!state.busy) sendAction(duel, selection.id); } else if (c.faceUp || ownSet || (duel.actions ?? []).some(a => a.cardId === c.id)) { inspect(c, 'duel'); if (c.faceUp) send({ type: 'inspectCard', cardId: c.id }); } });
      b.dataset.key = `field-card:${c.id}`; b.dataset.side = c.controller ? 'opponent' : 'your'; b.dataset.zone = c.zone; b.dataset.index = String(c.index); if (c.zone === 'monster') b.dataset.position = c.position ?? 'attack';
      b.className = `de-card de-field-card${c.faceUp ? '' : ' de-card-back'}${p.rotate ? ' defense' : ''}${selection ? ' de-card-target' : ''}`; b.append(...Array.from(tile.childNodes)); if (selection) b.title = selection.label;
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
      if (pileTop.has(`${c.controller}/${c.zone}`)) b.append(el('span', 'de-card-count', String(duel.cards.filter(x => x.controller === c.controller && x.zone === c.zone).length)));
      cards.append(b);
    }
    // Zone selections (where to summon or set): the empty zones themselves are the controls, as in the original.
    for (const action of (duel.actions ?? []).filter(a => a.place && !a.cardId)) {
      const p = fieldCardPosition({ id: action.id, name: '', controller: action.place!.controller, zone: action.place!.zone, index: action.place!.index, faceUp: false }, 0);
      const zone = button('', () => sendAction(duel, action.id), !!action.disabled || !!state.busy); zone.className = 'de-zone-target'; zone.dataset.key = `zone:${action.id}`; zone.setAttribute('aria-label', action.label); zone.title = action.label;
      zone.style.left = `${p.x / 1024 * 100}%`; zone.style.top = `${p.y / 768 * 100}%`; zone.style.width = `${76 / 1024 * 100}%`; zone.style.height = `${104 / 768 * 100}%`;
      cards.append(zone);
    }
    board.append(cards); effectsLayer = el('div', 'de-duel-effects'); effectsLayer.setAttribute('aria-hidden', 'true'); board.append(effectsLayer); presentEffects(duel); duelScene.mount(board, duel, state.settings.reducedMotion);
    const actions = el('div', 'de-duel-actions');
    for (const a of (duel.actions ?? []).filter(a => !a.cardId || !visibleCardIds.has(a.cardId))) actions.append(button(a.label, () => sendAction(duel, a.id), !!a.disabled || !!state.busy, true));
    if (duel.spectating) actions.append(button('Leave Duel', () => send({ type: 'leaveDuel' }), !!state.busy));
    else if (!duel.ended) actions.append(button('Surrender', () => confirmAction('Surrender this duel?', () => send({ type: 'surrender' }), 'surrender'), !!state.busy || state.relay?.canAct === false));
    else if ((!state.match || state.match.complete) && !htmlUi) actions.append(button('Return to Lobby', () => open('lobby'), false, true));
    stage.append(actions);
    // main's menu bar is not on the duel screen (as in the game): Options (sound, display) stays reachable, apart from
    // the duel's own actions
    stage.append(el('div', 'de-duel-options', button('Options', () => open('settings')), ...(state.connection === 'online' ? [button('Return to Title', () => confirmAction('Disconnect from the game?', () => send({ type: 'disconnect' }), 'disconnect'))] : [])));
    const log = el('div', 'de-duel-log'); log.setAttribute('role', 'log'); log.setAttribute('aria-label', 'Duel log');
    for (const line of duel.log.slice(-80)) log.append(el('div', '', line)); stage.append(log);
    // Follow new lines only while the reader is at the bottom; a player reading older lines keeps their place.
    log.scrollTop = local.logScroll === null ? log.scrollHeight : local.logScroll;
    log.onscroll = () => { local.logScroll = log.scrollHeight - log.scrollTop - log.clientHeight < 8 ? null : log.scrollTop; };
    if (!duel.notice) local.noticeSeen = 0;
    if (duel.notice && duel.notice.id > local.noticeSeen) {
      // The original shows these as a message box closed with OK; it never blocks the re-sent prompt underneath.
      const notice = duel.notice, close = () => { local.noticeSeen = Math.max(local.noticeSeen, notice.id); requestRender(); };
      const box = el('section', 'de-panel de-duel-notice', el('p', '', notice.text), button('OK', close, false, true)); box.setAttribute('role', 'alertdialog'); box.setAttribute('aria-label', notice.text);
      stage.append(box); setTimeout(() => { if (local.noticeSeen < notice.id && !disposed) close(); }, 6000);
    }
    if (duel.prompt && !htmlDuelPrompt(duel.prompt)) renderPrompt(duel.prompt);
    // A stale inspection (the card moved or its action is gone) is dropped and the result or waiting banner shown instead.
    const inspected = local.inspected && local.inspectedFrom === 'duel' ? duel.cards.find(c => c.id === local.inspected?.id && (c.faceUp || isOwnSetCard(c) || (duel.actions ?? []).some(a => a.cardId === c.id))) : undefined;
    if (local.inspected && local.inspectedFrom === 'duel' && !inspected) local.inspected = null;
    if (inspected) {
      const readable = inspected.faceUp || isOwnSetCard(inspected);
      const panel = el('aside', 'de-panel de-duel-inspector de-stack', title(readable ? inspected.name : 'Face-down card'), drawCard(inspected, readable, readable), ...(readable ? [...(inspected.faceUp ? [] : [note('Set face-down. Your opponent sees a card back.')]), note(`ATK ${inspected.attack ?? '?'} / DEF ${inspected.defense ?? '?'}`), el('p', '', inspected.description ?? 'Card description unavailable.')] : []), button('Close', () => { local.inspected = null; requestRender(); }));
      for (const action of (duel.actions ?? []).filter(a => a.cardId === inspected.id)) panel.append(button(action.label, () => { sendAction(duel, action.id); local.inspected = null; }, !!action.disabled || !!state.busy, true));
      panel.setAttribute('aria-label', 'Card details'); stage.append(panel);
    }
    // A spectator is neither side: the result names the winner instead of Victory/Defeat.
    const endedText = duel.ended && (duel.spectating && (duel.ended === 'Victory' || duel.ended === 'Defeat') ? `${duel.players[duel.ended === 'Victory' ? 0 : 1].name} wins` : duel.ended);
    if (endedText && htmlUi) {
      // main's result screen (duel-result.ts: CWindowResult) shows it; the result is still announced (assistive technology)
      const status = el('div', 'de-duel-end de-sr', endedText); status.setAttribute('role', 'status'); status.setAttribute('aria-label', endedText); stage.append(status);
    } else if (duel.ended && !htmlUi) {
      // data/y/duel_end: the result word (m01) over its glow (m02).
      const ended = endedText as string;
      const kind = ended === 'Victory' ? 'win' : ended === 'Defeat' ? 'lose' : ended === 'Draw' ? 'drow' : null;
      const banner = el('div', 'de-duel-end', el('strong', 'de-duel-end-text', ended)); banner.setAttribute('role', 'status'); banner.setAttribute('aria-label', ended);
      if (kind && controller.loadArchiveImage) for (const layer of ['m02', 'm01']) {
        const image = el('img', `de-duel-end-${layer}`); image.alt = ''; image.style.visibility = 'hidden';
        image.onload = () => { image.style.visibility = ''; banner.classList.add('has-art'); }; loadArchiveArt(`data/y/duel_end/duel_ef_${kind}_${layer}_e.png`, image); banner.append(image);
      }
      stage.append(banner);
    }
    else if (duel.waiting && !inspected) stage.append(el('div', 'de-panel de-duel-prompt', el('p', '', duel.waiting)));
    if (duel.issue && (duel.prompt || duel.ended)) { const issue = el('div', 'de-error de-notice de-duel-issue', duel.issue); issue.setAttribute('role', 'alert'); stage.append(issue); }
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
  function renderPrompt(prompt: DuelPromptView): void {
    if (local.promptId !== prompt.id) { local.promptId = prompt.id; local.selected.clear(); local.promptInspection = null; }
    for (const id of local.selected) if (!(prompt.kind === 'attributes' ? prompt.options.some(o => o.id === id && !o.disabled) : prompt.candidates?.some(c => c.id === id && !c.disabled))) local.selected.delete(id);
    const panel = el('section', 'de-panel de-duel-prompt'); if (prompt.kind === 'place' || prompt.options.some(o => o.cardId)) panel.className += ' de-target-prompt'; panel.setAttribute('role', 'dialog'); panel.setAttribute('aria-label', prompt.text); panel.dataset.kind = prompt.kind; panel.dataset.prompt = prompt.id; panel.append(title(prompt.text));
    const respond = (response: DuelResponse) => respondToPrompt(prompt.id, response);
    if (prompt.kind === 'attributes') {
      const options = el('div', 'de-prompt-options');
      for (const option of prompt.options) {
        const input = el('input'); input.type = 'checkbox'; input.checked = local.selected.has(option.id); input.disabled = !!option.disabled || !!state.busy; input.dataset.key = `prompt-attribute:${prompt.id}:${option.id}`;
        input.onchange = () => { if (input.checked) { if (local.selected.size < (prompt.max ?? 1)) local.selected.add(option.id); } else local.selected.delete(option.id); requestRender(); };
        options.append(labelled(option.label, input));
      }
      const confirm = button('Confirm Attributes', () => respond({ optionIds: [...local.selected] }), local.selected.size < (prompt.min ?? 1) || local.selected.size > (prompt.max ?? 1) || !!state.busy, true); confirm.dataset.key = `prompt-confirm:${prompt.id}`;
      panel.append(note(prompt.min === prompt.max ? `Choose ${prompt.min ?? 1} attribute${prompt.min === 1 ? '' : 's'}.` : `Choose ${prompt.min ?? 1}–${prompt.max ?? 1} attributes.`), options, confirm);
    } else if (prompt.options.length) {
      const options = el('div', 'de-prompt-options');
      for (const option of prompt.options) { const b = button(option.label, () => respond({ optionId: option.id }), !!option.disabled || !!state.busy, true); b.dataset.key = `prompt-option:${prompt.id}:${option.id}`; options.append(b); }
      panel.append(options);
    }
    if (prompt.kind === 'cards' || prompt.candidates?.length) {
      // Option prompts (yes/no, effect choice) may list the cards they refer to: those are for reading only.
      const reference = !prompt.readOnly && !['cards', 'announce'].includes(prompt.kind), inspectOnly = prompt.readOnly || reference;
      const choices = el('div', 'de-prompt-candidates');
      for (const candidate of prompt.candidates ?? []) {
        const selected = local.selected.has(candidate.id), b = button('', () => { if (inspectOnly) { local.promptInspection = candidate.card ?? null; requestRender(); return; } if (selected) local.selected.delete(candidate.id); else if (local.selected.size < (prompt.max ?? prompt.candidates?.length ?? 0)) local.selected.add(candidate.id); requestRender(); }, (inspectOnly ? !candidate.card : !!candidate.disabled) || !!state.busy);
        b.dataset.key = `prompt-${reference ? 'reference' : 'candidate'}:${prompt.id}:${candidate.id}`; if (!inspectOnly) b.setAttribute('aria-pressed', String(selected)); if (candidate.card) b.append(drawCard(candidate.card)); b.append(el('span', '', candidate.label)); choices.append(b);
      }
      const confirm = button(prompt.readOnly ? 'Close Card List' : 'Confirm Selection', () => respond({ cardIds: [...local.selected] }), local.selected.size < (prompt.min ?? 0) || !!state.busy, true); confirm.dataset.key = `prompt-confirm:${prompt.id}`;
      if (reference) panel.append(choices);
      else { if (prompt.readOnly) panel.append(note('Select a visible card to read its details.')); else panel.append(note(`Choose ${prompt.min ?? 0}–${prompt.max ?? prompt.candidates?.length ?? 0}. Selected: ${local.selected.size}`)); panel.append(choices, confirm); }
      if (inspectOnly && local.promptInspection) panel.append(el('aside', 'de-prompt-inspector', drawCard(local.promptInspection), el('h3', '', local.promptInspection.name), el('p', '', local.promptInspection.description ?? 'Card description unavailable.')));
    }
    // The server lists every number it accepts as a choice (scaled labels such as LP); free entry is for a bare range.
    if (prompt.kind === 'number' && !prompt.options.length) {
      const form = el('form', 'de-row'), input = textField(`prompt-number:${prompt.id}`, String(prompt.numberMin ?? 0)); input.type = 'number'; input.min = String(prompt.numberMin ?? 0); input.max = String(prompt.numberMax ?? 0x7fffffff); input.setAttribute('aria-label', prompt.text);
      const b = el('button', 'gold', 'Confirm'); b.type = 'submit'; b.disabled = !!state.busy; form.append(input, b); form.onsubmit = e => { e.preventDefault(); respond({ number: Number(input.value) }); }; panel.append(form);
    }
    if (prompt.kind === 'announce' && !prompt.candidates?.length) panel.append(announce.render(prompt, { busy: !!state.busy, declare: text => respond({ text }) }));
    if (prompt.cancelable) panel.append(button(['place', 'choice', 'cards'].includes(prompt.kind) ? 'Finish / cancel' : 'Cancel', () => respond({ cancel: true }), !!state.busy));
    if (!prompt.options.length && !prompt.candidates?.length && !['number', 'announce', 'cards'].includes(prompt.kind)) panel.append(note('Waiting for supported choices from the server.'));
    stage.append(panel);
  }
  function renderPreparation(): void {
    const prep = state.preparation; if (!prep) return;
    const archiveImage = controller.loadArchiveImage ? (path: string) => { const image = el('img'); image.alt = ''; image.draggable = false; image.style.visibility = 'hidden'; image.onload = () => { image.style.visibility = ''; }; loadArchiveArt(path, image); return image; } : null;
    const panel = el('section', 'de-panel de-duel-prompt de-stack', title('Duel Preparation'));
    const phase = prep.phase.toLowerCase();
    if (prep.role === 'partner' || prep.role === 'spectator') panel.append(el('p', '', prep.role === 'partner' ? 'Your captain is preparing the duel…' : 'Waiting for duel preparation…'));
    else if (/rps|hand|rock|scissors/.test(phase) && !/wait|result/.test(phase)) {
      // data/y/janken: jan_card_01..03 are rock, scissors and paper.
      panel.append(el('p', '', 'Choose your hand.'), el('div', 'de-row de-janken', ...(['Rock', 'Scissors', 'Paper'] as const).map((label, hand) => {
        const b = button(label, () => send({ type: 'chooseHand', hand: hand as 0 | 1 | 2 }), !!state.busy, true);
        if (archiveImage) { b.className = 'de-janken-card'; b.replaceChildren(archiveImage(`data/y/janken/jan_card_0${hand + 1}.png`), el('span', '', label)); }
        return b;
      })));
    } else if (/first|order|turn/.test(phase) && !/wait|result/.test(phase)) {
      const order = (label: string, first: boolean) => {
        const b = button(label, () => send({ type: 'chooseFirst', first }), !!state.busy, first);
        // jan_dai_01_e: four 64px plates, "first" on rows 0-1 and "second" on rows 2-3.
        if (archiveImage) { b.className = 'de-janken-order'; const plate = el('span', 'de-janken-plate'), image = archiveImage('data/y/janken/jan_dai_01_e.png'); image.style.top = first ? '0' : '-200%'; plate.append(image); b.replaceChildren(plate, el('span', 'de-sr', label)); }
        return b;
      };
      panel.append(el('p', '', 'You won! Choose who goes first.'), el('div', 'de-row de-janken', order('Go First', true), order('Go Second', false)));
    } else if (/ready|begin|confirm|invitation/.test(phase)) panel.append(button('Start Duel', () => send({ type: 'beginDuel' }), !!state.busy, true));
    else panel.append(el('p', '', 'Waiting for the other duelist…'));
    if (prep.opponentHand !== undefined && prep.opponentHand !== null) panel.append(note(`Opponent chose ${['Rock', 'Scissors', 'Paper'][prep.opponentHand] ?? 'an unknown hand'}.`));
    stage.append(panel);
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
  function renderSettings(): void {
    const n = sceneRoot('Options'), panel = el('section', 'de-panel de-center de-stack', title('Options'));
    const display = browserDisplay.state, displayGroup = el('section', 'de-settings-row', el('h3', '', 'Display'), note(display.active ? 'Fullscreen' : 'Windowed'));
    const fullscreen = button(display.active ? 'Exit Fullscreen' : 'Enter Fullscreen', () => { void browserDisplay.toggle(); }, !display.supported || display.pending); fullscreen.dataset.key = 'browser-fullscreen-toggle'; fullscreen.setAttribute('aria-pressed', String(display.active));
    displayGroup.append(fullscreen); if (display.pending) displayGroup.append(note('Waiting for the browser display change…'));
    if (!display.supported) displayGroup.append(note(browserDisplay.unavailableMessage));
    if (display.error) { const error = el('p', 'de-error', display.error); error.setAttribute('role', 'alert'); displayGroup.append(error); }
    panel.append(displayGroup);
    panel.append(renderLanguageSettings(state, language => send({ type: 'settings', settings: { language } })));
    if (state.dataStatus) {
      const data = state.dataStatus, details = el('details', 'de-audio-details'); details.dataset.key = 'options-data'; details.open = data.issues.length > 0;
      details.append(el('summary', '', 'Game data'), note(data.loading ? 'Loading game data…' : data.issues.length ? 'Some game data is unavailable.' : 'Game data loaded.'));
      if (data.issues.length) details.append(el('ul', '', ...data.issues.slice(0, 16).map(issue => el('li', '', issue))));
      details.append(button(data.loading ? 'Loading Game Data…' : 'Retry loading game data', () => send({ type: 'reloadData' }), data.loading || !!state.busy)); panel.append(details);
    }
    for (const [key, name] of [['sound', 'Sound effects'], ['music', 'Background audio']] as const) {
      const input = el('input'); input.type = 'range'; input.min = '0'; input.max = '1'; input.step = '0.05'; input.value = String(state.settings[key]); input.setAttribute('aria-label', name);
      input.onchange = () => send({ type: 'settings', settings: { [key]: Number(input.value) } }); panel.append(labelled(`${name} · ${Math.round(state.settings[key] * 100)}%`, input));
    }
    for (const [key, name] of [['reducedMotion', 'Reduce animation'], ['showCardNames', 'Show card names']] as const) { const input = el('input'); input.type = 'checkbox'; input.checked = state.settings[key]; input.onchange = () => send({ type: 'settings', settings: { [key]: input.checked } }); panel.append(labelled(name, input)); }
    if (state.capture) {
      const capture = state.capture, recording = el('details', 'de-audio-details'); recording.dataset.key = 'options-capture'; recording.append(el('summary', '', 'Gameplay recording'));
      recording.append(note('Record a duel for deterministic client comparison. Start before entering the duel for a complete recording.'), el('p', '', `${capture.state} · ${capture.records} records · ${(capture.jsonBytes / 1024).toFixed(1)} KiB`));
      if (capture.partial) recording.append(note('This recording is partial; it does not contain a complete duel start.'));
      if (capture.reason) recording.append(el('p', 'de-error', capture.reason));
      recording.append(el('div', 'de-row', button('Start Recording', () => { if (!capture.records) send({ type: 'captureStart' }); else confirmAction('Start a new recording? This replaces the current recording.', () => send({ type: 'captureStart' }), 'recording'); }, capture.recording || !!state.busy), button('Stop Recording', () => send({ type: 'captureStop' }), !capture.recording), button('Download Recording', () => send({ type: 'captureDownload' }), capture.recording || !capture.records))); panel.append(recording);
    }
    if (state.audio) { const audio = el('details', 'de-audio-details'); audio.dataset.key = 'options-audio'; audio.append(el('summary', '', 'Audio files & playback'), renderAudioFeature(state.audio, action => send({ type: 'audioAction', action }))); panel.append(audio); }
    panel.append(button('Back', () => open(state.sideboarding || state.preparation || state.match && !state.match.complete || state.duel && !state.duel.ended ? 'duel' : state.player ? 'lobby' : 'title'))); n.append(panel);
  }
  function render(): void {
    if (disposed || rendering) return; rendering = true;
    try {
      state = controller.getState();
      // the starter deck chooser: main's (web-shell/starter.js), from the lobby or Edit Deck like main's My Room / lobby / deck
      starterPicker.sync(state.mode !== 'free' && state.player ? state.player.id : null, state.starter?.claimable && (state.scene === 'lobby' || state.scene === 'deck') ? state.starter.decks : undefined);
      if (state.scene !== 'lobby') { Object.assign(lobbyUi, { open: null, searching: false, npc: null, join: null, cancel: false }); worldRenderer?.hide(); for (const view of avatarViews.values()) view.dispose(); avatarViews.clear(); }
      const restoreDrafts = !resetDraftsNextRender; resetDraftsNextRender = false;
      if (state.scene === 'duel' && state.duel?.timer && !state.duel.timer.paused && !state.duel.ended) { if (duelClock === null) duelClock = setInterval(() => { const timer = controller.getState().duel?.timer; if (duelClockNode && timer) duelClockNode.textContent = `Time ${clockText(timer)}`; }, 1000); } else if (duelClock !== null) { clearInterval(duelClock); duelClock = null; }
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
      if (state.scene !== 'shop') { shopScene = false; leaveShop = false; cardShop.dispose(); }
      else if (leaveShop && !state.busy) { leaveShop = false; queueMicrotask(() => open('lobby')); }
      if (!available(state.scene)) emptyPanel(state.scene, state.scene === 'deck' ? 'Edit Deck' : state.scene[0].toUpperCase() + state.scene.slice(1), 'This feature is unavailable.');
      else switch (state.scene) { case 'title': renderTitle(); break; case 'characters': renderCharacters(); break; case 'lobby': renderLobby(); break; case 'deck': renderDeck(); break; case 'shop': renderShop(); break; case 'duel': if (state.sideboarding) renderSideboarding(); else renderDuel(); break; case 'settings': renderSettings(); break; }
      if (state.preparation && !state.sideboarding && !htmlUi) renderPreparation();
      // the trade scene's ground and the rewrite's trunk under main's trade windows (htmlui/trade.ts)
      if (state.socialDetail && tradeScene(state.socialDetail.trade) && !['title', 'characters'].includes(state.scene))
        stage.append(renderTradeTrunk(state.socialDetail.trade, action => send({ type: 'socialAction', action }), { ...socialOptions(), search: local.tradeSearch, onSearch: value => { local.tradeSearch = value; requestRender(); }, backdrop: el => { deckBackdrop(el); }, open: trunkOpen(state.socialDetail.trade) }));
      if (state.tagLobby?.open && state.scene === 'lobby') stage.append(renderTagLobby(state.tagLobby, action => send({ type: 'tagAction', action })));
      if (state.npc && state.npc.npc && !['idle', 'duel'].includes(state.npc.stage) && ['lobby', 'duel'].includes(state.scene)) {
        const npc = state.npc; stage.append(renderNpcFeature(npc, command => { if (controller.getState().npc !== npc) { local.message = 'This NPC interaction has changed.'; requestRender(); return; } send(command); }, { busy: state.busy, htmlPackSelect: !!htmlUi, packName: id => state.packNames?.[id], resolveCard: id => state.npcCardViews?.[id], renderCard: card => drawCard(card), itemName: bit => giftItemName(bit) }));
      }
      // the message itself is main's error dialog (duelPrompts); the strip stays as the screen reader's live region only
      if (state.net?.reconnecting || state.connection === 'reconnecting') {
        const net = state.net, text = net?.what === 'duel' ? 'Connection lost. Returning to the duel' : 'Connection lost. Reconnecting';
        const notice = el('div', 'de-net-notice', `${text}${net?.attempt ? ` (try ${net.attempt + 1})` : ''}…`); notice.setAttribute('role', 'status'); notice.dataset.key = 'net-reconnecting'; stage.append(notice);
      }
      const message = state.error || local.message; if (message) { const notice = el('div', 'de-error de-notice de-sr-only', message); notice.setAttribute('role', 'alert'); stage.append(notice); }
      // main's menu bar and Main Menu (src/ui/htmlui: CWindowModelMenu, CMainMenu): main's entries where the rewrite has
      // the same thing, then the rewrite's own scenes (Find Player, Shop), the way back to a duel or the lobby, and
      // Return to Title (Disconnect). Before a character is chosen the bar is its strip alone, as on Select Player.
      const blocked = !!state.busy, sideboard = !!state.sideboarding;
      const go = (scene: Scene) => () => open(scene);
      const entries: MenuEntry[] = !state.player ? [] : [
        { label: 'Edit Deck', key: 'deck', disabled: blocked || sideboard, run: go('deck') },
        ...(state.profileDetail && state.mode !== 'free' ? [
          { label: 'My Profile', key: 'profile', disabled: blocked || sideboard, run: () => { if (state.scene !== 'lobby') open('lobby'); send({ type: 'profileAction', action: { type: 'open', pid: state.player!.id } }); } },
          // Create Comment edits the player's own profile lines: it opens over that profile (the controller's rule)
          { label: 'Create Comment', key: 'comment', disabled: blocked || sideboard, run: () => { if (state.scene !== 'lobby') open('lobby'); const p = state.profileDetail; if (p?.selectedPid !== state.player!.id) send({ type: 'profileAction', action: { type: 'open', pid: state.player!.id } }); htmlUiState.comment = [p?.selectedPid === state.player!.id ? p.comments[0] ?? '' : '', p?.selectedPid === state.player!.id ? p.comments[1] ?? '' : '']; showHtml(); } },
          // Change Title (CWindowModelTitleConfig): the earned titles, one worn
          ...(state.titles ? [{ label: 'Change Title', key: 'change-title', disabled: blocked || sideboard, run: () => { titleUi = { selected: -1, top: 0 }; showHtml(); } }] : []),
        ] : []),
        // Tournament (SCENE_TOURNAMENT): JoinGunsling, then the bracket once joined (the server enters on its first request)
        ...(state.mode !== 'free' && state.connection === 'online' ? [{ label: 'Tournament', key: 'tournament', disabled: blocked || sideboard, run: () => { if (state.scene !== 'lobby') open('lobby'); if (tourUi.joined) { tourUi.bracket = true; send({ type: 'tournamentRefresh' }); } else tourUi.join = true; showHtml(); } }] : []),
        ...(state.mode !== 'free' && state.location ? [
          // Return to your Room (the private My Room lobby) and, inside it, the door back to the world
          state.location === 'my-room'
            ? { label: 'Return to the World', key: 'leave-room', disabled: blocked || sideboard || !!state.duel, run: () => { if (state.scene !== 'lobby') open('lobby'); send({ type: 'myRoom', enter: false }); } }
            : { label: 'Return to your Room', key: 'my-room', disabled: blocked || sideboard || !!state.duel, run: () => { if (state.scene !== 'lobby') open('lobby'); send({ type: 'myRoom', enter: true }); } },
        ] : []),
        { label: 'DUEL OPTIONS', key: 'settings', disabled: blocked, run: () => { optionsUi = { kind: 'options' }; showHtml(); } },
        ...(state.mode !== 'free' ? [
          { label: 'D-Mail', key: 'mail', disabled: blocked || sideboard || !state.socialDetail, run: () => { htmlUiState.mail = { top: 0, selected: -1 }; send({ type: 'socialAction', action: { type: 'refreshMail' } }); showHtml(); } },
          // Duel Log (CWindowModelDuellogTop): the character's duel history, its stats and the search
          { label: 'Duel Log', key: 'duellog', disabled: blocked || sideboard, run: () => { duellog = duellogUi(); loadDuellog(duellog.search, 1); } },
          { label: 'Audio', key: 'audio', disabled: blocked, run: () => { optionsUi = { kind: 'audio' }; audioUi.message = undefined; showHtml(); } },
          // Find a Player (CWindowModelFriendEnum): a player by name, and the friend and team invitations waiting
          ...(state.socialDetail ? [{ label: 'Find Player', key: 'find', disabled: blocked || sideboard, run: () => { htmlUiState.find = { name: '', target: null, selected: -1 }; send({ type: 'socialAction', action: { type: 'refreshTeam' } }); showHtml(); } }] : []),
          // main's list windows (src/ui/htmlui: CWindowModelBlacklist / Friendlist / Teamlist) over the scene
          ...(state.socialDetail ? (['ignore', 'friends', 'team'] as const).map(kind => ({ label: { ignore: 'Ignore List', friends: 'Friend List', team: 'Team List' }[kind], key: kind === 'team' ? 'teams' : kind,
            disabled: blocked || sideboard, run: () => { htmlUiState.lists = { kind, selected: -1 }; if (kind === 'team') send({ type: 'socialAction', action: { type: 'refreshTeam' } }); if (kind === 'friends') loadPresence(); showHtml(); } })) : []),
          { label: 'Shop', key: 'shop', disabled: blocked || sideboard, run: go('shop') },
        ] : []),
        ...((state.duel || sideboard) && state.scene !== 'duel' ? [{ label: 'Return to Duel', key: 'duel', disabled: blocked, run: go('duel') }] : []),
        { label: 'Return to Lobby', key: 'lobby', disabled: blocked || sideboard, run: go('lobby') },
        // Return to Title stays available while busy: it is how a player abandons a request that never answers
        ...(state.connection === 'online' ? [{ label: 'Return to Title', key: 'title', run: () => confirmAction('Disconnect from the game?', () => send({ type: 'disconnect' }), 'disconnect') }] : []),
      ];
      const world = state.scene === 'lobby' && state.lobby;
      // the deck editor's bar is its strip alone, as on main (the editor's EXIT leaves it); the shop's bar is its strip (main's capture): Exit Store leaves
      menuView = state.scene === 'title' || state.scene === 'duel' ? null : { entries, keys: !!state.player && state.scene !== 'deck' && state.scene !== 'shop',
        message: state.player ? (world && waitingMessage({ state, text: id => gameTexts.get(id) })) || `${state.mode === 'free' ? 'Free Duel · ' : ''}${state.status}` : '',
        ...(world ? { duel: () => { duelKey(state, lobbyUi); showHtml(); }, move: () => { moveKey(lobbyUi); showHtml(); } } : {}) };
      nav.replaceChildren(status);
      // Extension panels also get stable keyboard focus when their data changes.
      for (const tag of ['button', 'input', 'textarea', 'select', 'canvas']) for (const [i, control] of Array.from(host.querySelectorAll<HTMLElement>(tag)).entries()) {
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
      if (focusNpc) Array.from(host.querySelectorAll<HTMLElement>('[data-key]')).find(x => x.dataset.key?.startsWith('npc:') && !(x as HTMLButtonElement).disabled)?.focus({ preventScroll: true });
    } finally { pruneArt(); rendering = false; }
    showHtml();
  }
  host.onkeydown = e => {
    if (e.key !== 'Escape') return;
    if (browserDisplay.state.active) return;
    if (htmlUiState.menu) { e.preventDefault(); htmlUiState.menu = false; showHtml(); return; }
    // DUEL OPTIONS / Audio (a modal over the scene): its language error first, then the window
    if (optionsUi) { e.preventDefault(); const refused = state.languageStatus?.error; if (refused && refused !== languageErrorSeen) languageErrorSeen = refused; else optionsUi = null; showHtml(); return; }
    if (state.duel?.prompt?.cancelable && state.scene === 'duel') { e.preventDefault(); respondToPrompt(state.duel.prompt.id, { cancel: true }); }
    else if (state.scene === 'lobby' && state.profileDetail?.selectedPid !== null && state.profileDetail?.selectedPid !== undefined) { e.preventDefault(); send({ type: 'profileAction', action: { type: 'close' } }); }
    else if (state.scene === 'deck' && (deckScene.ui.dialog || deckScene.ui.files)) { e.preventDefault(); deckScene.ui.dialog = null; deckScene.ui.files = null; showHtml(); }
    else if (local.inspected && state.scene === 'duel') { e.preventDefault(); local.inspected = null; requestRender(); }
    else if (state.scene !== 'duel' && !['title', 'lobby', 'characters'].includes(state.scene)) open(state.player ? 'lobby' : 'title');
  };
  // With nothing focused, keys go to <body>, outside the host: Escape still closes the topmost modal.
  const bodyKeys = (e: KeyboardEvent): void => { if (e.target === document.body || e.target === document.documentElement) host.onkeydown?.(e); };
  globalThis.document?.addEventListener?.('keydown', bodyKeys);
  const unsubscribe = controller.subscribe(next => { if (!disposed && !queued && canSkipRender(state, next)) { state = next; return; } if (!disposed && !queued && canPresentLobby(state, next)) { state = next; presentLobby(next.lobby!); return; } if (!disposed && !queued && canPresent(state, next)) { state = next; present(next.duel!); } else requestRender(); }); render();
  return { render, htmlUi: htmlDriver, dispose() { if (disposed) return; disposed = true; starterPicker.close(); discord.dispose(); cardShop.dispose(); pageMods.dispose(); deckDom?.dispose(); deckDom = null; deckScene.dispose(); htmlUi?.dispose(); htmlUi = null; pictureArt.dispose(); setPictureResolver(null); disposePictures(); startScene?.dispose(); startScene = null; globalThis.removeEventListener?.('yo2-tag-lobby-open', onTagDuel); globalThis.document?.removeEventListener?.('keydown', bodyKeys); if (duelClock !== null) { clearInterval(duelClock); duelClock = null; } for (const view of previewAvatars.values()) view.dispose(); host.removeEventListener?.('pointerdown', holdPointer, true); globalThis.removeEventListener?.('pointerup', releasePointer, true); globalThis.removeEventListener?.('pointercancel', releasePointer, true); if (pointerTimer) clearTimeout(pointerTimer); if (sideboardClock !== null) { clearInterval(sideboardClock); sideboardClock = null; } unsubscribe(); browserDisplay.dispose(); worldWalk?.dispose(); worldWalk = null; phone?.dispose(); duelScene.dispose(); observer?.disconnect(); for (const view of avatarViews.values()) view.dispose(); avatarViews.clear(); worldRenderer?.dispose(); header.replaceChildren(); stage.replaceChildren(); nav.replaceChildren(); for (const entry of art.values()) { entry.abort.abort(); for (const image of entry.images) image.removeAttribute('src'); entry.images.clear(); entry.lease?.release(); entry.lease = null; } art.clear(); fieldNodes.clear(); avatarNodes.clear(); effectsLayer = null; drafts.clear(); expanded.clear(); delete lpNodes[0]; delete lpNodes[1]; delete lpBars[0]; delete lpBars[1]; if (packDragOver) globalThis.document?.removeEventListener?.('dragover', packDragOver); if (packDropped) globalThis.document?.removeEventListener?.('drop', packDropped); packDragOver = packDropped = null; packSheet?.close(); packSheet = null; gameCursor?.dispose(); gameCursor = null; host.onkeydown = null; header.replaceChildren(); stage.replaceChildren(); nav.replaceChildren(); host.replaceChildren(); host.remove(); local.selected.clear(); local.inspected = null; local.promptInspection = null; } };
}
