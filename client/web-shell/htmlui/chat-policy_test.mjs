import assert from 'node:assert/strict';
import { CHAT_CHANNELS, bubbleMessages, visibleMessages } from './chat-policy.js';
import { chatAvatars } from './read/chat.js';
assert.deepEqual(CHAT_CHANNELS.map(c=>c.id), ['global','trade','whisper','team']);
const messages=[{pid:1,at:100,channel:'global',text:'public'},{pid:2,at:100,channel:'trade',text:'trade'},
 {pid:1,at:110,channel:'global',text:'newest'},{pid:3,at:100,channel:'whisper',text:'secret'}, {pid:4,at:100,channel:'team',text:'team'}];
assert.deepEqual(bubbleMessages(messages,200).map(m=>m.text),['newest','trade']);
assert.deepEqual(bubbleMessages(messages,10000),[]);
assert.deepEqual(visibleMessages(messages,'global').map(m=>m.text),['public','newest']);
assert.deepEqual(visibleMessages(messages,'team').map(m=>m.text),['team']);
const types=new Map([[1,'CAreaScene'],[2,'CPlChibiAvatar'],[3,'CSpriteElm']]);
const h={cls:n=>types.get(n)||'?',children:n=>n===1?[2,3]:[],ptr:a=>a===2+0xb8?100:a===2+0x94?200:0,
 i32:a=>a===2+0xec?1234:0,wstr:a=>a===100+0x410?'Ann':'',vis:()=>true,locked:()=>false,at:()=>({wx:300,wy:150})};
assert.deepEqual(chatAvatars(h,1),[{pid:1234,name:'Ann',x:300,y:150}]);
assert.deepEqual(chatAvatars({...h,vis:()=>false},1),[]);
assert.deepEqual(chatAvatars({...h,children:()=>[1]},1),[], 'cycles cannot hang the frame reader');
console.log('chat-policy_test: passed');
