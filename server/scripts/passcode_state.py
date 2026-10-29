"""A py-shaped state.json (the fixtures parity/e2e runs load, scripts/import_state.ts input) to real passcodes: the same
conversion scripts/passcode_d1.py makes on D1, on the JSON shape (db/project.ts).

  python3 -I scripts/passcode_state.py <state.json> [<out.json>]   (in place without <out.json>)

Per profile: trunk keys, decks.last_duel (main, extra, missing, bad_ids), decks.historial (main, extra, the hash,
problemas[].id), pending[].cards. A card without a passcode (gamedata/cards.json) stops it. schema -> 3.
"""
import hashlib
import json
import os
import sys

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PC = {c["i"]: c["pc"] for c in json.load(open(os.path.join(HERE, "gamedata", "cards.json")))}


def pc(v):
    v = int(v)
    if v not in PC: sys.exit(f"card {v} has no passcode")
    return PC[v]


def deck_hash(main, extra):   # deckCheck.ts deckHash
    return hashlib.sha1((",".join(map(str, sorted(main))) + "|" + ",".join(map(str, sorted(extra)))).encode()).hexdigest()[:16]


def profile(p):
    if "trunk" in p: p["trunk"] = {str(pc(k)): n for k, n in p["trunk"].items()}
    d = p.get("decks") or {}
    ld = d.get("last_duel")
    if isinstance(ld, dict):
        for k in ("main", "extra", "bad_ids"):
            if isinstance(ld.get(k), list): ld[k] = [pc(c) for c in ld[k]]
        if isinstance(ld.get("missing"), dict): ld["missing"] = {str(pc(k)): n for k, n in ld["missing"].items()}
    for h in d.get("historial") or []:
        h["main"], h["extra"] = [pc(c) for c in h.get("main", [])], [pc(c) for c in h.get("extra", [])]
        h["hash"] = deck_hash(h["main"], h["extra"])
        for pr in h.get("problemas") or []:
            if pr.get("id") is not None: pr["id"] = pc(pr["id"])
    for it in p.get("pending") or []:
        if isinstance(it.get("cards"), list): it["cards"] = [pc(c) for c in it["cards"]]


def profiles(container):
    if isinstance(container, dict): return [v for v in container.values() if isinstance(v, dict)]
    if isinstance(container, list): return [v for v in container if isinstance(v, dict)]
    return []


def main():
    src = sys.argv[1]
    st = json.load(open(src, encoding="utf-8"))
    if st.get("schema") == 3: sys.exit("already passcodes (schema 3)")
    n = 0
    for p in profiles(st.get("profiles")) + profiles(st.get("archived")):
        profile(p); n += 1
    for a in (st.get("accounts") or {}).values():
        for p in profiles(a.get("profiles")) + profiles(a.get("archived")):
            profile(p); n += 1
    st["schema"] = 3
    out = sys.argv[2] if len(sys.argv) > 2 else src
    json.dump(st, open(out, "w", encoding="utf-8"), ensure_ascii=False)
    print(f"{out}: {n} profiles to passcodes")


if __name__ == "__main__":
    main()
