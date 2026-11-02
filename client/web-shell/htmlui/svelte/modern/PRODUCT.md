# Product

<!-- impeccable:product-schema 1 -->

Scope: the Modern UI skin of Duel Evolution's in-game interface (client/web-shell/htmlui). Written without an
interview: the owner was away and had handed every decision to the coordinator. Facts marked *(inferred)* come from the
brief and the code, not from the owner.

## Platform

web

## Users
Players of Duel Evolution: people who played the 2008 Yu-Gi-Oh! Online 2 client and come back for it, and newer
players meeting it for the first time. They sit at a desktop or laptop browser, or a phone in landscape, for sessions of
deck building, chatting in lobbies and duelling. *(inferred from the brief's "for a 2026 audience" and the mobile work)*

## Product Purpose
The original game, recompiled to run in the browser, with its UI drawn as HTML over the canvas. The Modern UI is an
optional second skin over the same game: it keeps everything the game does and changes how its windows look and are
used. Legacy stays the default. Success: a returning player recognises the game at a glance and finds it easier and
nicer to use; nothing they could do before is lost.

## Positioning
The only way to play this game as it was, in a browser, with an interface that can also be modern without being
rebuilt. The modern skin drives the game's own engine controls, so the two skins can never disagree about the game.

## Operating Context
- Mouse and keyboard first; touch on phones. Long sessions in the lobby and deck editor.
- The engine renders a 1024 x 768 scene; the HTML layer scales with it.
- The game's windows are read every frame (snapshot); actions go back as the engine's own clicks, keys and text.

## Capabilities and Constraints
- Every action maps to something the engine already does; no new server behaviour, no protocol changes.
- Real HTML text, real buttons, native scroll bars. No glyph images.
- Product name "Duel Evolution". Say "audio", never "music".
- The repository is public: no Konami art or text dumps, no binaries. Card art and pictures come from the game (R2 or
  the engine itself).
- The 2008 ID / password form must never appear.

## Brand Commitments
- The 2008 identity: azure and sky blues, cyan glints, silver bevels, gold menu buttons, the duel disk, card-forward
  screens, the same names and tone. (Owner: "keeping the identity is super important", "not ultra modern flats".)

## Evidence on Hand
- The legacy look in code: controls/skin.js (sampled 2008 colours), svelte/lobby, svelte/deck.
- No testimonials, metrics or player research exist; none may be invented.

## Product Principles
1. Recognisable first: a 2008 player should know where they are without reading.
2. The engine is the truth: the modern skin shows the snapshot and plays the engine's own controls, nothing else.
3. Opt-in and reversible: one switch, live, remembered; off is the game exactly as before.
4. Depth with restraint: material, light and motion that serve state, never decoration for its own sake.
