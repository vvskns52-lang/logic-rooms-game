import { broadcastQuestions } from './broadcast-rounds.mjs?v=shared-1';
import { roomChannel } from './classroom-channel.mjs';

export function newBook() { return {stage:-1,revision:0,players:[],max:0}; }
function seat(name) { return {name,peer:null,base:0,correct:[],settled:[],answers:[null,null]}; }
export function observe(book,state) {
  const names = Array.isArray(state.roster) ? state.roster.filter(n=>typeof n==='string') : [];
  if (state.phase==='lobby') {
    const previous=book.players.slice();
    book.players=names.map(name=>{
      const index=previous.findIndex(p=>p.name===name);
      return index<0 ? seat(name) : previous.splice(index,1)[0];
    });
  } else {
    const known = names.slice();
    for (const p of book.players) {
      const i=known.indexOf(p.name);
      if(i>=0) known.splice(i,1);
    }
    for(const name of known) book.players.push(seat(name));
  }
  book.max=state.questionCount || book.max;
  for(const entry of state.results || []) {
    const matches=book.players.filter(p=>p.name===entry.name);
    if(!matches.length) {const p=seat(entry.name);book.players.push(p);matches.push(p);}
    if(matches.length!==1) continue;
    const [p]=matches;
    if(entry.correct===true && state.questionId!=null && !p.correct.includes(state.questionId))
      p.correct.push(state.questionId);
    if(state.phase==='reveal' && state.questionId!=null && !p.settled.includes(state.questionId))
      p.settled.push(state.questionId);
    // A reveal settles this question even when the student did not submit.
    p.base=Math.min(Math.max(p.base,p.correct.length),book.max-p.settled.filter(id=>!p.correct.includes(id)).length);
  }
  if(book.stage<0 && ['finish','epilogue'].includes(state.phase)) book.stage=0;
}

export function register(book,peer,msg) {
  let p=book.players.find(p=>p.peer===peer);
  if(!p && book.stage<4) {
    p=book.players.find(p=>p.name===msg.name && !p.peer);
    if(p) p.peer=peer;
  }
  if(!p || p.name!==msg.name) return null;
  if(book.stage<4 && Number.isInteger(msg.base) && msg.base>=0 && msg.base<=book.max)
    p.base=Math.min(Math.max(p.base,msg.base),book.max-p.settled.filter(id=>!p.correct.includes(id)).length);
  return p;
}
export function submit(book,p,stage,values) {
  if(![0,2].includes(stage) || stage!==book.stage || !Array.isArray(values)) return;
  const i=stage/2, q=broadcastQuestions[i];
  if(p.answers[i]!==null || values.length!==q.answer.length ||
    !q.choices.includes(values[0]) || values.slice(1).some(v=>!q.items.includes(v)) ||
    (i===0 && new Set(values.slice(1)).size!==6)) return;
  p.answers[i]=values.every((v,n)=>v===q.answer[n]);
}
export function view(book,p) {
  const result={stage:book.stage,revision:book.revision, mine:p?.answers??[], count:book.players.length,
    submitted:book.players.filter(x=>x.answers[Math.floor(book.stage/2)]!=null).length};
  if(book.stage===4)
    result.board=book.players.map(x=>({name:x.name,base:x.base,extra:x.answers.filter(Boolean).length,
      total:x.base+x.answers.filter(Boolean).length})).sort((a,b)=>b.total-a.total);
  return result;
}

export function sharedGame(session,host,expectedHost,change) {
  const key='logic-shared-v2:'+session.code+':'+session.token;
  const load=(suffix,def)=>JSON.parse(sessionStorage.getItem(key+suffix)||JSON.stringify(def));
  const save=(suffix,v)=>sessionStorage.setItem(key+suffix,JSON.stringify(v));
  const book=host?load(':book',newBook()):null;
  let latest=host?view(book):load(':view',null), pending=load(':pending',null), current,channel,closed=false;
  let lastName='',lastBase=-1, failure='';
  function sync(peer=channel?.teacher) {
    if(host || !current?.me || !peer || !channel?.ready) return;
    channel.send(peer,{name:current.me.name,base:current.me.total,stage:pending?.stage,values:pending?.values}).catch(()=>{});
  }
  function reply(p){if(p?.peer) channel?.send(p.peer,view(book,p)).catch(()=>{});}
  function notify(){latest=view(book);save(':book',book);change();}
  function receive(peer,msg) {
    if(host) {
      const before=JSON.stringify(book.players);
      const p=register(book,peer,msg);
      if(!p) {
        if(book.stage===4 && book.players.some(row=>row.name===msg.name))
          channel?.send(peer,view(book)).catch(()=>{});
        return;
      }
      submit(book,p,msg.stage,msg.values);
      if(before!==JSON.stringify(book.players)){book.revision++;notify();}
      reply(p);
    } else if(Number.isInteger(msg.stage) && (!latest || msg.revision>=latest.revision)){
      latest=msg;save(':view',msg);
      if(pending && (msg.stage!==pending.stage || msg.mine[Math.floor(msg.stage/2)]!=null)){
        pending=null;save(':pending',null);
      }
      change();
    }
  }
  roomChannel({code:session.code,key,host,expectedHost,receive,connected:sync,status:change}).then(c=>{
    if(closed){c.close();return;}
    channel=c;change();
  }).catch(()=>{failure='공유 연결을 시작하지 못했습니다. 이 탭에서 새로고침해 주세요.';change();});
  return {
    get ready(){return Boolean(channel?.ready);},
    get hostKey(){return host?channel?.id:null;},
    get data(){return latest;}, get pending(){return pending;}, get error(){return failure;},
    draft(stage,values){if(values)save(':draft'+stage,values);return load(':draft'+stage,[]);},
    observe(state) {
      current=state;
      if(host && book.stage<4){
        const before=JSON.stringify(book);
        observe(book,state);
        if(JSON.stringify(book)!==before){
          book.revision++;notify();
          if(book.stage>=0) for(const p of book.players)reply(p);
        }
      } else if(!host && (lastName!==state.me?.name || lastBase!==state.me?.total)){
        lastName=state.me?.name;lastBase=state.me?.total;sync();
      }
    },
    advance(stage){
      if(!channel?.ready || !host || stage!==book.stage || stage<0 || stage>=4)return;
      book.stage++;book.revision++;notify();for(const p of book.players)reply(p);
    },
    answer(stage,values){pending={stage,values};save(':pending',pending);sync();change();},
    close(){closed=true;channel?.close();}
  };
}
