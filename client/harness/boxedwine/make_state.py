"""Seed state.json for YOLaucher's server with one test login that its strict login (pvp_hub.LOGIN_ESTRICTO) accepts.

    python3.12 -I make_state.py OUT.json USER PASSWORD [CHARACTER]

Writes what the admin panel's moderacion.crear_cuenta(user, password) writes: accounts[id] with the character in slot
0 (its profile, trunk and starting DP are created on first use), and logins.usuarios[id] = user. id is the one
Hub.login derives from the client's 0x3003: cifrado.account_id(cifrado.encrypt(user, password)). The password itself
is not stored.
"""
import importlib.util
import json
import os
import sys

EMU = os.environ.get("YO2EMU_DIR", "/Users/y/Documents/GitHub/YOLaucher-web/tools/yo2emu")


def main():
    out, user, password = sys.argv[1:4]
    character = sys.argv[4] if len(sys.argv) > 4 else "QASmoke"
    spec = importlib.util.spec_from_file_location("yo2_cifrado", os.path.join(EMU, "research/cuentas/cifrado.py"))
    cifrado = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(cifrado)
    acct = cifrado.account_id(cifrado.encrypt(user, password))
    state = {"accounts": {acct: {"idx": 1, "players": {"0": character}, "profiles": {}, "active_slot": 0}},
             "logins": {"alias": {}, "usuarios": {acct: user}}}
    with open(out, "w", encoding="utf-8") as f:
        json.dump(state, f, ensure_ascii=False, indent=1)
    print(f"{out}: account {acct[:6]} for {user!r}, character {character!r}")


if __name__ == "__main__":
    main()
