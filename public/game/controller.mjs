import {Engine,emptyInput} from './engine.mjs';
import {Renderer} from './renderer.mjs';
import {loadAssets} from './assets.mjs';
import {RoomConnection,roomRequest} from './network.mjs';

const $=id=>document.getElementById(id);
export async function boot(){
  const generation=(window.dyoBoot||0)+1;window.dyoBoot=generation;window.dyo?.destroy?.();
  const [levels,assets]=await Promise.all([fetch('/game/levels.json').then(r=>{if(!r.ok)throw new Error('Level download failed. Reload to try again.');return r.json();}),loadAssets((loaded,total)=>{$('loading').textContent=`Loading original DYO artwork… ${Math.round(loaded/total*100)}%`;})]);
  if(window.dyoBoot!==generation)return;
  const engine=new Engine(levels),renderer=new Renderer($('world'),assets);
  let started=false,paused=false,mode='local',room=null,roomConnection=null,active=0,raf=0,last=0,accumulator=0,frame=0,hostInput=emptyInput(),remoteInput=emptyInput(),history=[],peerOnline=false,sound=false,audio=null,toastTimer=null,serial=engine.serial,remotePaused=false;
  const remoteMotion={left:0,right:0};
  const inputs=[emptyInput(),emptyInput()];
  let completed=[];try{completed=JSON.parse(localStorage.getItem('dyo-completed')||'[]');}catch{}
  const on=(element,type,handler)=>{element.addEventListener(type,handler);cleanup.push(()=>element.removeEventListener(type,handler));};const cleanup=[];
  function toast(text){$('toast').textContent=text;$('toast').hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').hidden=true,3500);}
  function modal(id,show=true){if(show)for(const el of document.querySelectorAll('.dialog'))if(el.id!==id)el.hidden=true;$(id).hidden=!show;paused=show;inputs.forEach(i=>{i.left=false;i.right=false;});if(show)$(id).querySelector('button,input')?.focus();}
  function resetInputs(){for(const i of inputs)Object.assign(i,{...emptyInput(),leftFrames:0,rightFrames:0});remoteInput=emptyInput();hostInput=emptyInput();history=[];remoteMotion.left=0;remoteMotion.right=0;}
  function loadLevel(index){engine.load(index);for(let i=0;i<2;i++){const input=mode==='host'&&i===1?remoteInput:inputs[i];Object.assign(engine.players[i],{lastJump:input.jump||0,lastLock:input.lock||0,lastRestart:input.restart||0,lastGate:input.gate||0});inputs[i].left=false;inputs[i].right=false;}history=[];serial=engine.serial;updateUi();}
  function updateUi(){
    $('stage-number').textContent=String(engine.index+1).padStart(2,'0');$('stage-name').textContent=levels[engine.index].name;
    $('progress').style.width=`${(engine.index+1)/levels.length*100}%`;
    $('chapter').textContent=engine.index<10?'THE ENTRANCE':engine.index<22?'THE LABYRINTH':'NEW PERSPECTIVES';
    const help=engine.index===0?'Jump together onto the cracked bridge. Your combined weight opens a way down.':engine.index===1?'Find the two doorways. Press F or Enter to step inside.':engine.index<5?'Stand still, lock both cameras, then cross the golden seam into the other view.':engine.level.blocks.length?'Push the stone blocks to create a path. Use the seam to move between distant places.':engine.index>21?'The two views have different scales. Crossing the seam changes your size.':'Rearrange the path by locking, crossing, and unlocking your views.';
    $('hint-text').textContent=help;
    $('level-grid').innerHTML=levels.map((l,i)=>`<button data-level="${i}" class="level-cell ${i===engine.index?'current':''} ${completed.includes(i)?'complete':''}" ${mode==='guest'?'disabled':''}><span>${String(i+1).padStart(2,'0')}</span><small>${l.name}</small>${completed.includes(i)?'<b>✓</b>':''}</button>`).join('');
  }
  function playLocal(){roomConnection?.leave();roomConnection=null;room=null;mode='local';$('room-bar').hidden=true;$('menu').hidden=true;started=true;paused=false;resetInputs();$('world').focus();toast('Player 1: WASD · Player 2: arrow keys. Press Space to lock both views.');}
  async function enterRoom(action){
    const button=$(action==='create'?'create-room':'join-room');button.disabled=true;$('room-error').textContent='';
    try {
      const session=await roomRequest({action,code:$('room-code').value.trim().toUpperCase()});
      roomConnection?.stop();room=session;mode=session.role;resetInputs();
      if(mode==='host')loadLevel(engine.index);
      const me=mode==='guest'?1:0;active=me;
      roomConnection=new RoomConnection(session,data=>{
        if(mode==='host'){if((data.input?.seq||0)<(remoteInput.seq||0)){remoteMotion.left=0;remoteMotion.right=0;Object.assign(engine.players[1],{lastJump:0,lastLock:0,lastRestart:0,lastGate:0});}remoteInput=data.input||emptyInput();}
        else if(data.state?.players){
          const changed=engine.serial!==data.state.serial||engine.index!==data.state.index;
          engine.restore(data.state);hostInput=data.state.hostInput||emptyInput();remotePaused=!!data.state.paused;
          if(changed){history=[];$('win-dialog').hidden=!engine.won;updateUi();} if(engine.won && $('win-dialog').hidden)engine.events.push({type:'win'});
          const ack=data.state.guestSeq||0;history=history.filter(h=>h.seq>ack).slice(-24);
          if(!paused&&!remotePaused)for(const h of history)engine.step([hostInput,h]);
          handleEvents();
        }
      },status=>{peerOnline=status.connected;$('connection-label').textContent=status.error||(status.connected?`Connected · ${status.latency} ms`:'Waiting for your friend');$('connection-dot').classList.toggle('connected',status.connected);});
      roomConnection.start(()=>mode==='host'?{state:{...engine.snapshot(),paused,hostInput:{...inputs[0]},guestSeq:remoteInput.seq||0}}:{input:{...inputs[1],seq:frame}});
      $('menu').hidden=true;$('online-dialog').hidden=true;$('room-bar').hidden=false;$('room-display').textContent=session.code;$('your-player').textContent=mode==='host'?'You are Player 1':'You are Player 2';started=true;paused=false;
      $('mode-label').textContent='ONLINE CO-OP';$('world').focus();toast(mode==='host'?'Share the room link with your friend.':'Joined! Use WASD or the arrow keys to move Player 2.');
    }catch(error){$('room-error').textContent=error.message;}
    finally{button.disabled=false;}
  }
  function note(frequency,duration=.08,volume=.035){if(!sound)return;try{audio ||= new AudioContext();const osc=audio.createOscillator(),gain=audio.createGain();osc.type='sine';osc.frequency.value=frequency;gain.gain.setValueAtTime(volume,audio.currentTime);gain.gain.exponentialRampToValueAtTime(.001,audio.currentTime+duration);osc.connect(gain);gain.connect(audio.destination);osc.start();osc.stop(audio.currentTime+duration);}catch{}}
  function handleEvents(){
    for(const event of engine.events.splice(0)){
      if(event.type==='lock'){note(event.locked?330:220,.16);}
      if(event.type==='jump')note(190,.1,.018);
      if(event.type==='cross')note(550,.16,.025);
      if(event.type==='gate')note(660,.3);
      if(event.type==='denied')toast('Stand on solid ground to lock. To unlock, return to separate views and step away from the seam.');
      if(event.type==='win'){
        if(!completed.includes(engine.index)){completed.push(engine.index);try{localStorage.setItem('dyo-completed',JSON.stringify(completed));}catch{}}
        $('win-title').textContent=engine.index===levels.length-1?'Together, you found a way.':'Another way forward.';
        $('next-level').textContent=engine.index===levels.length-1?'Return to the entrance':'Enter the next chamber →';
        $('next-level').disabled=mode==='guest';$('win-note').textContent=mode==='guest'?'Your host will open the next chamber.':`Chamber ${String(engine.index+1).padStart(2,'0')} complete`;
        $('win-dialog').hidden=false;updateUi();note(440,.4);setTimeout(()=>note(660,.5),160);
      }
    }
  }
  function key(event,down){
    if(event.target instanceof HTMLInputElement||event.target instanceof HTMLTextAreaElement)return;
    if(event.code==='Escape'&&down){if(!started)return;if(!$('menu').hidden){$('menu').hidden=true;paused=false;return;}modal('pause-dialog',$('pause-dialog').hidden);return;}
    if(!started||paused)return;
    const keys=['KeyA','KeyD','KeyW','KeyS','KeyF','KeyQ','KeyE','ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Enter','ShiftLeft','ShiftRight','ControlRight','Space','KeyR','Tab','KeyB'];
    if(!keys.includes(event.code))return;event.preventDefault();
    const single=mode!=='local';let idx=single?(mode==='guest'?1:0):(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Enter','ShiftLeft','ShiftRight','ControlRight'].includes(event.code)?1:active);const input=inputs[idx];
    if(event.code==='KeyA'||event.code==='ArrowLeft')input.left=down;
    if(event.code==='KeyD'||event.code==='ArrowRight')input.right=down;
    if(!down||event.repeat)return;
    if(event.code==='KeyF'||event.code==='Enter')input.gate++;
    if(event.code==='KeyW'||event.code==='ArrowUp')input.jump++;
    if(event.code==='KeyS'||event.code==='ArrowDown')input.lock++;
    if(event.code==='Space'){if(single)input.lock++;else{inputs[0].lock++;inputs[1].lock++;}}
    if(event.code==='KeyR'){if(mode==='guest')input.restart++;else loadLevel(engine.index);}
    if(['KeyQ','KeyB','ShiftLeft','ShiftRight'].includes(event.code)){if(mode==='guest')toast('Ask your host to rewind with Q.');else engine.rewind();}
    if(event.code==='Tab'){active=1-active;toast(`WASD now controls ${active?'Player 2':'Player 1'}.`);}
    if(event.code==='KeyE'||event.code==='ControlRight'){if(mode==='guest')toast('Ask your host to swap views with E.');else{const [a,b]=engine.cameras;engine.cameras=[b,a];engine.players.forEach(p=>{p.view=1-p.view;p.owner=1-p.owner;});}}
  }
  function animate(now){
    const dt=last?Math.min(now-last,100):16.667;last=now;accumulator+=dt;
    if(started&&!paused&&!(mode==='guest'&&remotePaused)){
      while(accumulator>=1000/60){
        frame++;
        const peer={...remoteInput};if(mode==='host')for(const direction of ['left','right']){peer[direction]=!!remoteInput[direction]||(remoteInput[direction+'Frames']||0)>remoteMotion[direction];if(peer[direction])remoteMotion[direction]++;}
        const pair=mode==='guest'?[hostInput,inputs[1]]:mode==='host'?[inputs[0],peer]:inputs;
        if(mode==='guest'){for(const direction of ['left','right'])if(inputs[1][direction])inputs[1][direction+'Frames']=(inputs[1][direction+'Frames']||0)+1;history.push({...inputs[1],seq:frame});if(history.length>120)history.shift();}
        engine.step(pair);accumulator-=1000/60;
      }
      handleEvents();
    }else accumulator=0;
    renderer.render(engine,dt);
    for(let i=0;i<2;i++){$(`lock-${i}`).textContent=engine.cameras[engine.players[i].owner].locked?'◇ Locked':'○ Following';$(`lock-${i}`).classList.toggle('locked',engine.cameras[engine.players[i].owner].locked);}
    const both=engine.cameras.every(c=>c.locked);$('seam-state').textContent=both?'THE SEAM IS OPEN':'TWO VIEWS · ONE LABYRINTH';$('seam-state').classList.toggle('open',both);
    
    raf=requestAnimationFrame(animate);
  }
  on(document,'keydown',e=>key(e,true));on(document,'keyup',e=>key(e,false));
  on(window,'blur',()=>inputs.forEach(i=>{i.left=false;i.right=false;}));
  on(document,'click',event=>{
    const b=event.target.closest('[data-action],[data-level]');if(!b)return;
    if(b.dataset.level!==undefined&&mode!=='guest'){loadLevel(Number(b.dataset.level));modal('levels-dialog',false);$('win-dialog').hidden=true;if(!started)playLocal();return;}
    switch(b.dataset.action){
      case 'local':playLocal();break;
      case 'online':modal('online-dialog');break;
      case 'create':enterRoom('create');break;
      case 'join':enterRoom('join');break;
      case 'close':modal(b.closest('.dialog').id,false);if(!started)$('menu').hidden=false;break;
      case 'levels':modal('levels-dialog');updateUi();break;
      case 'help':modal('help-dialog');break;
      case 'pause':modal('pause-dialog');break;
      case 'resume':modal('pause-dialog',false);break;
      case 'restart':if(mode==='guest')inputs[1].restart++;else loadLevel(engine.index);modal('pause-dialog',false);$('win-dialog').hidden=true;break;
      case 'rewind':if(mode==='guest')toast('Your host can rewind with Q.');else engine.rewind();break;
      case 'next':if(mode!=='guest'){loadLevel((engine.index+1)%levels.length);$('win-dialog').hidden=true;paused=false;}break;
      case 'sound':sound=!sound;$('sound-button').textContent=sound?'Sound on':'Sound off';$('sound-button').setAttribute('aria-pressed',String(sound));if(sound)note(440,.1);break;
      case 'fullscreen':if(document.fullscreenElement)document.exitFullscreen?.();else $('game-shell').requestFullscreen?.();break;
      case 'invite':{const url=new URL(location.href);url.hash=`room=${room.code}`;navigator.clipboard?.writeText(url.href).then(()=>toast('Invite link copied. Send it to your friend.')).catch(()=>toast(`Room code: ${room.code}`));break;}
      case 'leave':roomConnection?.leave();roomConnection=null;room=null;mode='local';$('room-bar').hidden=true;$('pause-dialog').hidden=true;$('menu').hidden=false;started=false;paused=false;$('mode-label').textContent='LOCAL CO-OP';break;
      case 'select-player':active=1-active;$('touch-player').textContent=active?'Player 2':'Player 1';break;
    }
  });
  for(const button of document.querySelectorAll('[data-touch]')){
    const action=button.dataset.touch;
    const touch=(event,down)=>{event.preventDefault();if(!started||paused)return;const i=mode==='guest'?1:mode==='host'?0:active,input=inputs[i];if(action==='left'||action==='right')input[action]=down;else if(down){input[action]++;}button.classList.toggle('pressed',down);};
    on(button,'pointerdown',event=>{button.setPointerCapture(event.pointerId);touch(event,true);});on(button,'pointerup',event=>touch(event,false));on(button,'pointercancel',event=>touch(event,false));
  }
  const hash=new URLSearchParams(location.hash.slice(1));if(hash.has('room')){$('room-code').value=hash.get('room');modal('online-dialog');}
  $('loading').hidden=true;updateUi();raf=requestAnimationFrame(animate);
  window.dyo={engine,renderer,inputs,get mode(){return mode;},get room(){return room;},loadLevel,playLocal,destroy(){cancelAnimationFrame(raf);roomConnection?.stop();cleanup.forEach(f=>f());clearTimeout(toastTimer);}};
}
