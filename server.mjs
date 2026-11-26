import {randomInt} from 'node:crypto';
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

export function createGameServer(up=upstream, teamPin=String(randomInt(1000,10000))){
  const rooms=new Map(),nextTokens=new Map();
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
        if(act==='create'&&b.mode==='team'){
          if(b.operator!==teamPin)fail('실행 창의 모둠전 교사 키를 확인하세요.',403);
          let game;do{game=classroom(Date.now,undefined,'T')}while(rooms.has(game.code));
          rooms.set(game.code,game);
          const result=game.api('teacher',{pin:game.pin});
          nextTokens.set(result.token,game);
          return json(200,{mode:'team',code:game.code,token:result.token});
        }
        if(act==='join'&&String(code).length===6){
          const game=rooms.get(String(code).trim().toUpperCase());
          if(!game)fail('이 교실의 모둠전 입장 코드를 확인하세요.',404);
          const result=game.api('join',{...b,code:game.code});
          nextTokens.set(result.token,game);
          return json(200,{mode:'team',code:game.code,token:result.token});
        }
        const v=await up(act,req.method,b,oldToken,code);
        const st=act==='state'||act==='action'?v:v.state;
        if(st?.phase==='lobby')st.studentOrigin=networkLinks(req.socket.localPort)[0];
        return json(200,v);
      }
      if(r.startsWith('/game/')&&req.method==='POST'){
        const game=nextTokens.get(b.token);if(!game)fail('교실 첫 화면에서 다시 입장해 주세요.',403);
        const act=r.slice(6);if(!['state','start','final','end','move','answer','inspect'].includes(act))fail('지원하지 않는 동작입니다.',404);
        return json(200,game.api(act,b));
      }
      fail('페이지가 없습니다.',404);
    }catch(e){json(e.status??400,{error:e.message})}
  });
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const port=Number(process.env.FINALE_PORT||8789),teamPin=String(randomInt(1000,10000)),server=createGameServer(upstream,teamPin);
  server.on('error',e=>{console.error(e.code==='EADDRINUSE'?'포트가 이미 사용 중입니다. 이전 게임 실행 창을 닫고 다시 열어 주세요.':e.message);process.exitCode=1});
  server.listen(port,'0.0.0.0',()=>{console.log('교사 화면  http://localhost:'+port+'/?host=1');for(const link of networkLinks(port))console.log('학생 주소  '+link+'/');console.log('모둠전 교사 키  '+teamPin+'\n개인전은 기존 생각의 문 진행 키를 사용하세요. 수업이 끝날 때까지 창을 열어 두세요.')});
}
