// 기록실 배경음: 음원 파일 없이 Web Audio로 실시간 합성하는 공포 앰비언트.
// 낮은 드론 + 바람 소리 + 어긋난 오르골 + 문제 풀이 중 심장 박동(시간이 적을수록 빨라짐).
const host = new URL(location.href).searchParams.get('host') === '1';
const prefKey = 'logic-rooms-bgm';
const button = document.getElementById('bgm-button');

let enabled = host;
try {
  const saved = localStorage.getItem(prefKey);
  if (saved !== null) enabled = saved === 'on';
} catch {}

let ctx = null;
let master = null;
let mood = { phase: 'entry', urgent: false };
let timers = [];
let heartTimer = 0;

function label() {
  button.setAttribute('aria-pressed', String(enabled));
  button.querySelector('.bgm-label').textContent = enabled ? '배경음 켜짐' : '배경음 꺼짐';
}

function noiseBuffer(seconds) {
  const buffer = ctx.createBuffer(1, ctx.sampleRate * seconds, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  let brown = 0;
  for (let i = 0; i < data.length; i += 1) {
    brown = (brown + 0.02 * (Math.random() * 2 - 1)) / 1.02;
    data[i] = brown * 3.2;
  }
  return buffer;
}

function lfo(rate, depth, target) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.frequency.value = rate;
  gain.gain.value = depth;
  osc.connect(gain).connect(target);
  osc.start();
}

function build() {
  ctx = new (window.AudioContext || window.webkitAudioContext)();
  master = ctx.createGain();
  master.gain.value = 0;
  const comp = ctx.createDynamicsCompressor();
  master.connect(comp).connect(ctx.destination);

  // 어두운 잔향(피드백 딜레이 두 개)
  const echo = ctx.createDelay(2);
  const echoBack = ctx.createGain();
  const echoTone = ctx.createBiquadFilter();
  echo.delayTime.value = 0.47;
  echoBack.gain.value = 0.48;
  echoTone.type = 'lowpass';
  echoTone.frequency.value = 1900;
  echo.connect(echoTone).connect(echoBack).connect(echo);
  echoTone.connect(master);
  build.echo = echo;

  // 1) 드론: 반음·트라이톤으로 비틀린 저음
  const droneFilter = ctx.createBiquadFilter();
  droneFilter.type = 'lowpass';
  droneFilter.frequency.value = 240;
  droneFilter.Q.value = 6;
  const droneGain = ctx.createGain();
  droneGain.gain.value = 0.16;
  droneFilter.connect(droneGain).connect(master);
  for (const [freq, type, level] of [[55, 'sawtooth', .5], [55.6, 'sawtooth', .5], [77.8, 'triangle', .45], [58.3, 'sine', .7]]) {
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    g.gain.value = level;
    osc.connect(g).connect(droneFilter);
    lfo(0.03 + Math.random() * 0.05, freq * 0.004, osc.frequency);
    osc.start();
  }
  lfo(0.045, 140, droneFilter.frequency);
  lfo(0.11, 0.05, droneGain.gain);

  // 2) 바람/숨소리
  const wind = ctx.createBufferSource();
  wind.buffer = noiseBuffer(6);
  wind.loop = true;
  const windFilter = ctx.createBiquadFilter();
  windFilter.type = 'bandpass';
  windFilter.frequency.value = 420;
  windFilter.Q.value = 0.9;
  const windGain = ctx.createGain();
  windGain.gain.value = 0.05;
  wind.connect(windFilter).connect(windGain).connect(master);
  lfo(0.07, 260, windFilter.frequency);
  lfo(0.13, 0.035, windGain.gain);
  wind.start();

  schedule(musicBox, 2200);
  schedule(swell, 14000);
  schedule(creak, 9000);
}

function schedule(fn, firstDelay) {
  const run = () => {
    if (!ctx) return;
    const next = fn();
    timers.push(setTimeout(run, next));
  };
  timers.push(setTimeout(run, firstDelay));
}

// 3) 음이 살짝 어긋난 오르골
const lullaby = [880, 932.3, 1046.5, 1244.5, 1318.5, 1396.9, 1760, 1864.7];
function musicBox() {
  const now = ctx.currentTime;
  const count = 1 + Math.floor(Math.random() * 3);
  for (let i = 0; i < count; i += 1) {
    const at = now + i * (0.28 + Math.random() * 0.2);
    const freq = lullaby[Math.floor(Math.random() * lullaby.length)] * (1 + (Math.random() - 0.5) * 0.012);
    for (const [mult, level] of [[1, 0.06], [2.01, 0.018], [3.98, 0.008]]) {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq * mult;
      g.gain.setValueAtTime(0, at);
      g.gain.linearRampToValueAtTime(level, at + 0.005);
      g.gain.exponentialRampToValueAtTime(0.0001, at + 2.2);
      osc.connect(g);
      g.connect(master);
      g.connect(build.echo);
      osc.start(at);
      osc.stop(at + 2.4);
    }
  }
  const busy = mood.phase === 'question' || mood.phase === 'study';
  return (busy ? 5200 : 2600) + Math.random() * 4200;
}

// 4) 불협화음으로 부풀었다 꺼지는 소리
function swell() {
  const now = ctx.currentTime;
  const base = [146.8, 155.6, 207.7][Math.floor(Math.random() * 3)];
  for (const ratio of [1, 1.059, 1.414]) {
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.value = base * ratio;
    osc.frequency.linearRampToValueAtTime(base * ratio * 0.97, now + 7);
    g.gain.setValueAtTime(0, now);
    g.gain.linearRampToValueAtTime(0.03, now + 3.5);
    g.gain.linearRampToValueAtTime(0, now + 7);
    osc.connect(g).connect(master);
    g.connect(build.echo);
    osc.start(now);
    osc.stop(now + 7.2);
  }
  return 18000 + Math.random() * 22000;
}

// 5) 낡은 문이 삐걱이는 소리
function creak() {
  const now = ctx.currentTime;
  const osc = ctx.createOscillator();
  const filter = ctx.createBiquadFilter();
  const g = ctx.createGain();
  osc.type = 'sawtooth';
  osc.frequency.setValueAtTime(70 + Math.random() * 30, now);
  osc.frequency.linearRampToValueAtTime(150 + Math.random() * 80, now + 1.3);
  filter.type = 'bandpass';
  filter.frequency.value = 900;
  filter.Q.value = 9;
  g.gain.setValueAtTime(0, now);
  g.gain.linearRampToValueAtTime(0.035, now + 0.2);
  g.gain.linearRampToValueAtTime(0.02, now + 1);
  g.gain.linearRampToValueAtTime(0, now + 1.4);
  const wobble = ctx.createOscillator();
  const wobbleDepth = ctx.createGain();
  wobble.frequency.value = 19;
  wobbleDepth.gain.value = 25;
  wobble.connect(wobbleDepth).connect(osc.frequency);
  osc.connect(filter).connect(g).connect(master);
  osc.start(now);
  wobble.start(now);
  osc.stop(now + 1.5);
  wobble.stop(now + 1.5);
  return 20000 + Math.random() * 30000;
}

// 6) 심장 박동: 암기·풀이 시간에만, 남은 시간이 10초 이하면 빨라짐
function thump(at, level) {
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(62, at);
  osc.frequency.exponentialRampToValueAtTime(34, at + 0.18);
  g.gain.setValueAtTime(0, at);
  g.gain.linearRampToValueAtTime(level, at + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, at + 0.3);
  osc.connect(g).connect(master);
  osc.start(at);
  osc.stop(at + 0.32);
}

function heartbeat() {
  clearTimeout(heartTimer);
  if (!ctx || !['study', 'question'].includes(mood.phase)) return;
  const at = ctx.currentTime + 0.02;
  const loud = mood.urgent ? 0.5 : 0.32;
  thump(at, loud);
  thump(at + 0.24, loud * 0.7);
  heartTimer = setTimeout(heartbeat, mood.urgent ? 520 : 960);
}

function fade(to, seconds = 1.6) {
  if (!master) return;
  const now = ctx.currentTime;
  master.gain.cancelScheduledValues(now);
  master.gain.setValueAtTime(master.gain.value, now);
  master.gain.linearRampToValueAtTime(to, now + seconds);
}

function level() {
  if (mood.phase === 'reveal' || mood.phase === 'finish') return 0.5;
  return 0.8;
}

async function start() {
  if (!enabled) return;
  if (!ctx) build();
  if (ctx.state === 'suspended') await ctx.resume().catch(() => {});
  fade(level());
  heartbeat();
}

function stop() {
  if (!ctx) return;
  fade(0, 0.8);
  clearTimeout(heartTimer);
}

button.hidden = false;
label();
button.addEventListener('click', () => {
  enabled = !enabled;
  try { localStorage.setItem(prefKey, enabled ? 'on' : 'off'); } catch {}
  label();
  if (enabled) start();
  else stop();
});

// 브라우저 자동재생 정책 때문에 첫 클릭·터치·키 입력에서 소리를 시작해요.
const unlock = () => {
  if (enabled) start();
  if (ctx && ctx.state === 'running') {
    window.removeEventListener('pointerdown', unlock, true);
    window.removeEventListener('keydown', unlock, true);
  }
};
window.addEventListener('pointerdown', unlock, true);
window.addEventListener('keydown', unlock, true);

window.addEventListener('room-phase', event => {
  mood = { ...mood, phase: event.detail.phase, urgent: false };
  if (ctx && enabled) {
    fade(level());
    heartbeat();
  }
});
window.addEventListener('room-urgent', event => {
  mood.urgent = event.detail;
  if (ctx && enabled) heartbeat();
});
// 정답이면 맑은 종소리, 오답이면 낮게 가라앉는 소리
window.addEventListener('room-result', event => {
  if (!ctx || !enabled) return;
  const now = ctx.currentTime;
  const notes = event.detail ? [[1318.5, 0], [1760, 0.12], [2637, 0.24]] : [[146.8, 0], [138.6, 0.18]];
  for (const [freq, delay] of notes) {
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = event.detail ? 'sine' : 'sawtooth';
    osc.frequency.setValueAtTime(freq, now + delay);
    if (!event.detail) osc.frequency.exponentialRampToValueAtTime(freq * 0.7, now + delay + 0.9);
    g.gain.setValueAtTime(0, now + delay);
    g.gain.linearRampToValueAtTime(event.detail ? 0.09 : 0.07, now + delay + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, now + delay + (event.detail ? 1.6 : 1));
    osc.connect(g).connect(master);
    g.connect(build.echo);
    osc.start(now + delay);
    osc.stop(now + delay + 1.7);
  }
});
document.addEventListener('visibilitychange', () => {
  if (!ctx) return;
  if (document.hidden) ctx.suspend();
  else if (enabled) ctx.resume();
});
