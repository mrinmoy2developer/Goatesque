export async function roomRequest(payload,signal) {
  const response=await fetch("/api/rooms",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(payload),cache:"no-store",signal});
  const result=await response.json();if(!response.ok){const error=new Error(result.error||"Could not connect to the room.");error.status=response.status;throw error;}return result;
}
export class RoomConnection {
  constructor(session,onData,onStatus){this.session=session;this.onData=onData;this.onStatus=onStatus;this.running=false;this.failures=0;this.timer=null;this.controllers=new Set();this.sent=0;this.delivered=0;}
  start(payload){this.running=true;this.payload=payload;this.tick();}
  tick(){if(!this.running)return;this.poll();clearTimeout(this.timer);this.timer=setTimeout(()=>this.tick(),50);}
  requestSoon(){if(!this.running)return;clearTimeout(this.timer);this.timer=setTimeout(()=>this.tick(),0);}
  async poll(){
    if(!this.running||this.controllers.size>=3)return;
    const start=performance.now(),controller=new AbortController(),order=++this.sent;this.controllers.add(controller);const timeout=setTimeout(()=>controller.abort(),5000);
    try {const data=await roomRequest({...this.session,action:"sync",...this.payload()},controller.signal);if(!this.running||order<=this.delivered)return;this.delivered=order;this.failures=0;this.onData(data);this.onStatus({connected:data.connected,latency:Math.round(performance.now()-start),error:null});}
    catch(error){if(this.running&&order>this.delivered){this.failures++;const closed=error.status===403||error.status===404;this.onStatus({connected:false,closed,error:closed||this.failures>2?error.message:"Reconnecting…"});if(closed)this.stop();}}
    finally{clearTimeout(timeout);this.controllers.delete(controller);}
  }
  async leave(){this.stop();try{await roomRequest({...this.session,action:"leave"});}catch{}}
  stop(){this.running=false;clearTimeout(this.timer);for(const controller of this.controllers)controller.abort();}
}
