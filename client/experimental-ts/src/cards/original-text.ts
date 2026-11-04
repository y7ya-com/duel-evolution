/** The original English rules wording. Effect-selection strings are a separate dataset. */
export interface OriginalCardText { readonly passcode: number; readonly internalId: number; readonly name: string; readonly description: string }
export interface OriginalTextTables { properties: Uint8Array; index: Uint8Array; names: Uint8Array; descriptions: Uint8Array }
export interface OriginalTableText { readonly name: string; readonly description: string }
const MAX_BYTES = 16 * 1024 * 1024;
function invalid(message: string): never { throw new Error(`Invalid original card text: ${message}`); }
function uint(value: unknown, min: number, max: number): value is number { return typeof value === 'number' && Number.isSafeInteger(value) && value >= min && value <= max; }

/** CARD_Prop's low 14 bits identify a card; CARD_Indx stores name/description byte offsets per property row.
 * See CardDB.cpp cardPropId and DuelText.cpp textCardName. The second offset is verified against the archive.
 * No pointers or guest memory layouts are used. Duplicate artwork rows must carry identical wording. */
export function decodeOriginalCardTextTables(tables: OriginalTextTables): ReadonlyMap<number, OriginalTableText> {
  const { properties, index, names, descriptions } = tables;
  const arrays = [properties, index, names, descriptions];
  if (arrays.some(a => !(a instanceof Uint8Array)) || arrays.reduce((n, a) => n + a.length, 0) > MAX_BYTES) invalid('table budget');
  if (!properties.length || properties.length > 100000 * 8 || properties.length % 8 || index.length % 8 || index.length < properties.length || index.length > properties.length + 8 || names.length % 2 || descriptions.length % 2) invalid('table dimensions');
  const prop = new DataView(properties.buffer, properties.byteOffset, properties.byteLength);
  const offsets = new DataView(index.buffer, index.byteOffset, index.byteLength);
  const decoder = new TextDecoder('utf-16le', { fatal: true, ignoreBOM: true });
  const cache = new Map<Uint8Array, Map<number, string>>(); let decodedBytes = 0;
  const text = (bytes: Uint8Array, start: number, max: number): string => {
    if (start % 2 || start >= bytes.length) invalid('text offset');
    let strings = cache.get(bytes); if (!strings) cache.set(bytes, strings = new Map());
    const old = strings.get(start); if (old !== undefined) { if (old.length > max) invalid('string budget'); return old; }
    let end = start;
    for (; end + 1 < bytes.length && (bytes[end] || bytes[end + 1]); end += 2) if (end - start >= max * 2) invalid('string budget');
    if (end + 1 >= bytes.length) invalid('unterminated string');
    decodedBytes += end - start; if (decodedBytes > MAX_BYTES) invalid('decoded text budget');
    const value = decoder.decode(bytes.subarray(start, end)); strings.set(start, value); return value;
  };
  const out = new Map<number, OriginalTableText>();
  for (let row = 0; row < properties.length / 8; row++) {
    const id = prop.getUint32(row * 8, true) & 0x3fff;
    if (!id) continue; // Original reserved/empty rows do not identify a card.
    const value = Object.freeze({ name: text(names, offsets.getUint32(row * 8, true), 512), description: text(descriptions, offsets.getUint32(row * 8 + 4, true), 32768) });
    if (!value.name.trim() || !value.description.trim()) invalid('empty identified card');
    const old = out.get(id);
    if (old && (old.name !== value.name || old.description !== value.description)) invalid('conflicting artwork aliases');
    out.set(id, value);
  }
  return out;
}

/** Transactional, bounded install of generated private data; names/wording are retained verbatim. */
export class OriginalCardTextCatalog {
  private byCode = new Map<number, OriginalCardText>();
  private missing: readonly number[] = [];
  get language(): 'E' { return 'E'; }
  get source(): 'merge.dat/CARD_Desc_E' { return 'merge.dat/CARD_Desc_E'; }
  install(input: unknown): void {
    if (!input || typeof input !== 'object' || Array.isArray(input)) invalid('catalog');
    const data = input as Record<string, unknown>;
    if (data.v !== 1 || data.language !== 'E' || data.source !== this.source || !Array.isArray(data.cards) || data.cards.length > 100000 || !Array.isArray(data.missingInternalIds) || data.missingInternalIds.length > 100000) invalid('catalog format');
    const byCode = new Map<number, OriginalCardText>(); let bytes = 0;
    for (const raw of data.cards) {
      if (!raw || typeof raw !== 'object' || Array.isArray(raw)) invalid('card row');
      const c = raw as Record<string, unknown>;
      if (!uint(c.passcode, 1, 0xffffffff) || !uint(c.internalId, 1, 0x3fff) || typeof c.name !== 'string' || !c.name.trim() || c.name.length > 512 || typeof c.description !== 'string' || !c.description.trim() || c.description.length > 32768 || byCode.has(c.passcode)) invalid('card identity/wording');
      bytes += (c.name.length + c.description.length) * 2;
      if (bytes > MAX_BYTES) invalid('catalog budget');
      byCode.set(c.passcode, Object.freeze({ passcode: c.passcode, internalId: c.internalId, name: c.name, description: c.description }));
    }
    const missing = data.missingInternalIds, missingSet = new Set(missing);
    if (missing.some(id => !uint(id, 1, 0xffff)) || missingSet.size !== missing.length || [...byCode.values()].some(c => missingSet.has(c.internalId))) invalid('missing identities');
    this.byCode = byCode; this.missing = Object.freeze([...missing] as number[]);
  }
  get(passcode: number): OriginalCardText | undefined { return this.byCode.get(passcode); }
  get entries(): readonly OriginalCardText[] { return [...this.byCode.values()]; }
  get missingInternalIds(): readonly number[] { return this.missing; }
  get size(): number { return this.byCode.size; }
}
