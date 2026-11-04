import type { CardDetailsCatalog } from './details';

export interface LegacyDeck { main: number[]; side: number[]; extra: number[] }
export const LEGACY_DECK_BYTES = 250;
export const LEGACY_DECK_FORMAT = 'native .ydc';
const sections = [['main', 80], ['side', 15], ['extra', 30]] as const;
type Mapping = Pick<CardDetailsCatalog, 'passcodeForId' | 'idForPasscode'>;

/** CDeckManager::File + yo2SaveFile -> CFile::Write: raw uint16 LE, zero vacancies. */
export function decodeLegacyDeck(input: Uint8Array | ArrayBuffer, catalog: Mapping): LegacyDeck {
  const bytes = input instanceof ArrayBuffer ? new Uint8Array(input) : input;
  if (!(bytes instanceof Uint8Array) || bytes.byteLength !== LEGACY_DECK_BYTES) throw new Error('Native .ydc must be exactly 250 bytes');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const deck: LegacyDeck = { main: [], side: [], extra: [] };
  let offset = 0;
  for (const [section, capacity] of sections) for (let i = 0; i < capacity; i++, offset += 2) {
    const id = view.getUint16(offset, true);
    if (!id) continue;
    if (id > 0xfff) throw new Error(`Invalid legacy card ID ${id} in ${section}`);
    const passcode = catalog.passcodeForId(id);
    if (!Number.isSafeInteger(passcode) || passcode! <= 0 || passcode! > 0xffffffff || catalog.idForPasscode(passcode!) !== id) throw new Error(`Unknown or ambiguous legacy card ID ${id}`);
    deck[section].push(passcode!);
  }
  return deck;
}

/** Encodes storage capacity, not deck legality/ownership; those are server decisions. */
export function encodeLegacyDeck(deck: LegacyDeck, catalog: Mapping): Uint8Array {
  if (!deck || typeof deck !== 'object') throw new Error('Invalid legacy deck');
  const bytes = new Uint8Array(LEGACY_DECK_BYTES), view = new DataView(bytes.buffer);
  let offset = 0;
  for (const [section, capacity] of sections) {
    const cards = deck[section];
    if (!Array.isArray(cards) || cards.length > capacity) throw new Error(`Invalid ${section} capacity (maximum ${capacity})`);
    for (let i = 0; i < cards.length; i++) {
      const passcode = cards[i];
      if (!Number.isSafeInteger(passcode) || passcode <= 0 || passcode > 0xffffffff) throw new Error('Invalid card passcode');
      const id = catalog.idForPasscode(passcode);
      if (!Number.isSafeInteger(id) || id! <= 0 || id! > 0xfff || catalog.passcodeForId(id!) !== passcode) throw new Error(`Unknown or ambiguous passcode ${passcode}`);
      view.setUint16(offset + i * 2, id!, true);
    }
    offset += capacity * 2;
  }
  return bytes;
}
