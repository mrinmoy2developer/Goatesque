export async function roomRequest(payload,signal) {
  const response=await fetch('/api/rooms',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload),cache:'no-store',signal});
  const result=await response.json();if(!response.ok){const error=new Error(result.error||'Could not connect to the room.');error.status=response.status;throw error;}return result;
}
export class RoomConnection {
  constructor(session,onData,onStatus,options={}){
    Object.assign(this,{session,onData,onStatus,running:false,failures:0,timer:null,controllers:new Set(),sent:0,delivered:0,streamActive:false,streamController:null,streamRetry:null,streamWatchdog:null,lastStreamAt:0,latency:0});
    this.useStream=options.stream??(typeof window!=='undefined'&&typeof ReadableStream!=='undefined');
    this.useSocket=options.socket??(typeof window!=='undefined'&&typeof WebSocket!=='undefined');this.socket=null;this.socketActive=false;this.socketRetry=null;this.lastPing=0;this.lastSocketAt=0;
  }
  get transport(){return this.socketActive?'websocket':this.streamActive?'stream':'poll';}
  start(payload){this.running=true;this.payload=payload;if(this.useSocket)this.openSocket();else if(this.useStream)this.openStream();this.tick();}
  tick(){if(!this.running)return;this.poll();clearTimeout(this.timer);this.timer=setTimeout(()=>this.tick(),this.socketActive?1000/30:this.streamActive?Math.max(1000/30,this.latency/4):50);}
  requestSoon(){if(!this.running)return;clearTimeout(this.timer);this.timer=setTimeout(()=>this.tick(),0);}
  status(data,error=null){this.onStatus({connected:!!data.connected,latency:this.latency,transport:this.transport,error,closed:!!data.closed});}
  openSocket(){
    if(!this.running||this.socket)return;const url=new URL('/api/rooms/socket',location.href);url.protocol=url.protocol==='https:'?'wss:':'ws:';
    const socket=new WebSocket(url);this.socket=socket;const timeout=setTimeout(()=>socket.close(),2500);
    socket.onopen=()=>socket.send(JSON.stringify({...this.session,action:'watch'}));socket.onerror=()=>{};
    socket.onmessage=event=>{try{const data=JSON.parse(event.data);this.lastSocketAt=performance.now();if(Number.isFinite(data.pong)){this.latency=Math.round(performance.now()-data.pong);return;}if(data.error){this.status(data,data.error);if(data.closed)this.stop();return;}if(!data.state)return;clearTimeout(timeout);this.socketActive=true;this.streamController?.abort();clearTimeout(this.streamRetry);this.streamActive=false;this.failures=0;this.onData(data);this.status(data);}catch{/* A malformed message cannot modify simulation state. */}};
    socket.onclose=()=>{clearTimeout(timeout);this.fallbackSocket(socket);};
  }
  fallbackSocket(socket){if(this.socket!==socket)return;this.socket=null;this.socketActive=false;if(this.running){if(this.useStream)this.openStream();this.requestSoon();this.socketRetry=setTimeout(()=>this.openSocket(),10000);}}
  async openStream(){
    if(!this.running||this.streamController||this.socketActive)return;
    const controller=new AbortController();this.streamController=controller;const connectTimeout=setTimeout(()=>controller.abort(),5000);
    try{
      const response=await fetch('/api/rooms',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...this.session,action:'watch'}),cache:'no-store',signal:controller.signal});
      clearTimeout(connectTimeout);if(!response.ok||!response.body||!response.headers.get('content-type')?.startsWith('text/event-stream'))throw new Error('State streaming is unavailable.');
      this.streamActive=true;this.lastStreamAt=performance.now();this.requestSoon();
      this.streamWatchdog=setInterval(()=>{if(performance.now()-this.lastStreamAt>3000)controller.abort();},500);
      const reader=response.body.getReader(),decoder=new TextDecoder();let buffer='';
      while(this.running){const{value,done}=await reader.read();if(done)break;buffer+=decoder.decode(value,{stream:true});if(buffer.length>262144)throw new Error('Invalid state stream.');let end;
        while((end=buffer.indexOf('\n\n'))>=0){const event=buffer.slice(0,end);buffer=buffer.slice(end+2);const line=event.split('\n').find(line=>line.startsWith('data:'));if(!line)continue;this.lastStreamAt=performance.now();const data=JSON.parse(line.slice(5));if(data.closed){this.status(data,data.error);this.stop();return;}this.failures=0;this.onData(data);this.status(data);}
      }
    }catch{/* HTTP polling remains available while the persistent stream reconnects. */}
    finally{clearTimeout(connectTimeout);clearInterval(this.streamWatchdog);this.streamWatchdog=null;controller.abort();if(this.streamController===controller)this.streamController=null;this.streamActive=false;if(this.running&&!this.socketActive){this.requestSoon();this.streamRetry=setTimeout(()=>this.openStream(),2000);}}
  }
  async poll(){
    if(this.running&&this.socketActive){const now=performance.now();if(now-this.lastSocketAt>3000){const stale=this.socket;stale.close();this.fallbackSocket(stale);return;}if(this.socket.bufferedAmount<8192){this.socket.send(JSON.stringify({action:'sync',...this.payload()}));if(now-this.lastPing>1000){this.lastPing=now;this.socket.send(JSON.stringify({action:'ping',id:now}));}}return;}
    if(!this.running||this.controllers.size>=(this.streamActive?5:3))return;
    const start=performance.now(),controller=new AbortController(),order=++this.sent,streaming=this.streamActive;this.controllers.add(controller);const timeout=setTimeout(()=>controller.abort(),5000);
    try{const data=await roomRequest({...this.session,action:'sync',...this.payload(),streaming},controller.signal);if(!this.running||order<=this.delivered)return;this.delivered=order;this.failures=0;this.latency=Math.round(performance.now()-start);if(!streaming&&!this.streamActive)this.onData(data);this.status(data);}
    catch(error){if(this.running&&order>this.delivered){this.failures++;const closed=error.status===403||error.status===404;this.onStatus({connected:false,closed,transport:this.transport,error:closed||this.failures>2?error.message:'Reconnecting…'});if(closed)this.stop();}}
    finally{clearTimeout(timeout);this.controllers.delete(controller);}
  }
  async leave(){this.stop();try{await roomRequest({...this.session,action:'leave'});}catch{}}
  stop(){this.running=false;clearTimeout(this.timer);clearTimeout(this.streamRetry);clearTimeout(this.socketRetry);clearInterval(this.streamWatchdog);this.streamController?.abort();this.streamActive=false;this.socketActive=false;this.socket?.close();for(const controller of this.controllers)controller.abort();}
}
