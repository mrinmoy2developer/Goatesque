import {edgeType} from './terrain.mjs';
import {NetworkPresentation} from './network-presentation.mjs';
const noise=(x,y)=>{const n=Math.sin(x*127.1+y*311.7)*43758.5453;return n-Math.floor(n);};
const randomGenerator=seed=>()=>{seed=(Math.imul(1664525,seed)+1013904223)>>>0;return seed/4294967296;};
export const splitViewports=engine=>engine.cameras.map((camera,view)=>({camera,view,left:view*960,width:960,height:1080}));

export class Renderer {
 constructor(canvas,assets){
  this.canvas=canvas;this.ctx=canvas.getContext('2d');this.assets=assets;this.time=0;this.themeCache=new Map();this.animations=[{},{}];this.gateFrames=new Map();this.levelId=null;
  this.reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
  this.networkPresentation=new NetworkPresentation();
 }
 sprite(name,frame,x,y,sx=1,sy=sx,rotation=0,alpha=1,context=this.ctx){return this.assets.draw(context,name,frame,x,y,sx,sy,rotation,alpha);}
 theme(id){
  id=Math.max(1,Math.min(5,id||1));if(this.themeCache.has(id))return this.themeCache.get(id);
  const map=this.assets.renderMap.tilesets[id],random=randomGenerator(0xD701+id*173),make=()=>{const canvas=document.createElement('canvas');canvas.width=1536;canvas.height=1152;return canvas;};
  const wall=make(),background=make(),wc=wall.getContext('2d'),bc=background.getContext('2d');
  wc.fillStyle='#808080';wc.fillRect(0,0,wall.width,wall.height);wc.imageSmoothingEnabled=false;
  const wrapped=(context,name,frame,x,y,sx,sy,rot)=>{
   const s=this.assets.sprites[name];if(!s)return;const radius=Math.max(s.width*Math.abs(sx),s.height*Math.abs(sy));
   const xs=[x],ys=[y];if(x<radius)xs.push(x+1536);if(x>1536-radius)xs.push(x-1536);if(y<radius)ys.push(y+1152);if(y>1152-radius)ys.push(y-1152);
   for(const xx of xs)for(const yy of ys)this.sprite(name,frame,xx,yy,sx,sy,rot,1,context);
  };
  for(let i=0;i<4000;i++){const scale=6-i*.001;wrapped(wc,map.wall.name,Math.floor(random()*26),random()*1536,random()*1152,scale,scale,random()*10-5);}
  for(let i=0;i<15;i++){const scale=.8+random()*.7;wrapped(wc,map.rock.name,i===0?0:1+Math.floor(random()*(this.assets.sprites[map.rock.name].frames.length-1)),random()*1536,random()*1152,scale*(random()<.5?-1:1),scale*(random()<.5?-1:1),random()*10-5);}
  bc.fillStyle='#000';bc.fillRect(0,0,1536,1152);
  for(let i=0;i<500;i++){const scale=5-random()*3;wrapped(bc,map.background.name,Math.floor(random()*24),random()*1536,random()*1152,scale,scale,random()*10-5);}
  bc.save();bc.globalAlpha=.2;bc.filter='brightness(.2)';
  for(let y=64;y<1152;y+=64*(1+Math.floor(random()*8))){const frame=Math.floor(random()*12);for(let x=0;x<1536;x+=64)this.sprite('sprBgrPatterns',frame,x,y+(random()*4-2),1,1,0,1,bc);}bc.restore();
  const result={map,wall,background,wallPattern:this.ctx.createPattern(wall,'repeat'),backgroundPattern:this.ctx.createPattern(background,'repeat')};this.themeCache.set(id,result);return result;
 }
 prepare(engine){
  if(this.levelId!==engine.level.id||this.serial!==engine.serial){this.levelId=engine.level.id;this.serial=engine.serial;this.animations=[{},{}];this.gateFrames.clear();}
  this.playerFrames=engine.players.map((p,i)=>{
   const other=engine.players[1-i];const carrying=other.gate<0&&Math.abs(other.x-p.x)<26*(other.scale+p.scale)&&Math.abs(other.y+47*other.scale-p.y+47*p.scale)<4;
   let action=!p.ground?(p.vy>0?'fall':'jump'):carrying?(Math.abs(p.vx)>1?'carryWalk':'carry'):(p.pushFrames>0&&Math.abs(p.vx)<1?'push':Math.abs(p.vx)>1?'walk':'idle');
   const state=this.animations[i];if(state.action!==action){state.phase=0;state.action=action;state.tick=engine.tick;}
   const speed=action==='walk'||action==='carryWalk'?.15/10.2*Math.abs(p.vx/p.scale):action==='push'?.15:i===0?.055:.05;
   const elapsed=this.preferences?.remote&&!engine.rewinding?(this.preferences.paused?0:this.lastDt*.06):engine.tick-(state.tick||0);
   state.phase=(state.phase||0)+elapsed*speed;state.tick=engine.tick;
   return {sprite:this.assets.renderMap.players[i][action].name,frame:state.phase};
  });
  const native=this.assets.renderMap.nativeScenes.find(scene=>scene.id===engine.level.id);
  this.decor=(native?.objects||engine.level.decor||[]).map((object,index)=>{
   const definition=this.assets.renderMap.decor.find(d=>d.id===object.type);if(!definition)return null;
   let name=this.assets.spriteNames[definition.sprite];
   if(object.type===13)name=this.currentTheme.map.backgroundBase.name;
   if(object.type===14||object.type===15)name=this.currentTheme.map.backgroundPillar.name;
   if(object.type===16)name=this.currentTheme.map.rock.name;
   if(!this.assets.sprites[name])return null;
   return {...definition,...object,spriteName:name,frame:object.frame??object.imageSingle??object.image_single??(noise(object.x,index)*this.assets.sprites[name].frames.length)};
  }).filter(Boolean).filter(d=>d.type!==30&&d.type!==31).sort((a,b)=>b.depth-a.depth);
 }
 render(engine,dt=16){
  this.lastDt=dt;engine=this.preferences?.remote?this.networkPresentation.present(engine,dt):engine;this.presented=engine;
  const cv=this.canvas,c=this.ctx;this.time+=this.reduced?0:dt*.001;
  const width=cv.clientWidth,height=cv.clientHeight,dpr=Math.min(devicePixelRatio||1,2);
  if(cv.width!==Math.round(width*dpr)||cv.height!==Math.round(height*dpr)){cv.width=Math.round(width*dpr);cv.height=Math.round(height*dpr);}
  c.setTransform(cv.width/1920,0,0,cv.height/1080,0,0);c.imageSmoothingEnabled=true;c.fillStyle='#161b1a';c.fillRect(0,0,1920,1080);
  this.currentTheme=this.theme(engine.level.tileset);this.prepare(engine);
  this.lastViewports=splitViewports(engine);
  for(const {camera,view,left,width} of this.lastViewports){
   c.save();c.beginPath();c.rect(left,0,width,1080);c.clip();
   const brokenAt=engine.breaks?.at(-1)?.tick,shake=brokenAt!==undefined&&engine.tick-brokenAt<10&&!this.reduced?Math.sin(engine.tick*3)*3:0;c.translate(left+shake,shake*.5);c.scale(width/camera.w,1080/camera.h);c.translate(-camera.x,-camera.y);
   this.background(camera);
   for(let i=0;i<engine.level.gates.length;i++)this.gate(engine,engine.level.gates[i],i,view);
   for(const item of this.decor)if(item.depth>5)this.drawDecor(item,camera,engine.tick);
   if(engine.ending){const half=this.assets.renderMap.ending[view===0?'leftHalf':'rightHalf'],shake=(engine.ending.shake?.[view]||0)*Math.sin(engine.tick*2)*.15;this.sprite(half.spriteName,engine.ending.frames[view],half.x+shake,half.y,2,2);}
   this.terrain(engine,camera,view);
    this.breakingFloor(engine);
   for(const item of this.decor)if(item.depth<=5)this.drawDecor(item,camera,engine.tick);
   for(const block of engine.blocks){this.sprite('sprBlock',0,block.x,block.y,block.w/320,block.h/320);if(block.vx){c.save();c.globalCompositeOperation='lighter';this.sprite('sprBlockGlow',2,block.x,block.y,Math.sign(block.vx)*block.w/320,block.h/320,0,.8);c.restore();}}
   const order=[0,1].sort((a,b)=>engine.players[a].y-engine.players[b].y);
   for(const i of order){const p=engine.players[i];if(p.gate>=0)continue;
    this.player(p,i,p.view!==view);
    if(engine.cameras.every(c=>c.locked)&&p.view!==view){const from=engine.cameras[p.view],to=camera,ratio=to.h/from.h;const x=p.view===0?to.x+(p.x-from.x-from.w)*ratio:to.x+to.w+(p.x-from.x)*ratio;const y=to.y+(p.y-from.y)*ratio;this.player({...p,x,y,scale:p.scale*ratio},i,false);}
    if(p.view===view)this.tutorial(engine,p,i);
   }
   // Original fog and torch light bitmaps soften the room without tinting the art.
   c.save();c.globalCompositeOperation='screen';this.sprite('sprFog',0,camera.x-100+Math.sin(this.time*.04)*70,camera.y-100,Math.max(camera.w,camera.h)/500,Math.max(camera.w,camera.h)/500,0,.035);c.restore();
   c.restore();
   if(camera.locked)this.sprite('sprLockFrame3',0,view*960,0,1,1,0,.7);
  }
  const joined=engine.cameras.every(c=>c.locked);
  c.save();if(!joined)c.filter='brightness(0)';this.sprite('sprLockCrack',joined?1:0,954,0,1,1);c.restore();
  if(engine.ending?.alpha){c.save();c.fillStyle='#fff';c.globalAlpha=engine.ending.alpha;c.fillRect(0,0,1920,1080);c.restore();}
  if(engine.rewinding){c.save();c.fillStyle='#74bdcc';c.globalAlpha=.07;c.fillRect(0,0,1920,1080);c.restore();}
 }
 background(camera){
  const c=this.ctx;c.save();c.translate(camera.x*.2,camera.y*.2);c.fillStyle=this.currentTheme.backgroundPattern;c.fillRect(camera.x*.8-200,camera.y*.8-200,camera.w+400,camera.h+400);c.restore();
 }
 terrain(engine,camera,view){
  const c=this.ctx,grid=engine.level.grid;
  const x0=Math.floor(camera.x/64)-2,x1=Math.ceil((camera.x+camera.w)/64)+2,y0=Math.floor(camera.y/64)-2,y1=Math.ceil((camera.y+camera.h)/64)+2;
  c.save();c.beginPath();for(let x=x0;x<=x1;x++)for(let y=y0;y<=y1;y++)if((grid[y]?.[x]??1)===1)c.rect(x*64,y*64,64,64);c.clip();c.fillStyle=this.currentTheme.wallPattern;c.fillRect(camera.x-160,camera.y-160,camera.w+320,camera.h+320);c.restore();
  for(let x=x0;x<=x1;x++)for(let y=y0;y<=y1;y++){
   const value=grid[y]?.[x];
   if(value===1){const type=edgeType(grid,x,y);if(type)this.edge(this.currentTheme.map[type].name,x,y,engine.level.tileset);}
   else if(value===7&&!engine.broken.includes(y*engine.level.width+x))this.edge('sprWallLinesFloorWorn',x,y,engine.level.tileset);
   else if(value===5||value===6){
    if(engine.tile(x,y,view)){c.save();c.fillStyle=this.currentTheme.wallPattern;c.fillRect(x*64,y*64,64,64);this.sprite('sprFadeBorder',Math.floor(noise(x,y)*12),x*64+32,y*64+32,1,1,0,.55);c.restore();}
    else this.sprite('sprFadeGone',Math.floor(noise(x,y)*24),x*64+32,y*64+32,1,1,0,.2);
   }
  }
 }
 edge(name,x,y,theme){
  const count=this.assets.sprites[name]?.frames.length;if(!count)return;
  const n=noise(x+theme*109,y),frame=n<.08?0:1+Math.floor(noise(x+13,y+3)*(count-1)),sx=1+noise(x,y+5)*.1,sy=1+noise(x+5,y)*.1,angle=noise(x+17,y+15)*6-3;
  this.sprite('sprWallBase',Math.floor(noise(x+7,y+9)*18),x*64+32,y*64+32,sx,sy,angle,.7+noise(x,y+8)*.2);
  this.sprite(name,frame,x*64+32,y*64+32,sx,sy,angle);
 }
 drawDecor(item,camera,tick){
  const c=this.ctx,sprite=this.assets.sprites[item.spriteName];if(!sprite)return;
  const px=camera.x+camera.w/2+(item.x-camera.x-camera.w/2)*(item.parallax??.98),py=item.y;
  const sx=item.scaleX??1,sy=item.scaleY??1;if(px+sprite.width*Math.abs(sx)<camera.x||px-sprite.width*Math.abs(sx)>camera.x+camera.w||py+sprite.height*Math.abs(sy)<camera.y||py-sprite.height*Math.abs(sy)>camera.y+camera.h)return;
  if(item.type===7){
   c.save();c.globalCompositeOperation='screen';this.sprite('sprLight',0,px,py-12,.6,.6,0,.32);c.restore();
   this.sprite('sprBgrTorchPlate',Math.floor(noise(item.x,item.y)*10),px,py,sx*2,2);
   this.sprite(item.spriteName,item.frame+(this.reduced?0:tick*.1),px,py,sx,sy,0,.5);return;
  }
  const speed=typeof item.frameSpeed==='number'?item.frameSpeed:0;
  this.sprite(item.spriteName,item.frame+(this.reduced?0:tick*speed),px,py,sx,sy,0,item.alpha??1);
 }
 gate(engine,gate,index,view){
  const c=this.ctx,camera=engine.cameras[view],players=engine.players.filter(p=>p.gate===index),closed=players.length>=gate.capacity||(players.length>0&&gate.capacity===2&&players.some(p=>p.view===view));
  const name=this.currentTheme.map[gate.capacity===2?'gateBig':'gate'].name;
  const previous={frame:engine.gateFrames[index]?.[view]||0};
  const x=camera.x+camera.w/2+(gate.x-camera.x-camera.w/2)*.96,sx=gate.scaleX??1;
  this.sprite(name,previous.frame,x,gate.y,sx,1);
  if(closed&&previous.frame>=4)for(const p of players){const id=1-engine.players.indexOf(p),offset=gate.capacity===2?40-80*id:5*sx;this.sprite('sprGateHeads',id,x+offset,gate.y-(gate.capacity===2?80:75),sx,1);}
  if(closed&&previous.frame>0&&previous.frame<4)for(let i=0;i<8;i++){const r=noise(index*31+i,engine.tick),age=previous.frame;this.sprite('sprParticleDust',0,x+(r-.5)*80,gate.y-45-r*70-age*3,.5+age*.12,.5+age*.12,0,.18);}
 }
 breakingFloor(engine){
  for(const event of engine.breaks||[]){const age=engine.tick-event.tick;if(age<0||age>100)continue;const alpha=Math.min(1,(100-age)/25);
   for(const cell of event.cells){const x=cell%engine.level.width,y=Math.floor(cell/engine.level.width),r=noise(cell,19),fall=Math.min(15*age,.4*(.6+r*.6)*age*age),dx=(r-.5)*age*.7;
    this.sprite('sprWallBase',Math.floor(noise(x+7,y+9)*18),x*64+32+dx,y*64+32+fall,1,1,(r-.5)*age*3,alpha);
    this.sprite('sprWallLinesFloorWorn',1+Math.floor(r*(this.assets.sprites.sprWallLinesFloorWorn.frames.length-1)),x*64+32+dx,y*64+32+fall,1,1,(r-.5)*age*3,alpha);
    for(let n=0;n<5;n++){const q=noise(cell,n+71),life=25+q*45;if(age>life)continue;const spread=(q-.5)*age*2;this.sprite('sprParticle',0,x*64+32+spread,y*64+36+Math.min(15*age,.2*age*age+q*age),.1+q*.25,.1+q*.25,q*360+age,.6*(1-age/life));}
    if(age<55)this.sprite('sprParticleDust',0,x*64+32+(r-.5)*age,y*64+35+age*.6,1+age*.04,1+age*.04,0,.13*(1-age/55));
   }
  }
 }
 player(p,index,ghost){
  const c=this.ctx,frame=this.playerFrames[index];c.save();if(ghost)c.globalAlpha*=.5;
  this.sprite(frame.sprite,frame.frame,p.x,p.y,p.face*p.scale,p.scale);c.restore();
 }
 tutorial(engine,p,index){
  const kind=engine.index<2&&p.lastJump===0?'jump':engine.index===2&&p.canLock&&p.lastLock===0?'lock':engine.index===5&&!this.preferences?.rewound?'rewind':engine.index===9?'switch':null;
  if(kind){const prefs=this.preferences||{},mode=prefs.inputMode??3,methods=this.assets.controls.inputModes[mode].methodsByNativeId;
   const method=prefs.online?'keyboard':methods[index===0?1:0];const key=prefs.keyboardSwap?1-index:index;
   const frame=this.assets.controls.controlsOverlay.glyphFramesByMode[method][key===0?'white':'red'][kind];
   this.sprite('sprHUDControls',frame,p.x,p.y-120*p.scale+Math.sin(engine.tick*.05)*5,p.scale,p.scale,0,.7);
  }
  const gate=engine.level.gates.find(g=>Math.abs(g.x-p.x)<100&&Math.abs(g.y-p.y-47*p.scale)<85);
  if(gate)this.sprite('sprHUDControls',index===0?30:29,p.x,p.y-210*p.scale,p.scale,p.scale,0,.8);
 }
}
