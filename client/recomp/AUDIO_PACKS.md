# Audio packs

The game ships with no background audio. An **audio pack** is one `.zip` that sets it for the whole game. Players
drop it anywhere on the game (or use **Open audio pack…** or **From a link…** on Main Menu > Audio). The game shows
which parts of the game the pack plays in, and nothing changes until the player clicks **Use this pack**, which
replaces whatever audio they had.

This project does not host, list or include any packs or audio. Players make packs and share them however they like.
Only share audio you have the right to share.

The easiest way to make a pack is **Create audio pack** on the Audio page: give it a name, add files to the parts of
the game (drop them onto a part, or use Add), then **Save audio pack**. The rest of this guide is for authors who
would rather build the zip by hand.

## Without audiopack.json: names decide

Put audio files in the zip, named after the part of the game they're for. A file can also sit in a folder named after
that part:

```
My Pack.zip
  title.mp3                 -> the title screen
  my_room/                  -> My Room (every file in the folder: a playlist in name order)
    01 Morning.ogg
    02 Evening.ogg
  duel/                     -> all ten duel tracks
    battle1.mp3
    battle2.mp3
  field/yami.mp3            -> the Yami field spell (the file's own name wins over its folder's)
  win.mp3, lose.mp3, draw.mp3
```

A file's own name is checked first, then its folders from the deepest up. A specific part beats a group, and a group
beats `all`. The match ignores case, spaces and punctuation, a leading track number (`01 - Title.mp3`) and a trailing
copy number (`duel 9.mp3` is the `duel` group). A single folder wrapping everything in the zip is ignored, and so is
macOS's `__MACOSX/`. Any file that matches nothing is listed in the review so the pack maker can rename it.

## With audiopack.json: you decide

Put `audiopack.json` anywhere in the zip. Its folder becomes the pack's root, and file paths are relative to it.
Every field is optional:

```json
{
  "name": "GX Remix Pack",
  "author": "your name",
  "description": "Shown to players before they use the pack.",
  "url": "https://where-you-share-it.example",
  "master": 0.8,
  "slots": {
    "all": "audio/lobby.mp3",
    "title": "audio/title.mp3",
    "duel": { "files": "audio/duels/", "shuffle": true, "volume": 0.7 },
    "win": ["audio/win.mp3"],
    "field_yami": { "file": "audio/yami.ogg", "loop": true }
  }
}
```

- A value is a path, a list of paths, or `{ "files" (or "file"), "shuffle", "loop", "volume" }`. Volume runs from
  0 to 1 (0–100 also works).
- A path ending in `/` (or naming a folder) means every audio file under that folder, in name order.
- When `"slots"` is present, only what it lists is used. Without it, the names-decide rules above apply, and the file
  only supplies the pack's name, author and so on.
- An unknown part or a missing file is listed in the review. Everything else in the pack is still used.

## Parts

The keys are the same in file names, folder names and `"slots"`. Each part also answers to the name of the original
game's track for it (`y_gx_01`, `b_du1_1`, … from `data/etc/bgm.txt`, see `audio-slots.md`).

| Part | Also | Plays |
|---|---|---|
| `title` | `title_screen` | the title screen |
| `login` | `notices` | logging in, the notice pages |
| `updater` | `patcher` | the update check |
| `my_room` | `room` | My Room |
| `yugi_area`, `gx_area` | `yugi`, `gx`, `academy` | the area maps and their shops |
| `event_lobby`, `tournament_lobby`, `event` | `tournament` | lobbies |
| `card_pack` | `packs`, `shop` | opening card packs |
| `deck_editor` | `deck` | the deck editor, trades, gifts |
| `janken` | `rock_paper_scissors`, `rps` | deciding who goes first |
| `duel_1` … `duel_8`, `duel_tournament_1`, `duel_tournament_2` | | the duel (the game picks one) |
| `duel_winning`, `duel_pinch` | `winning`, `pinch` | ahead or behind by 3000 LP or more (empty: the duel audio goes on) |
| `ritual`, `summon_1`, `summon_2` | | short jingles (empty: nothing changes) |
| `duel_win`, `duel_lose`, `duel_draw` | `win`, `lose`, `draw` | after a duel |
| `field_yami`, `field_umi`, `field_mountain`, `field_sogen`, `field_forest`, `field_wasteland`, `field_fusion_gate`, `field_gaia_power`, `field_umiiruka`, `field_luminous_spark`, `field_mystic_plasma_zone`, `field_rising_air_current`, `field_molten_destruction`, `field_chorus_of_sanctuary`, `field_skyscraper`, `field_other` | the name without `field_` | while that field spell is active (empty: the duel audio goes on) |

Groups set several parts at once:

| Group | Parts |
|---|---|
| `duel` | the ten duel tracks |
| `field` | every field spell |
| `lobby` | the area maps and lobbies |
| `menus` | title, login, updater |
| `jingles` | ritual and summon jingles |
| `all` | every part except the jingles and the in-duel layers (winning, pinch, field spells), which fall back to the duel audio |

Parts that share the same files keep playing across scene changes instead of restarting. Each file is stored once in
the player's browser, however many parts use it.

## Files

The game accepts any audio format the player's browser can play: mp3, m4a/aac, ogg/opus, wav and flac everywhere,
plus aiff and caf in Safari. The zip may be stored or deflated (any ordinary zip tool works), up to 4 GB. A file that
won't play is skipped and named in the result.

## Links

**Paste a link** downloads a pack directly, but only from a site that allows cross-site downloads.
`raw.githubusercontent.com` does: a GitHub file page link (`github.com/…/blob/…`) is rewritten to it automatically.
Dropbox share links are switched to their direct download. Many hosts refuse, and then the game tells the player to
download the zip and drop it instead.

## Native build

The native client reads one folder per part: `<YO2_WRITE>/audio/<part id>/`. A pack laid out as part folders (no
`audiopack.json`) unzips straight into `audio/`.
