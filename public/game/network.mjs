export async function roomRequest(payload,signal) {
  const response=await fetch("/api/rooms",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(payload),cache:"no-store",signal});
  const result=await response.json();if(!response.ok){const error=new Error(result.error||"Could not connect to the room.");error.status=response.status;throw error;}return result;
}
export class RoomConnection {
  constructor(session,onData,onStatus){this.session=session;this.onData=onData;this.onStatus=onStatus;this.running=false;this.failures=0;this.timer=null;this.controller=null;}
  start(payload){this.running=true;this.payload=payload;this.poll();}
  async poll(){
    if(!this.running)return;
    const start=performance.now();this.controller=new AbortController();const timeout=setTimeout(()=>this.controller?.abort(),5000);
    try {const data=await roomRequest({...this.session,action:"sync",...this.payload()},this.controller.signal);if(!this.running)return;this.failures=0;this.onData(data);this.onStatus({connected:data.connected,latency:Math.round(performance.now()-start),error:null});}
    catch(error){if(this.running){this.failures++;const closed=error.status===403||error.status===404;this.onStatus({connected:false,closed,error:closed||this.failures>2?error.message:"Reconnecting…"});if(closed)this.stop();}}
    finally{clearTimeout(timeout);if(this.running)this.timer=setTimeout(()=>this.poll(),Math.max(0,100-(performance.now()-start)));}
  }
  async leave(){this.stop();try{await roomRequest({...this.session,action:"leave"});}catch{}}
  stop(){this.running=false;clearTimeout(this.timer);this.controller?.abort();}
}
