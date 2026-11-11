import { describe, expect, it } from 'vitest';
import { WorldCamera } from '../src/world/camera';
describe('logical world camera',()=>{
  it('snaps centred on load, then scrolls only past the 300 px dead zone (350 below), clamped to the map (0x00a505a0)',()=>{
    const c=new WorldCamera({width:2400,height:1800});
    expect(c.follow({x:1200,y:900},true)).toEqual({x:688,y:516,width:1024,height:768});
    // inside the dead zone (x 988..1412, y 816..934): no scroll, no easing
    expect(c.follow({x:1100,y:850})).toMatchObject({x:688,y:516});
    expect(c.follow({x:988,y:816})).toMatchObject({x:688,y:516});
    // left/top: within 300 px moves the camera by exactly the overshoot
    expect(c.follow({x:987,y:815})).toMatchObject({x:687,y:515});
    // right 300 px; bottom 350 px (300 + 50)
    expect(c.follow({x:1412,y:933})).toMatchObject({x:688,y:515});
    expect(c.follow({x:1412,y:934})).toMatchObject({x:688,y:516});
    expect(c.follow({x:-1,y:-1})).toMatchObject({x:0,y:0});
    expect(c.follow({x:9000,y:9000})).toMatchObject({x:1376,y:1032});
  });
  it('draws at trunc(camera) and keeps the float camera between frames',()=>{
    const c=new WorldCamera({width:2400,height:1800});c.follow({x:1200,y:900},true);
    c.follow({x:687.75+300,y:900});expect(c.exact.x).toBeCloseTo(687.75);expect(c.viewport.x).toBe(687);
    expect(c.worldToScreen({x:1000,y:900})).toEqual({x:313,y:384});
  });
  it('sits a map smaller than the view flush right / bottom, as the original clamp does, and fits an exact-size map',()=>{
    expect(new WorldCamera({width:512,height:256}).viewport).toEqual({x:-512,y:-512,width:1024,height:768});
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
