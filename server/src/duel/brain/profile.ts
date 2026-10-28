// py research/ia/brain.py: NpcProfile, PERFILES, load_npc_profile.

export interface NpcProfile {
  nombre: string;
  agresividad: number;            // 0..1: attacks face-down monsters, accepts ties, attacks into traps
  coloca_boca_abajo: boolean;     // weak/flip monsters set face-down in DEF (otherwise everything in ATK)
  guarda_trampas: boolean;        // traps only at the right moment (otherwise as soon as possible)
  destruccion_inmediata: boolean; // Raigeki/Fissure/MST as soon as they have a target (otherwise only when needed)
  umbral_ataque: number;          // attacks if own ATK - target value > threshold (negative = suicidal)
  max_tributos: number;           // tributes it accepts to summon (0, 1 or 2)
  torpeza: number;                // chance of a random/bad decision on each important play
  defensa_boca_abajo: number;     // DEF it assumes for an opponent's face-down monster
  curar_por_debajo: number;       // uses healing below this LP
  acciones_por_turno: number;     // cap on main-phase decisions per turn (anti-loop)
}

const DEFAULTS: NpcProfile = {
  nombre: "normal", agresividad: 0.6, coloca_boca_abajo: true, guarda_trampas: true, destruccion_inmediata: true,
  umbral_ataque: 0, max_tributos: 2, torpeza: 0.1, defensa_boca_abajo: 1200, curar_por_debajo: 6500, acciones_por_turno: 14,
};
const FIELDS = Object.keys(DEFAULTS) as (keyof NpcProfile)[];

export function makeProfile(p: Partial<NpcProfile> = {}): NpcProfile {
  return { ...DEFAULTS, ...p };
}

/** py round(x, nd) / round(x): round-half-even on the exact binary value of x (round(x) is an int: no -0). */
export function pyRound(x: number, nd = 0): number {
  if (!Number.isFinite(x)) return x;
  const P = 100;
  const neg = x < 0;
  const full = Math.abs(x).toFixed(P);              // exact decimal expansion (enough digits for |x| >= ~1e-30)
  const N = BigInt(full.replace(".", ""));
  const unit = 10n ** BigInt(P - nd);
  let q = N / unit;
  const r2 = (N % unit) * 2n;
  if (r2 > unit || (r2 === unit && q % 2n === 1n)) q += 1n;
  const v = Number(q) / 10 ** nd;
  return neg ? (nd === 0 ? -v + 0 : -v) : v;
}

/** py NpcProfile.por_nivel(nivel, **cambios): level 1..9 (Power of Chaos stars). */
export function porNivel(nivel: number, cambios: Partial<NpcProfile> = {}): NpcProfile {
  const n = Math.max(1, Math.min(9, Math.trunc(nivel)));
  const f = (n - 1) / 8;
  const p: NpcProfile = {
    nombre: `nivel${n}`,
    agresividad: pyRound(0.85 - 0.4 * f, 2),
    coloca_boca_abajo: n >= 3,
    guarda_trampas: n >= 4,
    destruccion_inmediata: n <= 6,
    umbral_ataque: Math.trunc(pyRound(-800 * (1 - f) ** 2 / 50) * 50),
    max_tributos: n <= 2 ? 1 : 2,
    torpeza: pyRound(0.4 * (1 - f) ** 1.5, 3),
    defensa_boca_abajo: Math.floor(Math.trunc(800 + 700 * f) / 50) * 50,
    curar_por_debajo: 6500,
    acciones_por_turno: 8 + n,
  };
  return { ...p, ...cambios };
}

/** py NpcProfile.from_dict: only the known fields, the rest default. */
export function profileFromDict(d: Record<string, unknown>): NpcProfile {
  const ok: Partial<NpcProfile> = {};
  for (const k of FIELDS) if (Object.prototype.hasOwnProperty.call(d, k)) (ok as Record<string, unknown>)[k] = d[k];
  return makeProfile(ok);
}

export const PERFILES: Record<string, NpcProfile> = {
  facil: makeProfile({ nombre: "facil", agresividad: 0.85, coloca_boca_abajo: false, guarda_trampas: false, destruccion_inmediata: true,
    umbral_ataque: -1000, max_tributos: 1, torpeza: 0.5, defensa_boca_abajo: 800, acciones_por_turno: 9 }),
  normal: makeProfile({ nombre: "normal", agresividad: 0.65, coloca_boca_abajo: true, guarda_trampas: true, destruccion_inmediata: true,
    umbral_ataque: 0, max_tributos: 2, torpeza: 0.12, defensa_boca_abajo: 1200, acciones_por_turno: 13 }),
  dificil: makeProfile({ nombre: "dificil", agresividad: 0.45, coloca_boca_abajo: true, guarda_trampas: true, destruccion_inmediata: false,
    umbral_ataque: 0, max_tributos: 2, torpeza: 0.0, defensa_boca_abajo: 1500, acciones_por_turno: 17 }),
};

/** gamedata/npc_profiles.json (scripts/brain_gamedata.py): {"<npc>": {..., "perfil": {NpcProfile fields}}}. */
export type NpcProfilesJson = Record<string, { perfil: Record<string, unknown> } & Record<string, unknown>>;

/** py load_npc_profile(npc): the NPC's profile, or por_nivel(2) without the table / without an entry. */
export function loadNpcProfile(npc: number | string, table?: NpcProfilesJson | null): NpcProfile {
  if (!table) return porNivel(2);
  const e = Object.prototype.hasOwnProperty.call(table, String(npc)) ? table[String(npc)] : undefined;
  return e && Object.keys(e).length ? profileFromDict(e.perfil) : porNivel(2);
}
