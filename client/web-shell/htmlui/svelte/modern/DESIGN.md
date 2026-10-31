# Modern UI: design record

The 2008 interface, remade with 2026 material. Not flat: the same blues, silver and gold, given depth, light and
restraint. Every window keeps its job and its names; the layout and the flow are rethought where that helps.

## The switch
- **Title page:** "Modern UI" switch, bottom right. It applies at once (no reload) and is remembered in this browser.
- **In game:** Main Menu, System group, "Modern UI". Off puts the legacy window back in the same frame.
- **Page only:** `?MODERN_UI=1` or `?MODERN_UI=0`.
- **Kill switch:** htmlui.json `"modern": false` (no switch, never on).
- **Console:** `yo2Html.modern(true | false)`.
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
- **Deck editor:**
  - Before: no idea whether the deck is legal until the game complains, and only mouse trips to the side bars.
  - Now: a live check strip ("Ready to duel" or "Not legal yet", with Main 40–60, Fusion and Side up to 15, missing cards
    flagged).
  - Keys: / for the trunk search, Ctrl+S for Save Deck, Ctrl+O for Load Deck.
  - Search-as-you-type and the filter chips stay (the legacy HTML trunk), restyled.
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
- **Proposed, not built:** these need engine or server state the snapshot doesn't carry, or flows not mapped yet.
  - Friends' online status, with inline Mail / Duel / Visit on each friend.
  - Character cards with deck and last-played info.
  - Toasts in place of modal OK boxes.
  - EDOPro-style full-art card grid with sort, and add / remove on double-click.

## Screens and what changed
- **Title:** the engine's slanted buttons become a glass plate of slanted plates (the 2008 parallelogram), ONLINE in
  gold. The same four actions; the same clicks reach the engine.
- **Select Player:**
  - Slots become rows with a gold initial disc, the name, "Slot n" and a level chip. Delete is a trash icon beside its
    slot; empty slots are dashed with a plus.
  - Hovering or focusing a slot shows that character's bust (the engine's), as before.
  - Keys: arrows between slots, Esc = Back.
- **Main Menu:**
  - Twelve identical yellow bars become four groups: Play, You, Social, System.
  - Tiles have icons and a two-column grid; a group's odd last tile spans the row.
  - "DUEL OPTIONS" reads "Duel Options".
  - Esc or × closes it; the arrow keys move between tiles. The Modern UI switch lives here too.
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
- **Deck editor (also Card Swap / Trade, which reuse its windows; see also UX changes):**
  - Pass mode, as the legacy HTML deck: the game keeps the mouse, so drag and drop is untouched.
  - The legacy deck's plan says where everything is. Card faces, attribute, type, limit and star icons, copy counts
    and the count chips stay as they are.
  - Frames become plates cut around the card faces; the word art becomes real text; tabs, trunk row plates and switches
    are modern.
  - The scene is a deep-blue field with the duel disk's ring; the side actions are glass at the engine's places, gold
    on hover.
  - The trunk search is restyled. A modal dialog dims the editor and is cut only by its own card faces.

## Not covered (the legacy look stays, by design or for now)
- **Drawn by the game itself, left as the engine draws them:** Duel Options, the Duel Log browser and D-Mail. They are
  windows of pictures and custom frames; a modern version needs their own readers first.
- **Shop:** its windows are picture banners and the engine's animated parts (title, frame, MP plate), which the HTML
  layer can only pass through, not restyle. A modern shop needs readers for those parts first.
- **Trade:** the deck windows it reuses are modern; its own windows are not.
- **Duel HUD:** no HTML duel screen exists yet (htmlui-duel-plan.md).
- **Audio settings:** its own HTML page (web/audiopage.js); not touched.
- **The title menu's places:** taken from the engine's layout (modern.js TITLE). If the title scene's buttons move, update
  them there.

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
- **Motion.** The title menu honours prefers-reduced-motion. Its focus is an outline, not a no-op filter.
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
  - The title menu keeps its plate: it has to cover the engine's own title buttons, which the HTML layer cannot hide.
  - "Remove from Friend List" stays as the engine enables it.

## Development
- `cd client/web-shell/htmlui && npm run build`: gen/modern.js is built with the other Svelte groups.
- `node svelte/modern_test.mjs`: the state tests for logic.js and the switch.
- `yo2Html.modernScreens` is the live map of modern screens. A rebuilt gen/modern.js can be swapped in without a reload
  (import it with a cache-buster, and remove the head's `svelte-*` and `mu-theme` styles first).
