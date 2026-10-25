import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {Engine} from '../public/game/engine.mjs';
import {Renderer} from '../public/game/renderer.mjs';
const read=name=>JSON.parse(fs.readFileSync(new URL('../public/game/'+name,import.meta.url)));
const levels=read('levels.json'),manifest=read('assets/manifest.json'),renderMap=read('assets/render-map.json');
function renderer(engine){const r=Object.create(Renderer.prototype);Object.assign(r,{assets:{renderMap,sprites:manifest.sprites,spriteNames:manifest.spriteNames},animations:[{},{}],gateFrames:new Map(),currentTheme:{map:renderMap.tilesets[engine.level.tileset]},lastDt:1000/60,sprite(){}});r.prepare(engine);return r;}
test('native room doors never get a second static open drawing over their animated sprite',()=>{const e=new Engine(levels);for(let index=0;index<levels.length;index++){e.load(index);const r=renderer(e);assert.equal(r.decor.some(d=>d.type===18||d.type===19||d.type===87),false,levels[index].id);}});
test('the screenshot gate displays all closing images even if a network packet jumps from frame zero to four',()=>{const e=new Engine(levels);e.load(5);const r=renderer(e),gate=e.level.gates[0],seen=[];r.sprite=(name,frame)=>{if(name===r.currentTheme.map.gate.name)seen.push(Math.floor(frame));};r.gate(e,gate,0,0);e.players[0].gate=0;e.gateFrames[0]=[4,4];for(let i=0;i<5;i++)r.gate(e,gate,0,0);assert.deepEqual([...new Set(seen)],[0,1,2,3,4]);});
test('rewind restores the door frame immediately and reopening remains animated',()=>{const e=new Engine(levels);e.load(5);const r=renderer(e),gate=e.level.gates[0];e.gateFrames[0]=[4,4];r.gate(e,gate,0,0);e.gateFrames[0]=[0,0];e.rewinding=true;r.gate(e,gate,0,0);assert.equal(r.gateFrames.get('0:0').frame,0);e.rewinding=false;e.gateFrames[0]=[4,4];for(let i=0;i<4;i++)r.gate(e,gate,0,0);e.gateFrames[0]=[0,0];r.gate(e,gate,0,0);assert.ok(r.gateFrames.get('0:0').frame>0);});
