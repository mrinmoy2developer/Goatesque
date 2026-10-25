const noise=(x,y)=>{const n=Math.sin(x*127.1+y*311.7)*43758.5453;return n-Math.floor(n);};
const colors=["#ca8a64","#e7debd"];
export class Renderer {
  constructor(canvas){this.canvas=canvas;this.ctx=canvas.getContext("2d");this.time=0;this.flash=0;this.reduced=matchMedia("(prefers-reduced-motion: reduce)").matches;}
  render(engine,dt=16){
    const cv=this.canvas,c=this.ctx;this.time+=this.reduced?0:dt*.001;
    const width=cv.clientWidth,height=cv.clientHeight,dpr=Math.min(devicePixelRatio||1,2);
    if(cv.width!==Math.round(width*dpr)||cv.height!==Math.round(height*dpr)){cv.width=Math.round(width*dpr);cv.height=Math.round(height*dpr);}
    c.setTransform(cv.width/1920,0,0,cv.height/1080,0,0);
    c.fillStyle="#172525";c.fillRect(0,0,1920,1080);
    for(let view=0;view<2;view++){
      const camera=engine.cameras[view];c.save();c.beginPath();c.rect(view*960,0,960,1080);c.clip();
      c.translate(view*960,0);c.scale(960/camera.w,1080/camera.h);c.translate(-camera.x,-camera.y);
      this.background(camera,view);
      this.scenery(engine,camera,view);
      const x0=Math.floor(camera.x/64)-1,x1=Math.ceil((camera.x+camera.w)/64)+1,y0=Math.floor(camera.y/64)-1,y1=Math.ceil((camera.y+camera.h)/64)+1;
      for(let y=y0;y<=y1;y++)for(let x=x0;x<=x1;x++){
        const v=engine.level.grid[y]?.[x]??1;
        if(v===1||v===7&&!engine.broken.includes(y*engine.level.width+x))this.stone(x,y,v,engine,view);
        if(v===5||v===6){c.save();c.globalAlpha=engine.tile(x,y,view)?1:.17;this.stone(x,y,v,engine,view);c.restore();}
      }
      for(const b of engine.blocks){
        c.fillStyle="#69756c";c.fillRect(b.x-b.w/2,b.y-b.h/2,b.w,b.h);c.strokeStyle="#d6d2b5";c.lineWidth=4;c.strokeRect(b.x-b.w/2+5,b.y-b.h/2+5,b.w-10,b.h-10);
        c.strokeStyle="#939e8d";c.lineWidth=2;this.diamond(b.x,b.y,Math.min(b.w,b.h)*.25);
      }
      for(let i=0;i<engine.level.gates.length;i++)this.gate(engine.level.gates[i],engine.players.filter(p=>p.gate===i).length);
      for(let i=0;i<2;i++){
        const p=engine.players[i];if(p.gate>=0)continue;
        c.save();if(p.view!==view)c.globalAlpha=.18;this.player(p,i,engine.tick);c.restore();
        if(engine.cameras.every(c=>c.locked)&&p.view!==view){const from=engine.cameras[p.view],to=camera,ratio=to.h/from.h;const x=p.view===0?to.x+(p.x-from.x-from.w)*ratio:to.x+to.w+(p.x-from.x)*ratio;const y=to.y+(p.y-from.y)*ratio;this.player({...p,x,y,scale:p.scale*ratio},i,engine.tick);}
      }
      c.restore();
      c.save();c.translate(view*960,0);
      const shade=c.createRadialGradient(480,550,260,480,550,800);shade.addColorStop(0,"transparent");shade.addColorStop(1,"#06111388");c.fillStyle=shade;c.fillRect(0,0,960,1080);
      c.fillStyle=colors[view];c.globalAlpha=.8;c.font="17px system-ui";c.letterSpacing="3px";c.fillText(`0${view+1}  /  ${engine.players.find(p=>p.owner===view)?.owner===view?(engine.players.indexOf(engine.players.find(p=>p.owner===view))===0?"EMBER":"IVORY"):"VIEW"}`,40,55);
      if(camera.locked){c.font="17px system-ui";c.textAlign="right";c.fillText("◇  LOCKED",920,55);}
      c.restore();
    }
    const joined=engine.cameras.every(c=>c.locked);c.strokeStyle=joined?"#e9cb86":"#111b1c";c.lineWidth=joined?3:10;c.beginPath();c.moveTo(960,0);c.lineTo(960,1080);c.stroke();
    if(joined){c.strokeStyle="#e9cb8630";c.lineWidth=30;c.stroke();for(let y=20;y<1080;y+=80){c.fillStyle="#ecd89a";c.beginPath();c.arc(960,y,2,0,Math.PI*2);c.fill();}}
  }
  background(camera,view){
    const c=this.ctx;const g=c.createLinearGradient(0,camera.y,0,camera.y+camera.h);g.addColorStop(0,"#263636");g.addColorStop(.55,"#34413d");g.addColorStop(1,"#1b2b2b");c.fillStyle=g;c.fillRect(camera.x,camera.y,camera.w,camera.h);
    const x0=Math.floor(camera.x/192),y0=Math.floor(camera.y/128);
    c.lineWidth=2;
    for(let y=y0;y<(camera.y+camera.h)/128;y++)for(let x=x0;x<(camera.x+camera.w)/192;x++){
      c.strokeStyle=`rgba(141,154,137,${.025+noise(x,y)*.025})`;c.strokeRect(x*192+(y%2)*96,y*128,192,128);
    }
    if(!this.reduced)for(let i=0;i<24;i++){const x=camera.x+noise(i,view)*camera.w,y=camera.y+((noise(i,6)*camera.h-this.time*(8+noise(i,1)*15))%camera.h+camera.h)%camera.h;c.fillStyle=`rgba(232,215,164,${.05+noise(i,3)*.12})`;c.fillRect(x,y,2,2);}
  }
  scenery(engine,camera,view){
    const c=this.ctx,grid=engine.level.grid;
    for(let y=Math.floor(camera.y/64)-5;y<(camera.y+camera.h)/64+2;y++)for(let x=Math.floor(camera.x/64)-2;x<(camera.x+camera.w)/64+2;x++){
      if(grid[y]?.[x]!==1||grid[y-1]?.[x]!==0)continue;
      if(x%6===0&&[1,2,3,4].every(n=>grid[y-n]?.[x]===0)){
        const px=x*64+32,py=y*64;c.fillStyle="#a7ad973b";c.fillRect(px-19,py-256,38,256);c.fillStyle="#c9ccb045";c.fillRect(px-27,py-264,54,12);c.fillRect(px-27,py-12,54,12);
        c.strokeStyle="#c7c9ac22";c.lineWidth=2;for(let k=-12;k<20;k+=8){c.beginPath();c.moveTo(px+k,py-248);c.lineTo(px+k,py-18);c.stroke();}
      }
      if(x%8===3&&grid[y-3]?.[x]===0){
        const px=x*64+32,py=y*64-150;c.fillStyle="#1b2827";c.fillRect(px-7,py,14,46);
        const glow=c.createRadialGradient(px,py,1,px,py,190);glow.addColorStop(0,"#edb66b30");glow.addColorStop(1,"transparent");c.fillStyle=glow;c.fillRect(px-190,py-190,380,380);
        c.fillStyle="#e8c78e";c.beginPath();c.ellipse(px,py-6,5+Math.sin(this.time*5+x)*1,12,0,0,7);c.fill();
      }
    }
  }
  stone(x,y,v,engine,view){
    const c=this.ctx,px=x*64,py=y*64,n=noise(x,y);const hue=v===7?38:v===5?27:v===6?45:115;
    const light=v===7?46:42+n*9;c.fillStyle=`hsl(${hue} ${v===1?8:17}% ${light}%)`;c.fillRect(px,py,64,64);
    c.strokeStyle="#26343166";c.lineWidth=2;c.strokeRect(px+.6,py+.6,63,63);
    c.fillStyle="#ecedcb0c";c.fillRect(px+5,py+5,50+n*8,5);
    c.fillStyle="#15222018";c.fillRect(px+6,py+50,50,10);
    if(n>.72){c.strokeStyle="#263e3744";c.lineWidth=1.5;c.beginPath();c.moveTo(px+37,py+5);c.lineTo(px+30,py+23);c.lineTo(px+44,py+35);c.stroke();}
    if(v===7){c.strokeStyle="#3b4034";c.lineWidth=3;c.beginPath();c.moveTo(px+32,py);c.lineTo(px+20,py+25);c.lineTo(px+40,py+42);c.lineTo(px+30,py+64);c.stroke();}
    const top=!engine.tile(x,y-1,view),bottom=!engine.tile(x,y+1,view),left=!engine.tile(x-1,y,view),right=!engine.tile(x+1,y,view);
    if(top){c.fillStyle="#d5d4b9";c.fillRect(px,py,64,9);c.fillStyle="#a7b19b";c.fillRect(px,py+10,64,9);c.strokeStyle="#627968";c.lineWidth=2;
      for(let k=0;k<64;k+=16){c.beginPath();c.moveTo(px+k,py+16);c.lineTo(px+k,py+12);c.lineTo(px+k+10,py+12);c.lineTo(px+k+10,py+17);c.lineTo(px+k+5,py+17);c.stroke();}
      c.fillStyle="#111f2444";c.fillRect(px,py-9,64,9);
    }
    c.fillStyle="#acb39c";if(left)c.fillRect(px,py,7,64);if(right)c.fillRect(px+57,py,7,64);if(bottom){c.fillStyle="#384f43";c.fillRect(px,py+57,64,7);}
    if(v===5||v===6){c.strokeStyle=v===5?"#d2916a":"#e4dbb6";c.lineWidth=2;this.diamond(px+32,py+32,13);}
  }
  diamond(x,y,r){const c=this.ctx;c.beginPath();c.moveTo(x,y-r);c.lineTo(x+r,y);c.lineTo(x,y+r);c.lineTo(x-r,y);c.closePath();c.stroke();}
  gate(g,used){
    const c=this.ctx,w=g.capacity===2?128:90;const x=g.x,y=g.y;
    const glow=c.createRadialGradient(x,y-65,10,x,y-65,180);glow.addColorStop(0,used?"#f6dfa04d":"#bfc8a52b");glow.addColorStop(1,"transparent");c.fillStyle=glow;c.fillRect(x-180,y-245,360,360);
    c.fillStyle="#172728";c.beginPath();c.moveTo(x-w/2,y);c.lineTo(x-w/2,y-125);c.quadraticCurveTo(x,y-205,x+w/2,y-125);c.lineTo(x+w/2,y);c.closePath();c.fill();c.strokeStyle="#acb49a";c.lineWidth=10;c.stroke();
    c.strokeStyle="#647b6c";c.lineWidth=3;c.strokeRect(x-w/2-13,y-130,w+26,130);c.fillStyle="#d6cc9e";c.fillRect(x-w/2-18,y-7,w+36,7);
    c.fillStyle=used?"#ead49e":"#abb99c";for(let i=0;i<g.capacity;i++){c.beginPath();c.arc(x+(i-(g.capacity-1)/2)*25,y-64,6,0,7);c.fill();}
    c.fillStyle="#d6d0ac88";c.textAlign="center";c.font="13px system-ui";c.letterSpacing="3px";c.fillText("EXIT",x,y-220);c.textAlign="left";
  }
  player(p,i,tick){
    const c=this.ctx,s=p.scale,bob=p.ground?Math.sin(tick*.25)*Math.min(Math.abs(p.vx)*.25,2):0;
    c.save();c.translate(p.x,p.y+bob);c.scale(p.face*s,s);
    c.fillStyle="#081c1a44";c.beginPath();c.ellipse(0,47,27,6,0,0,7);c.fill();
    const stride=p.ground?Math.sin(tick*.28)*Math.min(Math.abs(p.vx),8):4;
    c.strokeStyle=i===0?"#9d684d":"#b9b291";c.lineWidth=12;c.lineCap="round";c.beginPath();c.moveTo(-10,20);c.lineTo(-13+stride,43);c.moveTo(10,20);c.lineTo(13-stride,43);c.stroke();
    c.fillStyle=colors[i];c.beginPath();c.moveTo(-19,-17);c.quadraticCurveTo(-30,2,-22,26);c.quadraticCurveTo(0,37,23,23);c.lineTo(18,-20);c.closePath();c.fill();
    c.fillStyle=i===0?"#da9a73":"#f0e8ca";c.beginPath();c.ellipse(0,-23,22,21,.1,0,7);c.fill();
    c.fillStyle=i===0?"#e9d7b5":"#c4ac7e";c.beginPath();c.moveTo(-16,-34);c.quadraticCurveTo(-37,-50,-30,-64);c.quadraticCurveTo(-24,-49,-11,-43);c.closePath();c.fill();c.beginPath();c.moveTo(14,-36);c.quadraticCurveTo(33,-51,27,-62);c.quadraticCurveTo(22,-49,9,-43);c.closePath();c.fill();
    c.fillStyle=i===0?"#b87759":"#d9cfa9";c.beginPath();c.ellipse(17,-17,12,9,-.1,0,7);c.fill();c.fillStyle="#253432";c.beginPath();c.arc(12,-30,2.4,0,7);c.fill();
    c.strokeStyle=i===0?"#79543e":"#9a9277";c.lineWidth=6;c.beginPath();c.moveTo(-17,-3);c.lineTo(-26,16);c.stroke();
    c.strokeStyle="#253e36";c.lineWidth=5;c.beginPath();c.moveTo(-24,15);c.quadraticCurveTo(0,23,24,11);c.stroke();
    c.restore();
  }
}
