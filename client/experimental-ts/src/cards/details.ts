/** Private, generated display metadata; server rules remain authoritative. */
export interface CardDetails {
  readonly passcode: number;
  /** Index in the original client's card box, used by native .ydc files. */
  readonly legacyId: number;
  /** Original card_prop identifier; NOT the .ydc identifier. */
  readonly internalId: number;
  readonly name: string;
  readonly description?: string;
  readonly descriptionSource?: 'cards.cdb';
  readonly effectTexts?: readonly string[];
  readonly type?: string;
  readonly typeBits?: number;
  readonly race?: string;
  readonly raceBits?: string;
  readonly attribute?: string;
  readonly attributeBits?: number;
  readonly level?: number;
  readonly attack?: number;
  readonly defense?: number;
  readonly extra?: boolean;
  readonly limit?: number;
  readonly deckAllowed?: boolean;
}

function fail(): never { throw new Error('Invalid card details'); }
function integer(value: unknown, min: number, max: number): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= min && value <= max;
}
function string(value: unknown, max: number): value is string { return typeof value === 'string' && value.length <= max; }

export class CardDetailsCatalog {
  private byCode = new Map<number, CardDetails>();
  private byId = new Map<number, number>();

  /** Atomic install, with no ambiguous or silently overwritten identity mappings. */
  install(input: unknown): void {
    if (!Array.isArray(input) || input.length > 100000) fail();
    const codes = new Map<number, CardDetails>(), ids = new Map<number, number>();
    let textBudget = 0;
    for (const raw of input) {
      if (!raw || typeof raw !== 'object' || Array.isArray(raw)) fail();
      const c = raw as Record<string, unknown>;
      if (!integer(c.passcode, 1, 0xffffffff) || !integer(c.legacyId, 1, 0xfff) || !integer(c.internalId, 1, 0xffff) || !string(c.name, 512) || !c.name.trim()) fail();
      if (codes.has(c.passcode) || ids.has(c.legacyId)) throw new Error('Ambiguous card identity mapping');
      for (const key of ['type', 'race', 'attribute'] as const) if (c[key] !== undefined && !string(c[key], 512)) fail();
      if (c.description !== undefined && !string(c.description, 32768)) fail();
      if (c.descriptionSource !== undefined && (c.descriptionSource !== 'cards.cdb' || c.description === undefined)) fail();
      if (c.effectTexts !== undefined && (!Array.isArray(c.effectTexts) || c.effectTexts.length > 16 || c.effectTexts.some(t => !string(t, 32768)))) fail();
      if (c.raceBits !== undefined && (typeof c.raceBits !== 'string' || !/^(0|[1-9][0-9]{0,19})$/.test(c.raceBits) || BigInt(c.raceBits) > 0xffffffffffffffffn)) fail();
      for (const key of ['typeBits', 'attributeBits'] as const) if (c[key] !== undefined && !integer(c[key], 0, 0xffffffff)) fail();
      if (c.level !== undefined && !integer(c.level, 0, 255)) fail();
      for (const key of ['attack', 'defense'] as const) if (c[key] !== undefined && !integer(c[key], -2, 0x7fffffff)) fail();
      if (c.limit !== undefined && !integer(c.limit, 0, 3)) fail();
      for (const key of ['extra', 'deckAllowed'] as const) if (c[key] !== undefined && typeof c[key] !== 'boolean') fail();
      if (c.deckAllowed === false && c.limit !== undefined) fail();
      textBudget += JSON.stringify(c).length;
      if (textBudget > 16 * 1024 * 1024) throw new RangeError('Card details exceed budget');
      // Whitelist fields; never retain caller-owned arrays or arbitrary metadata.
      const entry: Record<string, unknown> = {};
      for (const key of ['passcode', 'legacyId', 'internalId', 'name', 'description', 'descriptionSource', 'type', 'typeBits', 'race', 'raceBits', 'attribute', 'attributeBits', 'level', 'attack', 'defense', 'extra', 'limit', 'deckAllowed'] as const) if (c[key] !== undefined) entry[key] = c[key];
      if (c.effectTexts !== undefined) entry.effectTexts = Object.freeze([...(c.effectTexts as string[])]);
      codes.set(c.passcode, Object.freeze(entry) as unknown as CardDetails);
      ids.set(c.legacyId, c.passcode);
    }
    this.byCode = codes; this.byId = ids;
  }
  get(passcode: number): CardDetails | undefined { return this.byCode.get(passcode); }
  passcodeForId(legacyId: number): number | undefined { return this.byId.get(legacyId); }
  idForPasscode(passcode: number): number | undefined { return this.byCode.get(passcode)?.legacyId; }
  get size(): number { return this.byCode.size; }
  get entries(): readonly CardDetails[] { return [...this.byCode.values()]; }
}
