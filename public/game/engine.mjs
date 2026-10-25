// Independent implementation. Constants and numeric level geometry were measured
// from the official Windows release; see REVERSE_ENGINEERING.md.
export const PHYSICS = Object.freeze({ gravity: .8, maxFall: 20, friction: .8, jump: 18, speed: 10.2, acceleration: 1.4, width: 56, height: 94 });
export const emptyInput = () => ({ left:false,right:false,jump:0,lock:0,restart:0,gate:0,switch:0,switchHeld:false,rewind:false,confirm:0,menu:0 });
export const blankInput = emptyInput;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const intersect = (a, b) => a.x < b.x + b.w - .01 && a.x + a.w > b.x + .01 && a.y < b.y + b.h - .01 && a.y + a.h > b.y + .01;

export class Engine {
  constructor(levels) {
    this.levels = levels; this.events = []; this.history = []; this.serial = 0;
    this.load(0);
  }
  load(index) {
    this.index = clamp(index, 0, this.levels.length - 1);
    this.level = this.levels[this.index]; this.tick = 0; this.won = false; this.winTime = 0;
    this.players = this.level.spawns.map((s, i) => ({ x:s.x, y:s.y, vx:0, vy:0, view:i, owner:i, face:i ? -1:1, ground:false, coyote:0, buffer:0, gate:-1, lastJump:0, lastLock:0, lastRestart:0,lastSwitch:0,canLock:this.level.lockEnabled!==false,scale:1 }));
    this.cameras = this.players.map((p, i) => ({ x:p.x-this.level.views[i].w*.5, y:p.y-this.level.views[i].h*20/33, w:this.level.views[i].w, h:this.level.views[i].h, locked:false }));
    this.blocks = this.level.blocks.map(b=>({ ...b, vx:0, vy:0 })); this.broken=[]; this.history=[];this.rewindRate=2;this.rewinding=false;
    this.sharedCamera=this.level.shared?{x:0,y:0,w:1536,h:864}:null;
    this.ending=this.level.ending?{matched:false,frames:[3,3],shake:[0,0],alpha:0}:null;
    this.breakGroups=[];const seen=new Set();for(let y=0;y<this.level.height;y++)for(let x=0;x<this.level.width;x++){const key=y*this.level.width+x;if(this.level.grid[y][x]!==7||seen.has(key))continue;const group=[],queue=[[x,y]];while(queue.length){const [xx,yy]=queue.pop(),k=yy*this.level.width+xx;if(seen.has(k)||this.level.grid[yy]?.[xx]!==7)continue;seen.add(k);group.push(k);queue.push([xx+1,yy],[xx-1,yy],[xx,yy+1],[xx,yy-1]);}this.breakGroups.push(group);}
    // Spawns are tile anchors in GameMaker; settle their collision masks onto the floor.
    for (const p of this.players) {for (let n=0;n<120&&!this.collides(this.box(p,p.x,p.y+1),p.view);n++) p.y++;p.ground=this.collides(this.box(p,p.x,p.y+1),p.view);p.coyote=p.ground?6:0;}
    for(let i=0;i<2;i++) this.centerCamera(i,1);
    if(this.sharedCamera)this.updateSharedCamera(true);
    this.serial++;this.historyKey=this.motionKey();this.history.push(this.snapshot());
    this.events.push({type:"load",index:this.index});
  }
  box(p,x=p.x,y=p.y) { return {x:x-28*p.scale,y:y-47*p.scale,w:56*p.scale,h:94*p.scale}; }
  tile(x,y,view) {
    const v=this.level.grid[y]?.[x] ?? 1;
    if(v===1) return true;
    if(v===7) return !this.broken.includes(y*this.level.width+x);
    if(v===5||v===6){const c=this.cameras[v-5];return intersect({x:x*64,y:y*64,w:64,h:64},c);}
    return false;
  }
  localCollision(r,view,skip=-1) {
    for(let y=Math.floor(r.y/64);y<=Math.floor((r.y+r.h-.01)/64);y++)
      for(let x=Math.floor(r.x/64);x<=Math.floor((r.x+r.w-.01)/64);x++)
        {const value=this.level.grid[y]?.[x];if(value===5||value===6){const c=this.cameras[value-5],tx=Math.max(x*64,c.x),ty=Math.max(y*64,c.y),tw=Math.min(x*64+64,c.x+c.w)-tx,th=Math.min(y*64+64,c.y+c.h)-ty;if(tw>0&&th>0&&intersect(r,{x:tx,y:ty,w:tw,h:th}))return true;}else if(this.tile(x,y,view))return true;}
    return this.blocks.some((b,i)=>i!==skip&&intersect(r,{x:b.x-b.w/2,y:b.y-b.h/2,w:b.w,h:b.h}));
  }
  collides(r,view,skip=-1) {
    const bounds=this.cameras[view];if(bounds.locked&&(r.y<bounds.y||r.y+r.h>bounds.y+bounds.h||((view===0||!this.cameras[0].locked)&&r.x<bounds.x)||((view===1||!this.cameras[1].locked)&&r.x+r.w>bounds.x+bounds.w)))return true;
    if(!this.cameras.every(c=>c.locked))return this.localCollision(r,view,skip);
    const c=this.cameras[view],d=this.cameras[1-view],ratio=d.h/c.h;
    const edge=view===0?c.x+c.w:c.x;
    const crosses=view===0?r.x+r.w>edge:r.x<edge;
    if(!crosses)return this.localCollision(r,view,skip);
    const start=view===0?Math.max(r.x,edge):r.x,end=view===0?r.x+r.w:Math.min(r.x+r.w,edge);
    const target={x:(view===0?d.x:d.x+d.w)+(start-edge)*ratio,y:d.y+(r.y-c.y)*ratio,w:(end-start)*ratio,h:r.h*ratio};
    const local=view===0?{...r,w:Math.max(0,edge-r.x)}:{...r,x:Math.max(r.x,edge),w:Math.max(0,r.x+r.w-edge)};
    return (local.w>0&&this.localCollision(local,view,skip))||this.localCollision(target,1-view,skip);
  }
  centerCamera(i,amount=.3) {
    const c=this.cameras[i],p=this.players.find(p=>p.owner===i)||this.players[i];
    c.x+=(p.x-c.w*.5-c.x)*amount; c.y+=(p.y+(94*p.scale*1080/c.h-94)/2-c.h*20/33-c.y)*amount;
  }
  toggleLock(i) {
    const p=this.players[i];let c=this.cameras[p.owner];
    if(!p.canLock)return;
    if(this.ending?.matched){this.ending.frames[p.view]=Math.max(0,this.ending.frames[p.view]-1);this.ending.shake[p.view]=20;this.events.push({type:'ending-door',player:i});return;}
    if(c.locked) {
      if(this.players[0].view===this.players[1].view||this.players.some(p=>{const v=this.cameras[p.view];return p.view===0?Math.abs(p.x-v.x-v.w)<28*p.scale:Math.abs(p.x-v.x)<28*p.scale;})){this.events.push({type:"denied"});return;}
      for(const other of this.players)other.owner=other.view;
      c=this.cameras[p.owner];c.locked=false;
    } else {
      if(!p.ground){this.events.push({type:"denied"});return;}
      const ratio=this.cameras[1].h/this.cameras[0].h;
      c.x=Math.round((p.x-c.w*.5)/64)*64+(p.owner===0?(ratio!==1||c.w!==960?(ratio>1?-24:28):-4):4); c.y=Math.round(p.y+(94*p.scale*1080/c.h-94)/2-c.h*20/33); c.locked=true;
    }
    this.events.push({type:"lock",player:i,locked:c.locked});
  }
  mergeToggle() { const locked=this.cameras.every(c=>c.locked);for(let i=0;i<2;i++)if(this.cameras[this.players[i].owner].locked===locked)this.toggleLock(i); }
  seam(p, previousX) {
    if(!this.cameras.every(c=>c.locked))return;
    const c=this.cameras[p.view],nextView=1-p.view,d=this.cameras[nextView];
    const crosses=p.view===0?p.x>c.x+c.w:p.x<c.x;
    if(!crosses)return;
    const ratio=d.h/c.h;
    const nx=p.view===0?d.x+(p.x-c.x-c.w)*ratio:c.x===p.x?d.x+d.w:d.x+d.w+(p.x-c.x)*ratio;
    const ny=d.y+(p.y-c.y)*ratio;
    const nextScale=p.scale*ratio;
    const candidate={...p,scale:nextScale};
    if(!this.collides(this.box(candidate,nx,ny),nextView)) {
      p.x=nx;p.y=ny;p.view=nextView;p.scale=nextScale;p.vx*=ratio;p.vy*=ratio;
      this.events.push({type:"cross",player:this.players.indexOf(p)});
    }else {p.x=previousX;p.vx=0;}
  }
  movePlayer(p,input,index) {
    if(!p.canLock&&this.level.lockTriggers?.some(r=>intersect(this.box(p),r)))p.canLock=true;
    const gatePress=(input.gate||0)>(p.lastGate||0);p.lastGate=input.gate||0;
    if(p.gate>=0){if(gatePress&&!this.won){p.gate=-1;}else return;}
    if((input.lock||0)>p.lastLock){p.lastLock=input.lock;this.toggleLock(index);}
    if((input.jump||0)>p.lastJump){p.lastJump=input.jump;p.buffer=12;}
    p.buffer=Math.max(0,p.buffer-1);
    const direction=Number(!!input.right)-Number(!!input.left);
    if(direction){p.vx=clamp(p.vx+direction*1.4*p.scale,-10.2*p.scale,10.2*p.scale);p.face=direction;}
    p.vx=Math.sign(p.vx)*Math.max(0,Math.abs(p.vx)-.8*p.scale);
    const support=this.players[1-index];
    const onOther=support.gate<0&&Math.abs(p.x-support.x)<26*(p.scale+support.scale)&&Math.abs(p.y+47*p.scale-support.y+47*support.scale)<1.1;
    p.ground=this.collides(this.box(p,p.x,p.y+1),p.view)||onOther;
    p.coyote=p.ground?6:Math.max(0,p.coyote-1);
    p.vy=Math.min(20*p.scale,p.vy+.8*p.scale);
    const rider=this.players[1-index];const carrying=rider.gate<0&&Math.abs(rider.x-p.x)<26*(rider.scale+p.scale)&&Math.abs(rider.y+47*rider.scale-p.y+47*p.scale)<4;
    if(p.buffer>0&&p.coyote>0&&!carrying){p.vy=-18*p.scale;p.coyote=0;p.buffer=0;p.ground=false;this.events.push({type:"jump",player:index});}
    const oldX=p.x;
    const steps=Math.ceil(Math.abs(p.vx));const dx=steps?p.vx/steps:0;
    for(let n=0;n<steps;n++){
      if(this.collides(this.box(p,p.x+dx,p.y),p.view)) {
        // Push movable blocks with both characters using the same world geometry.
        const target=this.box(p,p.x+dx,p.y);
        const bi=this.blocks.findIndex(b=>intersect(target,{x:b.x-b.w/2,y:b.y-b.h/2,w:b.w,h:b.h}));
        if(bi>=0&&direction){const b=this.blocks[bi];p.pushFrames=(p.pushFrames||0)+1;if(p.pushFrames>=20){b.vx=direction*10.2*p.scale;p.pushFrames=0;}}
        p.vx=0;break;
      }
      p.x+=dx;
    }
    // The seam behaves as a portal, including where world geometry continues
    // beyond the visible pane. Collision is evaluated on the destination side.
    this.seam(p,oldX);
    if(carrying&&rider.view===p.view&&!this.collides(this.box(rider,rider.x+p.x-oldX,rider.y),rider.view))rider.x+=p.x-oldX;
    const ys=Math.ceil(Math.abs(p.vy));const dy=ys?p.vy/ys:0;
    for(let n=0;n<ys;n++){
      const other=this.players[1-index];
      if(dy>0&&other.gate<0&&Math.abs(p.x-other.x)<26*(p.scale+other.scale)&&p.y+47*p.scale<=other.y-47*other.scale+1&&p.y+47*p.scale+dy>other.y-47*other.scale){p.y=other.y-47*(other.scale+p.scale);p.vy=0;p.ground=true;p.coyote=6;break;}
      if(this.collides(this.box(p,p.x,p.y+dy),p.view)) {
        if(p.vy>0&&!p.ground)this.events.push({type:"land",player:index});
        p.vy=0;break;
      }
      p.y+=dy;
    }
    if(this.level.fallExit&&p.y>this.level.fallExit){p.gate=0;p.vx=0;p.vy=0;}
    if(!this.cameras.every(c=>c.locked)) {
      // An independently locked view has closed screen boundaries.
      const c=this.cameras[p.view];
      if(c.locked)p.x=clamp(p.x,c.x+28*p.scale,c.x+c.w-28*p.scale);
    }
    // Gates are anchored at their floor line in the original level declarations.
    for(let gi=0;gi<this.level.gates.length;gi++){
      const g=this.level.gates[gi];const used=this.players.filter(other=>other!==p&&other.gate===gi).length;
      const c=this.cameras[p.view],visible=g.x>=c.x&&g.x<=c.x+c.w&&g.y>=c.y&&g.y<=c.y+c.h+50;
      if(gatePress&&visible&&Math.abs(p.scale-1)<.001&&used<g.capacity&&Math.abs(p.x-g.x)<(g.capacity===2?64:40)&&Math.abs(p.y+47*p.scale-g.y)<85){p.gate=gi;p.vx=0;p.vy=0;this.events.push({type:"gate",player:index});break;}
    }
    if(p.y>this.level.height*64+200||p.x<0||p.x>this.level.width*64){const s=this.level.spawns[index];p.x=s.x;p.y=s.y;p.vx=0;p.vy=0;p.view=index;p.scale=1;this.cameras[index].locked=false;}
  }
  step(inputs=[emptyInput(),emptyInput()]) {
    if(inputs.some((input,i)=>(input?.restart||0)>this.players[i].lastRestart)){this.load(this.index);this.players.forEach((p,i)=>Object.assign(p,{lastJump:inputs[i]?.jump||0,lastLock:inputs[i]?.lock||0,lastRestart:inputs[i]?.restart||0,lastGate:inputs[i]?.gate||0,lastSwitch:inputs[i]?.switch||0}));return;}
    if(this.level.rewindEnabled!==false&&inputs.some(input=>input?.rewind)&&this.history.length>1){this.rewindRate+=.01;this.rewindFrames(Math.floor(this.rewindRate));return;}
    this.rewinding=false;this.rewindRate=Math.max(2,this.rewindRate-.1);
    if(this.won){this.winTime++;return;}
    this.tick++;
    const switchPressed=inputs.some((input,i)=>(input?.switch||0)>(this.players[i].lastSwitch||0));
    if(this.level.switchEnabled!==false&&switchPressed&&inputs.every(input=>input?.switchHeld)&&this.players.every(p=>p.ground)&&this.players[0].view!==this.players[1].view&&!this.players.some(p=>{const c=this.cameras[p.view];return p.view===0?Math.abs(p.x-c.x-c.w)<28*p.scale:Math.abs(p.x-c.x)<28*p.scale;})){
      this.cameras.reverse();this.players.forEach(p=>{p.view=1-p.view;p.owner=1-p.owner;});this.events.push({type:'switch'});
    }
    this.players.forEach((p,i)=>p.lastSwitch=inputs[i]?.switch||0);
    for(let i=0;i<this.blocks.length;i++){
      const b=this.blocks[i],steps=Math.ceil(Math.abs(b.vx));
      for(let n=0;n<steps;n++){const dx=b.vx/steps;if(this.collides({x:b.x+dx-b.w/2,y:b.y-b.h/2,w:b.w,h:b.h},0,i)){b.vx=0;break;}b.x+=dx;}
    }
    for(let i=0;i<2;i++)this.movePlayer(this.players[i],inputs[i]||emptyInput(),i);
    for(const group of this.breakGroups){if(this.broken.includes(group[0]))continue;const on=this.players.map(p=>{const y=Math.floor((p.y+47*p.scale+2)/64);return p.ground&&group.some(k=>Math.floor(k/this.level.width)===y&&Math.abs((k%this.level.width)*64+32-p.x)<32+28*p.scale);});const stacked=this.players.some((p,i)=>on[i]&&Math.abs(p.x-this.players[1-i].x)<50&&Math.abs((p.y-47*p.scale)-(this.players[1-i].y+47*this.players[1-i].scale))<4);if(on.every(Boolean)||stacked){this.broken.push(...group);this.events.push({type:"break"});}}
    for(let i=0;i<2;i++)if(!this.cameras[i].locked&&this.players[i].gate<0)this.centerCamera(i);
    if(this.sharedCamera)this.updateSharedCamera();
    if(this.ending){this.updateEnding();}
    if(this.players.every(p=>p.gate>=0)){this.won=true;this.events.push({type:"win",index:this.index});}
    const key=this.motionKey();if(key!==this.historyKey){this.history.push(this.snapshot());if(this.history.length>1800)this.history.shift();this.historyKey=key;}
  }
  updateSharedCamera(immediate=false){
    const c=this.sharedCamera,p=this.players,x=(p[0].x+p[1].x)/2,y=(p[0].y+p[1].y)/2,min=this.level.shared.minWidth;
    const distance=Math.max(...p.map(p=>Math.hypot(p.x-x,p.y-y)));c.w+=(Math.max(distance*2.5,min)-c.w)*.02;c.h=c.w*9/16;
    const targetX=clamp(x-c.w/2,0,Math.max(0,this.level.shared.worldWidth-c.w)),targetY=Math.min(y-c.h/2,this.level.shared.worldHeight-c.h);
    c.x+=(targetX-c.x)*(immediate?1:.05);c.y+=(targetY-c.y)*(immediate?1:.05);
  }
  updateEnding(){
    const gates=this.level.ending.gates||[];if(gates.length!==2)return;
    const a=this.cameras[0],b=this.cameras[1],left=gates.find(g=>g.scaleX>0),right=gates.find(g=>g.scaleX<0);
    this.ending.matched=this.cameras.every(c=>c.locked)&&Math.abs(a.x+a.w-left.x)<10&&Math.abs(b.x-right.x)<10&&Math.abs((left.y-a.y)-(right.y-b.y))<10;
    this.ending.shake=this.ending.shake.map(n=>Math.max(0,n-1));
    if(this.ending.frames.every(n=>n===0)){this.ending.alpha+=(1-this.ending.alpha)*.01;if(this.ending.alpha>.946&&!this.won){this.won=true;this.events.push({type:'ending-complete'});}}
  }
  motionKey(){return JSON.stringify([this.players.map(p=>[p.x,p.y,p.view,p.owner,p.scale,p.gate,p.lastLock]),this.cameras.map(c=>[c.x,c.y,c.locked]),this.blocks.map(b=>[b.x,b.y]),this.broken,this.ending]);}
  rewindFrames(count=2){const actions=this.players.map(p=>({lastJump:p.lastJump,lastLock:p.lastLock,lastGate:p.lastGate,lastSwitch:p.lastSwitch,lastRestart:p.lastRestart}));let state;for(let i=0;i<count&&this.history.length>1;i++){this.history.pop();state=this.history[this.history.length-1];}if(state){this.restore(state);this.players.forEach((p,i)=>Object.assign(p,actions[i]));this.rewinding=true;this.historyKey=this.motionKey();}}
  rewind() {this.rewindFrames(180);}
  snapshot(){return {index:this.index,tick:this.tick,serial:this.serial,won:this.won,winTime:this.winTime,rewinding:this.rewinding,sharedCamera:this.sharedCamera?{...this.sharedCamera}:null,ending:this.ending?{...this.ending,frames:[...this.ending.frames],shake:[...this.ending.shake]}:null,players:this.players.map(p=>({...p})),cameras:this.cameras.map(c=>({...c})),blocks:this.blocks.map(b=>({...b})),broken:[...this.broken]};}
  restore(s){if(!s||!Array.isArray(s.players)||s.players.length!==2)return;if(s.index!==this.index)this.load(s.index);this.index=s.index;this.level=this.levels[this.index];this.tick=s.tick;this.serial=s.serial;this.won=s.won;this.winTime=s.winTime||0;this.rewinding=!!s.rewinding;this.sharedCamera=s.sharedCamera?{...s.sharedCamera}:null;this.ending=s.ending?{...s.ending,frames:[...s.ending.frames],shake:[...(s.ending.shake||[0,0])]}:null;this.players=s.players.map(p=>({...p}));this.cameras=s.cameras.map(c=>({...c}));this.blocks=s.blocks.map(b=>({...b}));this.broken=[...s.broken];}
}
