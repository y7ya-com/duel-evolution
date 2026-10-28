#!/usr/bin/env python3
"""guard.py: keeps Konami's files, anything extracted from them and secrets out of this repo.

    python3 infra/guard.py --staged       what is about to be committed (the pre-commit / pre-applypatch hooks)
    python3 infra/guard.py --all          every tracked file, plus gitleaks over the whole history
    python3 infra/guard.py --range A..B   every file added or changed by each commit in A..B (CI, pushes and PRs)

Refuses: game binaries and archives by extension, generated or extracted paths (server/gamedata/ except its README,
recomp/out/, build*/, html-ui art and goldens, loader art, Ghidra and decompiler dumps), MZ/PE executables, any
binary file (NUL bytes: images, audio, fonts, archives), files over 1 MB, and whatever gitleaks finds.
Exit 1 with one line per problem. There is no override: if a file really belongs here, change the rules in a PR.
"""
import os, re, shutil, subprocess, sys

MAX = 1_000_000
EXT = re.compile(r"\.(exe|dll|dat|swf|7z|lzh|zip|cab|msi|bin|pak|cdb|png|jpe?g|bmp|gif|webp|tga|dds|ico|ttf|otf|"
                 r"woff2?|wav|ogg|mp3|mid|wma|avi|mpe?g|wasm|o|a|so|dylib|pyc|pkl|tgz|gz|xz|bz2)$", re.I)
PATH = re.compile(r"^(server/gamedata/(?!README\.md$)|client/recomp/out/|client/html-ui/(assets|golden|diff)|"
                  r"client/web-shell/(loader|fonts)/)|(^|/)build[^/]*/|(^|/)(decompiled|islands|ghidra-proj|swfdump|"
                  r"swf_golden|trace|openjoey)/|(^|/)(functions2?\.jsonl|labels\.tsv|vtables\.tsv|\.dev\.vars|\.env)$|"
                  r"\.(gpr|rep)$")


def git(*a, binary=False):
    out = subprocess.run(["git", *a], capture_output=True, check=True).stdout
    return out if binary else out.decode()


def problems(path, data):
    if PATH.search(path):
        yield "generated, extracted or local-only path"
    if EXT.search(path):
        yield "game binary / media / archive extension"
    # the DOS stub text is split so this file does not match itself
    if data[:2] == b"MZ" or b"This program cannot be run in " b"DOS mode" in data[:4096]:
        yield "MZ/PE executable"
    elif b"\0" in data[:8192]:
        yield "binary file (NUL bytes)"
    if len(data) > MAX:
        yield f"over 1 MB ({len(data)} bytes)"


def files(mode, arg):
    if mode == "--staged":
        for p in git("diff", "--cached", "--name-only", "--diff-filter=ACMR", "-z").split("\0"):
            if p:
                yield p, lambda p=p: git("show", f":{p}", binary=True)
    elif mode == "--all":
        for p in git("ls-files", "-z").split("\0"):
            if p:
                yield p, lambda p=p: git("show", f":{p}", binary=True)
    else:
        for c in git("rev-list", arg).split():
            for p in git("diff-tree", "--no-commit-id", "-r", "--root", "--name-only", "--diff-filter=ACMR", "-z", c).split("\0"):
                if p:
                    yield f"{c[:8]}:{p}", lambda c=c, p=p: git("cat-file", "blob", f"{c}:{p}", binary=True)


def leaks(mode, arg):
    if not shutil.which("gitleaks"):
        return ["gitleaks is not installed (brew install gitleaks)"]
    cmd = {"--staged": ["git", "--pre-commit", "--staged"], "--all": ["git"]}.get(mode, ["git", "--log-opts", arg])
    r = subprocess.run(["gitleaks", *cmd, "--no-banner", "--redact", "-v"], capture_output=True, text=True)
    return [] if r.returncode == 0 else ["gitleaks: " + (r.stdout + r.stderr).strip()[-3000:]]


def main():
    mode = sys.argv[1] if len(sys.argv) > 1 else "--staged"
    arg = sys.argv[2] if mode == "--range" else None
    if mode not in ("--staged", "--all", "--range") or (mode == "--range" and not arg):
        sys.exit(__doc__)
    os.chdir(git("rev-parse", "--show-toplevel").strip())
    bad = [f"{p}: {why}" for p, get in files(mode, arg) for why in problems(p, get())] + leaks(mode, arg)
    for b in bad:
        print("guard:", b, file=sys.stderr)
    if bad:
        sys.exit("guard: refused. Konami files, extracted data and secrets never enter this repo (README, CONTRIBUTING.md).")


if __name__ == "__main__":
    main()
