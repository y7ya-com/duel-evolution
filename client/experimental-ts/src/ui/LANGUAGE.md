# Language selection source audit

Options → Language offers the original seven languages in the original flag order (日本語, English, Deutsch, Français, Italiano, Español, 한국어; `features/language.ts`). Choosing one reads that language's original tables from merge.dat through the asset bridge, as `CSystemConfigManager::applyLanguage` reloads them: card names and rules (`data/bin#/CARD_Prop`, `CARD_Indx_?`, `CARD_Name_?`, `CARD_Desc_?`, joined to passcodes only through the verified English passcode ↔ internal id mapping) and pack names/descriptions (`data/cardpack/PACK_*_?`, decoded with the language's code page: Shift_JIS, Windows-1252 or EUC-KR). A card missing from a language's tables keeps its English wording (the original's English duel-resource fallback). A failed load keeps the previous language and offers a retry; a late load never replaces a later choice. The choice persists in `de-client-settings-v1` and is applied again after reload. Without configured original assets only English is offered.

Like live, where the engine's language routine reloads every table and main's HTML UI reads the words straight off the engine's windows (htmlui `read/*.js`), the rest of the UI follows the choice too (`features/ui-text.ts`):

- **Labels on main's screens.** Every window the rewrite builds for main's Legacy HTML UI (windows.ts, lobby.ts, deck.ts, avatar.ts, duel-dialogs.ts, duel-result.ts, options.ts, duellog.ts, tournament.ts, npc-pack.ts, trade.ts, shop.ts …) passes through `localizeSpecs` in `ui/index.ts` before it is drawn. Each label / text / title / item is looked up in the original English StringDB (`data/common/yo2text_e`) and replaced by the string with the same id in the chosen language's `yo2text_?` (decoded with that language's code page). The ids are the original's: an exact English match, else the same words ignoring case and spacing (main's captures write some in capitals, which stay capitals). Ids the rewrite already names (Delete's prompts, the lobby's words, the area names: `DELETE_TEXT`, `LOBBY_TEXT`, `AREA_TEXT`) are read in that language directly. What a player typed or chose (inputs, list rows, deck and file lists, chat) is never translated.
- **NPC dialogue.** `npc-data.json` keeps each balloon line's yo2text id; in another language the line is the five strings from that id in `yo2text_?` (CFukiDictionary), as is the present-eligibility text. A line that language lacks keeps its English.
- **Duel dialog texts.** `data/bin#/dlg_indx_?` / `dlg_text_?` are read with the language and override `duel-texts.json`'s English dialogs per id (the duel resources' English fallback). Card-specific option / prompt wordings in `duel-texts.json` come from the engine's English card scripts and stay English.
- **The rewrite's own words** (messages and fallbacks the original lacks) stay English. The ones the language note and the lobby use are gathered in `REWRITE_TEXT` (`features/ui-text.ts`) with an empty `REWRITE_TRANSLATIONS` table for later translation; a rewrite string elsewhere that is not one of the original's English strings also stays English. English is the default and nothing is replaced in English, so the acceptance tests' English labels and data-keys are unchanged.
- **Not localized:** the card shop's pack and card names (the server's `/api/de/shop` takes no language, PARITY-GAPS.md); composed lines (`Lv03`, `vs Name   Win   3 turns`, `Name: question`) whose whole text is not one original string; a player's name that happens to equal a UI word in a list row (button labels and names share one control class).

The language byte sent in character selection is unchanged (see below). Browser acceptance: `tests/acceptance/settings.test.ts`. Japanese and Korean need system CJK fonts; a machine without them shows boxes for correctly decoded text.

The original client has two distinct enumerations:

| Language | System configuration / resource index | Resource letter | Text code page | Server room / country language ID |
| --- | --- | --- | --- | --- |
| Japanese | 0 | j | 932 | 0 |
| English | 1 | e | 1252 | 1 |
| German | 2 | g | 1252 | 2 |
| French | 3 | f | 1252 | 4 |
| Italian | 4 | i | 1252 | 3 |
| Spanish | 5 | s | 1252 | 5 |
| Korean | 6 | k | 949 | 7 |
| World | — | — | — | 6 |

Evidence: `client/src/System/yo2SystemConfig.cpp:13` defines the seven configuration names and code pages; `client/src/System/yo2Lang.h` defines resource codes JPN/ENG/DEU/FRA/ITA/ESP/KOR and the separate eight server/world names. `server/src/config.ts` accepts room languages 0–7 with World=6; `server/src/game/persist.ts:28` confirms the server country mapping (Italian=3, French=4, Korean=7). World is a room grouping, not a renderer translation.

Native `CSystemConfigManager::applyLanguage` (`yo2SystemConfig.cpp:233`) changes locale and fonts/code page, sets general resource `?` substitution with Japanese fallback and duel resource substitution with English fallback, then reloads StringDB, card text, pack text and pack information. StringDB uses `data/common/yo2text_?.bin` and `.idx`. The TypeScript card generator (`tools/card-text.mjs`) explicitly selects `CARD_Prop.bin` plus `CARD_Indx_E`, `CARD_Name_E` and `CARD_Desc_E`; its output is labeled language E. Fonts, UI labels, original dialogue and duel text must also be localized consistently before offering another renderer language.

`CNetLobby::reqPSelect` (`client/src/Net/NetLobby.cpp:75`) sends a language byte supplied by `appLanguage()` (`NetLobbyTask.cpp:274`). The inspected call does not establish an explicit conversion between the two enumerations. The experimental session currently sends `options.language ?? 1` and independently chooses the advertised World server. A future implementation must verify the protocol mapping and reconnect behavior, load the matching complete text catalogs, and atomically replace renderer localization without retaining mixed-language drafts or claiming unsupported translations.

Browser fullscreen is independent of these settings. `settings-browser.ts` uses the standard Fullscreen API on an explicit click, observes actual browser state, and never stores or restores fullscreen automatically.
