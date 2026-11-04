import { describe, expect, it } from 'vitest';
import { BLACK_HIT_PIXEL as WALL, CollisionUnavailableError, EXIT_HIT_PIXELS as EXIT, heightScaleFromPixel, probeWalls } from '../src/world/collision';
import type { FootGeometry } from '../src/world/collision';
import { detectExit } from '../src/world/exits';
const OPEN = 0x00ffffff;
// Separated synthetic probes give each branch an independent lane.
const geometry = (): FootGeometry => ({ center: {x:0,y:0}, probes: Array.from({length:16},(_,i)=>({x:100,y:100*i})) });
describe('PE-verified ordered radial wall solver', () => {
  it('reads 16 candidate probes in order, adding step before subtracting origin', () => {
    const seen: number[][] = [];
    const result = probeWalls({x:2,y:3},geometry(),{pixel(x,y){seen.push([x,y]);return OPEN;}},{fieldOrigin:{x:5,y:7}});
    expect(seen).toEqual(Array.from({length:16},(_,i)=>[97,100*i-4]));
    expect(result).toEqual({step:{x:2,y:3},wallHit:false,color:0});
  });
  it('truncates toward zero after separate float vector stores', () => {
    const g = {center:{x:0,y:0},probes:Array.from({length:16},()=>({x:-1.8,y:-2.9}))};
    const seen: number[][] = [];
    probeWalls({x:0.5,y:0.5},g,{pixel(x,y){seen.push([x,y]);return OPEN;}});
    expect(seen.every(([x,y])=>x===-1&&y===-2)).toBe(true);
  });
  it('rounds the addition before subtracting field origin at float precision boundaries', () => {
    const g = {center:{x:16777216,y:0},probes:Array.from({length:16},()=>({x:16777216,y:0}))};
    const seen: number[] = [];
    probeWalls({x:1,y:0},g,{pixel(x){seen.push(x);return OPEN;}},{fieldOrigin:{x:16777216,y:0}});
    expect(seen).toEqual(Array(16).fill(0));
  });
  it('corrects at the first free tenth and reports the last blocked color', () => {
    const seen: number[][] = [];
    const result = probeWalls({x:0,y:0},geometry(),{pixel(x,y){
      seen.push([x,y]); if(y!==0)return OPEN;
      return x>=100 ? EXIT[0] : x>=90 ? EXIT[1] : OPEN;
    }});
    expect(seen.slice(0,3)).toEqual([[100,0],[90,0],[80,0]]);
    expect(result).toEqual({step:{x:-20,y:0},wallHit:true,color:EXIT[1]});
    expect(detectExit({id:0,entries:[{from:2,x:0,y:0,direction:0},{from:7,x:0,y:0,direction:0}]},result.color,{x:0,y:0})?.destination).toBe(7);
  });
  it('chooses greatest free factor, keeping first color and vector on a tie', () => {
    let call=0;
    const script = [EXIT[0],WALL,OPEN, EXIT[1],WALL,EXIT[1],OPEN, EXIT[2],WALL,EXIT[2],OPEN, ...Array(13).fill(OPEN)];
    const r = probeWalls({x:0,y:0},geometry(),{pixel(){return script[call++];}});
    expect(call).toBe(script.length); expect(r.color).toBe(EXIT[1]);
    expect(r.step).toEqual({x:Math.fround(-100*Math.fround(3*Math.fround(.1))),y:Math.fround(-100*Math.fround(3*Math.fround(.1)))});
  });
  it('cancels on nine blocked tenths without reporting their exit colors', () => {
    let calls=0;
    const r = probeWalls({x:4,y:2},geometry(),{pixel(){calls++;return EXIT[3];}});
    expect(calls).toBe(160); expect(r).toEqual({step:{x:0,y:0},wallHit:true,color:0});
  });
  it('all-hit overwrites correction but keeps its color and best factor', () => {
    let call=0;
    const script = [EXIT[0],OPEN, ...Array(10).fill(WALL), EXIT[2],OPEN, ...Array(13).fill(OPEN)];
    const r = probeWalls({x:4,y:2},geometry(),{pixel(){return script[call++];}});
    expect(call).toBe(script.length); expect(r).toEqual({step:{x:0,y:0},wallHit:true,color:EXIT[0]});
  });
  it('a later greater factor replaces an all-hit cancellation', () => {
    let call=0;
    const script = [EXIT[0],OPEN, ...Array(10).fill(WALL), EXIT[2],WALL,OPEN, ...Array(13).fill(OPEN)];
    const r = probeWalls({x:4,y:2},geometry(),{pixel(){return script[call++];}});
    expect(call).toBe(script.length); expect(r).toEqual({step:{x:-16,y:-38},wallHit:true,color:WALL});
  });
  it('never guesses missing masks and rejects malformed geometry', () => {
    expect(()=>probeWalls({x:1,y:0},geometry(),{pixel:()=>null})).toThrow(CollisionUnavailableError);
    expect(()=>probeWalls({x:1,y:0},{center:{x:0,y:0},probes:[]},{pixel:()=>OPEN})).toThrow(/16/);
    expect(()=>probeWalls({x:Infinity,y:0},geometry(),{pixel:()=>OPEN})).toThrow();
    let call=0;
    expect(()=>probeWalls({x:1,y:0},geometry(),{pixel(){return call++===0 ? EXIT[0] : null;}})).toThrow(CollisionUnavailableError);
    expect(call).toBe(2);
  });
  it('uses recovered float constants only for exact opaque red', () => {
    expect(heightScaleFromPixel(0xffff0000)).toBe(Math.fround(.7));
    for(const c of [0x00ff0000,0xfeff0000,0xffff0001,WALL,...EXIT])expect(heightScaleFromPixel(c)).toBe(1);
  });
});
