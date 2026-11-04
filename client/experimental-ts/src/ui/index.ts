import type { DuelCardView, DuelView, CardView, ClientCommand, ClientController, ClientView, DeckZone, DuelPromptView, DuelResponse, Scene } from './contracts';
import type { CollectionSort } from './helpers';
import { deckPlacementReason, fieldCardPosition, filterCollection, sortCollection, gamePoint, safeImageUrl, validatePromptResponse } from './helpers';
import { CLIENT_CSS } from './styles';
import { renderAccountFeature } from './extra/account';
import { renderAudioFeature } from './extra/audio';
import { renderSocialFeature } from './extra/social';
import { renderOnlineFeature } from './extra/online';
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
function cardTile(card: CardView, showName = true, faceUp = true, load?: (card: CardView, image: HTMLImageElement) => void): HTMLElement {
  const tile = el('div', 'de-card' + (faceUp ? '' : ' de-card-back'));
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
  message: string; search: string; collectionType: string; collectionSort: CollectionSort; collectionPage: number; deckZone: DeckZone; inspected: CardView | null; inspectedFrom: DeckZone | 'collection' | 'duel'; inspectedIndex: number | null;
  channel: string; chat: string; whisperTarget: string; target: number | null; promptId: string | null; selected: Set<string>;
  roomOptions: { style?: 3 | 4; allowSurrender?: boolean; timeLimit?: boolean; allowWatch?: boolean }; roomPassword: string; username: string; characterName: string; characterSlot: number; deckName: string; shopCategory: string;
}
export interface MountedClient { dispose(): void; render(): void; }

/** A fully disposable view. Networking, game rules and persistence are injected by the controller. */
export function mountClient(root: HTMLElement, controller: ClientController): MountedClient {
  let disposed = false, rendering = false, queued = false;
  let state = controller.getState();
  const local: LocalState = { message: '', search: '', collectionType: 'all', collectionSort: 'collection', collectionPage: 0, deckZone: 'main', inspected: null, inspectedFrom: 'collection', inspectedIndex: null, channel: 'lobby', chat: '', whisperTarget: '', target: null, promptId: null, selected: new Set(), roomOptions: {}, roomPassword: '', username: '', characterName: '', characterSlot: 0, deckName: '', shopCategory: 'all' };
  const host = el('section', 'de-client'); host.setAttribute('aria-label', 'Duel Evolution');
  const css = el('style'); css.textContent = CLIENT_CSS;
  const header = el('header', 'de-top'), stage = el('main', 'de-stage'), nav = el('nav', 'de-nav'); nav.setAttribute('aria-label', 'Game menu');
  host.append(css, header, stage, nav); root.append(host);
  interface ArtEntry { code: number; abort: AbortController; images: Set<HTMLImageElement>; used: boolean; pending: boolean; failed: boolean; lease: { url: string; release(): void } | null; }
  const fieldNodes = new Map<string, HTMLElement>();
  const avatarNodes = new Map<number, HTMLElement>();
  let effectsLayer: HTMLElement | null = null;
  const lpNodes: Partial<Record<0 | 1, HTMLElement>> = {};
  const drafts = new Map<string, string>();
  const expanded = new Map<string, boolean>();
  let renderedIdentity = '';
  const art = new Map<number, ArtEntry>();
  const imageEntries = new WeakMap<Element, ArtEntry>();
  const startArt = (entry: ArtEntry) => {
    if (disposed || entry.pending || entry.failed || entry.lease || !controller.loadCardImage) return;
    entry.pending = true;
    let pending: Promise<{ url: string; release(): void }>;
    try { pending = controller.loadCardImage(entry.code, entry.abort.signal); } catch { entry.pending = false; entry.failed = true; return; }
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
    if (!controller.loadCardImage || card.passcode === undefined || !Number.isSafeInteger(card.passcode) || card.passcode <= 0) return;
    let entry = art.get(card.passcode);
    if (!entry) { entry = { code: card.passcode, abort: new AbortController(), images: new Set(), used: true, pending: false, failed: false, lease: null }; art.set(card.passcode, entry); }
    entry.used = true; entry.images.add(image);
    if (entry.lease) image.src = entry.lease.url;
    else if (observer) { imageEntries.set(image, entry); observer.observe(image); }
    else startArt(entry);
  };
  const drawCard = (card: CardView, showName = true, faceUp = true) => cardTile(card, showName, faceUp, controller.loadCardImage ? loadArt : undefined);
  const placeFieldCard = (node: HTMLElement, card: DuelCardView, handCount: number) => {
    const p = fieldCardPosition(card, handCount), motion = card.motion;
    node.style.left = `${(motion?.x ?? p.x) / 1024 * 100}%`; node.style.top = `${(motion?.y ?? p.y) / 768 * 100}%`;
    node.style.width = `${p.width / 1024 * 100}%`; node.style.height = `${p.height / 768 * 100}%`;
    node.style.transform = motion ? `translate(-50%,-50%) rotate(${motion.rotation}deg) scaleX(${motion.scaleX})` : '';
    node.style.zIndex = motion?.zIndex === undefined ? '' : String(motion.zIndex);
    node.style.opacity = motion?.opacity === undefined ? '' : String(Math.max(0, Math.min(1, motion.opacity)));
  };
  const canSkipRender = (previous: ClientView, next: ClientView) => {
    if (previous.scene !== next.scene || previous.status !== next.status || previous.connection !== next.connection || previous.error !== next.error || previous.busy !== next.busy || previous.settings !== next.settings || previous.preparation !== next.preparation || previous.unavailable?.[previous.scene] !== next.unavailable?.[next.scene]) return false;
    if (previous.player?.id !== next.player?.id || previous.player?.name !== next.player?.name || previous.player?.level !== next.player?.level) return false;
    // Unrelated world packets must not replace open mail/trade confirmations or audio controls.
    if (next.scene === 'social') return previous.social === next.social && previous.socialDetail === next.socialDetail;
    if (next.scene === 'shop') return previous.shop === next.shop && previous.online === next.online;
    if (next.scene === 'settings') return previous.audio === next.audio && previous.capture === next.capture;
    return false;
  };
  const canPresentLobby = (previous: ClientView, next: ClientView) => {
    const a = previous.lobby, b = next.lobby;
    if (previous.scene !== 'lobby' || next.scene !== 'lobby' || !a || !b || previous.status !== next.status || previous.connection !== next.connection || previous.error !== next.error || previous.busy !== next.busy || previous.settings !== next.settings || previous.preparation !== next.preparation || previous.starter !== next.starter || previous.online !== next.online) return false;
    if (previous.player?.id !== next.player?.id || previous.player?.name !== next.player?.name || previous.player?.level !== next.player?.level || a.name !== b.name || a.width !== b.width || a.height !== b.height || a.mapImage !== b.mapImage || a.connected !== b.connected || a.chat !== b.chat || a.rooms !== b.rooms || a.areas !== b.areas || a.npcs !== b.npcs || a.invitation !== b.invitation || a.avatars.length !== b.avatars.length) return false;
    return a.avatars.every((p, i) => { const n = b.avatars[i]; return p.id === n.id && p.name === n.name && p.self === n.self && p.npc === n.npc && p.image === n.image; });
  };
  const presentLobby = (lobby: NonNullable<ClientView['lobby']>) => {
    for (const avatar of lobby.avatars) { const node = avatarNodes.get(avatar.id); if (node) { node.style.left = `${avatar.x / (lobby.width ?? 1024) * 100}%`; node.style.top = `${avatar.y / (lobby.height ?? 768) * 100}%`; } }
  };
  const canPresent = (previous: ClientView, next: ClientView) => {
    const a = previous.duel, b = next.duel;
    if (previous.scene !== 'duel' || next.scene !== 'duel' || !a || !b || previous.status !== next.status || previous.connection !== next.connection || previous.error !== next.error || previous.busy !== next.busy || previous.settings !== next.settings || previous.preparation !== next.preparation) return false;
    if (a.prompt !== b.prompt || a.actions !== b.actions || a.log !== b.log || a.turn !== b.turn || a.phase !== b.phase || a.turnPlayer !== b.turnPlayer || a.ended !== b.ended || a.waiting !== b.waiting || a.spectating !== b.spectating || a.timer !== b.timer || a.cards.length !== b.cards.length) return false;
    if (a.players.some((p, i) => p.name !== b.players[i].name)) return false;
    return a.cards.every((c, i) => { const n = b.cards[i]; return c.id === n.id && c.passcode === n.passcode && c.name === n.name && c.description === n.description && c.image === n.image && c.controller === n.controller && c.zone === n.zone && c.index === n.index && c.faceUp === n.faceUp && c.position === n.position && c.attack === n.attack && c.defense === n.defense; });
  };
  const presentEffects = (duel: DuelView) => {
    for (const node of fieldNodes.values()) delete node.dataset.effect;
    if (!effectsLayer) return;
    effectsLayer.replaceChildren();
    for (const effect of (duel.effects ?? []).slice(-24)) {
      const node = el('span', `de-effect de-effect-${effect.type}`), progress = Math.max(0, Math.min(1, effect.progress));
      const card = effect.cardId ? duel.cards.find(c => c.id === effect.cardId) : undefined;
      if (effect.cardId) { const target = fieldNodes.get(effect.cardId); if (target) target.dataset.effect = effect.type; }
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
    for (const i of [0, 1] as const) if (lpNodes[i]) lpNodes[i]!.textContent = `LP ${duel.players[i].lp.toLocaleString()}`;
    presentEffects(duel);
  };
  const pruneArt = () => {
    for (const [code, entry] of art) if (!entry.used) { entry.abort.abort(); entry.lease?.release(); entry.images.clear(); art.delete(code); }
  };
  const requestRender = () => { if (!queued && !disposed) { queued = true; queueMicrotask(() => { queued = false; if (!disposed) render(); }); } };
  const send = (command: ClientCommand) => {
    if (disposed) return;
    local.message = '';
    try {
      const result = controller.dispatch(command);
      if (result && typeof result.then === 'function') void result.catch((e: unknown) => { if (!disposed) { local.message = e instanceof Error ? e.message : 'The action could not be completed.'; requestRender(); } });
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
      panel.append(el('p', '', `Signed in${state.auth.name ? ` as ${state.auth.name}` : ''}.`), button(state.connection === 'online' ? 'Continue' : 'Go Online', () => state.connection === 'online' ? open('characters') : send({ type: 'connect' }), !!state.busy, true), button('Sign Out', () => send({ type: 'signOut' }), !!state.busy));
    } else if (state.auth) {
      const form = el('form', 'de-stack'), username = textField('username', local.username, 'Username'), password = textField('password', '', 'Password');
      username.autocomplete = 'username'; username.maxLength = 64; password.type = 'password'; password.autocomplete = 'current-password'; password.maxLength = 128;
      username.required = password.required = true; username.oninput = () => { local.username = username.value; };
      const submit = el('button', 'gold', 'Sign In'); submit.type = 'submit'; submit.disabled = !!state.busy;
      form.append(labelled('User ID', username), labelled('Password', password), submit);
      form.onsubmit = e => { e.preventDefault(); if (!username.value.trim() || !password.value) return; send({ type: 'signIn', username: username.value.trim(), password: password.value }); password.value = ''; };
      const discord = el('a', '', 'Sign in with Discord'); discord.href = '/api/auth/sign-in/discord?return=/';
      panel.append(form, discord);
    } else panel.append(button('Go Online', () => send({ type: 'connect' }), !!state.busy, true));
    if (state.accountDetail) { const account = el('details', 'de-account-details'); account.dataset.key = `title-account:${state.accountDetail.panel}`; account.open = state.accountDetail.panel !== 'overview'; account.append(el('summary', '', 'Registration, password recovery & account options'), renderAccountFeature(state.accountDetail, action => send({ type: 'accountAction', action }))); panel.append(account); }
    panel.append(button('Options', () => open('settings')), note(state.status)); n.append(panel);
  }
  function renderCharacters(): void {
    const n = sceneRoot('Select Character'), panel = el('section', 'de-panel de-center de-stack', title('Select Character'));
    const grid = el('div', 'de-characters');
    for (const c of state.characters) {
      const b = button('', () => send({ type: 'selectCharacter', slot: c.slot }), !!state.busy, !!c.selected);
      b.append(el('strong', '', c.name), el('span', '', `Slot ${c.slot + 1}${c.level ? ` · Lv ${c.level}` : ''}`)); const slot = el('article', 'de-character-slot', b, button(`Delete ${c.name}`, () => { if (confirmAction(`Permanently delete character ${c.name} and their game progress?`)) send({ type: 'deleteCharacter', slot: c.slot }); }, !!state.busy)); grid.append(slot);
    }
    panel.append(grid);
    if (!state.characters.length) panel.append(note('No characters received. Create a character or wait for the server.'));
    const create = el('form', 'de-row'), name = textField('character-name', local.characterName, 'Character name'); name.maxLength = 16; name.required = true;
    name.oninput = () => { local.characterName = name.value; };
    const slot = el('select'); slot.setAttribute('aria-label', 'Character slot'); slot.dataset.key = 'character-slot';
    for (let k = 0; k < 4; k++) if (!state.characters.some(c => c.slot === k)) { const o = el('option', '', `Slot ${k + 1}`); o.value = String(k); slot.append(o); }
    slot.value = String(local.characterSlot); if (!slot.value && slot.options[0]) slot.value = slot.options[0].value;
    slot.onchange = () => { local.characterSlot = Number(slot.value); };
    const submit = el('button', '', 'Create'); submit.type = 'submit'; submit.disabled = !!state.busy || !slot.options.length;
    create.append(slot, name, submit); create.onsubmit = e => { e.preventDefault(); if (name.value.trim() && slot.value) send({ type: 'createCharacter', slot: Number(slot.value), name: name.value.trim() }); };
    panel.append(create, button('Back', () => open('title'))); n.append(panel);
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
    const mapUrl = safeImageUrl(lobby.mapImage);
    if (mapUrl) { const image = el('img', 'de-stage-layer'); image.src = mapUrl; image.alt = lobby.name; image.style.width = '100%'; image.style.height = '100%'; image.style.objectFit = 'fill'; image.style.pointerEvents = 'none'; stage.append(image); }
    const worldW = lobby.width ?? 1024, worldH = lobby.height ?? 768;
    canvas.onclick = e => { if (lobby.connected && !state.busy) { const p = gamePoint(e.clientX, e.clientY, canvas.getBoundingClientRect(), worldW, worldH); if (p) send({ type: 'move', ...p }); } };
    canvas.onkeydown = e => {
      const currentLobby = controller.getState().lobby, self = currentLobby?.avatars.find(a => a.self); if (!self || !currentLobby?.connected) return;
      const delta: Record<string, [number, number]> = { ArrowLeft: [-32, 0], ArrowRight: [32, 0], ArrowUp: [0, -32], ArrowDown: [0, 32] };
      const d = delta[e.key]; if (!d) return; e.preventDefault(); send({ type: 'move', x: Math.max(0, Math.min(worldW, self.x + d[0])), y: Math.max(0, Math.min(worldH, self.y + d[1])) });
    };
    stage.append(el('h2', 'de-lobby-name', lobby.name));
    for (const avatar of lobby.avatars) {
      const b = button('', () => { local.target = avatar.id; requestRender(); }, !lobby.connected);
      b.className = 'de-avatar' + (avatar.self ? ' self' : ''); b.style.left = `${avatar.x / worldW * 100}%`; b.style.top = `${avatar.y / worldH * 100}%`; b.setAttribute('aria-label', `${avatar.name}${avatar.npc ? ', NPC' : ''}`);
      const art = safeImageUrl(avatar.image);
      if (art) { const img = el('img', 'de-avatar-sprite'); img.src = art; img.alt = ''; b.append(img); } else b.append(el('span', 'de-avatar-placeholder'));
      b.append(el('span', 'de-avatar-name', avatar.name)); b.dataset.key = `avatar:${avatar.id}`; avatarNodes.set(avatar.id, b); stage.append(b);
    }
    const target = lobby.avatars.find(a => a.id === local.target);
    if (target) stage.append(el('section', 'de-panel de-context de-stack', title(target.name), button('Talk / Interact', () => send({ type: 'interact', playerId: target.id }), !!state.busy), button('Duel', () => send({ type: 'duelChallenge', playerId: target.id }), !!state.busy || !!target.self), button('Close', () => { local.target = null; requestRender(); })));
    const chat = el('section', 'de-panel de-chat'); chat.setAttribute('aria-label', 'Chat');
    const lines = el('div', 'de-chat-log'); lines.setAttribute('role', 'log'); lines.setAttribute('aria-live', 'polite');
    for (const line of lobby.chat.slice(-200)) lines.append(el('div', 'de-chat-line', el('strong', '', `${line.sender}: `), line.text));
    const form = el('form'), channel = el('select'); channel.setAttribute('aria-label', 'Chat channel'); channel.dataset.key = 'chat-channel';
    for (const value of lobby.channels.length ? lobby.channels : ['lobby']) { const o = el('option', '', value); o.value = value; channel.append(o); }
    if (!Array.from(channel.options).some(o => o.value === local.channel)) local.channel = channel.options[0]?.value ?? 'lobby';
    channel.value = local.channel; channel.onchange = () => { local.channel = channel.value; requestRender(); };
    const input = textField('chat', local.chat, 'Enter a message…'); input.maxLength = 256; input.setAttribute('aria-label', 'Chat message'); input.oninput = () => { local.chat = input.value; };
    const submit = el('button', 'gold', 'Send'); submit.type = 'submit'; submit.disabled = !lobby.connected || !!state.busy;
    form.append(channel);
    if (local.channel === 'whisper') { const target = textField('chat-target', local.whisperTarget, 'Player name or ID'); target.setAttribute('aria-label', 'Whisper recipient'); target.maxLength = 64; target.oninput = () => { local.whisperTarget = target.value; }; form.append(target); }
    form.append(input, submit); form.onsubmit = e => { e.preventDefault(); if (input.value.trim()) { send({ type: 'chat', channel: local.channel, text: input.value, ...(local.channel === 'whisper' ? { target: local.whisperTarget.trim() } : {}) }); local.chat = ''; input.value = ''; } };
    chat.append(lines, form); stage.append(chat); lines.scrollTop = lines.scrollHeight;
    if (lobby.areas?.length || lobby.npcs?.length || lobby.rooms?.length || state.player) {
      const places = el('section', 'de-panel de-lobby-places de-stack');
      if (lobby.areas?.length) {
        const select = el('select'); select.dataset.key = 'lobby-area'; select.setAttribute('aria-label', 'Lobby area');
        const blank = el('option', '', 'Choose an area'); blank.value = ''; select.append(blank);
        for (const a of lobby.areas) { const o = el('option', '', `${a.name}${a.population === undefined ? '' : ` (${a.population})`}`); o.value = `${a.area}/${a.block}`; select.append(o); }
        select.onchange = () => { const area = lobby.areas?.find(a => `${a.area}/${a.block}` === select.value); if (area) send({ type: 'moveArea', area: area.area, block: area.block }); };
        places.append(select);
      }
      if (lobby.npcs?.length) {
        const list = el('details'); list.dataset.key = 'lobby-npcs'; list.append(el('summary', '', 'NPC Duelists'));
        for (const npc of lobby.npcs) list.append(button(npc.name, () => send({ type: 'interact', playerId: -Math.abs(npc.id) }), !lobby.connected || !!state.busy));
        places.append(list);
      }
      const rooms = el('details'); rooms.dataset.key = 'lobby-duel-rooms'; rooms.append(el('summary', '', `Duel Rooms (${lobby.rooms?.length ?? 0})`));
      rooms.append(button('Create Duel', () => { const options = { ...local.roomOptions, ...(local.roomPassword ? { password: local.roomPassword } : {}) }; send(Object.keys(options).length ? { type: 'createDuelRoom', options } : { type: 'createDuelRoom' }); local.roomPassword = ''; }, !lobby.connected || !!state.busy));
      const roomSettings = el('details'); roomSettings.dataset.key = 'lobby-room-options'; roomSettings.append(el('summary', '', 'Room Options'));
      const style = el('select'); style.dataset.key = 'room-style'; style.setAttribute('aria-label', 'Duel format');
      for (const [value, label] of [[3, 'Single Duel'], [4, 'Match']] as const) { const option = el('option', '', label); option.value = String(value); style.append(option); } style.value = String(local.roomOptions.style ?? 3); style.onchange = () => { local.roomOptions.style = Number(style.value) as 3 | 4; };
      roomSettings.append(labelled('Duel format', style));
      for (const [key, label] of [['allowSurrender', 'Allow surrender'], ['timeLimit', 'Time limit'], ['allowWatch', 'Allow spectators']] as const) { const input = el('input'); input.type = 'checkbox'; input.checked = local.roomOptions[key] !== false; input.onchange = () => { local.roomOptions[key] = input.checked; }; roomSettings.append(labelled(label, input)); }
      const roomPassword = textField('room-password', local.roomPassword, 'Optional room password'); roomPassword.type = 'password'; roomPassword.maxLength = 16; roomPassword.autocomplete = 'off'; roomPassword.oninput = () => { local.roomPassword = roomPassword.value; }; roomSettings.append(labelled('Password', roomPassword)); rooms.append(roomSettings);
      for (const room of lobby.rooms ?? []) {
        const row = el('div', 'de-room-row', el('strong', '', room.name || `Room ${room.id}`));
        row.append(button('Challenge', () => { if (room.password) { const password = typeof window.prompt === 'function' ? window.prompt('Room password:') : null; if (password !== null) send({ type: 'challengeRoom', roomId: room.id, password }); } else send({ type: 'challengeRoom', roomId: room.id }); }, !lobby.connected || !!state.busy || room.owner === state.player?.id), button('Watch', () => send({ type: 'spectate', pid: room.owner }), !lobby.connected || !!state.busy || room.owner === state.player?.id));
        if (room.owner === state.player?.id) row.append(button('Close Your Duel Room', () => { if (confirmAction('Close your duel room?')) send({ type: 'deleteDuelRoom' }); }, !!state.busy));
        rooms.append(row);
      }
      if (state.online) { const tag = el('details'); tag.dataset.key = 'lobby-tag'; tag.append(el('summary', '', 'Tag Duel'), renderOnlineFeature(state.online, action => send({ type: 'onlineAction', action }), 'tag')); rooms.append(tag); }
      places.append(rooms); stage.append(places);
    }
    if (lobby.invitation) {
      const invitation = lobby.invitation;
      const panel = el('section', 'de-panel de-duel-prompt de-stack', title('Duel Invitation'), el('p', '', `${invitation.name} challenges you to a duel.`), el('div', 'de-row', button('Accept Duel', () => send({ type: 'replyChallenge', accept: true }), !!state.busy, true), button('Decline', () => send({ type: 'replyChallenge', accept: false }), !!state.busy)));
      panel.setAttribute('role', 'dialog'); panel.setAttribute('aria-label', 'Duel Invitation'); stage.append(panel);
    }
    if (state.starter?.claimable) renderStarter();
  }
  function renderStarter(): void {
    const panel = el('section', 'de-panel de-duel-prompt de-stack', title('Choose your Starter Deck'), el('p', '', 'Choose one free structure deck for this character.'));
    for (const d of state.starter?.decks ?? []) panel.append(button(`${d.name}${d.mainCount !== undefined ? ` · ${d.mainCount} cards` : ''}`, () => { if (confirmAction(`Claim ${d.name} as your starter deck? This choice is permanent.`)) send({ type: 'claimStarter', id: d.id }); }, !!state.busy, true));
    stage.append(panel);
  }
  function confirmAction(message: string): boolean { return typeof window.confirm === 'function' ? window.confirm(message) : false; }
  function inspect(card: CardView, from: DeckZone | 'collection' | 'duel' = 'collection', index: number | null = null): void { local.inspected = card; local.inspectedFrom = from; local.inspectedIndex = index; requestRender(); }
  function renderDeck(): void {
    const editor = state.deckEditor; if (!editor) return emptyPanel('deck', 'Edit Deck', 'Loading your decks and collection.');
    const n = sceneRoot('Edit Deck'), panel = el('section', 'de-panel de-stack de-fill'); panel.append(title('Edit Deck'));
    const toolbar = el('div', 'de-row'); const deckSelect = el('select'); deckSelect.setAttribute('aria-label', 'Saved deck'); deckSelect.dataset.key = 'deck-select';
    const blank = el('option', '', 'Choose a deck'); blank.value = ''; deckSelect.append(blank);
    for (const deck of editor.decks) { const o = el('option', '', deck.name); o.value = deck.name; deckSelect.append(o); }
    deckSelect.value = editor.current?.name ?? ''; deckSelect.onchange = () => { if (deckSelect.value) send({ type: 'selectDeck', name: deckSelect.value }); };
    const name = textField('deck-name', editor.current?.name ?? local.deckName, 'Deck name'); name.maxLength = 40; name.setAttribute('aria-label', 'Deck name'); name.oninput = () => { local.deckName = name.value; };
    toolbar.append(deckSelect, name, button('New', () => send({ type: 'newDeck', name: name.value.trim() || 'New Deck' }), !!state.busy), button('Save', () => { if (name.value.trim() && name.value !== editor.current?.name) send({ type: 'renameDeck', name: name.value.trim() }); send({ type: 'saveDeck' }); }, !editor.current || !!state.busy || !!editor.loading, true), button('Delete', () => { if (editor.current && confirmAction(`Delete deck “${editor.current.name}”?`)) send({ type: 'deleteDeck', name: editor.current.name }); }, !editor.current || !!state.busy));
    panel.append(toolbar);
    if (editor.error) panel.append(el('p', 'de-error', editor.error));
    const cols = el('div', 'de-deck-columns');
    const inspector = el('aside', 'de-card-inspector de-stack'); const card = local.inspected;
    if (card) { inspector.append(drawCard(card), el('h3', '', card.name), note([card.type, card.attribute, card.level ? `Lv ${card.level}` : ''].filter(Boolean).join(' · ')), note(`ATK ${card.attack ?? '?'} / DEF ${card.defense ?? '?'}`), el('p', '', card.description ?? 'Card description unavailable.')); }
    else inspector.append(note('Select a card to inspect its details.'));
    const deckColumn = el('section', 'de-scroll');
    const lookup = new Map(editor.collection.map(c => [c.passcode, c]));
    for (const zone of ['main', 'extra', 'side'] as const) {
      const ids = editor.current?.[zone] ?? [], zoneNode = el('section', 'de-deck-zone'), heading = el('div', 'de-zone-title', `${zone === 'extra' ? 'Fusion' : zone === 'main' ? 'Main' : 'Side'} Deck`, el('span', '', String(ids.length)));
      const grid = el('div', 'de-card-grid');
      for (const [index, passcode] of ids.entries()) {
        const current = lookup.get(passcode) ?? { id: String(passcode), name: `Card ${passcode}`, passcode };
        const tile = drawCard(current, state.settings.showCardNames), b = button('', () => inspect(current, zone, index));
        b.className = tile.className; b.dataset.key = `deck-card:${zone}:${index}`; b.append(...Array.from(tile.childNodes)); b.title = `${current.name} · double-click to remove`; b.ondblclick = () => send({ type: 'deckCard', passcode, from: zone, to: 'collection', index });
        b.draggable = true; b.ondragstart = e => { e.dataTransfer?.setData('application/x-duel-card', JSON.stringify({ passcode, from: zone, index })); };
        b.onkeydown = e => { if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); send({ type: 'deckCard', passcode, from: zone, to: 'collection', index }); } };
        grid.append(b);
      }
      zoneNode.append(heading, grid); zoneNode.ondragover = e => e.preventDefault(); zoneNode.ondrop = e => dropCard(e, zone); deckColumn.append(zoneNode);
    }
    const collection = el('section', 'de-collection'); const search = textField('collection-search', local.search, 'Search cards'); search.setAttribute('aria-label', 'Search collection'); search.oninput = () => { local.search = search.value; local.collectionPage = 0; requestRender(); };
    const zoneSelect = el('select'); zoneSelect.setAttribute('aria-label', 'Add cards to'); zoneSelect.dataset.key = 'deck-destination';
    for (const z of ['main', 'extra', 'side'] as const) { const o = el('option', '', z === 'extra' ? 'Fusion Deck' : `${z === 'main' ? 'Main' : 'Side'} Deck`); o.value = z; zoneSelect.append(o); }
    zoneSelect.value = local.deckZone; zoneSelect.onchange = () => { local.deckZone = zoneSelect.value as DeckZone; };
    const typeFilter = el('select'); typeFilter.dataset.key = 'collection-type'; typeFilter.setAttribute('aria-label', 'Card type filter');
    for (const type of ['all', ...new Set(editor.collection.map(c => c.type).filter((t): t is string => !!t))]) { const o = el('option', '', type === 'all' ? 'All card types' : type); o.value = type; typeFilter.append(o); } typeFilter.value = local.collectionType; typeFilter.onchange = () => { local.collectionType = typeFilter.value; local.collectionPage = 0; requestRender(); };
    const sort = el('select'); sort.dataset.key = 'collection-sort'; sort.setAttribute('aria-label', 'Collection order');
    for (const [value, label] of [['collection', 'Collection order'], ['name', 'Name'], ['level', 'Level'], ['attack', 'ATK'], ['defense', 'DEF'], ['passcode', 'Passcode']] as const) { const o = el('option', '', label); o.value = value; sort.append(o); } sort.value = local.collectionSort; sort.onchange = () => { local.collectionSort = sort.value as CollectionSort; local.collectionPage = 0; requestRender(); };
    const cards = sortCollection(filterCollection(editor.collection, local.search, local.collectionType), local.collectionSort), pageSize = 80, pages = Math.max(1, Math.ceil(cards.length / pageSize)); local.collectionPage = Math.min(local.collectionPage, pages - 1);
    const count = note(`${cards.length} owned cards · Page ${local.collectionPage + 1}/${pages}`), grid = el('div', 'de-card-grid de-scroll de-fill');
    for (const current of cards.slice(local.collectionPage * pageSize, (local.collectionPage + 1) * pageSize)) {
      const tile = drawCard(current, state.settings.showCardNames), b = button('', () => inspect(current)); b.className = tile.className; b.dataset.key = `collection-card:${current.id}`; b.append(...Array.from(tile.childNodes), el('span', 'de-card-count', `×${current.owned ?? 0}`));
      b.title = `${current.name} · double-click to add`;
      b.ondblclick = () => addCard(current);
      b.draggable = true; b.ondragstart = e => { e.dataTransfer?.setData('application/x-duel-card', JSON.stringify({ passcode: current.passcode, from: 'collection' })); };
      grid.append(b);
    }
    collection.ondragover = e => e.preventDefault(); collection.ondrop = e => dropCard(e, 'collection');
    const paging = el('div', 'de-row de-spread', button('Previous', () => { local.collectionPage--; requestRender(); }, local.collectionPage === 0), button('Next', () => { local.collectionPage++; requestRender(); }, local.collectionPage + 1 >= pages));
    collection.append(search, el('div', 'de-row', typeFilter, sort), zoneSelect, count, grid, paging);
    if (card && card.passcode !== undefined) {
      if (['main', 'side', 'extra'].includes(local.inspectedFrom)) {
        const from = local.inspectedFrom as DeckZone, passcode = card.passcode;
        collection.append(note(card.name), button('Remove selected card', () => send({ type: 'deckCard', passcode, from, to: 'collection', ...(local.inspectedIndex === null ? {} : { index: local.inspectedIndex }) }), !editor.current || !!state.busy));
        if (from !== 'extra') collection.append(button(`Move to ${from === 'main' ? 'Side' : 'Main'} Deck`, () => send({ type: 'deckCard', passcode, from, to: from === 'main' ? 'side' : 'main', ...(local.inspectedIndex === null ? {} : { index: local.inspectedIndex }) }), !editor.current || !!state.busy));
      } else collection.append(button(`Add ${card.name}`, () => addCard(card), !editor.current || !!state.busy));
    }
    if (card) {
      const details = el('details', 'de-mobile-details'); details.append(el('summary', '', `Card details · ${card.name}`), note([card.type, card.attribute, card.level ? `Lv ${card.level}` : ''].filter(Boolean).join(' · ')), note(`ATK ${card.attack ?? '?'} / DEF ${card.defense ?? '?'}`), el('p', '', card.description ?? 'Card description unavailable.')); collection.append(details);
    }
    cols.append(inspector, deckColumn, collection); panel.append(cols, note('Double-click or drag cards to move them. Select a deck card and press Delete to remove it. Server validation applies when saving and entering a duel.')); n.append(panel);
    function addCard(c: CardView): void {
      if (!editor?.current || c.passcode === undefined) return;
      const reason = deckPlacementReason(c, local.deckZone, editor.current);
      if (reason) { local.message = reason; requestRender(); return; }
      send({ type: 'deckCard', passcode: c.passcode, from: 'collection', to: local.deckZone });
    }
    function dropCard(e: DragEvent, to: DeckZone | 'collection'): void {
      e.preventDefault();
      try {
        const p = JSON.parse(e.dataTransfer?.getData('application/x-duel-card') || 'null') as { passcode?: unknown; from?: unknown; index?: unknown } | null;
        if (!p || !Number.isSafeInteger(p.passcode) || !['collection', 'main', 'side', 'extra'].includes(String(p.from))) return;
        const c = lookup.get(Number(p.passcode));
        if (p.from === 'collection' && to !== 'collection' && c && editor?.current) { const reason = deckPlacementReason(c, to, editor.current); if (reason) { local.message = reason; requestRender(); return; } }
        send({ type: 'deckCard', passcode: Number(p.passcode), from: p.from as DeckZone | 'collection', to, ...(Number.isSafeInteger(p.index) ? { index: Number(p.index) } : {}) });
      } catch { local.message = 'This card could not be moved.'; requestRender(); }
    }
  }
  function renderShop(): void {
    const shop = state.shop; if (!shop) return emptyPanel('shop', 'Card Shop', 'Loading the shop catalogue.');
    const n = sceneRoot('Card Shop'), panel = el('section', 'de-panel de-stack de-fill', title('Card Shop'));
    const categories = ['all', ...new Set(shop.items.map(i => i.category ?? 'items'))], select = el('select'); select.setAttribute('aria-label', 'Shop department'); select.dataset.key = 'shop-category';
    for (const category of categories) { const o = el('option', '', category === 'all' ? 'All departments' : category); o.value = category; select.append(o); }
    select.value = local.shopCategory; select.onchange = () => { local.shopCategory = select.value; requestRender(); };
    panel.append(el('div', 'de-row de-spread', select, el('strong', '', `${shop.mp.toLocaleString()} MP${shop.earnedMp !== undefined ? ` · ${shop.earnedMp.toLocaleString()} earned` : ''}`)));
    if (shop.error) panel.append(el('p', 'de-error', shop.error));
    const grid = el('div', 'de-shop-grid de-scroll de-fill');
    for (const item of shop.items.filter(i => local.shopCategory === 'all' || (i.category ?? 'items') === local.shopCategory).slice(0, 240)) {
      const product = el('article', 'de-shop-item'), image = safeImageUrl(item.image); if (image) { const img = el('img'); img.src = image; img.alt = ''; img.loading = 'lazy'; product.append(img); }
      product.append(el('h3', '', item.name), el('strong', '', `${item.price.toLocaleString()} MP`));
      const count = textField(`buy-count-${item.id}`, '1'); count.type = 'number'; count.min = '1'; count.max = '50'; count.setAttribute('aria-label', `${item.name} quantity`);
      const buy = button(item.owned ? 'Owned' : 'Purchase', () => { const quantity = Number(count.value); if (!Number.isSafeInteger(quantity) || quantity < 1 || quantity > 50) { local.message = 'Choose a quantity from 1 to 50.'; requestRender(); return; } if (confirmAction(`Purchase ${quantity} × ${item.name} for ${(item.price * quantity).toLocaleString()} MP?`)) send({ type: 'buy', itemId: item.id, count: quantity }); }, !!item.owned || shop.available === false || !!shop.loading || !!state.busy || item.price > shop.mp, true);
      product.append(count, buy); grid.append(product);
    }
    if (!shop.items.length) grid.append(note('No products have been received from the server.'));
    panel.append(grid);
    if (state.online) { const cosmetics = el('details', 'de-shop-cosmetics'); cosmetics.dataset.key = 'shop-cosmetics'; cosmetics.append(el('summary', '', 'Cosmetic Boxes & Wardrobe'), renderOnlineFeature(state.online, action => send({ type: 'onlineAction', action }), 'cosmetics')); panel.append(cosmetics); }
    n.append(panel);
  }
  function drawField(canvas: HTMLCanvasElement): void {
    const ctx = canvas.getContext('2d'); if (!ctx) return;
    const g = ctx.createLinearGradient(0, 0, 0, 768); g.addColorStop(0, '#07315b'); g.addColorStop(.5, '#176e8c'); g.addColorStop(1, '#0b426a'); ctx.fillStyle = g; ctx.fillRect(0, 0, 1024, 768);
    ctx.strokeStyle = '#8ed9e4'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(180, 351); ctx.lineTo(844, 351); ctx.stroke();
    ctx.font = '11px Arial'; ctx.textAlign = 'center';
    for (const y of [180, 282, 417, 523]) for (let k = 0; k < 5; k++) { const x = 288 + 112 * k; ctx.strokeRect(x - 37, y - 49, 74, 98); ctx.fillStyle = '#c1eced66'; ctx.fillText(y === 282 || y === 417 ? 'MONSTER' : 'SPELL / TRAP', x, y + 4); }
    for (const x of [122, 902]) for (const y of [180, 282, 417, 523]) { ctx.strokeRect(x - 37, y - 49, 74, 98); }
    ctx.fillStyle = '#cff5ff'; ctx.font = '14px Arial'; ctx.fillText('DUEL EVOLUTION', 512, 359);
  }
  function renderDuel(): void {
    const duel = state.duel; if (!duel) return emptyPanel('duel', 'Duel', 'Waiting for duel state.');
    const canvas = el('canvas'); canvas.width = 1024; canvas.height = 768; canvas.setAttribute('aria-label', 'Duel field'); stage.append(canvas); drawField(canvas);
    const hud = el('div', 'de-duel-hud');
    const duelist = (index: 0 | 1) => { const lp = el('strong', '', `LP ${duel.players[index].lp.toLocaleString()}`); lpNodes[index] = lp; return el('div', 'de-duelist', el('div', '', duel.players[index].name), lp); };
    const clock = duel.timer ? `${duel.timer.paused ? 'Paused · ' : ''}${duel.players[duel.timer.player].name} ${Math.floor(Math.max(0, duel.timer.seconds) / 60)}:${String(Math.max(0, duel.timer.seconds) % 60).padStart(2, '0')}` : '';
    hud.append(duelist(0), el('div', 'de-duel-phase', `Turn ${duel.turn} · ${duel.phase}`, el('div', '', duel.players[duel.turnPlayer].name), ...(clock ? [el('div', '', clock)] : [])), duelist(1)); stage.append(hud);
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
      const p = fieldCardPosition(c, handCount), tile = drawCard(c, state.settings.showCardNames, c.faceUp), b = button('', () => { const target = duel.prompt?.options.find(o => o.cardId === c.id && !o.disabled); if (target && duel.prompt) respondToPrompt(duel.prompt.id, { optionId: target.id }); else if (c.faceUp || (duel.actions ?? []).some(a => a.cardId === c.id)) { inspect(c, 'duel'); if (c.faceUp) send({ type: 'inspectCard', cardId: c.id }); } });
      b.dataset.key = `field-card:${c.id}`;
      b.className = `de-card de-field-card${c.faceUp ? '' : ' de-card-back'}${p.rotate ? ' defense' : ''}`; b.append(...Array.from(tile.childNodes));
      placeFieldCard(b, c, handCount); fieldNodes.set(c.id, b);
      b.setAttribute('aria-label', c.faceUp ? `${c.name}, ${c.controller ? 'opponent' : 'your'} ${c.zone}, ${c.position ?? ''}` : `Face-down card, ${c.controller ? 'opponent' : 'your'} ${c.zone}`);
      if (pileTop.has(`${c.controller}/${c.zone}`)) b.append(el('span', 'de-card-count', String(duel.cards.filter(x => x.controller === c.controller && x.zone === c.zone).length)));
      cards.append(b);
    }
    stage.append(cards); effectsLayer = el('div', 'de-duel-effects'); effectsLayer.setAttribute('aria-hidden', 'true'); stage.append(effectsLayer); presentEffects(duel);
    const actions = el('div', 'de-duel-actions');
    for (const a of (duel.actions ?? []).filter(a => !a.cardId || !visibleCardIds.has(a.cardId))) actions.append(button(a.label, () => send({ type: 'duelAction', actionId: a.id }), !!a.disabled || !!state.busy, true));
    if (duel.spectating) actions.append(button('Leave Duel', () => send({ type: 'leaveDuel' }), !!state.busy));
    else if (!duel.ended) actions.append(button('Surrender', () => { if (confirmAction('Surrender this duel?')) send({ type: 'surrender' }); }, !!state.busy));
    else actions.append(button('Return to Lobby', () => open('lobby'), false, true));
    stage.append(actions);
    const log = el('div', 'de-duel-log'); log.setAttribute('role', 'log'); log.setAttribute('aria-label', 'Duel log');
    for (const line of duel.log.slice(-80)) log.append(el('div', '', line)); stage.append(log); log.scrollTop = log.scrollHeight;
    if (duel.prompt) renderPrompt(duel.prompt);
    if (local.inspected && local.inspectedFrom === 'duel') {
      const inspected = duel.cards.find(c => c.id === local.inspected?.id && (c.faceUp || (duel.actions ?? []).some(a => a.cardId === c.id)));
      if (inspected) {
        const panel = el('aside', 'de-panel de-duel-inspector de-stack', title(inspected.faceUp ? inspected.name : 'Face-down card'), drawCard(inspected, inspected.faceUp, inspected.faceUp), ...(inspected.faceUp ? [note(`ATK ${inspected.attack ?? '?'} / DEF ${inspected.defense ?? '?'}`), el('p', '', inspected.description ?? 'Card description unavailable.')] : []), button('Close', () => { local.inspected = null; requestRender(); }));
        for (const action of (duel.actions ?? []).filter(a => a.cardId === inspected.id)) panel.append(button(action.label, () => { send({ type: 'duelAction', actionId: action.id }); local.inspected = null; }, !!action.disabled || !!state.busy, true));
        panel.setAttribute('aria-label', 'Card details'); stage.append(panel);
      } else local.inspected = null;
    }
    else if (duel.ended || duel.waiting) stage.append(el('div', 'de-panel de-duel-prompt', el('p', '', duel.ended || duel.waiting || '')));
  }
  function respondToPrompt(promptId: string, response: DuelResponse): void {
    const currentState = controller.getState(), current = currentState.duel?.prompt;
    if (!current || current.id !== promptId) { local.message = 'This choice has expired.'; requestRender(); return; }
    if (currentState.busy) return;
    const error = validatePromptResponse(current, response); if (error) { local.message = error; requestRender(); return; }
    send({ type: 'duelRespond', promptId, response });
  }
  function renderPrompt(prompt: DuelPromptView): void {
    if (local.promptId !== prompt.id) { local.promptId = prompt.id; local.selected.clear(); }
    for (const id of local.selected) if (!(prompt.kind === 'attributes' ? prompt.options.some(o => o.id === id && !o.disabled) : prompt.candidates?.some(c => c.id === id && !c.disabled))) local.selected.delete(id);
    const panel = el('section', 'de-panel de-duel-prompt'); if (prompt.kind === 'place' || prompt.options.some(o => o.cardId)) panel.className += ' de-target-prompt'; panel.setAttribute('role', 'dialog'); panel.setAttribute('aria-label', prompt.text); panel.append(title(prompt.text));
    const respond = (response: DuelResponse) => respondToPrompt(prompt.id, response);
    if (prompt.kind === 'attributes') {
      const options = el('div', 'de-prompt-options');
      for (const option of prompt.options) {
        const input = el('input'); input.type = 'checkbox'; input.checked = local.selected.has(option.id); input.disabled = !!option.disabled || !!state.busy; input.dataset.key = `prompt-attribute:${prompt.id}:${option.id}`;
        input.onchange = () => { if (input.checked) { if (local.selected.size < (prompt.max ?? 1)) local.selected.add(option.id); } else local.selected.delete(option.id); requestRender(); };
        options.append(labelled(option.label, input));
      }
      const confirm = button('Confirm Attributes', () => respond({ optionIds: [...local.selected] }), local.selected.size < (prompt.min ?? 1) || local.selected.size > (prompt.max ?? 1) || !!state.busy, true); confirm.dataset.key = `prompt-confirm:${prompt.id}`;
      panel.append(note(`Choose ${prompt.min ?? 1}–${prompt.max ?? 1} attributes.`), options, confirm);
    } else if (prompt.options.length) {
      const options = el('div', 'de-prompt-options');
      for (const option of prompt.options) { const b = button(option.label, () => respond({ optionId: option.id }), !!option.disabled || !!state.busy, true); b.dataset.key = `prompt-option:${prompt.id}:${option.id}`; options.append(b); }
      panel.append(options);
    }
    if (prompt.kind === 'cards' || prompt.candidates?.length) {
      const choices = el('div', 'de-prompt-candidates');
      for (const candidate of prompt.candidates ?? []) {
        const selected = local.selected.has(candidate.id), b = button('', () => { if (selected) local.selected.delete(candidate.id); else if (local.selected.size < (prompt.max ?? prompt.candidates?.length ?? 0)) local.selected.add(candidate.id); requestRender(); }, !!candidate.disabled || !!state.busy);
        b.dataset.key = `prompt-candidate:${prompt.id}:${candidate.id}`; b.setAttribute('aria-pressed', String(selected)); if (candidate.card) b.append(drawCard(candidate.card)); b.append(el('span', '', candidate.label)); choices.append(b);
      }
      const confirm = button('Confirm Selection', () => respond({ cardIds: [...local.selected] }), local.selected.size < (prompt.min ?? 0) || !!state.busy, true); confirm.dataset.key = `prompt-confirm:${prompt.id}`;
      panel.append(note(`Choose ${prompt.min ?? 0}–${prompt.max ?? prompt.candidates?.length ?? 0}. Selected: ${local.selected.size}`), choices, confirm);
    }
    if (prompt.kind === 'number') {
      const form = el('form', 'de-row'), input = textField(`prompt-number:${prompt.id}`, String(prompt.numberMin ?? 0)); input.type = 'number'; input.min = String(prompt.numberMin ?? 0); input.max = String(prompt.numberMax ?? 0x7fffffff); input.setAttribute('aria-label', prompt.text);
      const b = el('button', 'gold', 'Confirm'); b.type = 'submit'; b.disabled = !!state.busy; form.append(input, b); form.onsubmit = e => { e.preventDefault(); respond({ number: Number(input.value) }); }; panel.append(form);
    }
    if (prompt.kind === 'announce' && !prompt.candidates?.length) {
      const form = el('form', 'de-row'), input = textField(`prompt-announcement:${prompt.id}`, '', 'Card name or passcode'); input.setAttribute('aria-label', 'Card announcement'); input.maxLength = 120;
      const b = el('button', 'gold', 'Announce'); b.type = 'submit'; b.disabled = !!state.busy; form.append(input, b); form.onsubmit = e => { e.preventDefault(); respond({ text: input.value }); }; panel.append(form);
    }
    if (prompt.cancelable) panel.append(button(['place', 'choice', 'cards'].includes(prompt.kind) ? 'Finish / cancel' : 'Cancel', () => respond({ cancel: true }), !!state.busy));
    if (!prompt.options.length && !prompt.candidates?.length && !['number', 'announce', 'cards'].includes(prompt.kind)) panel.append(note('Waiting for supported choices from the server.'));
    stage.append(panel);
  }
  function renderPreparation(): void {
    const prep = state.preparation; if (!prep) return;
    const panel = el('section', 'de-panel de-duel-prompt de-stack', title('Duel Preparation'));
    const phase = prep.phase.toLowerCase();
    if (/rps|hand|rock|scissors/.test(phase) && !/wait|result/.test(phase)) {
      panel.append(el('p', '', 'Choose your hand.'), el('div', 'de-row', ...(['Rock', 'Scissors', 'Paper'] as const).map((label, hand) => button(label, () => send({ type: 'chooseHand', hand: hand as 0 | 1 | 2 }), !!state.busy, true))));
    } else if (/first|order|turn/.test(phase) && !/wait|result/.test(phase)) {
      panel.append(el('p', '', 'Choose who goes first.'), el('div', 'de-row', button('Go First', () => send({ type: 'chooseFirst', first: true }), !!state.busy, true), button('Go Second', () => send({ type: 'chooseFirst', first: false }), !!state.busy)));
    } else if (/ready|begin|confirm|invitation/.test(phase)) panel.append(button('Start Duel', () => send({ type: 'beginDuel' }), !!state.busy, true));
    else panel.append(el('p', '', 'Waiting for the other duelist…'));
    if (prep.opponentHand !== undefined && prep.opponentHand !== null) panel.append(note(`Opponent chose ${['Rock', 'Scissors', 'Paper'][prep.opponentHand] ?? 'an unknown hand'}.`));
    stage.append(panel);
  }
  function renderSocial(): void {
    const social = state.social ?? (state.socialDetail ? { friends: [] } : null); if (!social) return emptyPanel('social', 'Friends & Mail', 'Loading your friends and mail.');
    const n = sceneRoot('Friends & Mail'), grid = el('div', 'de-social-grid');
    const friends = el('section', 'de-panel de-scroll', title('Friends'));
    for (const friend of social.friends) friends.append(el('div', 'de-social-row', el('strong', 'de-fill', friend.name), note(friend.status ?? (friend.online ? 'Online' : 'Offline')), ...(typeof friend.id === 'number' && friend.online ? [button('Duel', () => send({ type: 'duelChallenge', playerId: Number(friend.id) }), !!state.busy)] : [])));
    if (!social.friends.length) friends.append(note('No friends have been received.'));
    const mail = el('section', 'de-panel de-scroll', title('Mail'));
    for (const m of social.mail ?? []) { const details = el('details'); details.append(el('summary', '', `${m.subject} · ${m.sender}`), el('p', '', m.body)); mail.append(details); }
    if (!social.mail?.length) mail.append(note('No mail has been received.'));
    grid.append(friends, mail); n.append(grid);
    if (state.socialDetail) { grid.style.flex = '0 0 140px'; const feature = renderSocialFeature(state.socialDetail, action => send({ type: 'socialAction', action })); feature.className += ' de-panel de-feature-panel de-fill de-scroll'; n.append(feature); }
  }
  function renderSettings(): void {
    const n = sceneRoot('Options'), panel = el('section', 'de-panel de-center de-stack', title('Options'));
    for (const [key, name] of [['sound', 'Sound effects'], ['music', 'Music']] as const) {
      const input = el('input'); input.type = 'range'; input.min = '0'; input.max = '1'; input.step = '0.05'; input.value = String(state.settings[key]); input.setAttribute('aria-label', name);
      input.onchange = () => send({ type: 'settings', settings: { [key]: Number(input.value) } }); panel.append(labelled(`${name} · ${Math.round(state.settings[key] * 100)}%`, input));
    }
    for (const [key, name] of [['reducedMotion', 'Reduce animation'], ['showCardNames', 'Show card names']] as const) { const input = el('input'); input.type = 'checkbox'; input.checked = state.settings[key]; input.onchange = () => send({ type: 'settings', settings: { [key]: input.checked } }); panel.append(labelled(name, input)); }
    if (state.capture) {
      const capture = state.capture, recording = el('details', 'de-audio-details'); recording.dataset.key = 'options-capture'; recording.append(el('summary', '', 'Gameplay recording'));
      recording.append(note('Record a duel for deterministic client comparison. Start before entering the duel for a complete recording.'), el('p', '', `${capture.state} · ${capture.records} records · ${(capture.jsonBytes / 1024).toFixed(1)} KiB`));
      if (capture.partial) recording.append(note('This recording is partial; it does not contain a complete duel start.'));
      if (capture.reason) recording.append(el('p', 'de-error', capture.reason));
      recording.append(el('div', 'de-row', button('Start Recording', () => { if (!capture.records || confirmAction('Start a new recording? This replaces the current recording.')) send({ type: 'captureStart' }); }, capture.recording || !!state.busy), button('Stop Recording', () => send({ type: 'captureStop' }), !capture.recording), button('Download Recording', () => send({ type: 'captureDownload' }), capture.recording || !capture.records))); panel.append(recording);
    }
    if (state.audio) { const audio = el('details', 'de-audio-details'); audio.dataset.key = 'options-audio'; audio.append(el('summary', '', 'Audio files & playback'), renderAudioFeature(state.audio, action => send({ type: 'audioAction', action }))); panel.append(audio); }
    panel.append(button('Back', () => open(state.player ? 'lobby' : 'title'))); n.append(panel);
  }
  function render(): void {
    if (disposed || rendering) return; rendering = true;
    try {
      state = controller.getState();
      const identity = `${state.scene}/${state.player?.id ?? 'none'}`;
      if (renderedIdentity !== identity) { drafts.clear(); expanded.clear(); renderedIdentity = identity; }
      else for (const field of Array.from(host.querySelectorAll<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>('[data-key]'))) {
        if (['INPUT', 'TEXTAREA', 'SELECT'].includes(field.tagName) && !secretField(field) && !['checkbox', 'radio', 'range', 'file', 'button', 'submit'].includes(field.type)) drafts.set(field.dataset.key!, field.value);
      }
      for (const details of Array.from(host.querySelectorAll<HTMLDetailsElement>('details'))) if (details.dataset.key) expanded.set(details.dataset.key, details.open);
      fieldNodes.clear(); avatarNodes.clear(); effectsLayer = null; delete lpNodes[0]; delete lpNodes[1];
      observer?.disconnect(); for (const entry of art.values()) { entry.used = false; entry.images.clear(); }
      if (!state.duel?.prompt) { local.promptId = null; local.selected.clear(); }
      const previousPromptId = local.promptId;
      const active = document.activeElement as HTMLElement | null;
      const focusKey = active && host.contains(active) ? active.dataset.key : undefined;
      const editable = active && !secretField(active) && ['INPUT', 'TEXTAREA'].includes(active.tagName) ? active as HTMLInputElement | HTMLTextAreaElement : null;
      const selection = focusKey && editable ? { start: editable.selectionStart, end: editable.selectionEnd, value: editable.value, password: editable.type === 'password' } : null;
      header.replaceChildren(el('h1', '', 'Duel Evolution'));
      const status = el('div', 'de-status', el('span', `de-connection ${state.connection}`), state.player ? `${state.player.name}${state.player.level ? ` · Lv ${state.player.level}` : ''} · ` : '', state.status);
      status.setAttribute('role', 'status'); header.append(status);
      stage.replaceChildren(); stage.setAttribute('aria-busy', String(!!state.busy)); host.dataset.scene = state.scene;
      if (!available(state.scene)) emptyPanel(state.scene, state.scene === 'deck' ? 'Edit Deck' : state.scene[0].toUpperCase() + state.scene.slice(1), 'This feature is unavailable.');
      else switch (state.scene) { case 'title': renderTitle(); break; case 'characters': renderCharacters(); break; case 'lobby': renderLobby(); break; case 'deck': renderDeck(); break; case 'shop': renderShop(); break; case 'duel': renderDuel(); break; case 'social': renderSocial(); break; case 'settings': renderSettings(); break; }
      if (state.preparation) renderPreparation();
      const message = state.error || local.message; if (message) { const notice = el('div', 'de-error de-notice', message); notice.setAttribute('role', 'alert'); stage.append(notice); }
      nav.replaceChildren();
      const scenes: [Scene, string][] = state.player ? [['lobby', 'Lobby'], ['deck', 'Edit Deck'], ['shop', 'Shop'], ['social', 'Friends & Mail'], ['settings', 'Options']] : [['title', 'Title'], ['characters', 'Characters'], ['settings', 'Options']];
      if (state.duel) scenes.splice(1, 0, ['duel', 'Duel']);
      for (const [scene, label] of scenes) { const b = button(label, () => open(scene), !!state.busy || (scene === 'characters' && state.connection !== 'online')); if (scene === state.scene) b.setAttribute('aria-current', 'page'); nav.append(b); }
      if (state.connection === 'online') nav.append(button('Disconnect', () => { if (confirmAction('Disconnect from the game?')) send({ type: 'disconnect' }); }, !!state.busy));
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
    } finally { pruneArt(); rendering = false; }
  }
  host.onkeydown = e => {
    if (e.key !== 'Escape') return;
    if (state.duel?.prompt?.cancelable && state.scene === 'duel') { e.preventDefault(); respondToPrompt(state.duel.prompt.id, { cancel: true }); }
    else if (local.target !== null) { local.target = null; requestRender(); }
    else if (state.scene !== 'duel' && !['title', 'lobby', 'characters'].includes(state.scene)) open(state.player ? 'lobby' : 'title');
  };
  const unsubscribe = controller.subscribe(next => { if (!disposed && !queued && canSkipRender(state, next)) { state = next; return; } if (!disposed && !queued && canPresentLobby(state, next)) { state = next; presentLobby(next.lobby!); return; } if (!disposed && !queued && canPresent(state, next)) { state = next; present(next.duel!); } else requestRender(); }); render();
  return { render, dispose() { if (disposed) return; disposed = true; unsubscribe(); observer?.disconnect(); for (const entry of art.values()) { entry.abort.abort(); entry.lease?.release(); entry.images.clear(); } art.clear(); fieldNodes.clear(); avatarNodes.clear(); effectsLayer = null; drafts.clear(); expanded.clear(); delete lpNodes[0]; delete lpNodes[1]; host.onkeydown = null; header.replaceChildren(); stage.replaceChildren(); nav.replaceChildren(); host.replaceChildren(); host.remove(); local.selected.clear(); local.inspected = null; } };
}
