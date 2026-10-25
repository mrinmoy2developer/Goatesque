// Architectural edge selection reconstructed from the original tile neighborhoods.
export function edgeType(grid,x,y){
 const solid=(x,y)=>grid[y]?.[x]===1?1:0;
 if(!solid(x,y))return null;
 const top=solid(x-1,y-1)+solid(x,y-1)+solid(x+1,y-1);
 const down=solid(x-1,y+1)+solid(x,y+1)+solid(x+1,y+1);
 const middle=solid(x-1,y)+solid(x,y)+solid(x+1,y);
 if(!solid(x-1,y)||!solid(x+1,y)){
  if(top===3||top===0)return top===0&&middle===2?'floor':'top';
  if(down===3||down===0)return 'bottom';
  if(!solid(x,y-2)&&top>1)return 'top';
  return 'pillar';
 }
 if(top===2||!solid(x,y-1))return 'floor';
 return null;
}
