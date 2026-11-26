import http from 'node:http';
import {networkInterfaces} from 'node:os';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {apiBase,publicKey} from './online-config.js';
import {classroom} from './escape-engine.mjs';

const assets=['index.html','classroom.css','horror.css','classroom.js','bgm.js','archive-activities.mjs','spatial-tools.mjs','drips.svg','grain.svg','stains.svg','archive-room.jpg','escape/index.html','escape/play.js','escape/scene.js','escape/style.css'];
const types={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.jpg':'image/jpeg'};
const fail=(message,status=400)=>{throw Object.assign(new Error(message),{status})};
function networkLinks(port){
  return Object.values(networkInterfaces()).flat().filter(a=>a&&!a.internal&&a.family==='IPv4'&&!a.address.startsWith('169.254.')).map(a=>'http://'+a.address+':'+port);
}
async function upstream(action,method,b,token,code){
  const url=new URL(apiBase+'/api/'+action);
  if(code)url.searchParams.set('code',code);
  const headers={apikey:publicKey};if(token)headers['X-Room-Token']=token;
  if(method==='POST')headers['Content-Type']='application/json';
  let r;
  try{r=await fetch(url,{method,headers,body:method==='POST'?JSON.stringify(b):undefined,signal:AbortSignal.timeout(8500)})}
  catch{fail('개인전 서버에 연결할 수 없습니다. 교사 PC의 인터넷 연결을 확인하세요.',502)}
  const v=await r.json().catch(()=>({}));
  if(!r.ok)fail(v.error||'개인전 요청을 처리할 수 없습니다.',r.status);
  return v;
}

export function createGameServer(up=upstream){
  const rooms=new Map(),nextTokens=new Map();
  function teamRoom(code){
    if(!rooms.has(code))rooms.set(code,{people:new Map(),opened:false,complete:false});
    return rooms.get(code);
  }
  function transfer(room,peer){
    if(!peer.next)fail('이 개인전의 참가 명단에 없습니다.',403);
    return {token:peer.next,host:peer.host};
  }
  function openFinale(room,code){
    if(room.opened)return;
    const game=classroom(Date.now,code),reserved=[];
    const students=[...room.people.values()].filter(p=>!p.host);
    if(!students.length)fail('이어갈 학생이 없습니다.');
    const usedNames=new Set();
    for(const p of room.people.values()){
      let name=p.name;
      if(!p.host){
        let suffix=2;
        while(usedNames.has(name))name=p.name+' ('+(suffix++)+')';
        usedNames.add(name);
      }
      const result=p.host?game.api('teacher',{pin:game.pin}):game.api('join',{code,name});
      reserved.push([p,result.token]);
    }
    for(const [p,next] of reserved){p.next=next;nextTokens.set(next,game)}
    room.game=game;room.opened=true;
  }
  return http.createServer(async(req,res)=>{
    const json=(status,obj)=>{res.writeHead(status,{'content-type':'application/json; charset=utf-8','cache-control':'no-store'});res.end(JSON.stringify(obj))};
    try{
      const url=new URL(req.url,'http://localhost'),r=url.pathname;
      if(req.method==='GET'&&!r.startsWith('/api/')){
        if(r==='/runtime-config.js'){
          res.writeHead(200,{'content-type':'text/javascript; charset=utf-8','cache-control':'no-store'});
          return res.end('export const integrated = true;');
        }
        if(r==='/online-config.js'){
          res.writeHead(200,{'content-type':'text/javascript; charset=utf-8','cache-control':'no-cache'});
          return res.end(await readFile(new URL('online-config.js',import.meta.url)));
        }
        const file=r==='/'?'index.html':r==='/escape/'?'escape/index.html':r.slice(1);
        if(!assets.includes(file))return json(404,{error:'페이지가 없습니다.'});
        const data=await readFile(new URL(file,import.meta.url));
        res.writeHead(200,{'content-type':types[path.extname(file)],'cache-control':'no-cache'});return res.end(data);
      }
      let b={};if(req.method==='POST'){
        if(!req.headers['content-type']?.startsWith('application/json'))fail('JSON 요청이 필요합니다.',415);
        if(req.headers.origin&&req.headers.origin!=='http://'+req.headers.host)fail('게임 화면에서 다시 시도하세요.',403);
        const parts=[];let size=0;for await(const part of req){size+=part.length;if(size>32768)fail('요청이 너무 큽니다.',413);parts.push(part)}
        try{b=JSON.parse(Buffer.concat(parts).toString())}catch{fail('잘못된 입력입니다.')}
        if(!b||typeof b!=='object'||Array.isArray(b))fail('잘못된 입력입니다.');
      }
      const oldToken=req.headers['x-room-token'],code=url.searchParams.get('code')??b.code;
      if(r.startsWith('/api/')){
        const act=r.slice(5),allowed=req.method==='GET'?['state','host-guide']:req.method==='POST'?['create','join','action']:[];
        if(!allowed.includes(act))fail('지원하지 않는 요청입니다.',404);
        const v=await up(act,req.method,b,oldToken,code);
        if((act==='create'||act==='join')&&v.token&&v.code){
          const room=teamRoom(v.code);
          if(!room.people.has(v.token))room.people.set(v.token,{host:act==='create',name:v.state?.me?.name??b.name??''});
        }
        const room=rooms.get(v.code??code),peer=room?.people.get(oldToken??v.token);
        if(act==='action'&&v.left&&room&&!room.opened)room.people.delete(oldToken);
        const st=act==='state'||act==='action'?v:v.state;
        if(st?.phase&&room&&peer){
          if(st.phase==='finish')room.complete=true;
          st.finaleOpen=room.opened;
          if(st.phase==='lobby'&&peer.host)st.studentOrigin=networkLinks(req.socket.localPort)[0];
        }
        return json(200,v);
      }
      if(r==='/handoff'&&req.method==='POST'){
        const room=rooms.get(code),peer=room?.people.get(oldToken);
        if(!peer)fail('통합판의 개인전 입장 화면에서 접속해 주세요.',403);
        if(!room.complete)fail('개인전 종료 후 모둠전이 열립니다.',409);
        if(peer.host)openFinale(room,code);
        if(!room.opened)fail('교사가 모둠전을 열면 이동할 수 있습니다.',409);
        return json(200,transfer(room,peer));
      }
      if(r.startsWith('/game/')&&req.method==='POST'){
        const game=nextTokens.get(b.token);if(!game)fail('개인전 결과 화면에서 모둠전으로 다시 이동하세요.',403);
        const act=r.slice(6);if(!['state','start','final','end','move','answer','inspect'].includes(act))fail('지원하지 않는 동작입니다.',404);
        return json(200,game.api(act,b));
      }
      fail('페이지가 없습니다.',404);
    }catch(e){json(e.status??400,{error:e.message})}
  });
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const port=Number(process.env.FINALE_PORT||8789),server=createGameServer();
  server.on('error',e=>{console.error(e.code==='EADDRINUSE'?'포트가 이미 사용 중입니다. 이전 게임 실행 창을 닫고 다시 열어 주세요.':e.message);process.exitCode=1});
  server.listen(port,'0.0.0.0',()=>{console.log('교사 화면  http://localhost:'+port+'/?host=1');for(const link of networkLinks(port))console.log('학생 주소  '+link+'/');console.log('생각의 문 개인전 → 모둠 탈출전 → 상위 두 모둠 결승\n기존 생각의 문 진행 키를 사용하세요. 수업이 끝날 때까지 창을 열어 두세요.')});
}
