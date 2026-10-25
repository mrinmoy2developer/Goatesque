import test from 'node:test';
import assert from 'node:assert/strict';
import {createGameServer} from '../deploy/ludia/server.mjs';
import {Engine,emptyInput} from '../public/game/engine.mjs';
import {HostCommands,INPUT_PROTOCOL,encodeInput} from '../public/game/input-stream.mjs';
import {NetworkPresentation} from '../public/game/network-presentation.mjs';
const level=()=>({width:160,height:40,grid:Array.from({length:40},(_,y)=>Array.from({length:160},(_,x)=>y===20||x===0||x===159?1:0)),spawns:[{x:2000,y:1233},{x:4000,y:1233}],views:[{w:960,h:1080},{w:960,h:1080}],blocks:[],gates:[]});
const root=new URL('../public',import.meta.url).pathname;
test('authenticated state stream pushes simulation independently of input round trips',async()=>{
 const{server,rooms}=createGameServer({root,Engine,HostCommands,levels:[level()]});await new Promise(r=>server.listen(0,'127.0.0.1',r));const url='http://127.0.0.1:'+server.address().port+'/api/rooms',controller=new AbortController();
 const post=body=>fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
 try{
  const host=rooms.request({action:'create'}),guest=rooms.request({action:'join',code:host.code});
  const invalid=await post({...guest,token:'bad',action:'watch'});assert.equal(invalid.status,403);
  const response=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...guest,action:'watch'}),signal:controller.signal});
  assert.equal(response.headers.get('content-type'),'text/event-stream');assert.equal(response.headers.get('x-accel-buffering'),'no');
  rooms.request({...host,action:'sync',paused:false,presentation:{screen:'play'},input:{protocol:INPUT_PROTOCOL,packet:1,epoch:1,stream:11,frames:[]}});
  const compact=await post({...guest,action:'sync',streaming:true,input:{protocol:INPUT_PROTOCOL,packet:1,epoch:1,stream:22,frames:Array.from({length:40},(_,i)=>encodeInput(i+1,{...emptyInput(),right:true,jump:1}))}});
  const receipt=await compact.json();assert.ok(receipt.ok);assert.equal(receipt.state,undefined);assert.ok(JSON.stringify(receipt).length<100);
  const reader=response.body.getReader(),decoder=new TextDecoder(),states=[];let buffer='';
  const timeout=setTimeout(()=>controller.abort(),3000);
  try{while(states.length<7){const result=await reader.read();assert.equal(result.done,false);buffer+=decoder.decode(result.value,{stream:true});let end;while((end=buffer.indexOf('\n\n'))>=0){const part=buffer.slice(0,end);buffer=buffer.slice(end+2);if(part.startsWith('data: '))states.push(JSON.parse(part.slice(6)));}}}finally{clearTimeout(timeout);}
  assert.ok(states.at(-1).state.players[1].x>states[0].state.players[1].x);
  assert.equal(states.at(-1).state.players[0].x,2000);
  assert.ok(states.every(s=>!JSON.stringify(s).includes(host.token)&&!JSON.stringify(s).includes(guest.token)));
  assert.ok(states.at(-1).state.hostFrame>states[0].state.hostFrame);
 }finally{controller.abort();server.closeStreams();await new Promise(r=>server.close(r));}
});
test('a small server input buffer absorbs delivery jitter without inventing physics',()=>{
 const e=new Engine([level()]),q=new HostCommands(1,4);q.ingest({protocol:INPUT_PROTOCOL,packet:1,epoch:1,stream:1,frames:[encodeInput(1,{...emptyInput(),right:true})]},1,1000);
 assert.equal(q.next(e,1010).advance,false);assert.equal(q.ack,0);
 q.ingest({protocol:INPUT_PROTOCOL,packet:2,epoch:1,stream:1,frames:[2,3,4].map(seq=>encodeInput(seq,{...emptyInput(),right:true}))},1,1030);
 for(let i=0;i<4;i++)assert.equal(q.next(e,1030+i*16).seq,i+1);
 assert.equal(q.next(e,1100).advance,false);assert.equal(q.ack,4);
 q.ingest({protocol:INPUT_PROTOCOL,packet:3,epoch:1,stream:1,frames:[encodeInput(5,emptyInput())]},1,1120);
 assert.equal(q.next(e,1140).advance,false);assert.equal(q.next(e,1200).seq,5);
});
test('remote snapshot interpolation moves every render frame and leaves local prediction untouched',()=>{
 const e=new Engine([level()]),s=new NetworkPresentation();s.reset(e);const snapshots=[];
 for(let i=0;i<6;i++){const state=e.snapshot();state.hostFrame=60+i*2;state.players[1].x=4000+i*20;state.players[1].vx=10;state.players[1].ground=true;state.cameras[1].x+=i*20;s.observe(e,state,0,i*1000/30);s.present(e,1000/30,i*1000/30);snapshots.push(state);}
 const local=e.players[0].x,positions=[];for(let i=0;i<6;i++){const shown=s.present(e,1000/60,170+i*1000/60);positions.push(shown.players[1].x);assert.equal(shown.players[0].x,local);}
 assert.ok(positions.every((x,i)=>!i||x>positions[i-1]));assert.equal(e.players[1].x,4000);
 const before=positions.at(-1);const shown=s.present(e,50,400);assert.ok(shown.players[1].x>before);assert.ok(shown.players[1].x<=4136.01,'extrapolation stays within 60 ms');
 e.serial++;s.present(e,16,416);assert.equal(s.samples.length,0,'new level immediately discards old interpolation');
});
test('WebSocket sessions carry both directions, bind input ownership, and close revoked sessions',async()=>{
 const{default:WebSocket}=await import('../deploy/ludia/vendor/ws/wrapper.mjs');const{server,rooms}=createGameServer({root,Engine,HostCommands,levels:[level()]});await new Promise(r=>server.listen(0,'127.0.0.1',r));const port=server.address().port,host=rooms.request({action:'create'}),guest=rooms.request({action:'join',code:host.code}),messages=[];
 const socket=new WebSocket('ws://127.0.0.1:'+port+'/api/rooms/socket',{origin:'http://127.0.0.1:'+port});socket.on('message',bytes=>messages.push(JSON.parse(bytes)));const wait=async predicate=>{const limit=Date.now()+3000;while(!predicate()){if(Date.now()>limit)throw new Error('Missing WebSocket state');await new Promise(r=>setTimeout(r,10));}};
 try{await new Promise((resolve,reject)=>{socket.once('open',resolve);socket.once('error',reject);});socket.send(JSON.stringify({...guest,action:'watch'}));await wait(()=>messages.some(m=>m.state));rooms.request({...host,action:'sync',paused:false,presentation:{screen:'play'},input:{protocol:INPUT_PROTOCOL,packet:1,epoch:1,stream:11,frames:[]}});
 socket.send(JSON.stringify({action:'sync',token:host.token,input:{protocol:INPUT_PROTOCOL,packet:1,epoch:1,stream:22,frames:Array.from({length:30},(_,i)=>encodeInput(i+1,{...emptyInput(),right:true,jump:1}))}}));socket.send(JSON.stringify({action:'ping',id:42}));await wait(()=>messages.some(m=>m.state?.guestAck>=30));assert.ok(messages.some(m=>m.pong===42));const state=messages.filter(m=>m.state).at(-1).state;assert.equal(state.players[0].x,2000);assert.ok(state.players[1].x>4000);assert.equal(state.events.filter(r=>r.event.type==='jump').length,1);rooms.request({...guest,action:'leave'});await wait(()=>messages.some(m=>m.closed));
 }finally{socket.terminate();server.closeStreams();await new Promise(r=>server.close(r));}
});
