Original rules descriptions
===========================

`OriginalCardTextCatalog` installs the ignored `public/card-texts.json` display dataset. Its `entries` are immutable `{passcode, internalId, name, description}` records; `missingInternalIds` documents server extensions absent from the original archive. It never changes rules, eligibility, responses, or hidden-card visibility. Consumers merge only by verified passcode and retain `descriptionSource: 'original-en'`. English original wording can differ from the server engine's newer rules implementation; do not present it as a current rules ruling.

Generate privately with Node 22.18+:

```
node tools/card-text.mjs --archive /private/path/merge.dat
node tools/card-text.mjs --url https://original.ygoevolution.com/game/merge.dat
```

Optional `--data` selects the directory containing the original `cards.json` identity map; `--out` must be ignored and untracked. The remote reader requires exact bounded HTTP 206 ranges and stable total/ETag, limits each response and decoded entry, and reads the directory plus only four tables. No complete archive download is required. This tool has no automatic network step when imported.

Source evidence: `client/src/duel/CardDB.cpp` `cardPropId` identifies each CARD_Prop row by its low 14 bits. `client/src/duel/DuelText.cpp` loads the language tables in `JEGFISK` order and indexes CARD_Name with the first u32 of an eight-byte CARD_Indx row. The archived second u32 indexes UTF-16LE zero-terminated CARD_Desc, independently verified for every mapped row by the extractor. Names, Unicode characters and line breaks are retained verbatim. Matching duplicate property IDs are alternate artwork; conflicting wording is rejected. Reserved identity-zero rows are ignored. One extra trailing index row is allowed; its strings do not identify a property row.

The configured archive has 3,256 property rows, 3,257 index rows and 3,198 distinct property identities including reserved zero. Its original English description table is 1,081,296 bytes after LZSS decoding (242,553 stored). The current original-to-server map resolves 3,243 passcodes; 16 server extension identities have no archive description. These gaps remain explicit. Effect prompts (`str1`–`str16`) are never substituted for full descriptions. No game text is embedded in tracked code or tests.
