# Modern UI: design record

The 2008 interface, remade with 2026 material. Not flat: the same blues, silver and gold, given depth, light and
restraint. Every window keeps its job and its names; the layout and the flow are rethought where that helps.

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

## World
The 2008 palette, sampled from the legacy skin (controls/skin.js), with modern depth and light. The owner's verdict on a
first, navy pass ("dark blue and serious ... loses the nostalgia") set this: the original's brightness and saturation.
- **Plate** (every window): the 2008 window's light cyan glass (`#e8fbff` → `#b9f1ff` → `#8fe6fc`).
  - Its cyan bevel: `#a7ffff` inside, a `#2f8fd6` line, `#41abef` below.
  - A white sheen over the top half; the art's scan lines at 22 % white.
  - A soft offset shadow (0 18 36 −14, blue).
- **Title band:** the 2008 title bar, `#f2fbff` → `#a3d7f3` → `#4e93f5` → `#336deb` with its `#234cdb` line. White title text
  with a blue edge.
- **Gold** (`#ffffc8` → `#fff97f` → `#f4d558` → `#eca430`, edge `#e36f08`): the 2008 menu buttons. It marks the menu (the Main
  Menu's tiles, as its bars were), each window's primary action, chosen states and the title's ONLINE.
- **Sky glass** (`#fff` → `#d9f5ff` → `#a8e6ff` → `#7fd3fb`, a `#3a9de6` edge): every other button.
- **Wells** (logs, lists, figures, fields): white with a blue inset edge.
- **Ink:**
  - Dark navy text: `#0b2a5c`, `#26508a`, `#4a6c96`; strong `#06204a`.
  - Chat names in `#0050c8`, notices in amber `#b34d00`.
- **The 2008 word art lives on as type:**
  - Heavy italic white with a blue outline: the title buttons, EDIT DECK, the deck's side bars.
  - The deck headers in their colours: Deck / Number of Cards green, Trunk orange.
- **Elsewhere:** the dock is the 2008 cyan bar with its white field; the deck editor sits on brushed silver.
- **Font:** the platform's UI sans, tabular numerals.
- **Icons:** one authored set (Icon.svelte), 20 × 20, 1.8 px round strokes, mostly orange `#e36f08` (the gold's edge)
  or azure.
- **Motion:**
  - A plate rises in 260 ms; hovers take 140 ms, exponential ease-out.
  - The title buttons' sheen sweeps on hover.
  - With prefers-reduced-motion, none of it.

## Game UI (2026-10-31, owner: "doesn't give me game vibes, it feels like a website")
The shared language every modern screen and the generic window are built from (theme.js; components in game/). Game
windows, not web cards; the YO2 palette (A) and identity kept.
- **GamePanel** (`.mu-plate`, `.mu-head`): a bevelled brushed-metal frame (7 px, a dark outer rim, light from above) round
  an inner field (a faint diagonal weave, an inner shade under the top edge); the top-left and bottom-right corners cut,
  a gold line along each cut; the shadow follows the cut shape (drop-shadow). The title plaque: the blue band inside the
  frame, its own cut corner, a gold base line, the title in the display face.
- **GameButton** (`.mu-btn`): a physical key. A glossy split bevel, a rim, a solid 3 px lip under it; the press pushes it
  in (3 px down, the lip gone); hover glows and a shine sweeps across. Gold is the one primary action. With `ctl` + `api`
  it stands for a game control: hover is the game's (api.hover: the engine's own hover, its sound and help text), the
  press the game's click (and its sound).
- **GameField** (`.mu-field`): an inset slot cut into the panel; focus lights it gold.
- **GameTabs** (`.mu-tabs`, `.mu-tab`): raised plates on a sunken rail; the chosen one blue with a gold top line.
- **GameList** (`.mu-list`, `.mu-row`): rows in a sunken well; hover lights a row; the chosen one a blue bar with a gold
  notch.
- **GameDialog**: a GamePanel over a dimmed screen, the message, the game's buttons (primary gold); Enter the primary, Esc
  the way out.
- **Type:** Audiowide (OFL, self-hosted with the art: ui/fonts/) for titles, plaques and section labels, uppercase and
  tracked; Arial / system sans for everything read (the owner's text rule).
- **Motion:** a window opens with a quick scale and fade where it stands (.18 s), never sliding in; keys press in at
  70 ms. prefers-reduced-motion turns it off.
- **The HUD bar** (the dock): dark brushed blue under a gold hairline, its actions as keycaps with gold key labels.
- **Audio:** every modern button presses the game's own control, so the engine's own click (and hover, where it has one)
  sounds play; nothing new is played from the page.

## UX changes (what was clumsy → what it is now)
- **Getting anywhere:** open the Main Menu, read a list of twelve identical bars, click → the command dock along the bottom.
  - One click (or a key) for Deck D, Profile P, Friends F, Mail M, Duel Log L, Options O, Audio A.
  - Each chains the engine's own clicks (menu, then its button) with the menu out of sight (macro.js).
  - Enter jumps to the chat line.
  - The Main Menu itself is grouped: Play, You, Social, System.
- **Chat:**
  - Before: no sign of new lines on another tab, and losing your place when reading back.
  - Now: a red unread count on each tab, and a "n new messages" pill that jumps to the latest while you read older lines.
  - Names stand out from messages; system lines are amber.
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
  - Now: cards with an initial disc, the level chip and "Slot n is free" on the empty ones.
  - Delete sits apart as a trash icon. Arrows and Esc work; focus is on the first card.
- **D-Mail:**
  - Before: separate windows for reading and writing, and a To field you can't type in.
  - Now: the inbox is a mail client (actions on top, Write Mail first, the mails, the open mail below).
  - Write Mail is a form: To shows the chosen friend next to Friend List; Subject and Message are fields; Send D-mail is
    gold.
- **My Profile:** ten label/value rows become a profile card (name, title, level) and a grid of figures.
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
3. **Getting anywhere takes the Main Menu.** Change: the command dock (one click or a key: D P F M L O A; Enter to chat).
   Owner modern-ui: done.
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
    log covering the room. Change: owner htmlui-chat (a real redesign: one collapse control, the log's height dragged,
    unread counts kept when collapsed).
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
  - Slots become rows with a gold initial disc, the name, "Slot n" and a level chip. Delete is a trash icon beside its
    slot; empty slots are dashed with a plus.
  - Hovering or focusing a slot shows that character's bust (the engine's), as before.
  - Keys: arrows between slots, Esc = Back.
- **Main Menu:**
  - Twelve identical yellow bars become four groups: Play, You, Social, System.
  - Tiles have icons and a two-column grid; a group's odd last tile spans the row.
  - "DUEL OPTIONS" reads "Duel Options".
  - Esc or × closes it; the arrow keys move between tiles. The Legacy UI switch lives here too.
- **Bottom bar:**
  - Becomes a dock: Menu (gold), Duel, Move as labelled buttons.
  - The engine's message line becomes a status field.
- **Place banner:** a location chip, the place and the map, each with its head count.
- **Player list:** "Players n", rows with a status dot, find, taller / shorter. A row clicks the engine's row, scrolling
  the engine's list to it first.
- **Chat:**
  - The game's tabs as tabs with a gold underline, and a native scroller that stays at the bottom.
  - Names in sky, notices in gold.
  - The line is a real input with a send button: Enter sends, Esc leaves it.
  - The Duel Log tab appears on the duel screen, as the game adds it.
- **Friend / Ignore / Team List:** the name list as a grid of chips (gold initials), the selected one lit. Buttons as the
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
- **Move** (the bar's door, CWindowModelMove; Move.svelte, owned; before, plain buttons on a green frame with the
  count squeezed into the caption): "Where to?", a row per place with its name and a fill meter for its head count
  (red when full), the ×. Past six places the game shows six at a time: the wheel or the arrows past either end
  scroll its list. Keys: focus on the first place, Up / Down, Enter goes, Esc closes.
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
- **Duel** (the dock's Duel; CWindowModelDuel, DuelMenu.svelte on GamePanel / GameButton, owned): how busy the lobby is as three figures
  (Searching, Waiting, Duelling: the game's labels repeated its buttons' names), then the two ways in as large cards that
  say what they do (Auto Duel in gold: the game finds you an opponent; Create Duel: wait for a challenger), Cancel.
  Focus on Auto Duel; Left / Right, Enter, Esc.
- **Auto Duel's settings** (CWindowModelDuelFind; DuelConfig.svelte with logic.js duelFind): Duel type (Single / Match /
  Both) and Level as segmented choices, "OK starts looking for an opponent". The level captions are the game's own:
  note its "Level Limit ON" sits on the switch named 制限なし ("no limit"), so the 2008 English may be inverted
  (unverified: kept as the game has it).
- **Searching:** while an Auto Duel search runs the game shows only a small icon on its bar (CNoticeIconDuelroom); in the
  dock the Duel key becomes a gold "Awaiting duel ×" chip (a pulsing dot) which plays that same switch (the game asks
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
  - The dock's chip reads "Awaiting duel" (the same icon shows for an open duel and an Auto Duel search).
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
- **Still legacy:** the shop (CShop* tasks, not windows: the generic renderer takes windows only), the duel field itself
  (not windows), Audio settings (its own page, web/audiopage.js).
- **The title menu's places:** taken from the engine's layout (modern.js TITLE). If the title scene's buttons move,
  update them there.

## Critique (2026-10-31, impeccable: design review + detector evidence, against the legacy captures)
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
