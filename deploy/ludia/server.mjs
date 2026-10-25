// Dependency-free authoritative Goatesque server. Node 16+.
import http from 'node:http';
import {randomBytes,timingSafeEqual} from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {performance} from 'node:perf_hooks';
const PROTOCOL=3,alphabet='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const count=(n,max=1e9)=>Number.isFinite(Number(n))?Math.max(0,Math.min(max,Math.floor(Number(n)))):0;
const error=(status,message)=>Object.assign(new Error(message),{status});
const equal=(a,b)=>typeof a==='string'&&typeof b==='string'&&Buffer.byteLength(a)===Buffer.byteLength(b)&&timingSafeEqual(Buffer.from(a),Buffer.from(b));
const input=source=>({protocol:source?.protocol===PROTOCOL?PROTOCOL:0,packet:count(source?.packet,1e12),epoch:count(source?.epoch),stream:count(source?.stream),jump:count(source?.jump),lock:count(source?.lock),gate:count(source?.gate),switch:count(source?.switch),restart:count(source?.restart),menu:count(source?.menu),confirm:count(source?.confirm),frames:Array.isArray(source?.frames)?source.frames.slice(0,180).filter(f=>Array.isArray(f)&&f.length===7).map(f=>f.map((n,i)=>count(n,i===0?1e12:i===1?15:1e9))):[]});
export class AuthoritativeRooms {
 constructor({Engine,HostCommands,levels,maxRooms=4,now=()=>Date.now()}){Object.assign(this,{Engine,HostCommands,levels,maxRooms,now});this.rooms=new Map();this.frame=0;}
 collect(room){for(const event of room.engine.events.splice(0))room.events.push({seq:++room.eventSeq,epoch:room.engine.serial,event});room.events=room.events.slice(-64);}
 tick(){this.frame++;const now=this.now();for(const [code,r]of this.rooms){if(now-r.seen[0]>120000){this.rooms.delete(code);continue;}if(r.meta.paused||r.meta.presentation?.screen!=='play'||now-r.seen[0]>5000||r.tokens[1]&&now-r.seen[1]>5000)continue;const batches=r.commands.map(q=>q.batch(r.engine,now));r.engine.step(batches.map(commands=>commands[0]),batches);this.collect(r);r.revision++;}}
 request(body){
  if(!body||typeof body!=='object'||Array.isArray(body))throw error(400,'Invalid request.');const now=this.now();
  for(const[code,r]of this.rooms)if(now-r.seen[0]>120000)this.rooms.delete(code);
  if(body.action==='create'){
   if(this.rooms.size>=this.maxRooms)throw error(503,'All rooms are in use. Please try again shortly.');
   let code;do{code=Array.from(randomBytes(8),b=>alphabet[b%alphabet.length]).join('');}while(this.rooms.has(code));
   const token=randomBytes(48).toString('hex'),engine=new this.Engine(this.levels);this.rooms.set(code,{engine,tokens:[token,null],seen:[now,0],packet:[-1,-1],commands:[new this.HostCommands(0),new this.HostCommands(1)],meta:{paused:true,presentation:{screen:'map',selected:0,completed:[],inputMode:3}},lastLoad:0,revision:0,events:[],eventSeq:0,latest:[{},{}],peer:0});return{code,token,role:'host'};
  }
  const code=String(body.code||'').toUpperCase().replace(/\s/g,'');if(!/^[A-Z2-9]{8}$/.test(code))throw error(400,'Enter the 8-character room code.');const r=this.rooms.get(code);if(!r)throw error(404,'Room expired. Create a new room.');
  if(body.action==='join'){if(now-r.seen[0]>30000)throw error(409,'This room is offline.');if(r.tokens[1])throw error(409,'This room already has two players.');const token=randomBytes(48).toString('hex');r.tokens[1]=token;r.packet[1]=-1;r.seen[1]=now;r.latest[1]={};r.peer++;r.commands[1].reset(r.engine.serial);return{code,token,role:'guest'};}
  const role=equal(body.token,r.tokens[0])?0:equal(body.token,r.tokens[1])?1:-1;if(role<0)throw error(403,'Room session expired. Please rejoin.');
  if(body.action==='leave'){if(role===0)this.rooms.delete(code);else{r.tokens[1]=null;r.seen[1]=0;r.packet[1]=-1;r.latest[1]={};r.peer++;r.commands[1].reset(r.engine.serial);}return{ok:true};}
  if(body.action!=='sync')throw error(400,'Unknown room action.');const controls=input(body.input);if(controls.protocol!==PROTOCOL)throw error(409,'Goatesque has been updated. Both players must refresh and create a new room.');r.seen[role]=now;
  if(controls.packet>r.packet[role]){
   r.packet[role]=controls.packet;
   r.latest[role]=controls;
   if(role===0){
    if(body.load&&count(body.load.id)>r.lastLoad){const index=count(body.load.index,this.levels.length-1);r.lastLoad=count(body.load.id);r.engine.load(index);r.commands.forEach(q=>q.reset(r.engine.serial));this.collect(r);}
    if(body.presentation&&typeof body.presentation==='object'&&!Array.isArray(body.presentation))r.meta={paused:!!body.paused,presentation:body.presentation};
   }
   r.commands[role].ingest(controls,r.engine.serial,now);r.commands[role].applyBaseline(r.engine);r.revision++;
  }
  const q=r.commands[role];return{connected:!!r.tokens[1-role]&&now-r.seen[1-role]<5000,revision:r.revision,guestSession:r.peer,remoteInput:role===0?r.latest[1]:undefined,serverTime:now,state:{...r.engine.snapshot(),protocol:PROTOCOL,hostFrame:this.frame,paused:r.meta.paused||now-r.seen[0]>5000||!!r.tokens[1]&&now-r.seen[1]>5000,presentation:r.meta.presentation,guestAck:q.ack,guestStream:q.stream,guestResync:q.resync,queuedFrames:q.frames.size,loadAck:r.lastLoad,events:r.events}};
 }
}
export function createGameServer({root,...options}){
 const rooms=new AuthoritativeRooms(options),resolved=path.resolve(root),mime={'.html':'text/html; charset=utf-8','.css':'text/css','.mjs':'text/javascript','.json':'application/json','.svg':'image/svg+xml','.png':'image/png','.m4a':'audio/mp4','.ttf':'font/ttf'};
 const server=http.createServer(async(req,res)=>{
  const send=(status,body)=>{if(res.destroyed)return;const bytes=Buffer.from(JSON.stringify(body));res.writeHead(status,{'Content-Type':'application/json','Content-Length':bytes.length,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(bytes);};
  try{
   const url=new URL(req.url,'http://localhost');if(url.pathname==='/api/health'){send(200,{ok:true,game:'Goatesque',protocol:PROTOCOL,simulation:'server'});return;}
   if(url.pathname==='/api/rooms'&&req.method==='POST'){
    if(req.headers.origin&&new URL(req.headers.origin).host!==req.headers.host)throw error(403,'Invalid request origin.');if(!String(req.headers['content-type']).startsWith('application/json'))throw error(415,'Send JSON requests.');if(Number(req.headers['content-length'])>24000)throw error(413,'Request too large.');
    const chunks=[];let length=0;for await(const chunk of req){length+=chunk.length;if(length>24000)throw error(413,'Request too large.');chunks.push(chunk);}let body;try{body=JSON.parse(Buffer.concat(chunks).toString());}catch{throw error(400,'Invalid JSON request.');}send(200,rooms.request(body));return;
   }
   if(req.method!=='GET'&&req.method!=='HEAD')throw error(404,'Not found.');const name=decodeURIComponent(url.pathname);if(name.split('/').some(part=>part.startsWith('.')))throw error(404,'Not found.');const file=path.resolve(resolved,'.'+(name==='/'?'/index.html':name));if(!file.startsWith(resolved+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile())throw error(404,'Not found.');const stat=fs.statSync(file);res.writeHead(200,{'Content-Type':mime[path.extname(file)]||'application/octet-stream','Content-Length':stat.size,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});if(req.method==='HEAD')res.end();else fs.createReadStream(file).pipe(res);
  }catch(e){send(e.status||500,{error:e.status?e.message:'The room server could not complete that request.'});}
 });
 let last=performance.now(),accumulator=0;const timer=setInterval(()=>{const now=performance.now();accumulator+=Math.min(100,now-last);last=now;let steps=0;while(accumulator>=1000/60&&steps++<6){rooms.tick();accumulator-=1000/60;}},4);timer.unref();server.on('close',()=>clearInterval(timer));server.requestTimeout=5000;server.headersTimeout=6000;server.maxConnections=32;return{server,rooms};
}
async function main(){const args=process.argv.slice(2),value=(key,fallback)=>{const i=args.indexOf(key);return i<0?fallback:args[i+1];},root=path.resolve(value('--public',fileURLToPath(new URL('./public',import.meta.url))));const{Engine}=await import(pathToFileURL(path.join(root,'game/engine.mjs')).href),{HostCommands}=await import(pathToFileURL(path.join(root,'game/input-stream.mjs')).href),levels=JSON.parse(fs.readFileSync(path.join(root,'game/levels.json')));const{server}=createGameServer({root,Engine,HostCommands,levels,maxRooms:4});server.listen(Number(value('--port',8792)),value('--host','127.0.0.1'),()=>console.log('Goatesque authoritative server listening on '+server.address().port));for(const signal of['SIGTERM','SIGINT'])process.on(signal,()=>server.close(()=>process.exit()));}
if(process.argv[1]&&pathToFileURL(fs.realpathSync(process.argv[1])).href===import.meta.url)main().catch(e=>{console.error(e.message);process.exitCode=1;});
