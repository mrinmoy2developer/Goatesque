export class HeadTransition {
 constructor(target,{completion=false,automatic=false,id=0}={}){Object.assign(this,{target,completion,automatic,id,fade:0,direction:1,waiting:false,confirmed:false});}
 static opening(id=0){const t=new HeadTransition(null,{id});t.fade=1;t.direction=-1;return t;}
 static restore(state){if(!state)return null;return Object.assign(new HeadTransition(state.target),state);}
 confirm(restartTarget){if(!this.waiting)return false;this.waiting=false;this.confirmed=true;if(restartTarget)this.target=restartTarget;return true;}
 advance(frames=1){
  if(this.waiting)return null;
  this.fade+=.05*this.direction*frames;
  if(this.direction<0){if(this.fade<=0){this.fade=0;return {type:'opened'};}return null;}
  if(this.completion&&!this.automatic&&!this.confirmed&&this.fade>=1.2){this.fade=1.2;this.waiting=true;return {type:'waiting'};}
  if(this.fade>=(this.completion?2:1.9)-1e-8)return {type:'change',target:this.target};
  return null;
 }
 snapshot(){return {...this};}
}
export function nodeUnlocked(index,completedRooms){
 if(index===0)return true;
 if(index===18||index===22)return completedRooms.has(15);
 if(index===27)return completedRooms.has(23)&&completedRooms.has(21);
 if(index===28)return completedRooms.has(31)&&completedRooms.has(30);
 return completedRooms.has(index+3);
}
export function mapScrollTarget(index){return index<11?1820:index>25||index===17?40:1000;}
