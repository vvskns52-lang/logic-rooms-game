import {randomInt,randomBytes} from 'node:crypto';
const stations = ['방송실','창고','전기실','기록실'];
const locations = [[-5,-3.25],[5,-3.25],[-5,3.25],[5,3.25]];
const colors = ['청록','호박','파랑','보라'];
const token = () => randomBytes(16).toString('hex');
const letters = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const roomCode = () => Array.from({length:5},()=>letters[randomInt(letters.length)]).join('');
function shuffled(values) {
  const arr=values.slice();
  for(let i=arr.length-1;i>0;i--){const j=randomInt(i+1);[arr[i],arr[j]]=[arr[j],arr[i]]}
  return arr;
}
function must(condition, why) { if(!condition)throw Error(why); }
export function classroom(now=Date.now, code=roomCode()) {
  const pin=String(randomInt(100000,1000000)), teacher=token();
  const groups=[], sessions=new Map();
  const order=shuffled([0,1,2,3]);
  const nameAt=i=>colors[order[i]];
  const clues=[
    nameAt(0)+' 릴은 '+nameAt(1)+' 릴보다 먼저 재생된다.',
    nameAt(0)+' 릴과 '+nameAt(1)+' 릴 사이에는 다른 릴이 없다.',
    nameAt(0)+' 릴은 '+nameAt(2)+' 릴보다 먼저 재생된다.',
    nameAt(2)+' 릴은 '+nameAt(3)+' 릴보다 먼저 재생된다.'
  ];
  let phase='lobby',finalists=[],start=0,finalStart=0,finish=0;
  function addGroup(){
    const digits=shuffled([1,2,3,4,5,6,7,8,9]).slice(0,4);
    const places=shuffled([0,1,2,3]);
    const g={id:groups.length+1,players:[],digits,places,power:0,found:[false,false,false,false],finalFound:[false,false,false,false],
      qualified:0,decoded:false,pads:[0,0,0,0],escaped:0,faults:0,blocked:0};
    groups.push(g);return g;
  }
  function phaseOf(g){return finalists.includes(g.id)&&['final','ended'].includes(phase)?'final':'qualifier'}
  const status=g=>({id:g.id,count:g.players.length,online:g.players.filter(p=>now()-p.last<18000).length,clues:g.found.filter(Boolean).length,qualified:g.qualified,
    finalist:finalists.includes(g.id),decoded:g.decoded,pads:g.pads.filter(t=>t>now()).length,escaped:g.escaped});
  const standings=()=>groups.filter(g=>g.qualified).sort((a,b)=>a.qualified-b.qualified||a.id-b.id);
  const eligible=()=>standings().slice(0,2).map(g=>g.id);
  function snapshot(g,p,host){
    const t=now(), final=g&&phaseOf(g)==='final';
    return {code,host,phase,now:t,start,finalStart,finish,groups:groups.map(status),eligible:eligible(),finalists,
      me:p?.seat??-1, group:g?.id??null, stage:final?'final':'qualifier',
      players:g?.players.map(({name,seat,x,z,last})=>({name,seat,x,z,online:t-last<18000}))??[],
      found:g?(final?g.finalFound:g.found):[], notes:g?(final?g.finalFound:g.found).map((v,i)=>v?(final?clues[i]:
        ['첫째','둘째','셋째','넷째'][g.places[i]]+' 숫자는 '+g.digits[g.places[i]]+'다.'):null):[],
      power:g?.power??0, qualified:g?.qualified??0, decoded:g?.decoded??false,pads:g?.pads??[],escaped:g?.escaped??0,blocked:g?.blocked??0};
  }
  function api(a,b={}){
    if(a==='teacher'){must(b.pin===pin,'교사용 실행 창의 여섯 자리 번호를 확인하세요.');return {token:teacher,state:snapshot(groups[0],null,true)}}
    if(a==='join'){
      must(phase==='lobby','이미 게임이 시작됐습니다. 기존 참가자는 원래 탭으로 돌아가세요.');
      must(String(b.code).trim().toUpperCase()===code,'입장 코드를 확인하세요.');
      const name=String(b.name??'').trim();
      must(name.length>=1&&name.length<=30,'별명을 1~12자로 입력하세요.');
      let g=groups.find(g=>g.players.length<4);
      if(!g)g=addGroup();
      must(!groups.some(t=>t.players.some(p=>p.name===name)),'이미 사용 중인 별명입니다.');
      const seat=g.players.length;
      const p={seat,name,x:[-.65,.65,-.65,.65][seat],z:[-.55,-.55,.55,.55][seat],last:0};
      g.players.push(p);const id=token();sessions.set(id,{g,p});return {token:id,state:snapshot(g,p,false)};
    }
    const host=b.token===teacher, login=sessions.get(b.token);
    must(host||login,'다시 입장해 주세요.');
    const g=host?(groups.find(g=>g.id===b.watch)??groups[0]):login.g,p=login?.p;
    if(p)p.last=now();
    if(a==='state')return {state:snapshot(g,p,host)};
    if(host){
      if(a==='start'){must(phase==='lobby'&&groups.length,'학생이 입장한 뒤 시작하세요.');phase='qualifier';start=now()}
      else if(a==='final'){must(phase==='qualifier'&&eligible().length>=Math.min(2,groups.length),'두 모둠이 예선을 탈출하면 결승을 시작할 수 있어요.');finalists=eligible();finalStart=now();phase='final';
        for(const t of groups.filter(t=>finalists.includes(t.id)))for(const player of t.players){player.x=(player.seat%2?1:-1)*.65;player.z=(player.seat<2?-1:1)*.55}}
      else if(a==='end'){must(phase==='final','결승 중에 종료할 수 있습니다.');phase='ended';finish=now()}
      else throw Error('지원하지 않는 교사 동작입니다.');
      return {state:snapshot(g,p,true)};
    }
    must(phase!=='ended','경기가 종료됐습니다.');
    if(a==='move'){
      must(Number.isFinite(b.x)&&Number.isFinite(b.z),'위치를 확인하세요.');
      p.x=Math.max(-8.45,Math.min(8.45,b.x));p.z=Math.max(-5.25,Math.min(5.25,b.z));return {ok:true};
    }
    must(phase!=='lobby','교사의 시작을 기다리세요.');
    const final=phaseOf(g)==='final', found=final?g.finalFound:g.found;
    must(!g.escaped&&(final||!g.qualified),'이미 탈출했습니다.');
    if(a==='inspect'){
      const i=b.station;
      must(Number.isInteger(i)&&i>=0&&i<4,'조사 지점을 선택하세요.');
      must(i%g.players.length===p.seat,'이 장치는 담당 모둠원이 조작합니다.');
      must(Math.hypot(p.x-locations[i][0],p.z-locations[i][1])<1.25,'조사 지점 가까이 이동하세요.');
      if(final&&g.decoded){
        g.pads[i]=now()+25000;
        if(g.pads.every(t=>t>now())){
          g.escaped=now();
          if(finalists.every(id=>groups[id-1].escaped)){phase='ended';finish=now()}
        }
      }else{
        if(!final&&i===2)g.power=now()+35000;
        if(!final&&i===0)must(g.power>now(),'전원이 꺼져 있습니다. 전기실 담당에게 차단기를 켜 달라고 하세요.');
        found[i]=true;
      }
    }else if(a==='answer'){
      must(found.every(Boolean),'네 방에서 단서를 모두 수집하세요.');
      must(!final||!g.decoded,'재생 순서는 이미 복구했습니다.');
      must(g.blocked<=now(),'잠시 뒤 다시 입력하세요.');
      const answer=String(b.answer??'').normalize('NFKC').trim();
      const expected=(final?order:g.digits).join('');
      if(answer!==expected){g.blocked=now()+5000;g.faults++;throw Error('일치하지 않습니다. 5초 뒤 다시 시도하세요.')}
      if(final)g.decoded=true;else g.qualified=now();
    }else throw Error('지원하지 않는 동작입니다.');
    return {state:snapshot(g,p,false)};
  }
  return {api,pin,code};
}
