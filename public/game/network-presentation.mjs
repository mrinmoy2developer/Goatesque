// Keep authoritative physics immediate; ease only the visible network correction.
const signature=e=>JSON.stringify([e.index,e.serial,!!e.rewinding,e.players.map(p=>[p.view,p.owner,p.scale,p.gate]),e.cameras.map(c=>[c.locked,c.w,c.h]),e.blocks.length]);
export class NetworkPresentation {
 constructor(){this.key=null;this.samples=[];this.remoteIndex=null;this.playhead=null;}
 reset(engine){this.key=signature(engine);this.samples=[];this.remoteIndex=null;this.playhead=null;this.offsets={players:engine.players.map(()=>({x:0,y:0})),cameras:engine.cameras.map(()=>({x:0,y:0})),blocks:engine.blocks.map(()=>({x:0,y:0}))};}
 observe(engine,state,localPlayer,now=performance.now()){
  if(this.key!==signature(engine))this.reset(engine);
  if(state.rewinding||state.paused||state.won){this.samples=[];this.remoteIndex=null;this.playhead=null;return;}
  const remote=1-localPlayer,p=state.players[remote],owner=p.owner,t=state.hostFrame*1000/60,last=this.samples.at(-1);
  if(!Number.isFinite(t)||last&&t<=last.t)return;
  if(last&&Math.hypot(p.x-last.player.x,p.y-last.player.y)>192){this.samples=[];this.playhead=null;}
  this.remoteIndex=remote;this.samples.push({t,receivedAt:now,player:{...p},camera:{...state.cameras[owner]},owner});this.samples=this.samples.slice(-16);
  if(this.playhead===null||t-this.playhead>500)this.playhead=t-100;
 }
 capture(engine){if(this.key!==signature(engine))this.reset(engine);return {key:this.key,...Object.fromEntries(['players','cameras','blocks'].map(kind=>[kind,engine[kind].map((p,i)=>({x:p.x+this.offsets[kind][i].x,y:p.y+this.offsets[kind][i].y}))]))};}
 reconcile(before,engine){
  if(before.key!==signature(engine)||engine.rewinding){this.reset(engine);return;}
  for(const kind of ['players','cameras','blocks'])for(let i=0;i<engine[kind].length;i++){
   const current=engine[kind][i],old=before[kind][i];
   if(!old||Math.hypot(old.x-current.x,old.y-current.y)>(kind==='cameras'?320:192)){this.reset(engine);return;}
  }
  for(const kind of ['players','cameras','blocks'])this.offsets[kind]=engine[kind].map((p,i)=>({x:before[kind][i].x-p.x,y:before[kind][i].y-p.y}));
 }
 present(engine,dt,now=performance.now()){
  if(this.key!==signature(engine))this.reset(engine);
  const visual=Object.create(engine),decay=Math.exp(-Math.max(0,Math.min(dt,100))/120);
  for(const kind of ['players','cameras','blocks'])visual[kind]=engine[kind].map((p,i)=>{const o=this.offsets[kind][i];o.x*=decay;o.y*=decay;if(Math.abs(o.x)<.001)o.x=0;if(Math.abs(o.y)<.001)o.y=0;return {...p,x:p.x+o.x,y:p.y+o.y};});
  if(this.samples.length&&this.remoteIndex!==null){
   const latest=this.samples.at(-1),elapsed=Math.max(0,Math.min(dt,100)),target=latest.t+Math.min(100,Math.max(0,now-latest.receivedAt))-100;
   this.playhead+=elapsed;this.playhead+=Math.max(-elapsed*.15,Math.min(elapsed*.15,target-this.playhead));this.playhead=Math.min(this.playhead,latest.t+60);
   let right=this.samples.findIndex(s=>s.t>=this.playhead);if(right<0)right=this.samples.length-1;const b=this.samples[right],a=this.samples[Math.max(0,right-1)],fraction=b.t===a.t?1:Math.max(0,Math.min(1,(this.playhead-a.t)/(b.t-a.t)));
   for(const axis of ['x','y']){visual.players[this.remoteIndex][axis]=a.player[axis]+(b.player[axis]-a.player[axis])*fraction;visual.cameras[b.owner][axis]=a.camera[axis]+(b.camera[axis]-a.camera[axis])*fraction;}
   if(this.playhead>latest.t){const frames=(this.playhead-latest.t)*60/1000,p=visual.players[this.remoteIndex];p.x+=(latest.player.vx||0)*frames;if(!latest.player.ground)p.y+=(latest.player.vy||0)*frames;}
  }
  return visual;
 }
}
