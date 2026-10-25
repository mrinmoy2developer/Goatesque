import {Engine,emptyInput} from './engine.mjs';
import {Renderer} from './renderer.mjs';
import {loadAssets} from './assets.mjs';
import {RoomConnection,roomRequest} from './network.mjs';
import {NativeInterface} from './interface.mjs';
import {HeadTransition,nodeUnlocked} from './presentation.mjs';
import {Gamepads} from './gamepads.mjs';
import {OriginalAudio} from './audio.mjs';
import {toggleFullscreen} from './display.mjs';
import {GuestCommands,INPUT_PROTOCOL} from './input-stream.mjs';
const $=id=>document.getElementById(id);
const read=(key,fallback)=>{try{return JSON.parse(localStorage.getItem(key)??localStorage.getItem(key.replace('goatesque-','dyo-')))??fallback;}catch{return fallback;}};
const save=(key,value)=>{try{localStorage.setItem(key,JSON.stringify(value));}catch{}};
export async function boot(){
 const generation=(window.goatesqueBoot||0)+1;window.goatesqueBoot=generation;window.goatesque?.destroy?.();
 const [levels,assets]=await Promise.all([fetch('/game/levels.json').then(r=>r.json()),loadAssets((loaded,total)=>{$('loading').textContent=`Loading Goatesque… ${Math.round(loaded/total*100)}%`;})]);
 if(window.goatesqueBoot!==generation)return;await document.fonts.load('32px GoatesqueGaramond');
 const engine=new Engine(levels),renderer=new Renderer($('world'),assets),pads=new Gamepads(assets.controls),audio=new OriginalAudio(assets.audioManifest);
 const ui={screen:'title',selected:0,inputSelection:0,inputMode:read('goatesque-input-mode',3),completed:read('goatesque-completed',[]),overlay:null,gamepadConnected:false,guest:false,sound:read('goatesque-sound',true),music:read('goatesque-music',true)};
 audio.sounds=ui.sound;audio.music=ui.music;
 ui.touch=read('goatesque-touch',matchMedia('(pointer:coarse)').matches||navigator.maxTouchPoints>0);document.documentElement.dataset.touch=ui.touch?'on':'off';$('touch-toggle').setAttribute('aria-pressed',String(ui.touch));
 const native=new NativeInterface($('world'),assets,$('native-buttons'),action),inputs=[emptyInput(),emptyInput()],keys=new Set(),cleanup=[];
 let mode='local',room=null,connection=null,remote=emptyInput(),transition=null,transitionId=0,keyboardSwap=false,touchPlayer=0,last=0,accumulator=0,frame=0,raf=0,toastTimer,remotePaused=false,remoteMenu=0,remoteConfirm=0,remoteSession=null,inputReturn='play',seenRewind=false,lastRevision=-1,lastInputSignature='',packet=0,lastRemotePacket=-1,lastHostState=null,lastHostAt=0,lastHostFrame=-1,lastHostProgress=0,protocolWarning=false,loadCounter=0,serverLoad=null,lastServerEvent=0,lastInputAck=-1,lastInputStream=-1,lastInputProgress=0;
 const guestCommands=new GuestCommands();
 const touch=[{left:false,right:false,rewind:false,switchHeld:false},{left:false,right:false,rewind:false,switchHeld:false}];
 const on=(target,type,fn,options)=>{target.addEventListener(type,fn,options);cleanup.push(()=>target.removeEventListener(type,fn,options));};
 const authority=()=>mode!=='guest';const mine=()=>mode==='guest'?1:0;const busy=()=>!!transition||!!ui.overlay||!$('online-dialog').hidden||mode!=='local'&&!!ui.networkWaiting;
 function toast(message){$('toast').textContent=message;$('toast').hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').hidden=true,3000);}
 function clearHeld(){keys.clear();for(const i of inputs){i.left=false;i.right=false;i.rewind=false;i.switchHeld=false;}for(const i of touch)Object.assign(i,{left:false,right:false,rewind:false,switchHeld:false});for(const button of document.querySelectorAll('#touch-controls [data-touch]'))button.classList.remove('pressed');}
 function selectedForLevel(index){return assets.uiLayout.map.nodes.findIndex(n=>n.alsoIncludesEngineIndices.includes(index));}
 function markCompleted(index){if(!ui.completed.includes(index)){ui.completed.push(index);save('goatesque-completed',ui.completed);}}
 function loadLevel(index){engine.load(index);for(let i=0;i<2;i++){const input=mode==='host'&&i===1?remote:inputs[i];Object.assign(engine.players[i],{lastJump:input.jump||0,lastLock:input.lock||0,lastRestart:input.restart||0,lastGate:input.gate||0,lastSwitch:input.switch||0});}if(mode==='host')serverLoad={id:++loadCounter,index};if(mode!=='local')guestCommands.reset(engine.serial);seenRewind=false;clearHeld();}
 function switchScene(target){
  if(target.screen==='play')loadLevel(target.index);
  ui.screen=target.screen;ui.overlay=null;if(target.selected!==undefined)ui.selected=target.selected;
  $('online-button').hidden=ui.screen==='play'||mode!=='local';$('touch-controls').hidden=ui.screen!=='play';
  audio.setScene(ui.screen);clearHeld();$('world').focus();
 }
 function fadeTo(target,{completion=false,automatic=false}={}){if(!authority()||transition)return;transition=new HeadTransition(target,{completion,automatic,id:++transitionId});ui.overlay=null;clearHeld();audio.effect('sdHeadClose');}
 function openScene(target){switchScene(target);transition=HeadTransition.opening(++transitionId);audio.effect('sdHeadOpen');}
 function start(){audio.unlock();audio.effect('sdTitlePress');fadeTo({screen:read('goatesque-input-mode',null)!==null||ui.completed.length?'map':'input',selected:Math.max(0,Math.min(29,selectedForLevel(engine.index)))});}
 function startLevel(nodeIndex){const node=assets.uiLayout.map.nodes[nodeIndex];if(!authority()||!node||!nodeUnlocked(nodeIndex,new Set(ui.completed.map(i=>i+3))))return;ui.selected=nodeIndex;fadeTo({screen:'play',index:node.engineIndex});}
 function confirmCompletion(restart=false){if(!transition?.waiting)return;if(mode==='guest'){if(restart)inputs[1].restart++;else inputs[1].confirm++;return;}if(transition.confirm(restart?{screen:'play',index:engine.index}:undefined))audio.effect('sdMenuPress');}
 function requestMap(){if(mode==='guest'){inputs[1].menu++;return;}fadeTo({screen:'map',selected:Math.max(0,selectedForLevel(engine.index))});}
 function action(name,value){
  audio.unlock();
  if(name==='close-overlay'){ui.overlay=null;return;}
  if(name==='confirm-completion'){confirmCompletion();return;}
  if(transition)return;
  if(name==='start'){start();return;}
  if(name==='input-choice'){
   ui.inputMode=Number(value);ui.inputSelection=Number(value);const existing=read('goatesque-input-mode',null)!==null;save('goatesque-input-mode',ui.inputMode);
   audio.effect('sdMenuPress');fadeTo(existing||inputReturn==='map'?{screen:'map',selected:ui.selected}:{screen:'play',index:0});return;
  }
  if(name==='level'){startLevel(Number(value));return;}
  if(name==='input'){inputReturn='map';ui.inputSelection=ui.inputMode;fadeTo({screen:'input'});return;}
  if(name==='sound'){audio.sounds=!audio.sounds;ui.sound=audio.sounds;save('goatesque-sound',ui.sound);return;}
  if(name==='music'){audio.toggleMusic();ui.music=audio.music;save('goatesque-music',ui.music);return;}
  if(name==='credits'){ui.selected='credits';ui.overlay='credits';return;}
  if(name==='fullscreen')toggleFullscreen(toast);
 }
 function playLocal(){if(connection){connection.leave();connection=null;}room=null;mode='local';ui.guest=false;$('room-bar').hidden=true;ui.screen='play';transition=null;clearHeld();$('online-button').hidden=true;$('touch-controls').hidden=false;audio.setScene('play');$('world').focus();}
 function presentation(){return {screen:ui.screen,selected:ui.selected,inputSelection:ui.inputSelection,inputMode:ui.inputMode,completed:ui.completed,whiteFlash:ui.whiteFlash||0,transition:transition?.snapshot()||null};}
 function receivePresentation(state){if(!state)return;const changed=ui.screen!==state.screen;Object.assign(ui,{screen:state.screen,selected:state.selected,inputSelection:state.inputSelection,inputMode:state.inputMode,completed:state.completed||[],whiteFlash:state.whiteFlash||0});
  const next=state.transition;if(next){if(transition?.id===next.id){const fade=next.direction>0?Math.max(transition.fade,next.fade):Math.min(transition.fade,next.fade);transition=HeadTransition.restore({...next,fade:next.waiting?1.2:fade});}else transition=HeadTransition.restore(next);}else transition=null;
  if(changed){clearHeld();audio.setScene(ui.screen);$('touch-controls').hidden=ui.screen!=='play';}ui.guest=true;
 }
 async function enterRoom(kind){
  const b=$(kind==='create'?'create-room':'join-room');b.disabled=true;$('room-error').textContent='';
  try{
   const session=await roomRequest({action:kind,code:$('room-code').value.toUpperCase().trim()});connection?.stop();room=session;mode=session.role;ui.guest=mode==='guest';inputs.forEach(i=>Object.assign(i,emptyInput()));remote=emptyInput();remoteMenu=remoteConfirm=0;guestCommands.player=mine();guestCommands.reset(-1);loadCounter=0;serverLoad=null;lastServerEvent=0;lastHostState=null;lastHostFrame=-1;lastHostProgress=0;lastInputAck=-1;lastInputStream=-1;lastInputProgress=0;ui.networkWaiting=mode==='guest';packet=0;lastRemotePacket=-1;remoteSession=null;protocolWarning=false;
   lastRevision=-1;lastInputSignature='';
   if(mode==='host'){ui.inputMode=3;transition=null;openScene({screen:'map',selected:Math.max(0,selectedForLevel(engine.index))});}
   connection=new RoomConnection(session,data=>{
    if(mode==='host'&&data.guestSession!==remoteSession){remoteSession=data.guestSession;remoteMenu=remoteConfirm=0;}
    if(mode==='host')remote=data.remoteInput||emptyInput();
    if(data.state?.players){
     if(Number.isFinite(data.revision)){if(data.revision<=lastRevision)return;lastRevision=data.revision;}
     if(data.state.protocol!==INPUT_PROTOCOL){ui.networkWaiting=true;if(!protocolWarning){protocolWarning=true;toast('Both players must refresh Goatesque and create a new room.');}return;}
     if(mode==='host'&&serverLoad&&(data.state.loadAck||0)<serverLoad.id)return;
     const before=renderer.networkPresentation.capture(engine);
     lastHostState=data.state;lastHostAt=performance.now();if(data.state.hostFrame!==lastHostFrame){lastHostFrame=data.state.hostFrame;lastHostProgress=lastHostAt;}
     if(data.state.guestStream!==lastInputStream||(data.state.guestAck||0)>lastInputAck){lastInputStream=data.state.guestStream;lastInputAck=data.state.guestAck||0;lastInputProgress=lastHostAt;}
     engine.restore(data.state);const wasPaused=remotePaused;remotePaused=!!data.state.paused;
     if(!wasPaused&&remotePaused&&guestCommands.pending.length){guestCommands.cancel();clearHeld();}
     if(mode==='guest')receivePresentation(data.state.presentation);
     ui.networkWaiting=!guestCommands.acknowledge(data.state)||!remotePaused&&ui.screen==='play'&&lastHostAt-lastHostProgress>1500;
     if(ui.screen==='play'&&!busy()&&!remotePaused)guestCommands.replay(engine);
     engine.events=[];for(const record of data.state.events||[]){if(record.seq<=lastServerEvent)continue;lastServerEvent=record.seq;if(record.epoch===engine.serial)engine.events.push(record.event);}processEvents();
     renderer.networkPresentation.reconcile(before,engine);
     renderer.networkPresentation.observe(engine,data.state,mine());
    }
   },status=>{
    $('connection-label').textContent=(ui.networkWaiting?'Synchronizing with server…':null)||status.error||(status.connected?`Connected · ${status.latency} ms`:'Waiting for your friend');$('connection-dot').classList.toggle('connected',status.connected);
    if(status.closed&&mode==='guest'){connection?.stop();connection=null;room=null;mode='local';ui.guest=false;transition=null;switchScene({screen:'title'});$('room-bar').hidden=true;$('online-button').hidden=false;toast('The host closed the room.');}
   });
   connection.start(cursor=>({input:{...inputs[mine()],...guestCommands.payload(cursor),packet:++packet},...(mode==='host'?{presentation:presentation(),paused:ui.screen!=='play'||!!transition||!!ui.overlay,load:serverLoad}:{})}));
   $('online-dialog').hidden=true;$('room-bar').hidden=false;$('room-display').textContent=room.code;$('your-player').textContent=mode==='host'?'White minotaur':'Red minotaur';$('online-button').hidden=true;audio.unlock();$('world').focus();
  }catch(error){$('room-error').textContent=error.message;}finally{b.disabled=false;}
 }
 function confirm(){if(transition?.waiting){confirmCompletion();return;}if(transition)return;if(ui.overlay){ui.overlay=null;return;}if(ui.screen==='title')start();else if(ui.screen==='input')action('input-choice',ui.inputSelection);else if(ui.screen==='map'){if(typeof ui.selected==='number')startLevel(ui.selected);else action(ui.selected);}}
 function back(){if(ui.overlay){ui.overlay=null;return;}if(transition)return;if(ui.screen==='play'){requestMap();return;}if(mode==='guest'){leaveRoom();return;}if(ui.screen==='map'||ui.screen==='input')fadeTo({screen:'title'});}
 function leaveRoom(){connection?.leave();connection=null;room=null;mode='local';ui.guest=false;remote=emptyInput();transition=null;$('room-bar').hidden=true;$('online-dialog').hidden=true;switchScene({screen:'title'});}
 function keyboardAllowed(index){return mode!=='local'?index===mine():ui.inputMode===3||ui.inputMode===2&&index===1;}
 const groups=[assets.controls.keyboard.white,assets.controls.keyboard.red];
 function key(event,down){
  if(event.target instanceof HTMLInputElement)return;
  const code=event.code,recognized=['Space','Enter','Escape','KeyR','F1','ArrowLeft','ArrowRight','ArrowUp','ArrowDown','KeyW','KeyA','KeyS','KeyD','KeyE','KeyQ','KeyF','ControlLeft','ControlRight','ShiftLeft','ShiftRight'].includes(code);if(!recognized)return;event.preventDefault();
  if(down)keys.add(code);else keys.delete(code);
  if(!down||event.repeat)return;audio.unlock();
  if(!$('online-dialog').hidden){if(code==='Escape')$('online-dialog').hidden=true;return;}
  if(code==='F1'){ui.overlay=ui.overlay==='controls'?null:'controls';clearHeld();return;}
  if(code==='Escape'){back();return;}
  if(transition?.waiting){if(code==='KeyR')confirmCompletion(true);else if(['Space','Enter','ArrowUp'].includes(code))confirmCompletion();return;}
  if(transition)return;
  if(ui.overlay){if(['Space','Enter'].includes(code))ui.overlay=null;return;}
  if(ui.screen!=='play'){
   if(['Space','Enter'].includes(code)){confirm();return;}
   const direction={ArrowLeft:'left',ArrowRight:'right',ArrowUp:'up',ArrowDown:'down'}[code];if(direction&&mode!=='guest'){native.navigate(direction,ui);audio.effect('sdLevelSelect',.2);}return;
  }
  if(mode!=='local'&&ui.networkWaiting)return;
  if(code==='Space'){if(mode==='local')keyboardSwap=!keyboardSwap;return;}
  for(let physical=0;physical<2;physical++){
   const group=groups[physical];for(const name of ['jump','lock','switch','gate']){
    const matches=name==='switch'&&physical===1?code.startsWith('Control'):code===group[name];if(!matches)continue;
    const logical=mode!=='local'?mine():name==='gate'?physical:keyboardSwap?1-physical:physical;
    if(keyboardAllowed(logical))inputs[logical][name]++;
   }
  }
 }
 function keyboardHeld(name,index){
  if(!keyboardAllowed(index))return false;
  return groups.some((group,physical)=>{
   const logical=mode!=='local'?mine():keyboardSwap?1-physical:physical;if(logical!==index)return false;
   const key=group[name];return key==='Control'?keys.has('ControlLeft')||keys.has('ControlRight'):key==='Shift'?keys.has('ShiftLeft')||keys.has('ShiftRight'):keys.has(key);
  });
 }
 function processEvents(){for(const e of engine.events.splice(0)){
  const sounds={lock:e.locked?'sdScreenLock':'sdScreenUnlock',jump:e.player===0?'sdJump':'sdJump2',land:'sdLand',gate:'sdGate',switch:'sdSwitch',denied:'sdScreenUnlockError',break:'sdIntroBreak'};if(sounds[e.type])audio.effect(sounds[e.type],e.type==='land'?.12:.35);
  if(e.type==='win'&&authority()){markCompleted(engine.index);const next=engine.index===0?{screen:'play',index:1}:{screen:'map',selected:Math.min(29,Math.max(0,selectedForLevel(engine.index)+1))};fadeTo(next,{completion:engine.index!==0,automatic:engine.index===0});}
  if(e.type==='ending-complete'&&authority()){markCompleted(engine.index);transition=null;switchScene({screen:'title'});ui.whiteFlash=1;}
 }}
 function animate(now){
  if(mode!=='local'&&lastHostState&&!ui.networkWaiting&&(now-lastHostAt>2200||guestCommands.pending.length>0&&now-lastInputProgress>2200||ui.screen==='play'&&!remotePaused&&now-lastHostProgress>1500)){guestCommands.cancel();ui.networkWaiting=true;engine.restore(lastHostState);renderer.networkPresentation.reset(engine);connection?.requestSoon();}
  const dt=last?Math.min(100,now-last):16.667;last=now;accumulator+=dt;const gamepad=pads.poll(ui.inputMode,mine(),mode!=='local');ui.gamepadConnected=gamepad.connected>0;
  if(gamepad.confirm)confirm();if(gamepad.back)back();for(const direction of gamepad.navigation)if(ui.screen!=='play'&&!busy()&&mode!=='guest')native.navigate(direction,ui);
  for(let i=0;i<2;i++){
   const gp=gamepad.players[i];for(const name of ['jump','lock','switch','gate'])if(gp[name]&&ui.screen==='play'&&!busy())inputs[i][name]++;
   inputs[i].left=keyboardHeld('left',i)||!!gp.left||touch[i].left;inputs[i].right=keyboardHeld('right',i)||!!gp.right||touch[i].right;
   inputs[i].rewind=keyboardHeld('rewind',i)||!!gp.rewind||touch[i].rewind;inputs[i].switchHeld=keyboardHeld('switch',i)||!!gp.switchHeld||touch[i].switchHeld;
  }
  if(mode!=='local'){const input=inputs[mine()],signature=JSON.stringify([input.left,input.right,input.jump,input.lock,input.gate,input.switch,input.switchHeld,input.rewind,input.menu,input.confirm,input.restart]);if(signature!==lastInputSignature){lastInputSignature=signature;connection?.requestSoon();}}
  if(mode==='host'){
   if((remote.menu||0)>remoteMenu){remoteMenu=remote.menu;requestMap();}
   if((remote.confirm||0)>remoteConfirm){remoteConfirm=remote.confirm;confirmCompletion();}
   if(transition?.waiting&&(remote.restart||0)>(engine.players[1].lastRestart||0)){engine.players[1].lastRestart=remote.restart;confirmCompletion(true);}
  }
  let fixed=0;while(accumulator>=1000/60){fixed++;frame++;accumulator-=1000/60;
   if(ui.screen==='play'&&!busy()&&!(mode!=='local'&&remotePaused)){
    if(mode!=='local'){
     if(!guestCommands.pending.length)lastInputProgress=now;const command=guestCommands.push(inputs[mine()],engine.serial);
     if(command)engine.predictPlayer(mine(),command);else{guestCommands.cancel();ui.networkWaiting=true;if(lastHostState)engine.restore(lastHostState);connection?.requestSoon();}
    }else{engine.step(inputs);processEvents();}
    if(engine.rewinding)seenRewind=true;
   }
   if(transition){const before=transition.fade,result=transition.advance();if(transition.completion&&before<1.1&&transition.fade>=1.1)audio.effect('sdLevelSuccess');if(result?.type==='opened'){transition=null;}else if(result?.type==='change'&&authority()){openScene(result.target);}}
  }
  ui.whiteFlash=Math.max(0,(ui.whiteFlash||0)-fixed*.02);$('game-shell').dataset.screen=ui.screen;
  ui.rewinding=ui.screen==='play'&&engine.rewinding;audio.setRewinding(ui.rewinding&&!busy());$('touch-player').hidden=mode!=='local';
  renderer.preferences={inputMode:ui.inputMode,keyboardSwap,online:mode!=='local',remote:mode!=='local',localPlayer:mode!=='local'?mine():null,input:inputs[mine()],fraction:accumulator/(1000/60),paused:busy()||remotePaused,rewound:seenRewind};
  if(ui.screen==='play')renderer.render(engine,dt);
  native.render(ui,transition,dt);
  raf=requestAnimationFrame(animate);
 }
 on(document,'keydown',event=>key(event,true));on(document,'keyup',event=>key(event,false));on(window,'blur',clearHeld);
 on(document,'click',event=>{
  const button=event.target.closest('[data-action]');if(!button)return;const name=button.dataset.action;audio.unlock();
  if(name==='online'){$('online-dialog').hidden=false;$('room-code').focus();clearHeld();}
  if(name==='close-online')$('online-dialog').hidden=true;
  if(name==='create')enterRoom('create');if(name==='join')enterRoom('join');if(name==='leave')leaveRoom();if(name==='map')requestMap();
  if(name==='fullscreen')toggleFullscreen(toast);
  if(name==='touch-toggle'){ui.touch=!ui.touch;save('goatesque-touch',ui.touch);document.documentElement.dataset.touch=ui.touch?'on':'off';button.setAttribute('aria-pressed',String(ui.touch));clearHeld();}
  if(name==='invite'&&room){const url=new URL(location.href);url.hash=`room=${room.code}`;navigator.clipboard?.writeText(url.href).then(()=>toast('Invite link copied.')).catch(()=>toast(`Room ${room.code}`));}
  if(name==='touch-player'){touchPlayer=1-touchPlayer;$('touch-player').textContent=touchPlayer?'Red':'White';}
 });
 on($('world'),'click',()=>{if(ui.screen==='title'&&!busy())start();});
 on($('world'),'wheel',event=>{if(ui.screen==='map'&&!busy()){event.preventDefault();native.manualScroll=true;native.scroll=Math.max(0,Math.min(1820,native.scroll+event.deltaY*1920/$('world').clientWidth));}},{passive:false});
 for(const button of document.querySelectorAll('#touch-controls [data-touch]')){
  const pointers=new Map(),name=button.dataset.touch;
  on(button,'pointerdown',event=>{event.preventDefault();const player=mode==='local'?touchPlayer:mine();if(ui.screen!=='play'||busy())return;audio.unlock();if(name==='rewind'&&engine.level.rewindEnabled===false){toast('Rewind unlocks at the rewind tutorial. Hold Q, Shift or ↶ once it unlocks.');return;}if(name==='lock'&&!engine.players[player].canLock){toast('Camera locking unlocks at its tutorial.');return;}if(name==='switch'&&engine.level.switchEnabled===false){toast('Screen switching unlocks at its tutorial.');return;}button.setPointerCapture(event.pointerId);pointers.set(event.pointerId,player);if(['left','right','rewind'].includes(name))touch[player][name]=true;else if(name==='switch'){for(const i of mode==='local'?[0,1]:[player]){touch[i].switchHeld=true;inputs[i].switch++;}}else inputs[player][name]++;button.classList.add('pressed');});
  const release=event=>{const player=pointers.get(event.pointerId);if(player===undefined)return;pointers.delete(event.pointerId);if(['left','right','rewind'].includes(name)&&![...pointers.values()].includes(player))touch[player][name]=false;if(name==='switch'&&!pointers.size)for(const i of mode==='local'?[0,1]:[player])touch[i].switchHeld=false;if(!pointers.size)button.classList.remove('pressed');};on(button,'pointerup',release);on(button,'pointercancel',release);on(button,'lostpointercapture',release);
 }
 const fullscreenChange=()=>{const active=!!(document.fullscreenElement||document.webkitFullscreenElement);$('fullscreen-button').setAttribute('aria-label',active?'Exit fullscreen':'Enter fullscreen');$('fullscreen-button').setAttribute('aria-pressed',String(active));};on(document,'fullscreenchange',fullscreenChange);on(document,'webkitfullscreenchange',fullscreenChange);
 const invite=new URLSearchParams(location.hash.slice(1));if(invite.has('room')){$('room-code').value=invite.get('room');$('online-dialog').hidden=false;}
 $('loading').hidden=true;raf=requestAnimationFrame(animate);
 window.goatesque={engine,renderer,inputs,ui,native,assets,audio,net:{guestCommands,get server(){return lastHostState;},get connection(){return connection;},protocol:INPUT_PROTOCOL},get transition(){return transition;},get mode(){return mode;},get room(){return room;},loadLevel,playLocal,startLevel,action,enterRoom,confirmCompletion,requestMap,destroy(){cancelAnimationFrame(raf);connection?.stop();audio.destroy();cleanup.forEach(fn=>fn());clearTimeout(toastTimer);}};
}
