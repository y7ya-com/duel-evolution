// The game state (py yo2srv/datos/estado.py + cuentas/sesion.py). In memory it keeps py's state.json shape
// exactly, so ported code reads and writes the same dicts; D1 stores it relationally (db/project.ts).
// py reads state.json from disk on every load_state_raw(): each load is a fresh deep copy, saves replace it whole.

export type Json = null | boolean | number | string | Json[] | { [k: string]: Json };
export type State = { [k: string]: any };

/** Keys of an account that live under state.accounts[acct] (py ACCT_KEYS). */
export const ACCT_KEYS = ["players", "profiles", "active_slot", "wallet", "profiles_borrados"];
/** Keys only register_account / the admin write (py HUB_KEYS). */
export const HUB_KEYS = ["accounts", "owner_acct", "logins"];
export const MAX_SAVED_ACCOUNTS = 64;

const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v));

export class Store {
  private raw: State;
  /** Called after every save with the new raw state (D1 write-through). */
  onSave: ((st: State) => void) | null = null;

  constructor(initial: State | null) {
    this.raw = initial ? clone(initial) : { players: {} };
  }

  loadRaw(): State { return clone(this.raw); }

  saveRaw(st: State): void {
    this.raw = clone(st);
    this.onSave?.(this.raw);
  }

  /** The game account owned by a DE user (accounts[acct].user_id), if any. */
  accountOfUser(userId: string): string | null {
    for (const [acct, a] of Object.entries(this.raw.accounts ?? {})) if ((a as any)?.user_id === userId) return acct;
    return null;
  }

  /** Owner (DE user id) of a game account: undefined = no such account, null = unclaimed (legacy). */
  ownerOf(acct: string, ownerDefault: string | null): string | null | undefined {
    const a = this.raw.accounts?.[acct];
    if (a) return a.user_id ?? null;
    return acct === (this.raw.owner_acct || ownerDefault) ? null : undefined;
  }

  /** py pvp_hub.resolve_account: (account, exists?) for these ids. */
  resolveAccount(canon: string, legacy: string, ownerDefault: string | null): [string, boolean] {
    const st = this.raw;
    const accts = st.accounts ?? {};
    const owner = st.owner_acct || ownerDefault;
    const alias: Record<string, string> = st.logins?.alias ?? {};
    const ok = (a: string | undefined) => !!a && (a in accts || a === owner);
    for (const k of [canon, legacy]) if (k in alias && ok(alias[k])) return [alias[k], true];
    const covered = new Set(Object.values(alias));
    for (const k of [canon, legacy]) if (!covered.has(k) && ok(k)) return [k, true];
    return [canon, false];
  }
}
