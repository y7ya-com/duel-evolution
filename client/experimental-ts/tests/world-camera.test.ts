import { describe, expect, it } from 'vitest';
import { WorldCamera } from '../src/world/camera';
describe('logical world camera',()=>{
  it('centers follow within source 1024x768 viewport and clamps all edges',()=>{
    const c=new WorldCamera({width:2400,height:1800});
    expect(c.follow({x:1200,y:900})).toEqual({x:688,y:516,width:1024,height:768});
    expect(c.follow({x:-1,y:-1})).toMatchObject({x:0,y:0});
    expect(c.follow({x:9000,y:9000})).toMatchObject({x:1376,y:1032});
  });
  it('centers small maps and exactly fits a logical-size map',()=>{
    expect(new WorldCamera({width:512,height:256}).viewport).toEqual({x:-256,y:-256,width:1024,height:768});
    expect(new WorldCamera({width:1024,height:768}).follow({x:9999,y:-9999})).toMatchObject({x:0,y:0});
  });
  it('round trips world/screen coordinates without integer loss or mutating snapshot',()=>{
    const c=new WorldCamera({width:2400,height:1800}), old=c.viewport;c.follow({x:1111.25,y:888.5});
    const p={x:1700.125,y:1000.75};expect(c.screenToWorld(c.worldToScreen(p))).toEqual(p);expect(old.x).toBe(0);expect(Object.isFrozen(old)).toBe(true);
  });
  it('rejects unsafe dimensions and nonfinite targets/transforms',()=>{
    for(const width of [0,-1,NaN,Infinity,32769,2.5]) expect(()=>new WorldCamera({width,height:768})).toThrow();
    const c=new WorldCamera({width:1024,height:768});expect(()=>c.follow({x:NaN,y:0})).toThrow();expect(()=>c.screenToWorld({x:0,y:Infinity})).toThrow();expect(()=>c.worldToScreen({x:-Infinity,y:0})).toThrow();
  });
});
