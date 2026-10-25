export class OriginalAudio {
 constructor(manifest){this.manifest=manifest;this.sounds=true;this.music=true;this.unlocked=false;this.scene='title';this.playing=null;this.current=null;this.effects=new Map();}
 unlock(){this.unlocked=true;this.setScene(this.scene);}
 effect(name,volume=.4){if(!this.sounds||!this.unlocked||!this.manifest[name])return;let source=this.effects.get(name);if(!source){source=new Audio(this.manifest[name]);source.preload='auto';this.effects.set(name,source);}const audio=source.cloneNode();audio.volume=volume;audio.play().catch(()=>{});}
 setScene(scene){this.scene=scene;const name=scene==='title'||scene==='input'?'sdMusicTitle':scene==='map'?'sound65_Level_Select_180202_1':null;if(this.current===name){if(this.playing)this.playing.muted=!this.music;return;}this.playing?.pause();this.current=name;this.playing=null;if(name&&this.music&&this.unlocked&&this.manifest[name]){this.playing=new Audio(this.manifest[name]);this.playing.loop=true;this.playing.volume=.35;this.playing.play().catch(()=>{});}}
 toggleMusic(){this.music=!this.music;if(this.playing)this.playing.muted=!this.music;else{this.current=null;this.setScene(this.scene);}}
 setRewinding(active){active=!!(active&&this.sounds&&this.unlocked&&this.manifest.sdRewind);if(active===!!this.rewindActive)return;this.rewindActive=active;if(!active){this.rewindAudio?.pause();return;}if(!this.rewindAudio){this.rewindAudio=new Audio(this.manifest.sdRewind);this.rewindAudio.loop=true;this.rewindAudio.volume=.25;}this.rewindAudio.play().catch(()=>{});}
 destroy(){this.playing?.pause();this.rewindAudio?.pause();}
}
