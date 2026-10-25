import {nodeUnlocked,mapScrollTarget} from './presentation.mjs';
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
export class NativeInterface {
 constructor(canvas,assets,buttons,action){this.canvas=canvas;this.ctx=canvas.getContext('2d');this.assets=assets;this.layout=assets.uiLayout;this.buttons=buttons;this.action=action;this.scroll=40;this.selector={x:0,y:0};this.lastScreen=null;this.buttonKey='';this.time=0;}
 resize(){const dpr=Math.min(devicePixelRatio||1,2),w=Math.round(this.canvas.clientWidth*dpr),h=Math.round(this.canvas.clientHeight*dpr);if(this.canvas.width!==w||this.canvas.height!==h){this.canvas.width=w;this.canvas.height=h;}this.ctx.setTransform(w/1920,0,0,h/1080,0,0);}
 sprite(name,frame,x,y,sx=1,sy=sx,alpha=1){return this.assets.draw(this.ctx,name,frame,x,y,sx,sy,0,alpha);}
 text(value,x,y,size=32,alpha=1){const c=this.ctx;c.save();c.globalAlpha=alpha;c.fillStyle='#fff';c.textAlign='center';c.textBaseline='middle';c.font=`${size===32?'bold ':''}${size}px GoatesqueGaramond,serif`;const lines=value.split('\n');lines.forEach((line,i)=>c.fillText(line.trim(),x,y+(i-(lines.length-1)/2)*size*1.25));c.restore();}
 render(state,transition,dt=16){
  this.resize();const c=this.ctx;this.time+=dt;const screen=state.screen;
  if(this.lastScreen!==screen){this.scroll=40;this.selector={x:0,y:0};this.lastScreen=screen;this.buttonKey='';}
  if(screen==='title'){
   c.fillStyle='#c0c0c0';c.fillRect(0,0,1920,1080);this.heads(1,false);this.text('Goatesque',960,120,85.33);this.sprite('sprHUDControls',state.gamepadConnected?0:29,990,900,1.5,1.5,Math.max(0,Math.sin(this.time*.002)));
  }else if(screen==='input'){
   c.drawImage(this.assets.inputBackground,0,0,1920,1080);
   for(const option of this.layout.input.options)this.sprite(option.sprite,option.frame,option.x,option.y);
   const option=this.layout.input.options[state.inputSelection];this.drawSelector(option.x,option.y,2.2,dt);
  }else if(screen==='map')this.map(state,dt);
  if(state.overlay==='controls')this.controls(state.inputMode);
  if(state.overlay==='credits')this.credits();
  if(transition){this.drawTransition(transition,state);}
  if(state.whiteFlash){c.save();c.fillStyle='#fff';c.globalAlpha=state.whiteFlash;c.fillRect(0,0,1920,1080);c.restore();}
  this.updateButtons(state,transition);
 }
 heads(progress,success=false){const x=-1009*(1-clamp(progress,0,1));this.sprite('sprMinoPleb',0,x,0);this.sprite('sprMinoPleb',1,1920-x,0,-1,1);if(success){this.sprite('sprMinoPleb2',0,x,0);this.sprite('sprMinoPleb2',1,1920-x,0,-1,1);}}
 drawTransition(t,state){const c=this.ctx;c.save();c.fillStyle='#000';c.globalAlpha=clamp(t.fade,0,1);c.fillRect(0,0,1920,1080);c.restore();this.heads(t.fade,t.completion);if(t.waiting)this.sprite('sprHUDControls',state.gamepadConnected?0:29,990,900,1.5,1.5,Math.max(0,Math.sin(this.time*.002)));}
 drawSelector(x,y,scale,dt){const lerp=1-Math.pow(.7,dt/(1000/60));if(!this.selector.x)this.selector={x,y};this.selector.x+=(x-this.selector.x)*lerp;this.selector.y+=(y-this.selector.y)*lerp;this.sprite('sprLevelSelector',0,this.selector.x,this.selector.y,scale,scale);}
 map(state,dt){
  const selected=typeof state.selected==='number'?this.layout.map.nodes[state.selected]:this.layout.map.utilities.find(u=>u.action===state.selected);
  if(typeof state.selected==='number'&&!this.manualScroll){const target=mapScrollTarget(state.selected);this.scroll+=(target-this.scroll)*(1-Math.pow(.9,dt/(1000/60)));}
  const c=this.ctx;c.fillStyle='#c0c0c0';c.fillRect(0,0,1920,1080);c.save();c.translate(0,-this.scroll);
  this.sprite('sprLevelSelect1',0,0,0);this.sprite('sprLevelSelect2',0,0,2048);
  const completed=new Set(state.completed.map(index=>index+3));
  for(const node of this.layout.map.nodes){const beat=completed.has(node.index+4),unlocked=nodeUnlocked(node.index,completed);c.save();c.filter=beat?'brightness(.75)':unlocked?'none':'brightness(.5)';this.sprite(node.sprite,beat?1:unlocked?2:0,node.x,node.y,node.scale,node.scale);c.filter=beat?'brightness(.25)':unlocked?'none':'brightness(0)';this.sprite(node.numberSprite,node.numberFrame,node.x,node.y,node.numberScale,node.numberScale);c.restore();}
  c.restore();
  for(const u of this.layout.map.utilities){if(!u.enabledByDefault)continue;let frame=u.frame;if(u.action==='input')frame=state.inputMode===3?2:0;c.save();if(u.action==='sound'&&!state.sound||u.action==='music'&&!state.music)c.filter='brightness(.35)';this.sprite(u.sprite,frame,u.x,u.y);c.restore();}
  if(selected)this.drawSelector(selected.x,selected.screenFixed?selected.y:selected.y-this.scroll,.6,dt);
  if(state.selected==='input'&&!state.overlay)this.controls(state.inputMode);
  if(state.selected==='credits'&&!state.overlay)this.credits();
 }
 controls(mode=3){
  const c=this.ctx;c.save();c.fillStyle='#000';c.globalAlpha=.7;c.fillRect(384,0,1152,1080);c.restore();
  const methods=this.assets.controls.inputModes[mode].methodsByNativeId;
  for(const group of this.layout.controlsOverlay.groups){this.sprite('sprUIControls',group.frame,group.x,group.y);const action=this.assets.controls.controlsOverlay.items[group.frame].action;for(let i=0;i<2;i++){const method=methods[i===0?1:0],frame=this.assets.controls.controlsOverlay.glyphFramesByMode[method][i===0?'white':'red'][action];this.sprite('sprHUDControls',frame,group.x+(i===0?-110:110),group.y+170);}}
 }
 credits(){const c=this.ctx,config=this.layout.credits;c.save();c.fillStyle='#000';c.globalAlpha=.7;c.fillRect(480,0,960,1080);c.restore();this.text(config.text,960,540);}
 updateButtons(state,transition){
  const completed=new Set(state.completed.map(index=>index+3));let definitions=[];
  if(!transition&&!state.overlay){
   if(state.screen==='title')definitions=[{action:'start',label:'Start game',x:990,y:900,w:300,h:180}];
   if(state.screen==='input')definitions=this.layout.input.options.map(o=>({action:'input-choice',value:o.index,label:o.tag.replaceAll('#',' '),x:o.x,y:o.y,w:512,h:450}));
   if(state.screen==='map'){
    definitions=this.layout.map.nodes.map(n=>({action:'level',value:n.index,label:`Level ${n.index+1}`,x:n.x,y:n.y-this.scroll,w:128*n.scale,h:128*n.scale,disabled:state.guest||!nodeUnlocked(n.index,completed)}));
    definitions.push(...this.layout.map.utilities.filter(u=>u.enabledByDefault).map(u=>({action:u.action,label:u.label,x:u.x,y:u.y,w:128,h:128,disabled:state.guest&&u.action==='input'})));
   }
  }
  if(transition?.waiting)definitions=[{action:'confirm-completion',label:'Continue after level',x:990,y:900,w:300,h:180}];
  if(state.overlay)definitions=[{action:'close-overlay',label:'Close controls or credits',x:960,y:540,w:1152,h:1080}];
  const key=JSON.stringify(definitions.map(d=>[d.action,d.value,d.disabled,d.label]));
  if(key!==this.buttonKey){this.buttonKey=key;this.buttons.replaceChildren(...definitions.map(d=>{const b=document.createElement('button');b.className='native-button';b.type='button';b.setAttribute('aria-label',d.label);b.title=d.label;b.dataset.native=d.action;if(d.value!==undefined)b.dataset.value=String(d.value);b.disabled=!!d.disabled;b.addEventListener('click',()=>this.action(d.action,d.value));return b;}));}
  definitions.forEach((d,i)=>{const b=this.buttons.children[i];b.hidden=d.y+d.h/2<0||d.y-d.h/2>1080;Object.assign(b.style,{left:`${(d.x-d.w/2)/19.2}%`,top:`${(d.y-d.h/2)/10.8}%`,width:`${d.w/19.2}%`,height:`${d.h/10.8}%`});});
 }
 navigate(direction,state){
  this.manualScroll=false;
  if(state.screen==='input'){const index=state.inputSelection,column=index%2,row=Math.floor(index/2);state.inputSelection=(direction==='left'?row*2:direction==='right'?row*2+1:direction==='up'?column:column+2);return;}
  if(state.screen!=='map')return;
  const completed=new Set(state.completed.map(index=>index+3));const all=[...this.layout.map.nodes.filter(n=>nodeUnlocked(n.index,completed)).map(n=>({...n,id:n.index,cy:n.y-this.scroll})),...this.layout.map.utilities.filter(u=>u.enabledByDefault).map(u=>({...u,id:u.action,cy:u.y}))];
  const current=all.find(n=>n.id===state.selected);if(!current)return;
  const special=this.layout.map.navigation.special[direction]?.[state.selected];if(special!==undefined&&nodeUnlocked(special,completed)){state.selected=special;return;}
  const candidates=all.filter(n=>n.id!==current.id).map(n=>({...n,dx:n.x-current.x,dy:n.cy-current.cy})).filter(n=>direction==='left'?n.dx<0&&Math.abs(n.dx)>Math.abs(n.dy):direction==='right'?n.dx>0&&Math.abs(n.dx)>Math.abs(n.dy):direction==='up'?n.dy<0&&Math.abs(n.dx)<Math.abs(n.dy):n.dy>0&&Math.abs(n.dx)<Math.abs(n.dy));
  candidates.sort((a,b)=>Math.hypot(a.dx,a.dy)-Math.hypot(b.dx,b.dy));if(candidates[0])state.selected=candidates[0].id;
 }
}
