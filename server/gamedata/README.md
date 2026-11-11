# gamedata/

Tables the server needs at runtime, derived from the 2008 client's data (Konami) and from EDOPro's card database.
Because they are Konami-derived they are not committed: generate them as below, or (maintainers with access to the
site's Cloudflare account) fetch the current set with `infra/fetch-private.sh`. Raw game assets (merge.dat, yo2.exe,
images, audio) are never in the repo.

To rebuild, run from `server/`, with `nice`. The generators currently reuse the loaders of the Python reference
server, so they need a YOLaucher-web checkout whose game data is in place: `_original/` (an extracted 2008 client)
and `_vendor/` (EDOPro cards.cdb, strings.conf, CardScripts).

| File | From | Generator |
|---|---|---|
| `persist.json` | valid card ids (cards with art in data/mini), titles table of the exe, yo2pbinmap.dat (PBIN bits, defaults, NPC prize bits) | `scripts/gamedata.py` |
| `ydc.json` | structure/prize deck recipes (`cardpack/*.ydc`, 2008 data first) | `scripts/gamedata.py` |
| `lobby.json` | NPC names/sex (npc_ids.json), the 2008 banned/limited list (card_max.bin via cards_yo2.csv), avatar part table (yo2pbinmap.dat) | `scripts/gamedata.py` |
| `shop.json` | packinfo_s.txt (shop packs), booster contents (`cardpack/*.iid`) and deck contents (`*.ydc`) | `scripts/gamedata.py` |
| `translator.json` | YO2 card id ↔ passcode map (card_prop.bin, card_name_e.bin, card_indx_e.bin + cards.cdb), card data and script facts the translator needs | `scripts/translator_gamedata.py` |
| `brain_cards.json`, `npc_profiles.json` | cards.cdb fields the NPC brain reads; NPC AI profiles (generated from the client's NPC data) | `scripts/brain_gamedata.py` |
| `duel.json` | official NPC deck recipes (npc_decks.json) and the card table for the deck check (cards_yo2.csv: YO2 id, Konami id, kind, 2008 limit, name) | `scripts/duel_gamedata.py` |
| `engine/cards.json`, `engine/strings.json` | EDOPro cards.cdb + strings.conf | `scripts/engine_gamedata.mjs` |
| `engine/scripts.pack` (not committed, 20 MB) | EDOPro CardScripts + the 2008 script overrides; uploaded to R2 | `scripts/engine_gamedata.mjs` |
| `fixtures/` | recordings of the Python reference (duel engine, translator, brain) that the parity tests replay | `scripts/*_record.*` |
| `cards.json` | the client's card table: per 2008 card index its passcode (alternate arts their own ids), its art (ygoprodeck's or the 2008 face) | `client/tools/cardart.py match` |

**Card ids are passcodes.** The generators above emit the 2008 client's card ids; then
`python3 -I scripts/passcode_gamedata.py` rewrites every table to passcodes through `cards.json` (the card wire:
the client's codec, `client/recomp/rt/cardwire.cpp`, maps them back) and gives `translator.json` the client table's
passcodes and its hash (`wire`, `wireHash`, the hello's). A converted file says `"ids": "passcode"`.

**New cards** (the pre-Synchro cards the 2008 client never had): `client/tools/newcards.py` adds them to `cards.json` and
writes the client's card tables (`merge/data/bin#/CARD_*.bin`, shipped with the art in the `cards/` set); then
`cardart.py pack` and `table`, then `scripts/passcode_gamedata.py`, which on every run recomputes `wire`/`wireHash` from
`cards.json` and puts the new cards in `valid_cards`, `duel.json` and the shop (its `NEW_PACKS`, the rest as single
cards). The client's `card_passcode.bin` and the server's `wireHash` must match: ship them together.

### 2008 effects and printed text

`src/duel/engine/era2008.json` is the shared catalog for legacy effects and client text. The engine keeps the
existing 16 `scripts.pack` overrides and restores the remaining listed cards through `era2008.ts`: reviewed
ProjectIgnis pre-errata counterparts or checked edits to modern scripts. `GetID()` still binds to the original
passcode. Missing scripts or changed patch inputs fail at engine startup instead of quietly loading a modern effect.
The catalog intentionally uses the September 2008 rules, rather than indiscriminately selecting the earliest printing
(e.g. Ultimate Offering's older, unrestricted version predates this format).

`client/tools/era2008_assets.py` reads that catalog and the owner's original `merge.dat`. It emits the original
printed card faces, thumbnails, and localized descriptions, including alternate art. The client mounts those loose
files over the modern full-card images; the modern deck editor reads the same original effect descriptions.
Generated output stays private. Add a catalog entry, implement its script selection/patch, and add an engine behavior
test when restoring another card. The generator refuses missing original faces or descriptions.

The normal `infra/ship-client.sh` includes these assets under a content hash and injects their configuration before
the runtime starts. Rebuild **all three** runtimes after changing `lazyfs.js`; shipping refuses older runtime builds.
Set `YO2_MERGE` (or `YO2_GAME`) to the owner's original game, and `YO2_ASSET_PYTHON` to a Python with the cardart tools'
Pillow/numpy dependencies if the default `python3` does not have them. Ship client and server from the same main
commit using the standard release scripts; the legacy rules are bundled with the Worker, so no single-file R2
engine upload is needed. Existing open tabs need to reload for the matching printed text.
