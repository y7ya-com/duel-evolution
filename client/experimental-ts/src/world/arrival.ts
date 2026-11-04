import type { WorldMap, WorldPosition } from './maps';
import { chooseArrival } from './exits';
import { isWalkable } from './pathfinding';

/** CWorldMng::enterArea (0x00add7b0) enters from map 8 with [-30,29]
 * jitter and an independently selected facing. The coarse grid can exclude a
 * source spawn: bounded retries then an actual source anchor avoid trapping the
 * player. This does not reproduce VC6's random sequence or foot collision. */
export function chooseInitialArrival(map: WorldMap, random: () => number = Math.random): WorldPosition {
  const draw = () => { const value = random(); if (!Number.isFinite(value) || value < 0 || value >= 1) throw new RangeError('Invalid arrival random value'); return value; };
  for (let attempt = 0; attempt < 8; attempt++) {
    const y = Math.floor(draw() * 60) - 30, x = Math.floor(draw() * 60) - 30;
    const anchor = chooseArrival(map,8,{random:draw}), position = {...anchor,x:anchor.x+x,y:anchor.y+y};
    if (position.x >= 0 && position.y >= 0 && (!map.grid || isWalkable(map.grid,position))) return position;
  }
  const anchor = map.entries.find(e=>e.from===8 && (!map.grid || isWalkable(map.grid,e)));
  if (!anchor) throw new Error('No walkable original arrival is available for this map.');
  return {x:anchor.x,y:anchor.y,direction:anchor.direction};
}
