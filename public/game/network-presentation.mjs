// Keep authoritative physics immediate; ease only the visible network correction.
const signature=e=>JSON.stringify([e.index,e.serial,!!e.rewinding,e.players.map(p=>[p.view,p.owner,p.scale,p.gate]),e.cameras.map(c=>[c.locked,c.w,c.h]),e.blocks.length]);
export class NetworkPresentation {
 constructor(){this.key=null;}
 reset(engine){this.key=signature(engine);this.offsets={players:engine.players.map(()=>({x:0,y:0})),cameras:engine.cameras.map(()=>({x:0,y:0})),blocks:engine.blocks.map(()=>({x:0,y:0}))};}
 capture(engine){if(this.key!==signature(engine))this.reset(engine);return {key:this.key,...Object.fromEntries(['players','cameras','blocks'].map(kind=>[kind,engine[kind].map((p,i)=>({x:p.x+this.offsets[kind][i].x,y:p.y+this.offsets[kind][i].y}))]))};}
 reconcile(before,engine){
  if(before.key!==signature(engine)||engine.rewinding){this.reset(engine);return;}
  for(const kind of ['players','cameras','blocks'])for(let i=0;i<engine[kind].length;i++){
   const current=engine[kind][i],old=before[kind][i];
   if(!old||Math.hypot(old.x-current.x,old.y-current.y)>(kind==='cameras'?320:192)){this.reset(engine);return;}
  }
  for(const kind of ['players','cameras','blocks'])this.offsets[kind]=engine[kind].map((p,i)=>({x:before[kind][i].x-p.x,y:before[kind][i].y-p.y}));
 }
 present(engine,dt){
  if(this.key!==signature(engine))this.reset(engine);
  const visual=Object.create(engine),decay=Math.exp(-Math.max(0,Math.min(dt,100))/90);
  for(const kind of ['players','cameras','blocks'])visual[kind]=engine[kind].map((p,i)=>{const o=this.offsets[kind][i];o.x*=decay;o.y*=decay;if(Math.abs(o.x)<.001)o.x=0;if(Math.abs(o.y)<.001)o.y=0;return {...p,x:p.x+o.x,y:p.y+o.y};});
  return visual;
 }
}
