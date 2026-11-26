import { apiBase, publicKey } from './online-config.js';

const encode = bytes => btoa(String.fromCharCode(...new Uint8Array(bytes)));
const decode = text => Uint8Array.from(atob(text), char => char.charCodeAt(0));
const curve = { name: 'ECDH', namedCurve: 'P-256' };

export async function roomChannel({code, key, host, expectedHost, receive, connected, status}) {
  let identity = JSON.parse(sessionStorage.getItem(key + ':identity') || 'null');
  if (!identity) {
    const pair = await crypto.subtle.generateKey(curve, true, ['deriveKey']);
    identity = { id: encode(await crypto.subtle.exportKey('raw', pair.publicKey)),
      private: await crypto.subtle.exportKey('jwk', pair.privateKey) };
    sessionStorage.setItem(key + ':identity', JSON.stringify(identity));
  }
  const own = await crypto.subtle.importKey('jwk', identity.private, curve, false, ['deriveKey']);
  const peers = new Map();
  const id = identity.id;
  let teacher = expectedHost || sessionStorage.getItem(key + ':teacher');
  let socket, reconnect, heartbeat, stopped = false, ready = false, ref = 0;
  const topic = 'realtime:logic-seven-v2-' + code;
  function shared(peer) {
    if (!peers.has(peer)) {
      const promise = crypto.subtle.importKey('raw', decode(peer), curve, false, [])
        .then(publicKey => crypto.subtle.deriveKey({name:'ECDH', public: publicKey}, own,
          {name:'AES-GCM', length:256}, false, ['encrypt','decrypt']));
      peers.set(peer, promise);
    }
    return peers.get(peer);
  }
  function frame(event, payload, dest = topic) {
    if (socket?.readyState === WebSocket.OPEN)
      socket.send(JSON.stringify({topic:dest,event,payload,ref:String(++ref)}));
  }
  function broadcast(message) {
    if (ready) frame('broadcast', {type:'broadcast',event:'room',payload:message});
  }
  async function send(peer, data) {
    if (!ready || !peer) return;
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const bytes = new TextEncoder().encode(JSON.stringify(data));
    const encrypted = await crypto.subtle.encrypt({name:'AES-GCM',iv}, await shared(peer), bytes);
    broadcast({to:peer,from:id,iv:encode(iv),body:encode(encrypted)});
  }
  function discover() {
    if (host) broadcast({teacher:id});
    else if (teacher) connected(teacher);
    else broadcast({discover:true});
  }
  async function handle(msg) {
    if (!msg) return;
    if (host && msg.discover) { broadcast({teacher:id}); return; }
    if (!host && msg.teacher && (!teacher || teacher === msg.teacher)) {
      if (!teacher) {
        teacher = msg.teacher;
        sessionStorage.setItem(key + ':teacher', teacher);
        connected(teacher);
      }
      return;
    }
    if (msg.to !== id || (!host && msg.from !== teacher)) return;
    const bytes = await crypto.subtle.decrypt({name:'AES-GCM',iv:decode(msg.iv)},await shared(msg.from),decode(msg.body));
    if (!stopped) receive(msg.from,JSON.parse(new TextDecoder().decode(bytes)));
  }
  function connect() {
    const url = new URL('/realtime/v1/websocket', apiBase);
    url.protocol = 'wss:';
    url.search = new URLSearchParams({apikey:publicKey, vsn:'1.0.0'});
    socket = new WebSocket(url);
    socket.onopen = () => frame('phx_join',{config:{broadcast:{self:false,ack:false},presence:{enabled:false},postgres_changes:[]}});
    socket.onmessage = event => {
      const msg = JSON.parse(event.data);
      if (msg.event === 'phx_reply' && msg.topic === topic && !ready) {
        if (msg.payload.status !== 'ok') {socket.close();return;}
        ready = true;
        status();
        discover();
      } else if (msg.event === 'broadcast') handle(msg.payload.payload).catch(() => {});
      else if (msg.event === 'phx_error' || msg.event === 'phx_close') socket.close();
    };
    socket.onclose = () => {
      ready = false;
      if(!stopped) status();
      if (!stopped) reconnect = setTimeout(connect,1800 + Math.random()*800);
    };
  }
  connect();
  heartbeat = setInterval(() => {
    if (ready) frame('heartbeat',{},'phoenix');
    if (!host) discover();
  }, 10000 + Math.random()*2500);
  return {id, send, get teacher(){return teacher;}, get ready(){return ready;},
    close(){stopped=true;clearTimeout(reconnect);clearInterval(heartbeat);socket.close();}};
}
