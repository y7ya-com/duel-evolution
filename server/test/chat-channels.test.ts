import { afterEach, describe, expect, it, vi } from "vitest";
import { harness, be32, cat, str, cstr } from "./notes-harness.ts";
import { chatGet, chatSend } from "../src/game/chat.ts";

afterEach(() => vi.useRealTimers());
async function setup() {
  const h = harness({}, { DEV: "1", PROGRESSION: "1" });
  const a = h.client("A", "a", "pw", "user-a"), b = h.client("B", "b", "pw", "user-b"), c = h.client("C", "c", "pw", "user-c");
  for (const [i, client] of [a,b,c].entries()) await client.account(0, `Player${i}`);
  await a.enterRoom(); await b.enterRoom(1); await c.enterRoom(0, 5, 0, undefined, 5732);
  return { h,a,b,c };
}
const message = (kind: number, text: string, to = 0) => cat([0,kind],be32(0),be32(to),be32(0),str(text,text.length),[0]);
const read = (h: ReturnType<typeof harness>, id: string, after = 0) => { const r = chatGet(h.game,id,after); if ("error" in r) throw Error(r.error); return r.ok; };

describe("shared server chat", () => {
  it("Global and legacy proximity reach other blocks and My Room through the same stream", async () => {
    const {h,a,b,c} = await setup();
    // Capacity blocks still have separate avatar maps, but no separate public chat channel.
    const other = h.game.hub.byPid(b.pid!)!;
    h.game.hub.blocks.get(other.block!)!.delete(other.pid!);
    other.block = "5740|0#2";
    h.game.hub.blocks.set(other.block, new Map([[other.pid!, other]]));
    expect(h.game.hub.byPid(a.pid!)!.block).not.toBe(other.block);
    expect(h.game.hub.byPid(c.pid!)!.block).toBeNull();
    const nb=b.room!.mark(), nc=c.room!.mark();
    a.room!.send(0x4400,message(0,"hello room"));
    expect(cstr((await b.room!.wait(0x4402,nb))!.subarray(26))).toBe("hello room");
    expect(cstr((await c.room!.wait(0x4402,nc))!.subarray(26))).toBe("hello room");
    expect(read(h,"user-c").messages.map(m=>m.text)).toEqual(["hello room"]);
    a.room!.send(0x4400,message(1,"old proximity")); await h.tick(100);
    expect(read(h,"user-b").messages.at(-1)?.channel).toBe("global");
  });

  it("room HTTP messages retain their channel, emit one native line and retry idempotently", async () => {
    const {h,a,b} = await setup(), n=b.room!.mark();
    const body={channel:"trade",text:"Trading cards",requestId:"room-message-123"};
    expect(chatSend(h.game,"user-c",body)).toHaveProperty("ok");
    expect(chatSend(h.game,"user-c",body)).toHaveProperty("ok");
    await h.tick(300);
    const wire=b.room!.all(0x4402,n); expect(wire).toHaveLength(1); expect(wire[0][1]).toBe(2);
    expect(read(h,"user-a").messages.map(m=>[m.channel,m.text])).toEqual([["trade","Trading cards"]]);
    expect(a.errors()).toEqual([]);
  });

  it("whispers never enter another player's HTTP or native feed; ignore blocks both paths", async () => {
    const {h,a,b,c}=await setup(); const n=c.room!.mark();
    chatSend(h.game,"user-a",{channel:"whisper",text:"private",targetPid:b.pid}); await h.tick(200);
    expect(read(h,"user-b").messages[0].channel).toBe("whisper");
    expect(read(h,"user-c").messages).toEqual([]); expect(c.room!.all(0x4402,n)).toEqual([]);
    b.room!.send(0x4530,be32(a.pid!)); await h.tick(200);
    chatSend(h.game,"user-a",{channel:"global",text:"blocked"}); await h.tick(200);
    expect(read(h,"user-b").messages).toEqual([]);
    expect(read(h,"user-c").messages.map(m=>m.text)).toEqual(["blocked"]);
  });

  it("a refused line says why in its own tab: Team with no team, a whisper to someone offline", async () => {
    const {a,b}=await setup(), nb=b.room!.mark();
    let n=a.room!.mark(); a.room!.send(0x4400,message(5,"anyone?"));
    let w=(await a.room!.wait(0x4402,n))!;
    expect([w[1], cstr(w.subarray(10,26)), cstr(w.subarray(26))]).toEqual([5,"Notice","You are not in a team. Form one or accept an invite: Main Menu > Team List."]);
    n=a.room!.mark(); a.room!.send(0x4400,message(3,"psst",987654));
    w=(await a.room!.wait(0x4402,n))!;
    expect([w[1], cstr(w.subarray(26))]).toEqual([3,"That player is not online."]);
    expect(b.room!.all(0x4402,nb)).toEqual([]);
  });

  it("team messages are private and cannot be requested by an account outside the team", async () => {
    const {h,a,b,c}=await setup();
    a.room!.send(0x4550,str("Team",16)); await a.room!.wait(0x4566);
    const mark=b.room!.mark(); a.room!.send(0x4554,be32(b.pid!)); const inv=(await b.room!.wait(0x4567,mark))!;
    const dv=new DataView(inv.buffer,inv.byteOffset,inv.byteLength);
    b.room!.send(0x4568,cat(be32(1),be32(dv.getUint32(0)),be32(dv.getUint32(20)))); await h.tick(1000);
    expect(chatSend(h.game,"user-a",{channel:"team",text:"Team only"})).toHaveProperty("ok");
    expect(read(h,"user-b").messages.map(m=>m.text)).toEqual(["Team only"]);
    expect(read(h,"user-c").messages).toEqual([]);
    expect(chatSend(h.game,"user-c",{channel:"team",text:"intrusion"})).toHaveProperty("error");
  });

  it("rejects reserved channels, oversized messages, sanctioned senders and missing game sessions", async () => {
    const {h,a}=await setup();
    for(const channel of ["constructor","__proto__","proximity","metadata"]) expect(chatSend(h.game,"user-a",{channel,text:"x"})).toHaveProperty("error");
    expect(chatSend(h.game,"user-a",{channel:"global",text:"x".repeat(129)})).toHaveProperty("error");
    expect(chatSend(h.game,"absent",{channel:"global",text:"x"})).toHaveProperty("error");
    h.game.admin.data.flags.set(h.game.hub.byPid(a.pid!)!.acct,0x20);
    expect(chatSend(h.game,"user-a",{channel:"global",text:"muted"})).toHaveProperty("error");
    expect(read(h,"user-b").messages).toEqual([]);
  });
});
