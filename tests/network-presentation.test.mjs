import test from 'node:test';
import assert from 'node:assert/strict';
import {NetworkPresentation} from '../public/game/network-presentation.mjs';
import {RoomConnection} from '../public/game/network.mjs';
const pose=()=>({index:2,serial:1,rewinding:false,tick:10,players:[{x:100,y:500,view:0,owner:0,scale:1,gate:-1},{x:700,y:500,view:1,owner:1,scale:1,gate:-1}],cameras:[{x:0,y:0,w:960,h:1080,locked:false},{x:600,y:0,w:960,h:1080,locked:false}],blocks:[{x:50,y:60}]});
test('network corrections preserve the visible pose without changing authoritative physics',()=>{const e=pose(),s=new NetworkPresentation(),before=s.capture(e);e.players[1].x-=40;e.cameras[1].x-=40;e.blocks[0].x-=10;s.reconcile(before,e);const shown=s.present(e,0);assert.equal(shown.players[1].x,700);assert.equal(shown.cameras[1].x,600);assert.equal(shown.blocks[0].x,50);assert.equal(e.players[1].x,660);assert.equal(e.cameras[1].x,560);assert.equal(e.blocks[0].x,40);assert.equal(e.tick,10);assert.notEqual(shown.players,e.players);});
test('correction offsets decay smoothly and track new movement immediately',()=>{const e=pose(),s=new NetworkPresentation(),before=s.capture(e);e.players[1].x-=40;s.reconcile(before,e);const first=s.present(e,16).players[1].x;e.players[1].x+=9.4;const next=s.present(e,16).players[1].x;assert.ok(next>first);for(let i=0;i<100;i++)s.present(e,16);assert.ok(Math.abs(s.present(e,0).players[1].x-e.players[1].x)<.001);});
test('another packet preserves the partially corrected visible position',()=>{const e=pose(),s=new NetworkPresentation(),first=s.capture(e);e.players[1].x-=30;s.reconcile(first,e);s.present(e,40);const second=s.capture(e);e.players[1].x-=15;s.reconcile(second,e);assert.equal(s.present(e,0).players[1].x,second.players[1].x);});
for(const [name,change]of[
 ['a seam crossing',e=>e.players[1].view=0],['camera locking',e=>e.cameras[0].locked=true],['rewind',e=>e.rewinding=true],['room restart',e=>e.serial++],['gate entry',e=>e.players[1].gate=0],['a large teleport',e=>e.players[1].x+=1000]
])test(`${name} resets smoothing immediately`,()=>{const e=pose(),s=new NetworkPresentation(),before=s.capture(e);e.players[1].x-=20;change(e);s.reconcile(before,e);assert.equal(s.present(e,0).players[1].x,e.players[1].x);});
test('urgent polling waits for the active request and never overlaps requests',async()=>{
 const original=globalThis.fetch;let active=0,max=0,calls=0;const releases=[];
 globalThis.fetch=async()=>{calls++;active++;max=Math.max(active,max);await new Promise(r=>releases.push(r));active--;return{ok:true,json:async()=>({connected:true})};};
 const connection=new RoomConnection({code:'test'},()=>{},()=>{});
 try{connection.start(()=>({}));connection.requestSoon();connection.requestSoon();assert.equal(calls,1);releases.shift()();await new Promise(r=>setTimeout(r,15));assert.equal(calls,2);assert.equal(max,1);connection.stop();releases.shift()();await new Promise(r=>setTimeout(r,10));assert.equal(calls,2);}finally{connection.stop();for(const release of releases)release();globalThis.fetch=original;}
});
