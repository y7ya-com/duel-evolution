# Modern UI: design record

## Current direction · 3 November 2026

Modern UI now follows the original game’s visual language throughout. The native world, duel field, character busts,
portraits, card art, game sounds and interactions remain the source of truth.

- **Windows:** bright cyan glass and three-pixel cyan bevels, blue outlined rectangular frames, glossy azure title
  strips and small yellow close keys. No silver cut-corner frames, frosted dashboard cards or oversized round pills.
- **Type and controls:** Arial for readable game labels and body text; bold italic outlined lettering on the title
  menu. Blue beveled controls, yellow primary keys, inset fields and blue selected list rows share one vocabulary.
- **Lobby:** compact native Menu/Duel/Move controls. Chat is transparent while idle: only recent fading messages and
  a small Chat handle remain. Hover, focus or Enter reveals its translucent history and composer. Location and player
  count are in the top right, with the roster closed until requested. Tag Duel lives under Main Menu → Play; menu
  actions are not duplicated in a taskbar.
- **Character selection and creation:** numbered blue character slots with the engine’s live bust preview, blue
  category rails and yellow selected controls. The native character remains fully visible.
- **Records and social screens:** compact table rows in inset wells replace independent metric cards and circular
  initial badges. Profiles retain name/title/level hierarchy; lists and mail use the same row selection treatment.
- **Deck builder:** original-style green Deck and orange Trunk headers, larger 44×64 deck faces in eight columns,
  a wider card inspection pane and consistent search/filter/file controls. Crowded rows overlap within fixed wells,
  so the existing drag/drop, ordering, legality checks and native save flow remain intact.
- **Duel:** larger inspection artwork and card-action keys, cyan instruction panels, traditional winner/loser
  plaques and record tables. Tag rosters, team setup and the soulbound MP explanation use the same materials in Modern
  UI. Legacy UI styling remains available through the existing instant toggle.

Changes paint immediately in place. Hover lights controls without shifting their hit areas. Game geometry remains
1024×768 and scales with the canvas; pass-mode windows keep the engine’s control rectangles. The behavior notes below retain the interaction decisions shared with the original engine.

The original interface modernized with the same cyan, blue and yellow materials. Every window keeps its job and its
names; layouts improve readability while preserving native gameplay and character art.

## The switch
- **Players see it as "Legacy UI"** (owner): on = the original 2008 UI, off = the Modern UI. It is on until a player
  turns it off, so players who never touch it keep the original UI.
- **Title page:** the "Legacy UI" switch, bottom right. It applies at once (no reload) and is remembered in this browser.
- **In game:** Main Menu, System group, "Legacy UI" (off there). Turning it on puts the legacy window back in the same frame.
- **Page only:** `?LEGACY_UI=1` (original) or `?LEGACY_UI=0` (modern). The older `?MODERN_UI=1 | 0` still works.
- **Kill switch:** htmlui.json `"modern": false` (no switch, never modern).
- **Code and storage keep "modern":** `yo2Html.modern(true | false)` (true = Modern UI); localStorage `yo2.modernUI`
  `"1"` = Modern UI, so a choice saved before the rename reads the same.
- Mechanics: `../modern.js` holds the switch and the title page layer. `bridge.js` picks gen/modern.js's screen over the
  legacy one for a window class while it is on; a window whose screen changes is remounted.

## Shared window language

`theme.js` owns the cyan window bevel, blue title strip, yellow primary key, blue secondary key, pale inset field,
selected blue row and connected tabs. Body text is Arial; title menu lettering is bold italic Arial. Native pictures
remain native pictures. The deck editor has its own blue stage with green Deck and orange Trunk headers.

Game windows appear immediately where the engine places them. Hover changes color and border light without moving
controls. Keyboard focus uses a gold outline, press feedback is a one-pixel depression, and reduced-motion preferences
suppress transitions. Both owned and pass-mode screens use the same shared materials, while pass-mode geometry follows
the native control rectangles.

## UX changes (what was clumsy → what it is now)
- **Getting anywhere:** the compact Menu control opens the grouped Main Menu: Play, You, Social and System.
  - Deck, Profile, Friends, Mail, Duel Log, Options and Audio remain in that menu.
  - Tag Duel is a direct entry in its Play group; player cards also offer a contextual Tag Duel invitation.
  - The former full-width shortcut taskbar and its duplicate keyboard action handler have been removed.
  - Enter still opens/focuses chat through Chat.svelte.
- **Chat (Chat.svelte):** transparent and quiet by default, independent of a saved-open preference. Up to four recent
  lines fade over the world after twelve seconds and never intercept world clicks. A small Chat handle, hover, focus
  or Enter opens the translucent history and composer. Leaving interaction hides it after a short delay; typing keeps
  it open and Escape closes it. Channels, unread counts, scroll position and sending still use native state/actions.
  Failed native height transitions never force the DOM chat open. Hidden native chat controls cannot intercept world
  input; deliberate DOM actions temporarily enable their specific native target. No chat is shown outside online play.
- **Deck editor (Edit Deck), rebuilt EDOPro-style (deck/Editor.svelte, owned):**
  - Before: a trunk of eleven text rows to scroll and drag from, cards seen only one at a time in the detail panel,
    no idea whether the deck is legal until the game complains, files only through the side bars.
  - Now: the card under the pointer shown large on the left (its art, type line, ATK / DEF and text); the deck in the
    middle (Main, Fusion, Side as grids of card faces, each with its count and rule); the trunk on the right as a grid
    of full cards with the copies left and in the deck, limits marked.
  - Search across names, then card text: fuzzy (prefix, words in any order, initials "bewd", letters in order). The
    filters stay in view: type, attribute (the game's own words), level range, ATK / DEF range, sort, cards not owned.
  - Adding and removing: double-click or right-click (Shift: the Side Deck, or Main ↔ Side), drag between the trunk and
    the sections, Enter / Shift+Enter / Delete on a focused card. A refused move says why ("Limited to 1", "Fusion
    monsters go to the Fusion Deck").
  - The bar: the deck's name with an unsaved dot, the live check ("Ready to duel" / "Not legal yet"), Load and
    Structure Deck as pickers, Clear, Save As (a name field), Save (gold), Exit. Keys: / search, Ctrl+S save,
    Ctrl+Shift+S save as, Ctrl+O load.
  - Every change is the engine's own (deck/engine.js): its drag and drop, tabs, side buttons and file list, played out
    of sight under a "Saving…" veil. The card data is read from the exe's tables (read/deck.js), never a file in git.
- **Select Player:**
  - Before: four identical bars and a Delete beside each.
  - Now: numbered blue selection rows, the level badge and "Slot n is free" on empty slots.
  - Delete sits apart as a trash icon. Arrows and Esc work; focus is on the first card.
- **D-Mail:**
  - Before: separate windows for reading and writing, and a To field you can't type in.
  - Now: the inbox is a mail client (actions on top, Write Mail first, the mails, the open mail below).
  - Write Mail is a form: To shows the chosen friend next to Friend List; Subject and Message are fields; Send D-mail is
    gold.
- **My Profile:** the duelist name, title and level sit on a blue band above a readable inset record table.
- **Friend / Ignore / Team List:** a grid of name chips, the selected one lit; the buttons as the game has them; Esc
  closes.
- **Dialogs and prompts:**
  - Before: grey boxes over the game.
  - Now: the message centred, the primary in gold, Enter on the primary, Esc on the way out, a light scrim behind.
  - The name prompt (Create Player) has a real field.
- **OK boxes:**
  - Before: modal boxes that stop play for news ("saved", "sent").
  - Now: an OK box that is only news (CWindowModelDialogOk, a message and its one OK) shows as a toast at the top for
    five seconds, and its OK is pressed at once. Error boxes stay modal, in the modern dialog.
  - Unit-tested; not yet seen live: no flow on the local stack raised one.
- **Create Comment:** a form with the Greeting and Duel Message fields, OK in gold.
- **Friend List:**
  - Each friend shows online or offline and where they are, from the site's `GET /api/de/friends` (`[{ pid, name,
    online, place }]`; yo2-server-ts). Nothing extra while it doesn't answer.
  - A Mail button on each friend: the list closed, D-Mail opened, Write Mail pressed (macro.js writeMail).
- **Proposed, not built:** these need engine or server state the snapshot doesn't carry, or flows not mapped yet.
  - Inline Duel / Visit on each friend (their lobby flows aren't mapped yet).
  - Character cards with deck and last-played info.
  - Toasts in place of modal OK boxes.

## UX spec (2026-10-31, owner: "leaning towards a skin as opposed to genuine UX improvements")
Each main flow: what is clumsy in the 2008 behaviour, the concrete behaviour change (not a look), who owns it and where it
stands. Owners: modern-ui (this file's screens and the generic window), htmlui-chat, htmlui-select (lobby, NPC and the
remaining lobby windows), html-ui-pixel (flicker, bridge bugs, best practices).

1. **Every window: no keyboard.** 2008: every window needs the mouse; nothing says which button is the safe way out.
   Change: Esc presses the window's way out (Close, Cancel, No, Back, OK) and Enter its primary (OK, Yes, Send) on every
   window, bespoke or generic, when no field has the focus. The topmost window takes the key. Owner modern-ui: bespoke
   done; generic **done in this pass** (Generic.svelte, logic.js genericKeys).
2. **Blocking windows look like any other.** 2008: a modal box and a passing panel look the same; clicks on the room
   silently do nothing. Change: a modal window (snapshot `modal`) has a light scrim behind it, so the game reads as
   waiting on it. Owner modern-ui: bespoke dialogs done; generic **done in this pass**.
3. **Getting anywhere:** use the grouped Main Menu, opened by the compact Menu control. The duplicate shortcut
   taskbar was removed at the owner’s request; the world keeps its screen space. Enter still focuses chat.
4. **News interrupts play.** 2008: "saved", "sent" are modal OK boxes. Change: news is a toast; only errors and questions
   stay modal. Owner modern-ui: done (toasts unit-tested, not yet seen live).
5. **Title: mouse only.** Change: the modern title menu has the focus on ONLINE when it shows; arrows move, Enter
   starts. Owner modern-ui: arrows done; focus **done in this pass**.
6. **Select Player: four identical bars.** Change: character cards, Delete apart as a trash icon, arrows and Esc, Enter on
   a card plays it. Owner modern-ui: done.
7. **Friends: a list of names.** Change: presence (online, where) and Mail on each friend; Duel / Visit inline next.
   Owner modern-ui: presence and Mail done (presence waits on yo2-server-ts's /api/de/friends); Duel / Visit proposed
   (their lobby flows belong with htmlui-select's NPC / player menus).
8. **Mail: two separate windows, a To field you can't type in.** Change: one mail client (inbox, reading pane, Write
   Mail form). Owner modern-ui: done.
9. **Deck building: eleven text rows, legality unknown until the game refuses.** Change: the EDOPro-style editor (search,
   filters, card grids, live legality, keys). Owner htmlui-deck: done.
10. **Chat: minimize / expand is unintuitive** (owner). 2008: two tiny icons that grow and shrink the log in steps, the
    log covering the room. Change: one Hide / Show toggle, remembered, never covering the room; unread counts kept
    while hidden (UX changes, Chat). Owner htmlui-chat: done. Not done, by decision: a dragged height (the engine has
    three fixed heights; a height of the DOM's own would leave the engine's rect catching clicks it doesn't draw).
11. **Lobby: NPC talk and duel invites are 2008 boxes; NPC / player click menus are tiny lists.** Change: owner
    htmlui-select (bespoke NPC dialogs, invites as cards with Accept / Decline, the click menus as context menus at the
    pointer). Until then the generic window gives them the modern look and items 1 and 2.
12. **Flicker and misbehaving windows** (owner: "SUPER BUGGY", "flickering"). Owner html-ui-pixel (bridge and Svelte
    audit). The generic window can't add input bugs (pass mode).
13. **Options (title and Duel Options): pictures and tiny ON / OFF boxes.** Change: segmented choices with the chosen one
    lit, the help text in a well, OK in gold; Esc cancels, Enter confirms (item 1). Owner modern-ui: done via the generic
    window.

## Screens and what changed
- **Title:** four slanted bars (the 2008 parallelogram) standing on the title art as the 2008 ones do, with no plate
  behind them. Each has its own depth: a white rim, the bar's fill and a soft drop shadow. ONLINE is taller and gold.
  The engine stops drawing the title movie's own buttons (read.js `title`, the hide table); the same clicks reach them.
- **Select Player:**
  - Slots become rows with a blue slot number, the name, "Slot n" and a level badge. Delete is a trash icon beside its
    slot; empty slots are dashed with a plus.
  - Hovering or focusing a slot shows that character's bust (the engine's), as before.
  - Keys: arrows between slots, Esc = Back.
- **Main Menu:**
  - Twelve identical yellow bars become four groups: Play, You, Social, System.
  - Commands are yellow beveled rows with icons, grouped in one readable column.
  - "DUEL OPTIONS" reads "Duel Options".
  - Play also contains Tag Duel. Esc or × closes the menu; arrow keys move between rows. The Legacy UI switch lives here too.
- **World entry controls:**
  - Only the original Menu (gold), Duel and Move controls remain, as a compact group of buttons.
  - No full-width taskbar, duplicate menu shortcuts, status strip or empty background.
  - Duel retains its “Awaiting duel” cancel action; Move retains pending-request feedback.
- **Place banner:** a blue location banner at the top left, with its player count.
- **Player list:** "Players n", rows with a status dot, find, and one size toggle. A row clicks the engine's row,
  scrolling the engine's list to it first.
  - Two sizes only (owner: the game's three-stage taller / shorter was weird): small (the game's 128) and minimised
    (its 32 bar). The game's own buttons step a cycle 128 → 560 → 32; the toggle steps it to the size asked for
    (through 560 when minimising), drawn at the target size and at the game's own place for it all along (small at
    y 608, minimised at 712: the bar sits 8 px lower), so nothing jumps. A list left expanded (from Legacy UI) is
    brought back to small within a second.
- **Chat:** a GamePanel standing on the short chat's foot: the log well on top, the foot row below (the channels as a
  segmented GameTabs rail, the line as a GameField, Send in gold, Hide). Hidden: a HUD strip (the dock's material, its
  gold edge) with the channel in the display face, the latest line and the unread count. The engine's rects: short
  776 × 128; collapsed 32 high and 8 px lower (over the dock's edge), so both states are drawn from the short chat's foot
  and the strip is its top 24 px. Read with read/chat.js (mode_, and each tab's log: the Duel Log is made last but laid
  out second, so order alone can't pair them). Tests: modern_test.mjs (pairs, sizeSteps, logRows, grouping),
  modern_chat_dom_test.mjs (headless, mock.html?modern=1), flip route `modern-chat` (live: tall → open, two lines said,
  Hide, Enter).
- **Friend / Ignore / Team List:** the name list as two columns of inset rows with blue selection, the selected one lit. Buttons as the
  game has them, the primary in gold; Esc = Close.
- **My Profile:** a profile card. Name, title and a level chip up top, then the record as figures (Tournament Points,
  Wins, Losses, Score, Win%, % of Cards Collected, Miles).
- **Yes / No dialog:** the message centred, Yes in gold. Enter is on the primary, Esc is No; a scrim dims the game
  behind it.
- **Duel Options** (DuelConfig.svelte, owned; before, a pink-and-grey picture grid whose help text only changed
  on hover):
  - Each setting is one segmented choice (Auto Tracking, Auto Card Placing, Activation Message), the current one gold.
  - The help panel names the option it explains ("Activation Message: Manual") and follows hover and keyboard focus
    (the engine writes it when its switch is hovered: api.hover).
  - The game keeps a choice only on OK (no instant apply without closing the window), so the plate counts the unsaved
    changes; Cancel or Esc drops them.
  - Keys: focus opens on the first setting's choice; the arrows choose within a setting, Tab moves between settings,
    Enter is OK, Esc Cancel.
  - No layout shifts (owner): the help panel is a fixed 200 px box, tall enough for the longest help (Semi Auto
    Cancel's nine lines), its title line always reserved; choices don't move when pressed; the footer note is one
    line. Measured: hovering each of the seven options moves nothing but the help text inside its box.
- **Move** (the bar's door, CWindowModelMove; Move.svelte, owned; before, plain buttons on a green frame with the
  count squeezed into the caption, then six rows and "scroll for 3 more"): "Where to?" with every place at once, a
  tile each (its name, a fill meter and the head count, red when full), one column up to six places, two past that.
  - The game shows six places at a time behind a scroll bar; the window reads the whole list first (stepping the
    game's list, hidden behind it) and a click on a place beyond the six scrolls the game's list to it, then presses
    the game's own button.
  - Stable (owner: "super glitchy"): fixed-size tiles; hover and press change colour only, nothing moves. The plate
    shows once, complete: never the game's 65 ms "Connecting to server..." placeholder as a one-row plate, never tiles
    reading "…" while the list is read (at most 0.7 s on a first opening). A place opened before shows its last list
    at once (counts dimmed and clicks held until the fresh list arrives), then updates in place.
  - The game asks the server before showing its window (1 to 4 s): the compact Move control shows that it is working
    (pressed in, its icon pulsing) until the window is there, and ignores a second press meanwhile.
  - Keys: focus on the first place; the arrows move through the grid, Enter goes, Esc closes.
- **Unlocks and items** (CWindowModelItemGet: "Now, you can challenge Yami Marik to a Duel!"; ItemGet.svelte, pass):
  the engine keeps drawing the portrait card (the window's sprite extras pass through); its lines become one blue
  ribbon across the card's foot and its OK a large gold button that takes the focus, so Enter, Space or Esc dismisses
  it. (The generic window had dropped the portrait: its extras have no rect.)
- **Clicking a character** (the lobby's NPCs and players):
  - **Pick list** (CWindowModelList, who is under the click; PickList.svelte, owned): a small "Choose" popover at
    the game's place, a row per name with an initial badge. Focus opens on the first row, so Enter picks it at once;
    Up / Down, Esc closes. (Picking makes your character walk over first: the card opens when you arrive.)
  - **Duelist card** (CNpcListMenu, CPlayerListMenu; NpcCard.svelte, pass): the name on the title strip, the record
    as three figures (wins, losses, win rate) instead of "Win%" over "Wins0/Losses0", the deck ("Unknown" for the
    game's "?????"), the about text in a well that scrolls with the wheel. A click elsewhere closes it, as before.
  - **Speech bubble** (CWindowModelBalloon; Balloon.svelte, pass): a white bubble with its tail toward the portrait
    (the engine's), the speaker on a gold tag, the line in large type, a "Continue" cue. The game's '・' marks (a
    glyph the 2008 font lacked: a box) read as '…'. The bubble takes the focus: Space or Enter goes on, as a click
    anywhere does. The duel offer that ends a challenge is the modern Yes / No.
- **Find players** (the player list's search, CFindMenu; FindMenu.svelte, owned): a menu rising from the player list
  beside its search button (the game opened it over the list's own top), its entries grouped as Show (single / match
  duels, friends, nearby, everyone) and Order (by level, by name) with icons. Focus on the first entry; Up / Down,
  Enter, Esc closes (a click on the player list's title bar, as the game closes it on a click elsewhere).
- **Duel disk case** (My Room's shelf case, CDuelDiskList; DiskCase.svelte, pass): a plate framing the game's own
  grid of disks (its sprites stay the engine's, as does dragging one onto a lit shelf slot to put it on show), a
  "Duel Disks" tab, the page arrows as chevrons, the hovered disk's name in bold before its text, Close in gold. With
  nothing pointed at yet, the well says what to do: drag a disk onto a lit slot. Close takes the focus (Esc, Enter);
  the left / right arrow keys turn the page.
- **Options** (the title's, COptionDlg; Options.svelte, pass: painted over the game's own layout, so every click and
  the volume drag stay the game's): the game frame (.mu-plate) grown by an OPTIONS plaque above the game's layout and a
  foot under its buttons, with a hole over each flag and screen picture (the engine's; the clip's outer edge 40 px out so
  the frame's drop shadow stays); section labels in the display face; the section
  names are small caps with the current choice beside them; the chosen flag and screen are ringed in gold, a hovered one
  in blue, and its name (the language's own: Deutsch, Français ...; Full screen / Window) takes the section's line while
  it is pointed at; the volume is a modern track and knob (from the slider's sprites) with - / +; OK gold. OK has the
  focus: Enter, Esc = Cancel.
- **Duel** (the compact Duel control; CWindowModelDuel, DuelMenu.svelte on GamePanel / GameButton, owned): how busy the lobby is as three figures
  (Searching, Waiting, Duelling: the game's labels repeated its buttons' names), then the two ways in as large cards that
  say what they do (Auto Duel in gold: the game finds you an opponent; Create Duel: wait for a challenger), Cancel.
  Focus on Auto Duel; Left / Right, Enter, Esc.
- **Auto Duel's settings** (CWindowModelDuelFind; DuelConfig.svelte with logic.js duelFind): Duel type (Single / Match /
  Both) and Level as segmented choices, "OK starts looking for an opponent". The level captions are the game's own:
  note its "Level Limit ON" sits on the switch named 制限なし ("no limit"), so the 2008 English may be inverted
  (unverified: kept as the game has it).
- **Searching:** while an Auto Duel search runs the game shows only a small icon on its bar (CNoticeIconDuelroom); in the
  compact controls the Duel key becomes a gold "Awaiting duel ×" chip (a pulsing dot) which plays that same switch (the game asks
  "Cancel the Duel you created?", the modern Yes / No). An empty status field gives up its room.
- **Duel invites** (walked with two players: stack.py --player2):
  - **Create Duel** (CWindowModelDuelWait; DuelConfig.svelte with logic.js duelCreate): Duel type, Time limit,
    Spectators, Surrender as segmented choices, the password as a game field ("None: anyone can join"), "OK opens your
    duel for a challenger". (The generic window drew it as a blank white box.)
  - **A player's card** with an open duel: its settings as tags under "Open duel" (they were loose lines), and Send
    Duel Request first and gold.
  - **The request** (the duel's owner, the shared Yes / No: "Lv1 Duelist F [Beginner Duelist] You have aDuel
    Request! Will you accept?"): a "Duel Request" dialog with the challenger's level, name and title, "wants to duel
    you. Accept?", Accept (gold, the focus: Enter) / Decline (Esc).
  - **The challenger's wait** ("Requesting Duel" and Cancel): "Request sent: waiting for an answer…" with a pulse.
    A refusal is a toast.
  - The compact Duel control reads "Awaiting duel" (the same icon shows for an open duel and an Auto Duel search).
- **Fixes in shared pieces found on the way:** the player list's "Lv 1@>40/Name" (logic.js untag: '@>n/' is the game's
  move-to-x tag, now a space); Toast pressed its OK before the game showed the box, which then stayed open behind the
  toast and blocked the screen (now pressed once shown, again until gone); GameDialog focused its button while the
  window was still hidden, so Enter went nowhere (now macro.js focusSoon once shown).
- **Deck editor:** Edit Deck is the rebuilt editor (UX changes above). The rest below is Card Swap and Trade, which
  reuse its windows:
  - Pass mode, as the legacy HTML deck: the game keeps the mouse, so drag and drop is untouched.
  - The legacy deck's plan says where everything is. Card faces, attribute, type, limit and star icons, copy counts
    and the count chips stay as they are.
  - Frames become plates cut around the card faces; the word art becomes real text; tabs, trunk row plates and switches
    are modern.
  - The scene is a deep-blue field with the duel disk's ring; the side actions are glass at the engine's places, gold
    on hover.
  - The trunk search is restyled. A modal dialog dims the editor and is cut only by its own card faces.

## Duel prompts (2026-10-31, owner: "my turn, couldn't end turn")
- **The freeze:** the End Phase discard (CUDiscardDialog, "Discard from your hand.") is a small box that only waits for a
  click on a hand card; easy to miss, so the turn just waits. The generic window even drew it blank (its text is nested
  under a Help control) with a scrim that dimmed the hand.
- **Now:** any in-duel window (CU*) with words and no button of its own (logic.js duelPrompt) is a prompt
  (DuelPrompt.svelte): a banner across the top of the field (a game panel, its plaque: "Too many cards", "Choose a
  card"; the instruction in plain words, the game's own line under it) and a gold ring round where to click (the hand
  for a discard, the field for a target), labelled. No scrim. After 5 s with no move the banner and the ring pulse.
  Pass mode: the click is the engine's own, on its card; the engine draws nothing of the old box.
- **Command menus** (owner: "I can pick between set and normal summon, it's so buggy and weird"): the engine's choice
  list (CWindowModelListDuelCmd, CUSummonDialogSp: Summon / Set, Activate, Attack ...) is a ListboxDuelCmd whose rows are
  nested texts; the prompt rule had taken it for a banner ("Your move: Summon", no Set). Now (logic.js duelCmd,
  DuelCmd.svelte) a compact translucent panel where the engine put its list, by the card: one real button per option
  the engine offers, the first gold; a press is the engine's own row, clicked at its centre, once. Seen live: Summon /
  Set offered, Set pressed, "Duel Tester Set a monster".
- **Translucent:** duel windows (CU*) and the prompt banner are see-through (blurred glass), with no scrim, so the
  field stays in view.
- **Duel windows with their own buttons** (Yes / No, phase choices, coin, dice) stay the generic window (Esc / Enter).
- **Seen live:** the discard, in a duel against the dev NPC (the prompt, the ring, a hand card clicked, the turn passed).
  The target prompt (CULockOnDialog) is covered by the same rule, not yet seen live.

## Coverage: every window modern (2026-10-31)
The game has 107 window classes (every CWindowTaskModel subclass in client/include/yo2). In Modern UI each is bespoke
(svelte/modern.js), generic (logic.js GENERIC, Generic.svelte) or deliberately not drawn; the inventory is
modern-ui-coverage.md in the coordinator's notes.
- **The generic window** (Generic.svelte, logic.js generic): any window without a bespoke screen, its controls in the
  modern look at the engine's own places. Pass mode: the engine keeps every input (click, hover, keys, typing, wheel,
  drag) and its own focus; the DOM only paints, so a window nobody has looked at can't gain an input bug.
  - Plate: the outermost frame; a frame of the window's own class (DuellogFrame); a frame reading far smaller than its
    window (DuelConfigFrame: 80 x 24) or a picture that is the window's backdrop (Options' option_dai) stand for the
    whole window. A ShadowText heading the plate is the title strip.
  - Text, buttons (gold for OK / Yes / Send), fields with their caret, lists (rows from the engine's top, the selected
    row), checkboxes, tabs, scroll bars (thumb only: the engine's bar takes the drag), icons, sliders (drawn from their
    sprites: the track and the knob where the engine puts it). A picture switch with a caption, or with a text laid over
    it (the Duel Log's tabs), is a button. A text field with a back plane, or a large text area, sits in a well.
  - What it can't draw stays the engine's, cut out of everything drawn here (evenodd clip-path): pictures (flags, card
    art, screen modes), Flash, unknown controls (their sprites place the hole when they have no size), sprite extras.
  - Seen live: Duel Log. (Options and Duel Options have their own screens now.)
- **Never drawn:** CWindowLogin (the 2008 ID / password form must never show), base classes, CDeckCardLoader (no
  controls), CWindowTaskCardArea (trade's drag stays the engine's), CWindowModelTitleConfig.
- **Shop:** `modern/shop/` wraps the dedicated Legacy HTML renderer with blue/gold game furniture and unobtrusive
  department/product labels. Native layout, mouse hit regions, Back/Purchase/Exit, selection, paging and confirmation
  remain the game's own in pass mode. The clerk, player and real pictures remain visible. There is no separate
  storefront, marketing hero, inferred button routing or second cart. Native foreground dialogs retain their holes.
- **Still native:** the duel field itself (not windows), Audio settings (its own page, web/audiopage.js).
- **The title menu's places:** taken from the engine's layout (modern.js TITLE). If the title scene's buttons move,
  update them there.

## Historical critique (2026-10-31, impeccable: design review + detector evidence, against the legacy captures)
Historical implementation notes follow; visual descriptions here do not supersede the current direction above.
The two assessments ran separately. The detector found nothing; the reviews found these, all fixed in one pass.
- **Deck editor dimmed.** A deck window reporting itself modal drew its scrim over the scene and the card faces; the
  scrim is now the file list's only.
- **Identity.** The Main Menu's gold bars came back as gold tiles. The plate is lighter (2008 sky, not night). The dock
  is the 2008 cyan bar again.
- **Contrast.** Muted text was raised (`--ink-2` #c8ddf5, `--ink-3` #a9c3e4). Inactive tabs moved to `--ink-2`.
  Placeholders are #5b6f8c. Focus rings are solid cyan.
- **Keyboard.** Select Player, the lists and Profile focus their first control on open, so Esc and the arrows work at
  once. The Main Menu's arrows reach the switch.
- **Hit targets.** At least 24 px: icon buttons, player rows.
- **Motion.** The title menu honours prefers-reduced-motion. Its focus turns the bar's rim gold.
- **Deck.**
  - The search chips show their colour as a dot, not a side stripe.
  - Trunk row tints are stronger.
  - The card name and type runs are lifted to gold / green to read on the plate.
  - Exit no longer overlaps the detail window.
- **Details.**
  - Slots line up, with Delete set apart.
  - Profile shows "—" for the engine's "---.--%", and its odd last figure is wider.
  - The level chip reads "Lv 1" everywhere.
  - The place chip's counts align.
  - The dock is hidden where the scene has no buttons.
- **Kept as decided.**
  - "Remove from Friend List" stays as the engine enables it.

## Development
- `cd client/web-shell/htmlui && npm run build`: gen/modern.js is built with the other Svelte groups.
- `node svelte/modern_test.mjs`: the state tests for logic.js and the switch.
- `yo2Html.modernScreens` is the live map of modern screens. A rebuilt gen/modern.js can be swapped in without a reload
  (import it with a cache-buster, and remove the head's `svelte-*` and `mu-theme` styles first).
