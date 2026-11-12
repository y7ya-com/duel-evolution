import { afterEach, describe, expect, it } from 'vitest';
import { vi } from 'vitest';
import { setup, drive } from './network-server-fixture';
import { GameSession } from '../src/network/session';
import { NPC_DECKS } from '../../../server/src/duel/data';
import type { WireMessage } from '../src/network/codec';
afterEach(()=>{vi.clearAllTimers();vi.useRealTimers();});
describe('successful outgoing packet observation',()=>{
  it('reports actual sequences and copied bytes and isolates observer errors',async ()=>{
    const fixture = setup(); fixture.session.dispose();
    const login = new TextEncoder().encode('fixture-known-login-0123456789abc').slice(0,32);
    const blob = new Uint8Array(32); blob.set(login);
    const sent:{ channel:number; message:WireMessage }[] = [];
    let session:GameSession;
    session = new GameSession({ ...fixture.session.options,loginBlob:blob,onOutgoing:(channel,message)=>{
      sent.push({ channel:channel.id,message:{ ...message,data:message.data.slice() } });
      message.data.fill(0xff); // Observer cannot modify the caller's packet or bytes already sent.
      if (message.id===0x0005) throw new Error('Observer failure');
    } });
    try {
      await drive(session.start()); await drive(session.createCharacter(0,'Observed')); await drive(session.selectCharacter(0));
      await drive(session.startNpcDuel(51,NPC_DECKS['51']));
      expect(sent.find(r=>r.message.id===0x3003)?.message.data).toEqual(blob);
      expect(sent.some(r=>r.message.id===0x6601)).toBe(true);
      const byChannel = new Map<number,number>();
      for (const entry of sent) {
        const { id,param } = entry.message;
        if ((id&0xff00)===0xca00) expect(param).toBe(0);
        else { expect(param).toBe((byChannel.get(entry.channel)??0)+1); byChannel.set(entry.channel,param); }
      }
      // The deliberate observer exception must not lose this actual heartbeat response.
      await drive(session.lobby!.request(0x0005,new Uint8Array(0),0x0004));
      expect(sent.some(r=>r.message.id===0x0005)).toBe(true);
      expect(blob).toEqual(new Uint8Array(32).map((_,i)=>login[i]??0));
      expect(session.gateway.status).toBe('connected');
    } finally { session.dispose(); }
  });
});
