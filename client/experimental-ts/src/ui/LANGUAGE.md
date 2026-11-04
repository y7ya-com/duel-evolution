# Language selection source audit

Options → Language offers the original seven languages in the original flag order (日本語, English, Deutsch, Français, Italiano, Español, 한국어; `features/language.ts`). Choosing one reads that language's original tables from merge.dat through the asset bridge, as `CSystemConfigManager::applyLanguage` reloads them: card names and rules (`data/bin#/CARD_Prop`, `CARD_Indx_?`, `CARD_Name_?`, `CARD_Desc_?`, joined to passcodes only through the verified English passcode ↔ internal id mapping) and pack names/descriptions (`data/cardpack/PACK_*_?`, decoded with the language's code page: Shift_JIS, Windows-1252 or EUC-KR). A card missing from a language's tables keeps its English wording (the original's English duel-resource fallback). A failed load keeps the previous language and offers a retry; a late load never replaces a later choice. The choice persists in `de-client-settings-v1` and is applied again after reload. Without configured original assets only English is offered.

Not localized: the TypeScript interface's own labels (the original drew them from `data/common/yo2text_?`), NPC dialogue (`npc-data.json`, generated from `yo2text_e`) and duel dialog strings (`dlg_text_e`). The language byte sent in character selection is unchanged (see below). Browser acceptance: `tests/acceptance/settings.test.ts`. Japanese and Korean need system CJK fonts; a machine without them shows boxes for correctly decoded text.

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
