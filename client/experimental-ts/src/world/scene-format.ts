/** FieldMapData.txt: value; key records, grouped by MapData::Start/End. */
export interface SceneObject { readonly path: string; readonly x: number; readonly y: number }
export interface SceneDefinition {
  readonly name: string;
  readonly baseMap: string;
  readonly hitMap: string;
  readonly tileWidth: number;
  readonly tileHeight: number;
  readonly columns: number;
  readonly rows: number;
  readonly width: number;
  readonly height: number;
  readonly objects: readonly SceneObject[];
  readonly frontObjects: readonly SceneObject[];
}
export const SCENE_TABLE_PATH = 'data/Map/FieldMapData.txt';
const MAX_TABLE_BYTES = 1024 * 1024;
export function sceneAssetPath(value: string): string {
  const path = value.replace(/\\/g, '/');
  if (path.length > 240 || !/^[a-zA-Z0-9_./-]+$/.test(path) || path.split('/').some(p => !p || p === '.' || p === '..') || path.startsWith('/')) throw new Error('Invalid scene asset path');
  return /^data\/map\//i.test(path) ? path : 'data/Map/' + path;
}
function integer(value: string, min: number, max: number): number {
  if (!/^-?\d+$/.test(value)) throw new Error('Invalid scene integer');
  const n = Number(value);
  if (!Number.isSafeInteger(n) || n < min || n > max) throw new RangeError('Scene integer out of bounds');
  return n;
}
export function parseSceneTable(input: Uint8Array | string): ReadonlyMap<string, SceneDefinition> {
  if (input.length > MAX_TABLE_BYTES) throw new RangeError('Scene table too large');
  // Verified table identifiers/paths are ASCII; Shift-JIS supports original encoding.
  const text = typeof input === 'string' ? input : new TextDecoder('shift-jis', { fatal: true }).decode(input);
  if (text.includes('\0')) throw new Error('NUL in scene table');
  const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  if (lines.length > 20000) throw new RangeError('Too many scene records');
  let at = 0;
  const next = (key: string): string => {
    const line = lines[at++];
    if (line === undefined) throw new Error(`Missing scene ${key}`);
    const parts = line.split(';');
    if (parts.length !== 2 || parts[1].trim() !== key || !parts[0].trim()) throw new Error(`Expected scene ${key}`);
    return parts[0].trim();
  };
  const result = new Map<string, SceneDefinition>();
  const objects = (key: string): readonly SceneObject[] => {
    const count = integer(next(key), 0, 256), out: SceneObject[] = [];
    for (let i = 0; i < count; i++) {
      const path = sceneAssetPath(next('Pic'));
      if (!/\.png$/i.test(path)) throw new Error('Scene object must be PNG');
      out.push(Object.freeze({ path, x: integer(next('X'), -32768, 32768), y: integer(next('Y'), -32768, 32768) }));
    }
    return Object.freeze(out);
  };
  while (at < lines.length) {
    if (result.size >= 16 || lines[at++] !== 'MapData::Start') throw new Error('Invalid scene section start');
    const name = next('MapName');
    if (!/^Map_[a-z0-9_]{1,32}$/.test(name) || result.has(name)) throw new Error('Invalid or duplicate scene name');
    const baseMap = sceneAssetPath(next('BaseMap'));
    const tileWidth = integer(next('BasePartsW'), 1, 2048), tileHeight = integer(next('BasePartsH'), 1, 2048);
    const columns = integer(next('BaseNumX'), 1, 16), rows = integer(next('BaseNumY'), 1, 16);
    const hitMap = sceneAssetPath(next('HitMap'));
    const normal = objects('ObjMapNum'), frontObjects = objects('FrontObjMapNum');
    if (lines[at++] !== 'MapData::End') throw new Error('Invalid scene section end');
    result.set(name, Object.freeze({ name, baseMap, hitMap, tileWidth, tileHeight, columns, rows,
      width: tileWidth * columns, height: tileHeight * rows, objects: normal, frontObjects }));
  }
  if (!result.size) throw new Error('Empty scene table');
  return result;
}
/** PNG header validation is a geometry guard, not a full image decoder. */
export function pngDimensions(bytes: Uint8Array): { readonly width: number; readonly height: number } {
  const signature = [137, 80, 78, 71, 13, 10, 26, 10];
  if (bytes.length < 33 || signature.some((v, i) => bytes[i] !== v)) throw new Error('Invalid scene PNG signature');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.getUint32(8) !== 13 || view.getUint32(12) !== 0x49484452) throw new Error('Missing PNG IHDR');
  const width = view.getUint32(16), height = view.getUint32(20);
  if (!width || !height || width > 8192 || height > 8192 || width * height > 16 * 1024 * 1024) throw new RangeError('PNG dimensions out of bounds');
  return Object.freeze({ width, height });
}
export function sceneTilePath(definition: SceneDefinition, column: number, row: number, hit = false): string {
  if (!Number.isInteger(column) || !Number.isInteger(row) || column < 0 || row < 0 || column >= definition.columns || row >= definition.rows) throw new RangeError('Invalid scene tile');
  return `${hit ? definition.hitMap : definition.baseMap}_${column + 1}_${row + 1}.png`;
}
