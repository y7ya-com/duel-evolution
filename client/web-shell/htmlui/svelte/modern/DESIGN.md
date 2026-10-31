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
  - Seen live: Options (title), Duel Log. (Duel Options has its own screen now.)
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
