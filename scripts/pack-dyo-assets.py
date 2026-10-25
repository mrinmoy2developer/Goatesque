"""Pack exported DYO PNG frames losslessly, preserving pixels and sprite origins.
Usage: python pack-dyo-assets.py EXPORT_DIRECTORY OUTPUT_DIRECTORY
Requires Pillow. EXPORT_DIRECTORY contains metadata.json and Sprites/*.png.
"""
from pathlib import Path
from PIL import Image
import hashlib,json,sys,shutil
source=Path(sys.argv[1]);output=Path(sys.argv[2]);output.mkdir(parents=True,exist_ok=True)
metadata=json.loads((source/'metadata.json').read_text());entries=[];sprites={}
for sprite in metadata['sprites']:
 if sprite['name'] in ['mCol','mPlayer','sprite101','sprWall','sprButton'] or ('--include-ui' not in sys.argv and sprite['name'].startswith(('sprCred','sprMinoPleb','sprLevelSelect','sprButton','sprUI','sprInput','sprHUD','sprEditor','sprFullscreen','sprMute','sprControls'))):continue
 sprites[sprite['name']]={k:sprite[k] for k in ['width','height','originX','originY']};sprites[sprite['name']]['frames']=[None]*sprite['frames']
 for frame in range(sprite['frames']):
  path=source/'Sprites'/f"{sprite['name']}_{frame}.png"
  if path.exists():
   image=Image.open(path).convert('RGBA');entries.append((sprite['name'],frame,image))
entries.sort(key=lambda e:(-e[2].height,-e[2].width,e[0],e[1]))
pages=[];current=Image.new('RGBA',(2048,2048));x=y=row=0;positions=[]
def save_page():
 index=len(pages);temp=output/f'page-{index}.png';current.save(temp,optimize=True)
 data=temp.read_bytes();name=f"atlas-{index}-{hashlib.sha256(data).hexdigest()[:12]}.png";target=output/name
 # Keep the deterministic intermediate in research, only copy final pages to output.
 target.write_bytes(data);pages.append({'url':'/game/assets/'+name,'sha256':hashlib.sha256(data).hexdigest(),'bytes':len(data)})
for name,frame,image in entries:
 pad=0 if max(image.size)>=2048 else 1
 if x+image.width+pad*2>2048:x=0;y+=row;row=0
 if y+image.height+pad*2>2048:save_page();current=Image.new('RGBA',(2048,2048));x=y=row=0
 current.paste(image,(x+pad,y+pad));sprites[name]['frames'][frame]=[len(pages),x+pad,y+pad,image.width,image.height]
 x+=image.width+pad*2;row=max(row,image.height+pad*2)
if entries:save_page()
manifest={'source':'DYO official Windows upload1536745','sourceSHA256':'5c85ac4c17c95db84239f26e12675448c7673336b26acfacee0db66772d0b2bc','pages':pages,'sprites':sprites,'objects':metadata['objects'],'spriteNames':[s['name'] for s in metadata['sprites']]}
(output/'manifest.json').write_text(json.dumps(manifest,separators=(',',':'))+'\n')
print(json.dumps({'sprites':len(sprites),'frames':len(entries),'pages':len(pages),'bytes':sum(p['bytes'] for p in pages)}))
