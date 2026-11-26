'use strict';
const $=id=>document.getElementById(id),canvas=$('map'),ctx=canvas.getContext('2d');
const people=[
 {name:'방송 담당',room:'방송실',color:'#91ded0',x:-5,z:-3.25},
 {name:'물품 담당',room:'창고',color:'#eeb77f',x:5,z:-3.25},
 {name:'전기 담당',room:'전기실',color:'#91bef3',x:-5,z:3.25},
 {name:'기록 담당',room:'기록실',color:'#d0a9e2',x:5,z:3.25}];
const reelNames=['청록','호박','파랑','보라'];
const teacher=new URLSearchParams(location.search).has('teacher'),storageKey='frequency.final.2.'+(teacher?'teacher':'student');
let auth='',watch=1,game=null,s={seat:-1,phase:0},actors=[],roster=[],teamFlags=[],labels=[],movingNow=false;
let path=[],destination=null,keys=new Set(),prev=0,dirty=false,polling=false,moving=false,working=false,revision=0,issued=0,offset=0,selection=[];
const escaped=t=>String(t??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const btn=(title,act,primary=false)=>'<button type="button" data-action="'+act+'" class="'+(primary?'primary':'')+'">'+title+'</button>';
const now=()=>Date.now()+offset;
const elapsed=t=>{const n=Math.max(0,Math.floor(t/1000));return Math.floor(n/60)+'분 '+String(n%60).padStart(2,'0')+'초'};
const say=t=>{$('note').textContent=t};
function update(el,html){if(el.dataset.mark!==html){el.innerHTML=html;el.dataset.mark=html}}
function snap(st,seq){
 if(seq<revision)return;revision=seq;
 const reset=!game||st.group!==game.group||st.me!==game.me||st.stage!==game.stage;
 if(reset){actors=[];path=[];destination=null;dirty=false;selection=[];keys.clear()}
 game=st;offset=st.now-Date.now();roster=st.players;s={seat:st.me,phase:st.stage==='final'?1:0};teamFlags=st.found;
 st.players.forEach(p=>{if(!actors[p.seat])actors[p.seat]={x:p.x,z:p.z};actors[p.seat].target=p});
 $('entry').hidden=true;$('game').hidden=false;render();
}
async function api(action,params={}){
 const seq=++issued,response=await fetch('/game/'+action,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token:auth,watch,...params})});
 const data=await response.json();if(!response.ok)throw Error(data.error);
 if(data.token){auth=data.token;try{sessionStorage.setItem(storageKey,auth)}catch{}}
 if(data.state)snap(data.state,seq);return data;
}
async function command(action,data,done){
 if(working)return;working=true;
 try{await api(action,data);if(done)say(done)}catch(e){say(e.message)}finally{working=false}
}
function results(){
 const finishers=game.groups.filter(t=>t.escaped).sort((a,b)=>a.escaped-b.escaped||a.id-b.id);
 const winner=finishers.filter(t=>t.escaped===finishers[0]?.escaped);
 return winner.length?'🏆 '+winner.map(g=>g.id+'모둠').join(' · ')+' 우승 · '+elapsed(winner[0].escaped-game.finalStart):'완주한 모둠 없이 종료';
}
function status(g){
 if(g.escaped)return '탈출 · '+elapsed(g.escaped-game.finalStart);
 if(g.finalist)return g.decoded?'송신기 활성화 '+g.pads+'/4':'결승 추리 중';
 if(g.qualified)return '예선 탈출 · '+elapsed(g.qualified-game.start);
 return game.phase==='lobby'?'접속 '+g.online+' / '+g.count+'명':'단서 '+g.clues+'/4';
}
function field(){
 let title='',body='',controls='';
 if(game.phase==='ended'){title=results();body='모든 경기가 종료되었습니다.';controls=btn('첫 화면으로','home')}
 else if(teacher){
   if(game.phase==='lobby'){title='모둠원 합류 대기';body='입장 순서대로 네 명씩 배정됩니다. 아래 현황에서 모둠별 접속 인원을 확인한 뒤 시작하세요.';if(game.groups.length)controls=btn('예선 시작','start',true)}
   if(game.phase==='qualifier'){title='예선 진행 중';body='탈출 기록 상위 두 모둠이 결승에 진출합니다. '+(game.groups.length===1?'현재는 한 모둠 연습 경기입니다.':'');
   if(game.eligible.length>=Math.min(2,game.groups.length))controls=btn('결승 동시 시작','final',true)}
   if(game.phase==='final'){title='모둠 대항 결승';body='결승 모둠은 같은 단서로 재생 순서를 복원한 후 네 송신기를 동시에 켭니다.';controls=btn('경기 조기 종료','end')}
 }else if(game.phase==='lobby'){title='모둠원 입장 대기';body='교사가 예선을 시작하면 담당 방을 조사하세요.'}
 else if(game.escaped){title='결승 탈출 성공';body='기록 '+elapsed(game.escaped-game.finalStart)+' · 다른 모둠의 진행 상황을 확인하세요.'}
 else if(game.stage!=='final'&&game.qualified){title=game.phase==='final'?'예선 완주':'예선 탈출 성공';body=game.phase==='final'?'아래 현황판에서 결승을 관전하세요.':'결승은 교사의 신호로 동시에 시작합니다.'}
 else{
   const final=game.stage==='final',own=people.map((_,i)=>i).filter(i=>i%roster.length===game.me);
   title=final?(game.decoded?'최종 송신기 가동':'결승 · 마지막 릴'): '예선 · 방송동 탈출';
   body=final?(game.decoded?'모든 송신기가 동시에 켜져야 탈출합니다. 가동 상태는 25초간 유지됩니다.':'각 방의 메모를 모으고 네 릴의 재생 순서를 맞히세요.'):'전기실에서 차단기를 올려야 방송실 화면에 숫자가 보입니다. 네 방의 숫자로 출구를 여세요.';
   controls=own.map(i=>btn(people[i].room+' '+(final&&game.decoded?'송신기':!final&&i===2?'차단기':'조사'),'visit'+i,true)).join('');
   if(!final&&game.phase==='final')body+=' 결승이 시작됐지만 예선은 계속 풀 수 있습니다.';
   if(game.found.every(Boolean)&&!game.decoded){
     if(final){controls+='<p>재생 순서</p><div class="btns">'+reelNames.map((n,i)=>btn(n,'reel'+i)).join('')+'</div><p>'+ (selection.map(i=>reelNames[i]).join(' → ')||'릴을 순서대로 선택하세요.')+'</p>'+btn('다시 선택','clear')+(selection.length===4?btn('순서 제출','answer',true):'')}
     else controls+='<form id="answerform"><label>장비함 암호<input name="digits" inputmode="numeric" maxlength="4" pattern="[0-9０-９]{4}" required></label><button class="primary">암호 제출</button></form>';
   }
 }
 return '<p class="eyebrow">'+(teacher?'교사 관제실':'나의 임무')+'</p><h2>'+title+'</h2><p>'+body+'</p><div class="btns">'+controls+'</div>';
}
function render(){
 const g=game;$('badge').textContent='입장 코드 '+g.code;
 $('maptag').textContent=(g.group?g.group+'모둠':'방송동')+' · '+(g.stage==='final'?'결승 경기장':'예선 방송동');
 $('subtitle').textContent=teacher?'모둠별 조사 상황과 결승 탈출 기록을 확인하세요.':g.group+'모둠 · '+(g.players[g.me]?.name??'')+' · '+people[g.me]?.name;
 update($('field'),field());
 const selector=teacher&&g.groups.length?'<label>관전 모둠<select id="watch">'+g.groups.map(t=>'<option value="'+t.id+'" '+(g.group===t.id?'selected':'')+'>'+t.id+'모둠</option>').join('')+'</select></label>':'';
 update($('team'),'<h2>모둠원</h2>'+selector+'<ul class="list">'+g.players.map(p=>'<li><b style="color:'+people[p.seat].color+'">'+escaped(p.name)+'</b> · '+people.map((a,i)=>i%g.players.length===p.seat?a.room:null).filter(Boolean).join('·')+(p.online?'':' · 연결 대기')+'</li>').join('')+'</ul>');
 $('summary').textContent=g.found.filter(Boolean).length+' / 4장';
 update($('board'),people.map((p,i)=>'<article class="clue '+(g.found[i]?'found':'')+'" style="--c:'+p.color+'"><b>'+p.room+'</b><p>'+(g.notes[i]||'아직 조사되지 않았습니다.')+'</p></article>').join(''));
 update($('scores'),g.groups.map(t=>'<li><strong>'+t.id+'모둠</strong>　'+status(t)+'</li>').join(''));
}
function go(i){
 if(teacher||!game?.players.length||working)return;
 if(i%roster.length!==game.me){say(people[i].room+'은 '+roster[i%roster.length].name+' 담당입니다.');return}
 const a=actors[game.me],p=people[i];
 path=Math.hypot(a.x-p.x,a.z-p.z)<1.1?[]:[{x:0,z:a.z},{x:0,z:p.z},{x:p.x,z:p.z}];destination=i;
 if(!path.length)arrive();else say(p.room+'으로 이동 중입니다.');
}
async function arrive(){const station=destination;destination=null;if(station===null)return;
 // Send the final walking position before the interaction.
 if(moving){destination=station;return}
 const a=actors[game.me];try{await api('move',{x:a.x,z:a.z});await command('inspect',{station},'장치 상태가 모둠 화면에 반영됐습니다.')}catch(e){say(e.message)}
}
document.addEventListener('click',e=>{
 const b=e.target.closest('[data-action]');if(!b||!game)return;const act=b.dataset.action;
 if(act==='home'){sessionStorage.removeItem(storageKey);location.assign(teacher?'/?host=1&mode=team':'/');return}
 if(act.startsWith('visit'))return go(Number(act.slice(5)));
 if(act.startsWith('reel')){const i=Number(act.slice(4));if(!selection.includes(i))selection.push(i);return render()}
 if(act==='clear'){selection=[];return render()}
 if(act==='answer')return command(act,{answer:selection.join('')},'재생 순서가 맞았습니다. 네 송신기를 가동하세요.');
 if(act==='end'&&!confirm('현재 기록으로 결승을 종료할까요?'))return;
 command(act,{},'진행 상태를 변경했습니다.');
});
document.addEventListener('change',e=>{if(e.target.id==='watch'){watch=Number(e.target.value);api('state').catch(e=>say(e.message))}});
document.addEventListener('submit',async e=>{
 e.preventDefault();if(e.target.id==='answerform')return command('answer',{answer:new FormData(e.target).get('digits')},'예선 탈출 성공!');
});
canvas.addEventListener('click',e=>{
 if(!game||teacher||game.phase==='lobby'||game.phase==='ended')return;
 const b=canvas.getBoundingClientRect(),x=e.clientX-b.left,y=e.clientY-b.top;
 const tag=labels.find(t=>x>=t.x&&x<=t.x+t.w&&y>=t.y&&y<=t.y+t.h);
 const u=(x-W*.5)/S,v=(y-H*.55)/S,wx=(.50*u+.46*v)/.5635,wz=(.92*v-.225*u)/.5635;
 const i=tag?.i??people.findIndex(p=>Math.abs(wx-p.x)<=3.75&&Math.abs(wz-p.z)<=2.15);if(i>=0)go(i);
});
const dirs={w:[0,-1],arrowup:[0,-1],a:[-1,0],arrowleft:[-1,0],s:[0,1],arrowdown:[0,1],d:[1,0],arrowright:[1,0]};
window.addEventListener('keydown',e=>{if(!game||teacher||game.phase==='ended'||e.target.matches('input,select')||e.ctrlKey||e.metaKey)return;
 const k=e.key.toLowerCase();if(dirs[k]){e.preventDefault();keys.add(k);path=[];destination=null}
 if(k==='e'&&!e.repeat){const a=actors[game.me];const i=people.findIndex(p=>Math.hypot(p.x-a.x,p.z-a.z)<1.25);if(i>=0)go(i);else say('담당 방의 표식 가까이 이동하세요.')}});
window.addEventListener('keyup',e=>keys.delete(e.key.toLowerCase()));window.addEventListener('blur',()=>keys.clear());
function walk(dt){
 actors.forEach((a,i)=>{if(i===game.me)return;const f=Math.min(1,dt*9);a.x+=(a.target.x-a.x)*f;a.z+=(a.target.z-a.z)*f});
 if(teacher||game.phase==='ended')return;const a=actors[game.me];if(!a)return;let dx=0,dz=0;
 if(keys.size){for(const k of keys){const [x,z]=dirs[k];dx+=x*.9+z*.45;dz+=-x*.45+z*.9}}
 else if(path.length){dx=path[0].x-a.x;dz=path[0].z-a.z;if(Math.hypot(dx,dz)<dt*6+.04){a.x=path[0].x;a.z=path[0].z;path.shift();dirty=true;return}}
 else if(destination!==null){arrive();return}
 const n=Math.hypot(dx,dz);movingNow=n>0;if(n){a.x=Math.max(-8.45,Math.min(8.45,a.x+dx/n*dt*6));a.z=Math.max(-5.25,Math.min(5.25,a.z+dz/n*dt*6));dirty=true}
}
function frame(t){if(game){walk(Math.min(.05,(t-(prev||t))/1000));draw(t);const active=game.pads.map((v,i)=>v>now()?people[i].room+' '+Math.ceil((v-now())/1000)+'초':null).filter(Boolean);
 $('clock').textContent=game.phase==='ended'?'경기 종료':game.stage==='final'?(active.join(' · ')||'결승 '+elapsed(now()-game.finalStart)):game.power>now()?'전원 ON · '+Math.ceil((game.power-now())/1000)+'초':game.start?'예선 '+elapsed(now()-game.start):'입장 대기'}prev=t;requestAnimationFrame(frame)}
async function poll(){if(!auth||polling)return;polling=true;try{await api('state')}catch(e){say(e.message);if(/다시 입장|개인전 결과 화면/.test(e.message)){auth='';game=null;try{sessionStorage.removeItem(storageKey)}catch{}$('entry').hidden=false;$('game').hidden=true}}finally{polling=false}}
setInterval(poll,650);setInterval(async()=>{if(!auth||teacher||!dirty||moving||!game||game.phase==='ended')return;const a=actors[game.me];dirty=false;moving=true;try{await api('move',{x:a.x,z:a.z})}catch{dirty=true}finally{moving=false}},240);
$('returnLink').href=teacher?'/?host=1&mode=team':'/';
try{auth=sessionStorage.getItem(storageKey)||''}catch{}poll();requestAnimationFrame(frame);
