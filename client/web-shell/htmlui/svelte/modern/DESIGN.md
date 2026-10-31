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
- **Field:** deep navy to azure (`#061733` → `#0e3275` → `#1b51b6`), with the 2008 art's scan lines at 3 % white.
- **Plate** (every window): deep-blue glass in a 1.5 px silver rim (`#f3f7fc` → `#8fa3bd` → `#dfe8f3`).
  - The upper third carries the old gloss as a 13 % sheen.
  - Corners are 18/18/18/6: the duel disk's blade, one corner kept tight.
  - Shadow: offset and soft (0 24 48 −18). No glow halos.
- **Gold** (`#fff7c2` → `#f7e46c` → `#f1c330` → `#e7a51b`, edge `#a8640f`): the 2008 menu buttons. Only the one primary
  action of a window uses it, and the active tab's underline.
- **Glass buttons:** sky-to-azure translucent with a cyan rim. On hover they lift 1 px and the rim brightens.
- **Text:**
  - Hierarchy: white for titles and names; `#eaf6ff`, `#b7d3f2` and `#86a7cf` for the rest.
  - Accents: sky `#7deffc` for names in chat and counts; gold for notices.
  - Font: the platform's UI sans (Segoe UI / SF Pro / system-ui), tabular numerals. No display face: the game's own art
    carries the display voice.
- **Icons:** one authored set (Icon.svelte), 20 × 20, 1.8 px round strokes.
- **Motion:**
  - A plate rises in 260 ms (opacity, 8 px, a 3 px blur clearing).
  - Hovers take 140 ms, exponential ease-out.
  - The title buttons' sheen sweeps on hover.
  - With prefers-reduced-motion, none of it.

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
- **Deck editor (also Card Swap / Trade, which reuse its windows):**
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
- **Shop, trade and the duel HUD:** not started.
- **Audio settings:** its own HTML page (web/audiopage.js); not touched.
- **The title menu's places:** taken from the engine's layout (modern.js TITLE). If the title scene's buttons move, update
  them there.

## Development
- `cd client/web-shell/htmlui && npm run build`: gen/modern.js is built with the other Svelte groups.
- `node svelte/modern_test.mjs`: the state tests for logic.js and the switch.
- `yo2Html.modernScreens` is the live map of modern screens. A rebuilt gen/modern.js can be swapped in without a reload
  (import it with a cache-buster, and remove the head's `svelte-*` and `mu-theme` styles first).
