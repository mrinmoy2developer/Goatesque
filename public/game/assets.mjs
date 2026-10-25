export async function loadAssets(progress=()=>{}){
  if(window.dyoOriginalAssets)return window.dyoOriginalAssets;
  window.dyoOriginalAssets=(async()=>{
    const [manifest,renderMap,uiLayout,controls,audioManifest]=await Promise.all([
      fetch('/game/assets/manifest.json').then(r=>{if(!r.ok)throw Error('Could not load the original artwork. Reload to retry.');return r.json();}),
      fetch('/game/assets/render-map.json').then(r=>r.json()),
      fetch('/game/assets/ui-layout.json').then(r=>r.json()),
      fetch('/game/assets/controls.json').then(r=>r.json()),
      fetch('/game/audio/manifest.json').then(r=>r.json()),
    ]);
    const inputBackground=new Image();inputBackground.src='/game/assets/input-background.png';await inputBackground.decode();
    let loaded=0;
    const images=await Promise.all(manifest.pages.map(async page=>{
      const image=new Image();image.decoding='async';image.src=page.url;
      await image.decode();progress(++loaded,manifest.pages.length);return image;
    }));
    const spriteNames=manifest.spriteNames||Object.keys(manifest.sprites);
    return {manifest,renderMap,uiLayout,controls,audioManifest,inputBackground,images,sprites:manifest.sprites,spriteNames,
      draw(ctx,name,frame,x,y,sx=1,sy=sx,rotation=0,alpha=1){
        const sprite=manifest.sprites[name];if(!sprite)return false;
        const count=sprite.frames.length,index=((Math.floor(frame)%count)+count)%count,region=sprite.frames[index];if(!region)return false;
        const [page,tx,ty,w,h]=region;
        ctx.save();ctx.globalAlpha*=alpha;ctx.translate(x,y);if(rotation)ctx.rotate(rotation*Math.PI/180);ctx.scale(sx,sy);
        ctx.drawImage(images[page],tx,ty,w,h,-sprite.originX,-sprite.originY,w,h);ctx.restore();return true;
      },
    };
  })();
  try{return await window.dyoOriginalAssets;}catch(error){delete window.dyoOriginalAssets;throw error;}
}
