export class Gamepads {
 constructor(constants){this.constants=constants;this.previous=new Map();this.directions={};}
 pressed(pad,index){const down=!!pad?.buttons[index]?.pressed,key=`${pad?.index}:${index}`,previous=this.previous.get(key)||false;this.next.set(key,down);return down&&!previous;}
 held(pad,index){return !!pad?.buttons[index]?.pressed;}
 poll(mode,localPlayer=0,online=false){
  this.next=new Map();const pads=Array.from(navigator.getGamepads?.()||[]).filter(Boolean),one=pads[0],result=[{},{}];
  const axis=(pad,index)=>Number(pad?.axes[index]||0);
  for(let i=0;i<2;i++){
   let pad,mapping;if(online){pad=one;mapping=this.constants.gamepad.oneControllerEach;}
   else if(mode===0){pad=one;mapping=this.constants.gamepad.oneSharedController[i===0?'white':'red'];}
   else if(mode===1){pad=pads[i];mapping=this.constants.gamepad.oneControllerEach;}
   else if(mode===2&&i===0){pad=one;mapping=this.constants.gamepad.oneControllerEach;}else continue;
   if(!pad||online&&i!==localPlayer)continue;
   const axes=mapping.horizontalAxis!==undefined?[mapping.horizontalAxis]:mapping.horizontalAxes;
   const x=axes.map(n=>axis(pad,n)).find(x=>Math.abs(x)>.5)||0;
   const pressed=index=>this.pressed(pad,index),held=index=>this.held(pad,index);
   result[i]={left:x<-.5,right:x>.5,jump:pressed(mapping.jumpButton),lock:(mapping.lockButtons||[mapping.lockButton]).map(pressed).some(Boolean),switch:(mapping.switchButtons||[mapping.switchButton]).map(pressed).some(Boolean),switchHeld:(mapping.switchButtons||[mapping.switchButton]).some(held),rewind:held(mapping.rewindButton),gate:pressed(mapping.gateButton)};
  }
  const confirm=this.constants.gamepad.menuConfirmButtons.map(index=>this.pressed(one,index)).some(Boolean);
  const back=this.pressed(one,8);
  const raw={left:axis(one,0)<-.5||this.held(one,14),right:axis(one,0)>.5||this.held(one,15),up:axis(one,1)<-.5||this.held(one,12),down:axis(one,1)>.5||this.held(one,13)};
  const navigation=Object.entries(raw).filter(([key,value])=>value&&!this.directions[key]).map(([key])=>key);this.directions=raw;
  for(const [key,value]of this.next)this.previous.set(key,value);
  return {players:result,confirm,back,navigation,connected:pads.length};
 }
}
