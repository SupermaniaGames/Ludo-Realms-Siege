'use strict';
/* Ludo Realms: Siege & Vassalage — standalone game (pass & play) */
const $=s=>document.querySelector(s);
const CS=48,M=84,SZ=12,W=SZ*CS+2*M,px=v=>M+v*CS;
const RN=['Aqua','Forest','Desert','Mountain'];
const RC=['#1f7fe0','#2e9d3a','#e8a020','#d6402f'];
const TINT=[['#d7eaff','#c3dcf6'],['#dcf1cf','#c9e6b8'],['#fdebc2','#f4d9a2'],['#f9d4cb','#efbdb1']];
const KN={Q:'Queen',R:'Rook',B:'Bishop',N:'Knight',P:'Pawn',K:'King'};
const GATE=[2,3,8,9];                       // the 2-tile gates (rows in the vertical wall, columns in the horizontal wall)
const home=r=>({dx:r&1?-1:1,dy:r>1?-1:1,cx:r&1?11:0,cy:r>1?11:0});
const realmAt=(x,y)=>(x>5?1:0)+(y>5?2:0);
const promoTiles=r=>{const h=home(r);return[[h.cx+h.dx,h.cy],[h.cx,h.cy+h.dy],[h.cx+h.dx,h.cy+h.dy]]};

/* ---------- piece art: shaded silhouettes on a round plinth ---------- */
const SH={
 P:'<circle cx="20" cy="15" r="6.5"/><ellipse cx="20" cy="23" rx="9" ry="2.8"/><path d="M13 43Q15 33 17.5 25.5L22.5 25.5Q25 33 27 43Z"/>',
 R:'<path d="M11 12h4v3.5h3.5V12h3v3.5H25V12h4v9l-3 2.5 1.5 18h-15L14 23.5 11 21z"/><path d="M10.5 43l2-4h15l2 4z"/>',
 B:'<path d="M20 5C28 11 30 20 26.5 25.5L24.5 28H15.5L13.5 25.5C10 20 12 11 20 5Z"/><rect x="11.5" y="27.5" width="17" height="3.5" rx="1.7"/><path d="M14.5 31h11Q26 38 29 43H11Q14 38 14.5 31Z"/><circle cx="20" cy="4.5" r="2.6"/>',
 N:'<path d="M11.5 43C11.5 35 15 30 19 26.5C14 25.5 10.5 21.5 10.5 17.5L16 8 18 10.5 22 5.5 24 9C30.5 13 30.5 22 29.5 28 28.5 34 28.5 39 28.5 43Z"/>',
 Q:'<path d="M13 43Q14 34 16.5 27L9.5 13.5 16 19 20 8 24 19 30.5 13.5 23.5 27Q26 34 27 43Z"/><ellipse cx="20" cy="26.5" rx="8" ry="2.6"/>',
 K:'<rect x="18" y="1" width="4" height="12" rx="1.4"/><rect x="14" y="4.5" width="12" height="4" rx="1.4"/><path d="M13 43Q14 34 16 27Q12.5 24 14 20Q17 16.5 20 16.5Q23 16.5 26 20Q27.5 24 24 27Q26 34 27 43Z"/><ellipse cx="20" cy="26.5" rx="8" ry="2.6"/>'
};
const gem=(x,y,r)=>`<circle cx="${x}" cy="${y}" r="${r}" fill="#ffd54a" stroke="#7a5600" stroke-width=".8"/>`;
const EX={
 B:'<path d="M17.5 14l5.5 6" fill="none" stroke="#fff" stroke-width="1.7" stroke-linecap="round" opacity=".85"/>',
 N:'<circle cx="19" cy="14.5" r="1.5" fill="#fff"/><path d="M22 10Q26 16 25 24" fill="none" stroke="#0004" stroke-width="1.2"/>',
 Q:gem(9.5,12.5,2.3)+gem(20,6.5,2.3)+gem(30.5,12.5,2.3),
 K:gem(20,21,2.3)
};
function buildDefs(){
 let s=`<defs><linearGradient id="shade" x1="0" x2="1" y1="0" y2="0"><stop offset="0" stop-color="#fff" stop-opacity=".6"/><stop offset=".38" stop-color="#fff" stop-opacity="0"/><stop offset=".72" stop-color="#000" stop-opacity=".1"/><stop offset="1" stop-color="#000" stop-opacity=".52"/></linearGradient>
 <linearGradient id="bshade" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".5"/><stop offset="1" stop-color="#000" stop-opacity=".25"/></linearGradient>
 <g id="base"><ellipse cx="20" cy="48" rx="18" ry="5" fill="#0004"/>
  <ellipse cx="20" cy="46" rx="16.5" ry="6" style="fill:color-mix(in srgb,var(--c) 40%,#000)"/>
  <ellipse cx="20" cy="43.8" rx="16.5" ry="6" style="fill:var(--c);stroke:#0008;stroke-width:1"/>
  <ellipse cx="20" cy="43.8" rx="16.5" ry="6" fill="url(#bshade)"/>
  <ellipse cx="20" cy="43.2" rx="11.5" ry="3.6" fill="none" stroke="#fff" stroke-opacity=".55" stroke-width="1"/></g>`;
 for(const k in SH)s+=`<g id="s-${k}">${SH[k]}</g><g id="pc-${k}"><use href="#base"/><use href="#s-${k}" style="fill:var(--c);stroke:color-mix(in srgb,var(--c) 38%,#000);stroke-width:1.3;stroke-linejoin:round"/><use href="#s-${k}" fill="url(#shade)"/>${EX[k]||''}</g>`;
 $('#defs').innerHTML=s+'</defs>';
}
const tok=(k,c,x,y,s)=>`<g style="--c:${c}" transform="translate(${x},${y}) scale(${s})"><use href="#pc-${k}"/></g>`;
const icon=(k,c)=>`<svg viewBox="0 0 40 56" style="--c:${c}"><use href="#pc-${k}"/></svg>`;

/* ---------- state ---------- */
let G=null,pieces=[],walls=new Set(),timer=0,uid=1;
const at=(x,y)=>pieces.find(p=>p.x==x&&p.y==y);
const cur=()=>G.players[G.turn];
const alive=r=>G.players.includes(r)&&!G.dead.has(r);
const count=r=>pieces.filter(p=>p.o==r).length;
const nm=r=>RN[r];

function mk(r,k,lx,ly){const h=home(r);return{id:uid++,k,o:r,x:h.cx+h.dx*lx,y:h.cy+h.dy*ly,dx:h.dx,dy:h.dy,haven:false}}
function newGame(np){
 const players=np==2?[0,3]:np==3?[0,1,3]:[0,1,2,3];
 walls=new Set();pieces=[];
 for(let i=0;i<SZ;i++){if(!GATE.includes(i)){walls.add('v,'+i);walls.add('h,'+i)}}
 // Queen on the corner, Rook below, Bishop beside, Knight at C1, Pawns at C2 C3 A3 B3
 players.forEach(r=>[['Q',0,0],['R',0,1],['B',1,0],['N',2,0],['P',2,1],['P',2,2],['P',0,2],['P',1,2]].forEach(([k,a,b])=>pieces.push(mk(r,k,a,b))));
 G={players,turn:0,phase:'roll',roll:null,msg:'',last:null,sel:null,dead:new Set(),promo:null};
 render();
}

/* ---------- walls & movement ---------- */
function edgeOpen(x1,y1,x2,y2){
 if(y1==y2&&((x1==5&&x2==6)||(x1==6&&x2==5)))return!walls.has('v,'+y1);
 if(x1==x2&&((y1==5&&y2==6)||(y1==6&&y2==5)))return!walls.has('h,'+x1);
 return true;
}
function stepOpen(x,y,nx,ny){
 if(x==nx||y==ny)return edgeOpen(x,y,nx,ny);
 return(edgeOpen(x,y,nx,y)&&edgeOpen(nx,y,nx,ny))||(edgeOpen(x,y,x,ny)&&edgeOpen(x,ny,nx,ny));
}
const inB=(x,y)=>x>=0&&y>=0&&x<SZ&&y<SZ;
const ORTH=[[1,0],[-1,0],[0,1],[0,-1]],DIAG=[[1,1],[1,-1],[-1,1],[-1,-1]];
function moves(p,roll){
 const out=[],n=Math.min(roll,4);
 const slide=(dirs,max,cap)=>{for(const[dx,dy]of dirs){let x=p.x,y=p.y;for(let s=1;s<=max;s++){
  const nx=x+dx,ny=y+dy;if(!inB(nx,ny)||!stepOpen(x,y,nx,ny))break;
  const o=at(nx,ny);if(o){if(cap&&o.o!==p.o&&!o.haven)out.push([nx,ny]);break}
  if(cap!==2)out.push([nx,ny]);x=nx;y=ny}}};
 if(p.k=='Q')slide(ORTH.concat(DIAG),n,1);
 else if(p.k=='R')slide(ORTH,n,1);
 else if(p.k=='B')slide(DIAG,n,1);
 else if(p.k=='N'){for(const[a,b]of[[1,2],[2,1],[-1,2],[-2,1],[1,-2],[2,-1],[-1,-2],[-2,-1]]){
  const nx=p.x+a,ny=p.y+b;if(!inB(nx,ny))continue;const o=at(nx,ny);if(o&&(o.o===p.o||o.haven))continue;out.push([nx,ny])}}
 else if(p.k=='P'){
  slide([[p.dx,0],[0,p.dy]],Math.min(n,2),0);          // forward steps, no capture
  const nx=p.x+p.dx,ny=p.y+p.dy;                        // diagonal capture
  if(inB(nx,ny)&&stepOpen(p.x,p.y,nx,ny)){const o=at(nx,ny);if(o&&o.o!==p.o&&!o.haven)out.push([nx,ny])}
 }
 return out;
}
const bombTargets=()=>({walls:[...walls],havens:pieces.filter(p=>p.haven&&p.o!==cur())});

/* ---------- turn flow ---------- */
function roll(){
 if(!G||G.phase!='roll')return;
 const r=1+Math.random()*6|0;G.roll=r;G.sel=null;G.msg='';
 if(r<=4){if(!pieces.some(p=>p.o==cur()&&moves(p,r).length))return noMove();G.phase='pick'}
 else if(r==5){const t=bombTargets();if(!t.walls.length&&!t.havens.length)return noMove();G.phase='bomb'}
 else{if(!pieces.some(p=>p.o==cur()&&!p.haven))return noMove();G.phase='haven'}
 render();
}
function noMove(){G.msg=nm(cur())+' rolled '+G.roll+': no move';G.phase='wait';render();timer=setTimeout(endTurn,1200)}
function endTurn(){
 clearTimeout(timer);
 const al=G.players.filter(alive);
 if(al.length<=1){G.phase='over';render();return win(al[0])}
 let i=G.turn;do{i=(i+1)%G.players.length}while(!alive(G.players[i]));
 G.turn=i;G.phase='roll';G.roll=null;G.sel=null;render();
}
function eliminate(r,why){G.dead.add(r);pieces=pieces.filter(q=>q.o!==r);G.msg=nm(r)+' falls: '+why+'!'}
function doMove(p,x,y){
 const o=at(x,y);G.last=[[p.x,p.y],[x,y]];G.msg='';
 if(o){pieces.splice(pieces.indexOf(o),1);G.msg=nm(p.o)+' captured a '+KN[o.k]}
 p.x=x;p.y=y;p.haven=false;G.sel=null;
 for(const r of G.players){const h=home(r);if(alive(r)&&r!=p.o&&x==h.cx&&y==h.cy)eliminate(r,'palace gate stormed')}
 if(o&&alive(o.o)&&!count(o.o))eliminate(o.o,'army destroyed');
 if(p.k=='P'&&G.players.some(r=>alive(r)&&r!=p.o&&promoTiles(r).some(([a,b])=>a==x&&b==y))){
  G.phase='promo';G.promo=p.id;render();return promoDialog(p);
 }
 endTurn();
}
function promoDialog(p){
 const b=['Q','R','B','N'].map(k=>`<button data-k="${k}">${icon(k,RC[p.o])}${KN[k]}</button>`).join('');
 modal('♟ Pawn promotion','Your Pawn reached an enemy palace. Choose its new rank:','<div class="pick">'+b+'</div>',[]);
 $('#mb').onclick=e=>{const t=e.target.closest('button');if(!t)return;p.k=t.dataset.k;closeModal();G.msg='Promoted to '+KN[p.k]+'!';endTurn()};
}
function win(r){
 modal('🏆 '+nm(r)+' wins!','The last kingdom standing.','',[{t:'Play again',c:'primary',f:()=>newGame(G.players.length)},{t:'Menu',f:toMenu}]);
}

/* ---------- surrender ---------- */
function surrender(){
 if(!G||G.phase!='roll')return;
 const c=G.players.filter(r=>alive(r)&&r!=cur()&&count(r)<=3);
 if(!c.length)return modal('Not yet','You can only demand surrender from a kingdom with 3 pieces or fewer.','',[{t:'OK',c:'primary'}]);
 modal('🏳 Demand surrender','Choose the kingdom:','',c.map(r=>({t:nm(r)+' ('+count(r)+')',f:()=>confirmSurrender(r)})).concat([{t:'Cancel'}]));
}
function confirmSurrender(t){
 const by=cur();
 modal('🏳 '+nm(t)+', surrender?',nm(by)+' demands your surrender. Your Queen, Rook, Bishop and Knight would turn into Pawns serving '+nm(by)+'.','',[
  {t:'Fight on'},
  {t:'Surrender',c:'primary',f:()=>{
   const h=home(t);
   pieces.forEach(p=>{if(p.o!=t)return;p.o=by;p.haven=false;if(p.k!='P'){p.k='P';p.dx=h.dx;p.dy=h.dy}});
   G.dead.add(t);G.msg=nm(t)+' surrendered to '+nm(by)+'!';
   if(G.players.filter(alive).length<=1){G.phase='over';render();win(by)}else render();
  }}]);
}

/* ---------- input ---------- */
function cellClick(x,y){
 if(!G)return;const p=at(x,y);
 if(G.phase=='pick'){
  if(p&&p.o==cur()&&moves(p,G.roll).length){G.sel=G.sel==p.id?null:p.id;return render()}
  const s=pieces.find(q=>q.id==G.sel);
  if(s&&moves(s,G.roll).some(([a,b])=>a==x&&b==y))doMove(s,x,y);
 }else if(G.phase=='haven'){
  if(p&&p.o==cur()&&!p.haven){p.haven=true;G.msg=nm(cur())+' raised a Haven on a '+KN[p.k];endTurn()}
 }else if(G.phase=='bomb'){
  if(p&&p.haven&&p.o!==cur()){
   const o=p.o;pieces.splice(pieces.indexOf(p),1);G.msg='Bomb! '+nm(o)+"'s "+KN[p.k]+' destroyed';
   if(alive(o)&&!count(o))eliminate(o,'army destroyed');
   endTurn();
  }
 }
}
function wallClick(k){
 if(!G||G.phase!='bomb'||!walls.has(k))return;
 walls.delete(k);G.msg=nm(cur())+' bombed a wall';endTurn();
}
$('#board').addEventListener('click',e=>{
 const t=e.target.closest('[data-w],[data-c]');if(!t)return;
 if(t.dataset.w)wallClick(t.dataset.w);else{const[x,y]=t.dataset.c.split(',').map(Number);cellClick(x,y)}
});
$('#dice').onclick=roll;
$('#surr').onclick=surrender;
$('#back').onclick=()=>G&&G.phase!='over'?modal('Leave game?','Your game will be lost.','',[{t:'Stay'},{t:'Leave',c:'primary',f:toMenu}]):toMenu();
$('#start').onclick=()=>{$('#menu').hidden=true;$('#game').hidden=false;newGame(+document.querySelector('#np .on').dataset.v)};
$('#np').onclick=e=>{const b=e.target.closest('button');if(!b)return;[...$('#np').children].forEach(c=>c.classList.toggle('on',c==b))};
function toMenu(){clearTimeout(timer);G=null;$('#game').hidden=true;$('#menu').hidden=false;closeModal()}

function modal(t,body,html,btns){
 $('#mt').textContent=t;$('#mb').innerHTML='';$('#mb').onclick=null;
 const p=document.createElement('p');p.textContent=body;$('#mb').append(p);
 if(html){const d=document.createElement('div');d.innerHTML=html;$('#mb').append(d)}
 const bx=$('#mbtn');bx.innerHTML='';
 btns.forEach(b=>{const e=document.createElement('button');e.className='btn '+(b.c||'');e.textContent=b.t;e.onclick=()=>{closeModal();b.f&&b.f()};bx.append(e)});
 $('#modal').hidden=false;
}
const closeModal=()=>{$('#modal').hidden=true};

/* ---------- drawing ---------- */
const wallSeg=k=>{const[t,i]=k.split(',').map((v,j)=>j?+v:v);return t=='v'?[px(6),px(i),px(6),px(i+1)]:[px(i),px(6),px(i+1),px(6)]};
function palace(r,turn){
 const h=home(r),cc=[px(h.cx)+CS/2,px(h.cy)+CS/2],c=[cc[0]-h.dx*(CS/2+34),cc[1]-h.dy*(CS/2+34)];
 const out=[px(h.cx)+(h.dx>0?0:CS),px(h.cy)+(h.dy>0?0:CS)],col=RC[r],on=G.players.includes(r),dead=G.dead.has(r);
 if(!on)return`<rect x="${c[0]-33}" y="${c[1]-33}" width="66" height="66" rx="12" fill="#0001" stroke="#0003" stroke-dasharray="4 4"/>`;
 let s=`<g opacity="${dead?.45:1}">`;
 s+=`<line x1="${c[0]}" y1="${c[1]}" x2="${out[0]}" y2="${out[1]}" stroke="#7a5600" stroke-width="16" stroke-linecap="round"/><line x1="${c[0]}" y1="${c[1]}" x2="${out[0]}" y2="${out[1]}" stroke="#ffd54a" stroke-width="11" stroke-linecap="round"/>`;
 if(turn)s+=`<rect class="glow" x="${c[0]-39}" y="${c[1]-39}" width="78" height="78" rx="18" fill="none" stroke="#3dff6e" stroke-width="5"/>`;
 s+=`<rect x="${c[0]-33}" y="${c[1]-33}" width="66" height="66" rx="12" fill="${col}" stroke="#d9a521" stroke-width="4"/>`;
 s+=`<rect x="${c[0]-27}" y="${c[1]-27}" width="54" height="54" rx="9" fill="#fff" fill-opacity=".38" stroke="#fff" stroke-opacity=".7"/>`;
 [[-1,-1],[1,-1],[-1,1],[1,1]].forEach(([a,b])=>{s+=`<circle cx="${c[0]+a*31}" cy="${c[1]+b*31}" r="6" fill="${col}" stroke="#d9a521" stroke-width="2.5"/>`});
 s+=dead?`<text x="${c[0]}" y="${c[1]+10}" text-anchor="middle" font-size="30">🔥</text>`:tok('K',col,c[0]-21,c[1]-39,1.05);
 return s+'</g>';
}
function render(){
 if(!G)return;
 const ph=G.phase,me=cur(),sel=pieces.find(p=>p.id==G.sel);
 let s='';
 s+=`<rect width="${W}" height="${W}" fill="#e9ecd9"/><rect x="${M-9}" y="${M-9}" width="${SZ*CS+18}" height="${SZ*CS+18}" rx="10" fill="#d9a521"/>`;
 for(let y=0;y<SZ;y++)for(let x=0;x<SZ;x++)s+=`<rect x="${px(x)}" y="${px(y)}" width="${CS}" height="${CS}" fill="${TINT[realmAt(x,y)][(x+y)&1]}"/>`;
 s+=`<g stroke="#243326" stroke-opacity=".12">`;for(let i=0;i<=SZ;i++)s+=`<line x1="${px(i)}" y1="${M}" x2="${px(i)}" y2="${M+SZ*CS}"/><line x1="${M}" y1="${px(i)}" x2="${M+SZ*CS}" y2="${px(i)}"/>`;s+='</g>';
 'ABCDEFGHIJKL'.split('').forEach((l,i)=>{s+=`<text x="${px(i)+CS/2}" y="${M-12}" text-anchor="middle" font-size="11" fill="#5A6B5A">${l}</text><text x="${px(i)+CS/2}" y="${M+SZ*CS+22}" text-anchor="middle" font-size="11" fill="#5A6B5A">${l}</text><text x="${M-14}" y="${px(i)+CS/2+4}" text-anchor="middle" font-size="11" fill="#5A6B5A">${i+1}</text><text x="${M+SZ*CS+14}" y="${px(i)+CS/2+4}" text-anchor="middle" font-size="11" fill="#5A6B5A">${i+1}</text>`});
 G.players.forEach(r=>{if(!alive(r))return;const h=home(r);
  s+=`<rect x="${px(h.cx)+3}" y="${px(h.cy)+3}" width="${CS-6}" height="${CS-6}" rx="6" fill="none" stroke="#d9a521" stroke-width="3"/>`;
  promoTiles(r).forEach(([a,b])=>{s+=`<rect x="${px(a)+4}" y="${px(b)+4}" width="${CS-8}" height="${CS-8}" rx="8" fill="#ffd54a" fill-opacity=".35" stroke="#b7860b" stroke-width="2" stroke-dasharray="5 4"/>`});
 });
 if(G.last)G.last.forEach(([a,b])=>{s+=`<rect x="${px(a)}" y="${px(b)}" width="${CS}" height="${CS}" fill="#ffdd57" fill-opacity=".5"/>`});
 // walls
 walls.forEach(k=>{const[a,b,c,d]=wallSeg(k),bm=ph=='bomb';
  s+=`<line x1="${a}" y1="${b}" x2="${c}" y2="${d}" stroke="#2b2f3a" stroke-width="13"/><line x1="${a}" y1="${b}" x2="${c}" y2="${d}" stroke="#a3a9b8" stroke-width="8"/><line x1="${a}" y1="${b}" x2="${c}" y2="${d}" stroke="#5b6070" stroke-width="8" stroke-dasharray="1.5 8"/>`;
  if(bm)s+=`<line class="glow" x1="${a}" y1="${b}" x2="${c}" y2="${d}" stroke="#ff3b30" stroke-width="5" stroke-linecap="round"/>`});
 s+=`<circle cx="${px(6)}" cy="${px(6)}" r="10" fill="#7d8494" stroke="#2b2f3a" stroke-width="3"/>`;
 GATE.filter(i=>i%2==0||i==9&&0).forEach(i=>{});
 [2,8].forEach(i=>{
  s+=`<rect x="${px(6)-10}" y="${px(i)+2}" width="20" height="${2*CS-4}" rx="8" fill="#ffd54a" fill-opacity=".28" stroke="#d9a521" stroke-width="3"/>`;
  s+=`<rect x="${px(i)+2}" y="${px(6)-10}" width="${2*CS-4}" height="20" rx="8" fill="#ffd54a" fill-opacity=".28" stroke="#d9a521" stroke-width="3"/>`;
  [i,i+2].forEach(j=>{s+=`<rect x="${px(6)-11}" y="${px(j)-5}" width="22" height="10" rx="3" fill="#5b6070" stroke="#2b2f3a" stroke-width="2"/><rect x="${px(j)-5}" y="${px(6)-11}" width="10" height="22" rx="3" fill="#5b6070" stroke="#2b2f3a" stroke-width="2"/>`});
 });
 G.players.concat([0,1,2,3].filter(r=>!G.players.includes(r))).forEach(r=>{s+=palace(r,G.players[G.turn]==r&&ph!='over')});
 // highlights under pieces
 if(ph=='pick'){pieces.filter(p=>p.o==me&&moves(p,G.roll).length&&p.id!=G.sel).forEach(p=>{s+=`<rect class="glow" x="${px(p.x)+2}" y="${px(p.y)+2}" width="${CS-4}" height="${CS-4}" rx="8" fill="none" stroke="#3dff6e" stroke-width="3"/>`})}
 if(sel){s+=`<rect x="${px(sel.x)+1}" y="${px(sel.y)+1}" width="${CS-2}" height="${CS-2}" rx="8" fill="#3dff6e" fill-opacity=".3" stroke="#1d9c40" stroke-width="3"/>`;
  moves(sel,G.roll).forEach(([a,b])=>{const cap=at(a,b);s+=cap?`<rect x="${px(a)+2}" y="${px(b)+2}" width="${CS-4}" height="${CS-4}" rx="8" fill="#ff3b30" fill-opacity=".25" stroke="#ff3b30" stroke-width="3"/>`:`<circle cx="${px(a)+CS/2}" cy="${px(b)+CS/2}" r="8" fill="#1d9c40" fill-opacity=".7"/>`})}
 if(ph=='haven')pieces.filter(p=>p.o==me&&!p.haven).forEach(p=>{s+=`<rect class="glow" x="${px(p.x)+2}" y="${px(p.y)+2}" width="${CS-4}" height="${CS-4}" rx="8" fill="#55d6ff" fill-opacity=".25" stroke="#55d6ff" stroke-width="3"/>`});
 if(ph=='bomb')bombTargets().havens.forEach(p=>{s+=`<rect class="glow" x="${px(p.x)+2}" y="${px(p.y)+2}" width="${CS-4}" height="${CS-4}" rx="8" fill="#ff3b30" fill-opacity=".3" stroke="#ff3b30" stroke-width="3"/>`});
 // pieces (back to front)
 [...pieces].sort((a,b)=>a.y-b.y).forEach(p=>{
  const cx=px(p.x)+CS/2,cy=px(p.y)+CS/2;
  if(p.haven)s+=`<ellipse cx="${cx}" cy="${cy+4}" rx="21" ry="11" fill="#55d6ff" fill-opacity=".3" stroke="#55d6ff" stroke-width="3"/>`;
  s+=tok(p.k,RC[p.o],cx-17,cy-34,.85);
  if(p.haven)s+=`<text x="${cx+13}" y="${cy-14}" font-size="13">🛡</text>`;
 });
 // click targets
 for(let y=0;y<SZ;y++)for(let x=0;x<SZ;x++)s+=`<rect data-c="${x},${y}" x="${px(x)}" y="${px(y)}" width="${CS}" height="${CS}" fill="transparent"/>`;
 if(ph=='bomb')walls.forEach(k=>{const[a,b,c,d]=wallSeg(k);s+=`<line data-w="${k}" x1="${a}" y1="${b}" x2="${c}" y2="${d}" stroke="transparent" stroke-width="22" style="cursor:pointer"/>`});
 $('#board').innerHTML=s;

 // panels
 $('#chips').innerHTML=G.players.map(r=>`<div class="pl${r==me&&ph!='over'?' act':''}${G.dead.has(r)?' out':''}" style="--c:${RC[r]}">${icon('K',RC[r])}<div><b>${nm(r)}</b><small>${G.dead.has(r)?'fallen':count(r)+' pieces'}</small></div></div>`).join('');
 const d=$('#dice');d.disabled=ph!='roll';
 d.textContent=G.roll==null?'🎲':G.roll==5?'💣':G.roll==6?'🛡':G.roll;
 $('#surr').disabled=ph!='roll';
 const H={roll:'Roll the dice',pick:'Rolled '+G.roll+': tap a glowing piece, then a spot',bomb:'Bomb! Tap a wall segment or an enemy Haven',haven:'Haven! Tap one of your pieces',wait:'',promo:'Choose a promotion',over:''}[ph];
 $('#hint').textContent=H;
 $('#status').textContent=(G.msg?G.msg+' · ':'')+(ph=='over'?'Game over':nm(me)+"'s turn");
 $('#status').style.background=ph=='over'?'#477747':RC[me];
}

buildDefs();
if('serviceWorker' in navigator){
 navigator.serviceWorker.register('sw.js',{updateViaCache:'none'}).then(r=>{r.update();document.addEventListener('visibilitychange',()=>{if(document.visibilityState=='visible')r.update()})}).catch(()=>{});
}
