// Keep authoritative physics immediate; ease only the visible network correction.
const signature=e=>JSON.stringify([e.index,e.serial,!!e.rewinding,e.players.map(p=>[p.view,p.owner,p.scale,p.gate]),e.cameras.map(c=>[c.locked,c.w,c.h]),e.blocks.length]);
// Limit endpoint tangents so interpolation cannot overshoot a wall or reverse
// between monotonically moving authoritative samples.
const curve=(a,b,va,vb,f,span)=>{const delta=b-a;if(!delta)return a;const tangent=v=>Math.sign(delta)*Math.max(0,Math.min(3*Math.abs(delta),v*Math.sign(delta)*span));const m0=tangent(va),m1=tangent(vb),f2=f*f,f3=f2*f;return (2*f3-3*f2+1)*a+(f3-2*f2+f)*m0+(-2*f3+3*f2)*b+(f3-f2)*m1;};
export class NetworkPresentation {
 constructor(){this.key=null;this.samples=[];this.remoteIndex=null;this.playhead=null;this.delay=50;this.jitter=0;}
 reset(engine){this.key=signature(engine);this.samples=[];this.remoteIndex=null;this.playhead=null;this.offsets={players:engine.players.map(()=>({x:0,y:0})),cameras:engine.cameras.map(()=>({x:0,y:0})),blocks:engine.blocks.map(()=>({x:0,y:0}))};}
 observe(engine,state,localPlayer,now=performance.now()){
  if(this.key!==signature(engine))this.reset(engine);
  if(state.rewinding||state.paused||state.won){this.samples=[];this.remoteIndex=null;this.playhead=null;return;}
  const remote=1-localPlayer,p=state.players[remote],owner=p.owner,t=state.hostFrame*1000/60,last=this.samples.at(-1);
  if(!Number.isFinite(t)||last&&t<=last.t)return;
  if(last){const gap=now-last.receivedAt,expected=t-last.t;if(expected>0&&expected<250&&gap>=0){this.jitter=Math.max(0,gap-expected,this.jitter*Math.exp(-expected/1500));this.delay=Math.max(50,Math.min(140,50+this.jitter*.75));}}
  if(last&&Math.hypot(p.x-last.player.x,p.y-last.player.y)>192){this.samples=[];this.playhead=null;}
  this.remoteIndex=remote;this.samples.push({t,receivedAt:now,player:{...p},camera:{...state.cameras[owner]},owner});this.samples=this.samples.slice(-16);
  if(this.playhead===null||t-this.playhead>500)this.playhead=t-this.delay;
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
 present(engine,dt,now=performance.now(),preferences=null){
  if(this.key!==signature(engine))this.reset(engine);
  const visual=Object.create(engine),decay=Math.exp(-Math.max(0,Math.min(dt,100))/120);
  for(const kind of ['players','cameras','blocks'])visual[kind]=engine[kind].map((p,i)=>{const o=this.offsets[kind][i];o.x*=decay;o.y*=decay;if(Math.abs(o.x)<.001)o.x=0;if(Math.abs(o.y)<.001)o.y=0;return {...p,x:p.x+o.x,y:p.y+o.y};});
  if(this.samples.length&&this.remoteIndex!==null){
   const latest=this.samples.at(-1),elapsed=Math.max(0,Math.min(dt,100)),target=latest.t+Math.min(180,Math.max(0,now-latest.receivedAt))-this.delay;
   this.playhead+=elapsed;this.playhead+=Math.max(-elapsed*.15,Math.min(elapsed*.15,target-this.playhead));this.playhead=Math.min(this.playhead,latest.t+60);
   let right=this.samples.findIndex(s=>s.t>=this.playhead);if(right<0)right=this.samples.length-1;const b=this.samples[right],a=this.samples[Math.max(0,right-1)],fraction=b.t===a.t?1:Math.max(0,Math.min(1,(this.playhead-a.t)/(b.t-a.t)));
   const previous=this.samples[Math.max(0,right-2)],next=this.samples[Math.min(this.samples.length-1,right+1)],span=Math.max(0,b.t-a.t);
   for(const axis of ['x','y']){const velocity=axis==='x'?'vx':'vy',cameraA=(b.camera[axis]-previous.camera[axis])/Math.max(1,b.t-previous.t),cameraB=(next.camera[axis]-a.camera[axis])/Math.max(1,next.t-a.t);visual.players[this.remoteIndex][axis]=curve(a.player[axis],b.player[axis],(a.player[velocity]||0)*.06,(b.player[velocity]||0)*.06,fraction,span);visual.cameras[b.owner][axis]=curve(a.camera[axis],b.camera[axis],cameraA,cameraB,fraction,span);}
   if(this.playhead>latest.t){const frames=(this.playhead-latest.t)*60/1000,p=visual.players[this.remoteIndex],previous=this.samples.at(-2);p.x+=(latest.player.vx||0)*frames;if(!latest.player.ground)p.y+=(latest.player.vy||0)*frames;if(previous&&!latest.camera.locked)for(const axis of ['x','y'])visual.cameras[latest.owner][axis]+=(latest.camera[axis]-previous.camera[axis])/Math.max(1,latest.t-previous.t)*(this.playhead-latest.t);}
  }
  const local=preferences?.localPlayer,fraction=Math.max(0,Math.min(1,preferences?.fraction||0));
  if(fraction&&Number.isInteger(local)&&preferences?.input&&!preferences.paused&&!engine.rewinding&&!engine.won&&engine.players[local].gate<0&&typeof engine.predictPlayer==='function'){
   const predicted=Object.create(engine);predicted.players=engine.players.slice();predicted.cameras=engine.cameras.slice();predicted.predictPlayer(local,preferences.input);const current=engine.players[local],next=predicted.players[local];
   const candidate={...current,x:current.x+(next.x-current.x)*fraction,y:current.y+(next.y-current.y)*fraction};
   if(next.view===current.view&&next.owner===current.owner&&next.scale===current.scale&&Math.hypot(next.x-current.x,next.y-current.y)<=32*current.scale&&!engine.collides(engine.box(candidate),current.view))for(const axis of ['x','y']){visual.players[local][axis]+=(next[axis]-current[axis])*fraction;visual.cameras[current.owner][axis]+=(predicted.cameras[current.owner][axis]-engine.cameras[current.owner][axis])*fraction;}
  }
  return visual;
 }
}
