import test from 'node:test';
import assert from 'node:assert/strict';
import {Engine,emptyInput} from '../public/game/engine.mjs';
import {GuestCommands} from '../public/game/input-stream.mjs';
import {RoomConnection} from '../public/game/network.mjs';
import {NetworkPresentation} from '../public/game/network-presentation.mjs';
const level=()=>({width:160,height:40,grid:Array.from({length:40},(_,y)=>Array.from({length:160},(_,x)=>y===20||x===0||x===159?1:0)),spawns:[{x:2000,y:1233},{x:4000,y:1233}],views:[{w:960,h:1080},{w:960,h:1080}],blocks:[],gates:[]});
test('reliable socket sends each command once and resends pending history on reconnect',()=>{
 const sent=[],c=new RoomConnection({},()=>{},()=>{}),input={epoch:1,stream:10,frames:[[1,2,0,0,0,0,0],[2,2,0,0,0,0,0]]};c.socket={send:bytes=>sent.push(JSON.parse(bytes))};c.payload=()=>({input:{...input,frames:input.frames.map(f=>[...f])}});
 c.sendSocketInput();c.sendSocketInput();input.frames.push([3,0,0,0,0,0,0]);c.sendSocketInput();
 assert.deepEqual(sent.map(m=>m.input.frames.map(f=>f[0])),[[1,2],[],[3]]);assert.equal(input.frames.length,3);
 c.socketSent=null;c.sendSocketInput();assert.deepEqual(sent.at(-1).input.frames.map(f=>f[0]),[1,2,3]);
 input.stream++;input.frames=[[7,2,1,0,0,0,0]];c.sendSocketInput();assert.deepEqual(sent.at(-1).input.frames.map(f=>f[0]),[7]);
});
test('failed socket writes never advance the command cursor',()=>{
 const c=new RoomConnection({},()=>{},()=>{});c.payload=()=>({input:{epoch:1,stream:1,frames:[[1,2,0,0,0,0,0]]}});c.socket={send:()=>{throw new Error('closed');}};
 assert.throws(()=>c.sendSocketInput(),/closed/);assert.equal(c.socketSent,null);
});
test('display buffer stays low on stable links, grows with jitter and recovers',()=>{
 const e=new Engine([level()]),s=new NetworkPresentation();s.reset(e);let now=0;
 for(let i=0;i<20;i++){const state=e.snapshot();state.hostFrame=i*2;s.observe(e,state,0,now);now+=1000/30;}
 assert.ok(s.delay<=50.01);
 const late=e.snapshot();late.hostFrame=40;s.observe(e,late,0,now+100);assert.ok(s.delay>=120&&s.delay<=140);
 now+=100;for(let i=21;i<180;i++){now+=1000/30;const state=e.snapshot();state.hostFrame=i*2;s.observe(e,state,0,now);}
 assert.ok(s.delay<55);
});
test('120 Hz local rendering fills physics gaps without changing the world or input counters',()=>{
 const e=new Engine([level()]),s=new NetworkPresentation(),input={...emptyInput(),right:true},shown=[];let accumulator=0;
 for(let frame=0;frame<240;frame++){accumulator+=1000/120;if(accumulator+1e-8>=1000/60){accumulator-=1000/60;e.predictPlayer(0,input);}const before=JSON.stringify(e.snapshot());const visual=s.present(e,1000/120,frame*1000/120,{localPlayer:0,input,fraction:Math.max(0,accumulator/(1000/60)),paused:false});assert.equal(JSON.stringify(e.snapshot()),before);shown.push(visual.players[0].x);}
 const deltas=shown.slice(81).map((x,i)=>x-shown[i+80]);assert.ok(deltas.every(dx=>dx>4.69&&dx<4.71));assert.equal(e.players[1].x,4000);
});
test('interpolated remote motion stays bounded and cannot reverse on monotonic snapshots',()=>{
 const e=new Engine([level()]),s=new NetworkPresentation();s.reset(e);let previous=4000;
 for(let frame=0;frame<180;frame++){if(frame%4===0){const state=e.snapshot();state.hostFrame=frame/2;state.players[1].x=4000+Math.min(300,frame*3);state.players[1].vx=frame<100?6:0;state.cameras[1].x+=Math.min(300,frame*3);s.observe(e,state,0,frame*1000/120);}const visual=s.present(e,1000/120,frame*1000/120);assert.ok(visual.players[1].x>=previous-.001);assert.ok(visual.players[1].x<=4300.001);previous=visual.players[1].x;}
});

test('delta payloads keep the full replay history available for acknowledgments and fallback',()=>{const commands=new GuestCommands();commands.reset(1);for(let i=0;i<8;i++)commands.push({...emptyInput(),right:true},1);const cursor={epoch:1,stream:commands.stream,sequence:6};assert.deepEqual(commands.payload(cursor).frames.map(f=>f[0]),[7,8]);assert.equal(commands.pending.length,8);assert.equal(commands.payload().frames.length,8);assert.equal(commands.payload({...cursor,stream:cursor.stream-1}).frames.length,8);});
