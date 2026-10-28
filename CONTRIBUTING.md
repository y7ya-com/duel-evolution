# Contributing to Duel Evolution

All code changes land in this repo (y7ya-com/duel-evolution). The old private repos are frozen. `yo2-decomp` is still
used for Ghidra and Konami data work, and no code goes there. `duel-evolution-private` is archived.

## What may be committed (the owner's rule)

- **Allowed:** everything we wrote, including code that references the game's functions by address or reproduces
  small tables from the exe. Examples:
  - `recomp/hooks.py` and `emit.py`'s `IMM_HOOKS`;
  - `recomp/ovr/*` and `ovr/orig.txt` (an address list);
  - lazyfs `FIELD_SPELLS`;
  - the audio-slot labels in `recomp/audio-slots.md`;
  - the hand decompilation in `client/src/`.
- **Not allowed:**
  - `yo2.exe`, `MagicKey.dll`, `*.dat`, `*.swf`;
  - generated recomp C (`client/recomp/out/`, including `ovr/orig.py`'s `o_` bodies);
  - art, audio, fonts and screenshots extracted from the game;
  - raw Ghidra, SWF or disassembly dumps;
  - the `server/gamedata/` tables.

  The README's "Files you supply" section says how each one is regenerated. The guard enforces this list by path,
  extension and content: a file with dozens of generated `f_`/`o_` functions, disassembly lines or Ghidra `FUN_`
  definitions is refused wherever it is.

## Rules

- **Enable the guard** once per clone: `git config core.hooksPath .githooks` (worktrees share it). It needs `gitleaks`
  (`brew install gitleaks`).
  - `infra/guard.py` runs before every commit (`pre-commit`) and every `git am` patch (`pre-applypatch`).
  - It refuses forbidden paths and extensions, MZ/PE files, binary files, files over 1 MB, and secrets.
  - CI runs the same checks on every pushed commit and PR, then the server's typecheck and tests.
  - There is no override. If a file really belongs in the repo, change the rules in a PR.
- **Secrets** go to `wrangler secret put`, never to files. Only `*.example` env files are committed, and they hold
  placeholders.
- Keep the user-facing name "Duel Evolution".

## Working in a worktree

```sh
cd ~/Documents/GitHub/duel-evolution-public          # the main clone (git clone https://github.com/y7ya-com/duel-evolution)
git config core.hooksPath .githooks                  # once
git fetch origin
git worktree add ../de-<task> -b <task> origin/main
cd ../de-<task>
infra/fetch-private.sh                               # maintainers: server/gamedata/, html-ui art, loader art (R2 private/)
(cd server && pnpm install --frozen-lockfile)
```

- **Client builds** read the game from `YO2_GAME`, and the tools read `yo2.exe` and the Ghidra outputs from
  `YO2_DATA` (default `~/Documents/GitHub/yo2-decomp-data`). See `client/README.md` and `client/recomp/README.md`.
- **Long builds and tests** go through `python3 -I client/tools/buildslot.py <cmd>`.
- **When you're done:** rebase on `origin/main`, push the branch and open a PR, or fast-forward main if you own the
  change. Deploys and client ships go from this repo (`server/DEPLOY.md`).

## Porting work from the old repos

No old history enters this repo, so port each pending branch from the old repos as patches. The public tree started
from these sync bases:

| Old repo, branch | Sync base | Prefix here |
|---|---|---|
| `yo2-decomp` `public-sync` (= `claude/recomp-496b28` fbffd368 + `main` d1b6f1d6 + `recomp-web` e83433e8) | `54e14ed1` | `client/` |
| `ygo-original` (duel-evolution-private) `master` | `6c4cf63` | none (`server/`, `client/html-ui/` map 1:1) |
| `yo2-decomp-data` `web/public/recomp/{index.html,loader.js,stage.js}` | not git | `client/web-shell/` (copy the files) |

**A branch that contains the sync base and has no merges after it** (`git merge-base --is-ancestor <base> <branch>`)
ports commit by commit:

```sh
cd ~/Documents/GitHub/yo2-decomp
git format-patch -o /tmp/port 54e14ed1..<branch>
cd <your public worktree>
git am --directory=client/ /tmp/port/*.patch      # ygo-original branches: no --directory
```

**Any other branch** (based on an older commit, or merging the integration branch along the way) ports as one commit
with its net change. Replaying it commit by commit fails, because its early patches don't match the synced tree.

```sh
cd ~/Documents/GitHub/yo2-decomp
T=$(git merge-tree --write-tree 54e14ed1 <branch>)    # exits non-zero on conflicts: merge for real in the old repo first
git diff --binary 54e14ed1 $T > /tmp/port.diff
git log --no-merges --format='- %s' 54e14ed1..<branch> > /tmp/port.msg
cd <your public worktree>
git apply --index --directory=client/ /tmp/port.diff
{ echo "<area>: <branch> (ported from yo2-decomp <sha>)"; echo; cat /tmp/port.msg; } | git commit -F -
```

- **Tested** on phase1's `lazyfs-deck` (`dbafce65`, 18 commits, never merged with the sync base). `git am` stopped at
  patch 8. The net-diff route applied cleanly (9 files, +921/−45), and the guard passed on the commit.
- **Commit messages** must not carry secrets either. The guard checks file content, not messages.
- **Once a branch is ported**, stop using it in the old repo.
