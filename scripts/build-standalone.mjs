// Build the same game UI without a framework runtime or server dependencies.
import {readFile,mkdir,cp,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
const root=resolve(import.meta.dirname,'..'),output=resolve(root,'outputs/goatesque');
await mkdir(output,{recursive:true});
await cp(resolve(root,'public'),resolve(output,'public'),{recursive:true});
const page=await readFile(resolve(root,'app/page.tsx'),'utf8');
let main=page.match(/return (<main[\s\S]*<\/main>);}/)?.[1];
if(!main)throw Error('Could not locate the game UI. Update the standalone builder for the new page structure.');
main=main.replace(/<GameBoot\s*\/>/g,'').replaceAll('className=','class=').replaceAll('htmlFor=','for=').replace(/(\w+)=\{(true|false|\d+)\}/g,'$1="$2"');
main=main.replace(/<([a-z][a-z0-9]*)([^>]*?)\/>/g,(_,tag,attrs)=>['input','br','img','hr','meta','link'].includes(tag)?`<${tag}${attrs}>`:`<${tag}${attrs}></${tag}>`);
if(/[{}]/.test(main))throw Error('Unexpected JSX expression in the standalone UI.');
const html=`<!doctype html>\n<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Goatesque · Two worlds. One way out.</title><meta name="description" content="Explore a shifting labyrinth together in Goatesque, a local and online co-op puzzle platformer."><meta name="theme-color" content="#101412"><link rel="icon" href="/favicon.svg"><link rel="stylesheet" href="/style.css"></head><body>${main}<script type="module" src="/game/start.mjs"></script></body></html>\n`;
await writeFile(resolve(output,'public/index.html'),html);
await writeFile(resolve(output,'public/style.css'),(await readFile(resolve(root,'app/globals.css'),'utf8')).replace('@import "tailwindcss";',''));
for(const file of ['relay.py','goatesque.service','goatesque.nginx.conf','activate-public.sh'])await cp(resolve(root,'deploy/ludia',file),resolve(output,file));
console.log(output);
