import {boot} from './controller.mjs';
boot().catch(error=>{const el=document.getElementById('loading');if(el)el.textContent=error.message;console.error(error);});
