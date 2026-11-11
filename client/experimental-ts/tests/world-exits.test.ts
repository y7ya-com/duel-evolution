import { describe, expect, it } from 'vitest';
import { arrivalEntries, chooseArrival, crossingAt, detectExit } from '../src/world/exits';
import { EXIT_HIT_PIXELS } from '../src/world/collision';
const entry = (from: number, x = 10, direction = 0) => ({from,x,y:20,direction});
const map = {id:2,entries:[entry(0),entry(8),entry(11),entry(8,30),entry(12),entry(8,99)]};
describe('source-backed exit/entrance helpers', () => {
  it('maps all four colors to entry index, the shop door (11) kept, END and missing destinations rejected', () => {
    expect(detectExit(map,EXIT_HIT_PIXELS[0],{x:0,y:0})).toMatchObject({index:0,destination:0,source:'mask'});
    expect(detectExit(map,EXIT_HIT_PIXELS[1],{x:0,y:0})?.destination).toBe(8);
    expect(detectExit(map,EXIT_HIT_PIXELS[2],{x:0,y:0})).toMatchObject({index:2,destination:11});   // the card shop's door
    expect(detectExit(map,EXIT_HIT_PIXELS[3],{x:0,y:0})?.destination).toBe(8);
    expect(detectExit(map,null,{x:0,y:0})).toBeNull(); expect(detectExit(map,0xff000000,{x:0,y:0})).toBeNull();
    expect(detectExit({id:0,entries:[]},EXIT_HIT_PIXELS[0],{x:0,y:0})).toBeNull();
  });
  it('uses half-open override boxes and current avatar position, opt-in only', () => {
    for (const p of [{x:420,y:930},{x:599.9,y:1044.9}]) expect(crossingAt(2,p)?.destination).toBe(7);
    for (const p of [{x:419.9,y:930},{x:600,y:930},{x:420,y:1045}]) expect(crossingAt(2,p)).toBeNull();
    expect(crossingAt(7,{x:190,y:730})?.destination).toBe(2); expect(crossingAt(0,{x:420,y:930})).toBeNull();
    expect(detectExit(map,null,{x:420,y:930})).toBeNull();
    expect(detectExit(map,null,{x:420,y:930},{crossings:true})).toMatchObject({index:3,destination:7,source:'crossing'});
  });
  it('stops at END, patches crossing arrival entry 3, and draws facing independently', () => {
    expect(arrivalEntries(map,8)).toHaveLength(2);
    expect(arrivalEntries(map,7,{crossings:true})).toEqual([{from:7,x:700,y:1110,direction:3}]);
    expect(arrivalEntries(map,8,{crossings:true})).toHaveLength(1);
    const m = {id:0,entries:[entry(8,11,1),entry(8,22,7)]}; let i=0;
    expect(chooseArrival(m,8,{random:()=>[0,0.99][i++]})).toEqual({x:11,y:20,direction:7}); expect(i).toBe(2);
    expect(() => chooseArrival(m,9)).toThrow(/No arrival/);
    expect(() => chooseArrival(m,8,{random:()=>1})).toThrow();
  });
  it('rejects invalid positions/map ids', () => {
    expect(() => crossingAt(10,{x:0,y:0})).toThrow(); expect(() => crossingAt(0,{x:NaN,y:0})).toThrow();
    expect(() => arrivalEntries(map,-1)).toThrow();
  });
});
