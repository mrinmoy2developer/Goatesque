import {emptyInput} from './engine.mjs';
export const INPUT_PROTOCOL=2,MAX_PENDING=180;
export function encodeInput(seq,input){return [seq,Number(!!input.left)+Number(!!input.right)*2+Number(!!input.rewind)*4+Number(!!input.switchHeld)*8,...['jump','lock','gate','switch','restart'].map(k=>input[k]||0)];}
export function decodeInput(frame){const [seq,mask,jump,lock,gate,swap,restart]=frame;return {...emptyInput(),seq,left:!!(mask&1),right:!!(mask&2),rewind:!!(mask&4),switchHeld:!!(mask&8),jump,lock,gate,switch:swap,restart};}
export class GuestCommands {
 constructor(){this.stream=1+Math.floor(Math.random()*100000000);this.reset(-1);}
 reset(epoch){this.epoch=epoch;this.sequence=0;this.pending=[];this.resync=0;this.stream++;}
 cancel(){this.pending=[];this.stream++;}
 push(input,epoch){if(epoch!==this.epoch)this.reset(epoch);if(this.pending.length>=MAX_PENDING)return null;const frame=encodeInput(++this.sequence,input);this.pending.push(frame);return decodeInput(frame);}
 acknowledge(state){if(state.serial!==this.epoch)this.reset(state.serial);if(state.guestStream!==this.stream)return false;const ack=state.guestAck||0;this.sequence=Math.max(this.sequence,ack);if((state.guestResync||0)!==this.resync){this.pending=[];this.resync=state.guestResync||0;}else this.pending=this.pending.filter(frame=>frame[0]>ack);return true;}
 payload(){return {protocol:INPUT_PROTOCOL,epoch:this.epoch,stream:this.stream,seq:this.sequence,frames:this.pending.map(frame=>[...frame])};}
 replay(engine){if(engine.rewinding||engine.won)return;for(const frame of this.pending)engine.predictPlayer(1,decodeInput(frame));}
}
export class HostCommands {
 constructor(){this.reset(-1);}
 reset(epoch){this.epoch=epoch;this.ack=0;this.frames=new Map();this.lastPacket=-1;this.lastReceived=0;this.resync=0;this.stream=0;this.baseline=null;}
 ingest(input,epoch,now){if(epoch!==this.epoch)this.reset(epoch);if(input.protocol!==INPUT_PROTOCOL||input.epoch!==epoch||input.packet<=this.lastPacket||input.stream<this.stream)return;this.lastPacket=input.packet;this.lastReceived=now;if(input.stream>this.stream){this.stream=input.stream;this.frames.clear();this.ack=0;this.resync=0;this.baseline=input;}for(const frame of input.frames||[])if(frame[0]>this.ack&&!this.frames.has(frame[0]))this.frames.set(frame[0],[...frame]);if(this.frames.size>MAX_PENDING){this.ack=Math.max(this.ack,...this.frames.keys());this.frames.clear();this.resync++;}}
 next(engine,now){if(engine.serial!==this.epoch)this.reset(engine.serial);const p=engine.players[1];if(this.baseline){for(const [key,last]of[['jump','lastJump'],['lock','lastLock'],['gate','lastGate'],['switch','lastSwitch'],['restart','lastRestart']])p[last]=this.baseline[key]||0;this.baseline=null;}if(this.frames.size&&now-this.lastReceived>1000){this.ack=Math.max(this.ack,...this.frames.keys());this.frames.clear();this.resync++;}if(this.frames.size){const seq=Math.min(...this.frames.keys()),frame=this.frames.get(seq);this.frames.delete(seq);this.ack=seq;return decodeInput(frame);}return {...emptyInput(),jump:p.lastJump,lock:p.lastLock,gate:p.lastGate,restart:p.lastRestart,switch:p.lastSwitch};}
}
