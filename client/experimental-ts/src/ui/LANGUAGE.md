# Language selection source audit

No language dropdown is currently offered. The TypeScript interface uses English labels, and the supplied original card-text generator loads only English tables. A selector that changes a numeric setting would not localize the renderer.

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
