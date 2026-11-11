/** The field's draw order, as the original's CZSort builds it each frame (ascending z: a larger key draws later,
 * in front). Read from the exe (notes in SCENE.md, "Draw order"):
 *
 * - CFieldMap::loadSection (0x00a50ec0) adds every `ObjMap` object through CFieldMap::addObject (0x00a508c0) at
 *   (X, Y, z = Y * 10) with "fixed z" off, and addObject then adds the PNG's height * 10 (the sprite's image height,
 *   OneTexture +0x18): the key is the object's bottom edge * 10.
 * - `FrontObjMap` objects go in with "fixed z" on at z = 30724.0 (0x46f00800): in front of everything on the field.
 * - CFieldMap::onMain (0x00a527c0) queues each object with its own key (the translation's z after the map's
 *   transform), the tiles with the map's own z.
 * - CChibiAvatarElm (players, NPCs) sets z = y * 10 every frame (onMain 0x009cbed0 at 0x009cbf96: pos+0x78 = pos+0x74 * 10.0; walkStep 0x009cd4e0): the foot.
 *
 * So an avatar is drawn in front of an object whose bottom edge is at or above its feet, and behind one whose bottom
 * edge is below its feet; front objects cover it. */
export const FRONT_OBJECT_DEPTH = 30724;
export function objectDepth(object: { readonly y: number; readonly height: number }): number { return (object.y + object.height) * 10; }
/** CSS z-index is an integer: the floor keeps "avatar key > object key" (an avatar a fraction below an object's
 * bottom edge is in front); an exact tie draws the avatar in front (the exe's std::sort leaves ties unordered). */
export function avatarDepth(y: number): number { return Math.floor(y * 10); }
/** True when the original draws the avatar standing at foot `y` in front of `object`. */
export function avatarInFront(y: number, object: { readonly y: number; readonly height: number }): boolean { return y * 10 >= objectDepth(object); }
