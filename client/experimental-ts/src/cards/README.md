# Card details and native deck files

Import from `./cards` (relative to `src`). Browser imports are extensionless.

```ts
import { CardDetailsCatalog, decodeLegacyDeck, encodeLegacyDeck } from './cards';

const details = new CardDetailsCatalog();
// Reuse readCatalog(response, signal, 16 * 1024 * 1024) from src/catalog.ts
// to bound the HTTP body before JSON parsing. install() validates the result.
details.install(parsedCardDetails);
details.get(passcode);                 // CardDetails | undefined
details.passcodeForId(legacyId);        // number | undefined
details.idForPasscode(passcode);        // number | undefined
details.entries;                       // readonly CardDetails[]

const deck = decodeLegacyDeck(new Uint8Array(await file.arrayBuffer()), details);
const bytes = encodeLegacyDeck(deck, details);
// deck: { main: number[], side: number[], extra: number[] }, all PASSCODES.
// bytes: Uint8Array, native .ydc; application may download as application/octet-stream.
```

`install` replaces the catalog atomically, rejects duplicate passcodes or legacy IDs,
copies and freezes installed metadata, and bounds strings, numbers, masks and record
count. Getters return `undefined` for unknown identity, never a guessed mapping.
The parent can merge `details.get(passcode)` into existing display views; no changes
to `CardCatalog`, UI contracts, app or services are included here. Optional fields
must remain optional: absent descriptions/statistics/limits are not zero values.

## Generation and private data

The parent must add `public/card-details.json` to
`client/experimental-ts/.gitignore`. That file is outside this implementation's
ownership, so it has not been edited. The generator refuses tracked or unignored
output paths. No game records are embedded in these tracked modules or tests.

```sh
cd client/experimental-ts
node tools/card-data.mjs
node tools/card-data.mjs --cdb /path/to/owned/cards.cdb
# Optional: --data /path/to/gamedata --out /path/to/gitignored/output.json
# Environment alternatives: DE_GAMEDATA and DE_CARDS_CDB.
```

Default inputs are `server/gamedata/cards.json`, `duel.json`, and
`engine/cards.json`. The CDB is optional and opened read-only using Node's
`node:sqlite` (Node 22.13+ recommended). No archives are downloaded or extracted.

Field provenance:

| Fields | Source |
| --- | --- |
| `legacyId` | `cards.json.i`: original client card-box/deck identifier, 1..4095 |
| `internalId` | `cards.json.internal`: original card_prop identifier, distinct from file ID |
| `passcode` | `cards.json.pc`: identity used by the new client and server |
| `name` | Engine `texts[pc][0]`, then `cards.json.name`, then explicit `Card <passcode>` placeholder |
| `description` | Only `cards.cdb` `texts.desc`, with `descriptionSource: 'cards.cdb'` |
| `effectTexts` | Engine `texts[pc][1..16]`: effect-choice prompts, **not** full rules text |
| Type/race/attribute/level/ATK/DEF/extra | Engine card tuples; masks retained, race as uint64 decimal string |
| `limit`, `deckAllowed` | `duel.json.cards[pc][1]`: server's 2008 source list |

The engine tuple schema is documented in `server/scripts/engine_gamedata.mjs`.
Type, race and attribute labels decode masks without discarding unknown bits.
Negative ATK/DEF sentinels remain negative; rendering them is the UI's decision.
`limit` is 0..3; 65535 is `NO_DECK`, represented by `deckAllowed: false` and no
`limit`. A missing rule row produces neither field. These are display metadata;
ownership, legality, alias grouping and actual rules remain server-authoritative.
CDB descriptions reflect the supplied database, not a claim of original 2008
wording. Whitespace-only or absent descriptions stay absent; effect prompts are
never promoted to descriptions.

Available source conversion verified on 2026-11-04: 3,259 cards, 1,183 with effect
prompts, 8 without engine statistics, 47 with NO_DECK, none without ban metadata.
No local CDB was found, so those available inputs yield **zero full descriptions**.
These counts describe the inspected inputs, not a parity or completeness claim.

## Verified native .ydc format

`client/src/Deck/DeckManager.h` defines `CDeckManager::File` as 80 main,
15 side, 30 extra `uint16_t` entries, in that order. `DeckManager.cpp` save
(0x00906dd0) clears the record and passes its exact 250 bytes to `yo2SaveFile`.
`client/src/System/yo2File.h` identifies that wrapper as yaneSDK
`CFile::Write` at 0x0052b140. Its checked-in implementation in
`client/third_party/yanesdk/yaneFile.cpp:1118` truncates/creates the file and calls
`WriteFile(hFile, lpMem, dwSize, ...)` directly. There is no extra header,
checksum, encryption or passcode conversion in this path.

Thus `LEGACY_DECK_FORMAT` is accurately labeled `native .ydc`: exactly 250 bytes,
little-endian IDs, zero vacancies. Section byte offsets are 0, 160, and 190.
This codec rejects truncated and oversized files even though the old load method
copied partial records. Vacant slots anywhere in a section are skipped as the
original reader does. Order and repeated cards are preserved; encoding packs
nonzero entries before zero padding. Unknown IDs, out-of-range IDs, unknown
passcodes and non-reciprocal mappings throw instead of dropping cards or writing
a substitute. Section capacities are storage bounds, not assertions of legal
deck size. YDK and JSON formats are separate UI work.

## Verification

```sh
node tools/run.mjs vitest run tests/cards.test.ts tests/cards-data.test.ts
node tools/run.mjs tsc --noEmit
```

Tests use synthetic metadata, independent bytes for endian/section verification,
capacity edges, malformed identities, atomic installation and source conversion.
Whole-client typechecking can report concurrent integration failures outside this
scope; owned `src/cards` modules must produce no type errors.
