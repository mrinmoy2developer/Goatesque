export async function toggleFullscreen(toast=()=>{}){
 const root=document.documentElement,active=document.fullscreenElement||document.webkitFullscreenElement;
 try{
  if(active){const exit=document.exitFullscreen||document.webkitExitFullscreen;if(exit)await exit.call(document);try{screen.orientation?.unlock?.();}catch{}return;}
  const enter=root.requestFullscreen||root.webkitRequestFullscreen;
  if(!enter){toast('For full screen on this browser, use Share → Add to Home Screen, then open Goatesque from there.');return;}
  await enter.call(root);try{await screen.orientation?.lock?.('landscape');}catch{}
 }catch{toast('Full screen was unavailable. You can also add Goatesque to your Home Screen.');}
}
