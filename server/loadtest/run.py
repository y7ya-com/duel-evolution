"""One load step (README.md): POST /run to the driver with n players (`pvp` of them in PvP pairs, `npcs` duelling NPCs,
the rest walking and chatting), all logged in over `ramp` s, for `secs` s. Prints the merged summary as JSON.
  LOAD_KEY=... [TAG=x] python3.12 -I loadtest/run.py <driver url> n [secs] [pvp] [npcs] [ramp] [per]
TAG reuses the players of an earlier run with that tag (returning players: no new characters).
"""
import json
import os
import sys
import urllib.request

url, n = sys.argv[1], int(sys.argv[2])
secs, pvp, npcs, ramp, per = (int(sys.argv[i]) if len(sys.argv) > i else d for i, d in ((3, 120), (4, n // 5 * 2 // 2 * 2 // 2), (5, n // 5), (6, 30), (7, 4)))
deck = json.load(open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "gamedata", "duel.json")))["npc_decks"]["51"]
body = {"n": n, "secs": secs, "pvp": pvp // 2 * 2, "npcs": npcs, "rampS": ramp, "per": per, "npc": 84, "prompts": 20, "pvpPrompts": 40,
        "deck": [deck["main"], deck.get("extra") or []], **({"tag": os.environ["TAG"]} if os.environ.get("TAG") else {})}
req = urllib.request.Request(url.rstrip("/") + "/run", data=json.dumps(body).encode(), method="POST",
                             headers={"x-load-key": os.environ["LOAD_KEY"], "Content-Type": "application/json", "User-Agent": "de-loadtest"})
with urllib.request.urlopen(req, timeout=secs + ramp + 900) as r:
    out = json.load(r)
out["plan"] = {k: body[k] for k in ("n", "secs", "pvp", "npcs", "rampS", "per")}
print(json.dumps(out, indent=1))
