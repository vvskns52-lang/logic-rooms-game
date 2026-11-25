import { colors, renderMap, visibleDoors } from './map.js';

const byId = id => document.getElementById(id);
const url = new URL(window.location.href);
const onTeacherComputer = true;
import { apiBase, publicKey } from './online-config.js';

function onlineHeaders(token) {
  return {
    ...(publicKey ? { apikey: publicKey } : {}),
    ...(publicKey.startsWith('ey') ? { Authorization: 'Bearer ' + publicKey } : {}),
    ...(token ? { 'X-Room-Token': token } : {}),
  };
}

function configureTeacherKey() {
  const input = document.getElementById('teacher-key');
  const row = document.getElementById('teacher-key-row');
  const fromLink = new URLSearchParams(url.hash.slice(1)).get('operator');
  try {
    if (fromLink) sessionStorage.setItem('logic-rooms-operator', fromLink);
    input.value = fromLink ?? sessionStorage.getItem('logic-rooms-operator') ?? '';
    input.addEventListener('change', () => {
      try { sessionStorage.setItem('logic-rooms-operator', input.value.trim()); } catch {}
    });
  } catch {
    input.value = fromLink ?? '';
  }
  if (fromLink) history.replaceState(null, '', url.pathname + url.search);
  row.hidden = false;
}

const host = onTeacherComputer && url.searchParams.get('host') === '1';
const storageKey = host ? 'logic-rooms-host' : 'logic-rooms-player';
const elements = {
  home: byId('home'), game: byId('game'), layout: byId('game-layout'), alert: byId('game-alert'),
  control: byId('control'), map: byId('game-map'), preview: byId('preview-map'),
};
const guide = byId('host-guide');
const guideButton = byId('open-guide');
const guideSelect = byId('guide-question');

let session = null;
let state = null;
let stateReceived = 0;
let statusMessage = '';
let connectionMessage = '';
let statusTimer = null;
let issued = 0;
let accepted = 0;
let selected = null;
let color = '민트';
let busy = false;
let controlPhase = null;
let lobbySignature = '';
let missionSignature = '';
let displayedSecond = null;
let lastMapFrame = 0;
let guideQuestions = [];

function escape(text) {
  return String(text).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
}

function safeSession() {
  try {
    return JSON.parse(sessionStorage.getItem(storageKey) || 'null');
  } catch {
    return null;
  }
}

function store(next) {
  session = next;
  try {
    if (next) sessionStorage.setItem(storageKey, JSON.stringify(next));
    else sessionStorage.removeItem(storageKey);
  } catch {
    // The active tab still works if storage is disabled.
  }
}

async function request(path, data, token) {
  let response;
  try {
    response = await fetch(apiBase + path, {
      method: data ? 'POST' : 'GET',
      headers: {
        ...(data ? { 'Content-Type': 'application/json' } : {}),
        ...onlineHeaders(token),
      },
      ...(data ? { body: JSON.stringify(data) } : {}),
      signal: AbortSignal.timeout(5000),
    });
  } catch {
    throw new Error('연결이 잠시 끊겼어요. 다시 연결하는 중이에요.');
  }
  const payload = await response.json();
  if (!response.ok) throw Object.assign(new Error(payload.error), { status: response.status });
  return payload;
}

function showEntry() {
  elements.home.hidden = false;
  elements.game.hidden = true;
  state = null;
  controlPhase = null;
  guideButton.hidden = true;
  if (guide.open) guide.close();
  byId('top-status').innerHTML = '';
  renderMap(elements.preview, { preview: true, round: 0, players: [] });
}

function message(text, duration = 3500) {
  clearTimeout(statusTimer);
  statusMessage = text;
  paintAlert();
  if (text) statusTimer = setTimeout(() => { statusMessage = ''; paintAlert(); }, duration);
}

function paintAlert() {
  const text = statusMessage || connectionMessage;
  elements.alert.hidden = !text;
  elements.alert.textContent = text;
}

function clearSession(error = '') {
  store(null);
  issued += 1;
  accepted = issued;
  selected = null;
  connectionMessage = '';
  message('');
  showEntry();
  byId('home-error').textContent = error;
}

function revealState(next, sequence) {
  if (sequence < accepted) return;
  accepted = sequence;
  const priorState = state;
  if (!priorState || priorState.questionId !== next.questionId) selected = null;
  if (next.me?.answer !== null && next.me?.answer !== undefined) selected = next.me.answer;
  state = next;
  stateReceived = performance.now();
  connectionMessage = '';
  paintAlert();
  elements.home.hidden = true;
  elements.game.hidden = false;
  guideButton.hidden = !host;
  paintGame();
}

function paintGuide() {
  const question = guideQuestions[Number(guideSelect.value)];
  if (!question) return;
  byId('guide-answer').textContent = '정답 · ' + question.answer;
  byId('guide-explanation').textContent = question.explanation;
}

async function openGuide() {
  if (!host || !session || !state || guide.open) return;
  const saved = session;
  const question = Math.max(0, state.questionId);
  const status = byId('guide-status');
  const content = byId('guide-content');
  content.hidden = true;
  status.textContent = '풀이 불러오는 중…';
  guide.showModal();
  guideButton.disabled = true;
  try {
    const questions = await request('/api/host-guide?code=' + saved.code, null, saved.token);
    if (session !== saved || !guide.open) return;
    guideQuestions = questions;
    const options = guideQuestions.map((entry, index) =>
      new Option(entry.round + '라운드 · ' + entry.title, String(index)));
    guideSelect.replaceChildren(...options);
    guideSelect.value = String(Math.min(question, options.length - 1));
    paintGuide();
    content.hidden = false;
    status.textContent = '';
  } catch (error) {
    if (guide.open && session === saved) status.textContent = error.message;
  } finally {
    guideButton.disabled = false;
  }
}

function iconSwatches() {
  byId('colors').innerHTML = Object.entries(colors).map(([name, tone]) =>
    '<button type="button" class="swatch" aria-label="' + name + '" aria-pressed="' + (name === color) +
    '" data-color="' + name + '"><span class="mini-avatar" style="--avatar:' + tone + '" aria-hidden="true"></span></button>'
  ).join('');
}

function initializeEntry() {
  if (host) {
    byId('host-label').hidden = false;
    byId('join-form').hidden = true;
    byId('create-room').hidden = false;
    configureTeacherKey();
    byId('lead').textContent = '새 방을 열고, 모두 입장하면 시작하세요.';
    byId('role-link').textContent = '학생 입장 화면';
    byId('role-link').href = './';
  } else {
    byId('role-link').hidden = !onTeacherComputer;
    const code = url.searchParams.get('join');
    if (code) byId('code').value = code.slice(0, 5).toUpperCase();
    iconSwatches();
  }
}

function playerList(players) {
  return players.map(player => '<li><span class="mini-avatar" style="--avatar:' + colors[player.color] +
    '" aria-hidden="true"></span>' + escape(player.name) + '</li>').join('');
}

function timer() {
  return '<div class="clock-row"><div class="clock-track" aria-hidden="true"><span id="clock-fill"></span></div>' +
    '<span class="clock" id="clock" aria-label="남은 시간"></span></div>';
}

function hostPause() {
  return '<button type="button" class="secondary fill" id="pause-btn" data-action="pause">일시정지</button>';
}

function lobbyPanel() {
  if (host) {
    const links = session.urls?.length ? session.urls : [location.origin];
    const rows = links.map((link, index) => {
      const href = new URL(link);
      href.searchParams.set('join', state.code);
      return '<div class="address-row"><input type="text" readonly value="' + escape(href.href) +
        '" aria-label="학생 입장 주소 ' + (index + 1) + '"><button class="compact" type="button" data-action="copy">복사</button></div>';
    }).join('');
    return '<p class="eyebrow">학생 입장</p><div class="setup-code">' + state.code +
      '</div><p class="small">태블릿에 아래 주소를 열면 입장 코드가 자동으로 입력돼요.</p>' +
      rows + '<p class="seating" id="seating"></p><ul class="roster" id="roster"></ul>' +
      '<button class="primary fill" type="button" id="start-btn" data-action="start">게임 시작</button>';
  }
  return '<p class="eyebrow">입장 완료</p><h2>' + escape(state.me.name) +
    ' 님</h2><p>선생님이 게임을 시작하면 첫 문제가 열려요. 바닥을 눌러 다른 친구들 곁으로 이동해 보세요.</p>' +
    '<p class="seating" id="seating"></p><ul class="roster" id="roster"></ul>' +
    '<button class="secondary fill" type="button" data-action="leave">입장 화면으로</button>';
}

function optionButtons(puzzle, revealed) {
  return puzzle.options.map((option, index) => {
    const classes = [revealed && index === puzzle.correct ? 'correct' : '', revealed && index !== puzzle.correct && state.me?.answer === index ? 'wrong' : ''];
    return '<button type="button" class="choice ' + classes.join(' ') + '" data-choice="' + index +
      '" aria-pressed="false"' + (host || revealed ? ' disabled' : '') +
      '><span class="answer-key" aria-hidden="true">' + (index + 1) + '</span><span>' + escape(option) + '</span></button>';
  }).join('');
}

function missionAction(puzzle) {
  return {
    evidence: '답 제출',
    switches: '회로 제출',
    sequence: '검수함 제출',
    route: '운반 경로 제출',
  }[puzzle.mode];
}

function lampsRow(label, lights) {
  return '<div class="lamp-line"><strong>' + label + '</strong><div class="lamps">' +
    lights.map((light, index) => '<span class="lamp ' + (light ? 'lit' : '') +
      '" aria-label="' + (index + 1) + '번 ' + (light ? '켜짐' : '꺼짐') + '">' + (index + 1) + '</span>').join('') +
    '</div></div>';
}

function edgeTable(puzzle) {
  return '<details class="edge-table"><summary>전체 경로와 비용</summary><ul>' +
    puzzle.stations.filter(station => station.id !== 'H').map(station => '<li><b>' + station.id +
      (station.stamp ? ' (' + station.stamp + ')' : '') + '</b> · ' +
      puzzle.edges.filter(edge => edge.from === station.id).map(edge => edge.to + ' (' + edge.cost + ')').join('　') +
    '</li>').join('') + '</ul></details>';
}

function puzzlePanel(revealed) {
  const puzzle = state.puzzle;
  const questionLabel = puzzle.total > 1 ? '문제 ' + puzzle.number + ' / ' + puzzle.total : state.roomName;
  const showPuzzleMaterial = !revealed || !state.me;
  let markup = timer() + '<p class="eyebrow">' + (revealed ? '정답 공개' : escape(questionLabel)) + '</p>' +
    '<h2>' + escape(puzzle.title) + '</h2>';
  if (showPuzzleMaterial) {
    markup += '<p>' + escape(puzzle.intro) + '</p>';
    if (puzzle.rules) markup += '<ol class="mission-rules">' +
      puzzle.rules.map(rule => '<li>' + escape(rule) + '</li>').join('') + '</ol>';
    if (puzzle.mode === 'switches') markup += lampsRow('목표 전등', puzzle.targetLights);
    if (puzzle.mode === 'route') markup += edgeTable(puzzle);
  }
  if (!revealed && !host) {
    markup += '<div id="mission-state" class="mission-state"></div>';
  }
  if (puzzle.options) markup += '<div class="choices">' + optionButtons(puzzle, revealed) + '</div>';
  if (revealed) {
    markup += '<strong class="solution">정답 · ' + escape(puzzle.solution ?? puzzle.options[puzzle.correct]) + '</strong>' +
      '<p>' + escape(puzzle.explanation) + '</p>';
    if (state.me) {
      let feedback = '이 문제에 제출한 답이 없어요.';
      if (state.me.submitted) {
        feedback = state.me.result ? '도전에 성공했어요.' :
          puzzle.options ? '내가 고른 답 · ' + puzzle.options[state.me.answer] : '제출한 계획은 모든 조건을 만족하지 못했어요.';
      }
      markup += '<div class="verdict">' + escape(feedback) + '</div>';
    }
  } else if (state.me) {
    markup += '<button type="button" class="primary fill" id="submit-btn" data-action="answer" disabled>' +
      missionAction(puzzle) + '</button>';
  }
  if (host) markup += '<p class="small" id="submit-count"></p>' + hostPause();
  return markup;
}

function passagePanel() {
  const finalRound = state.round === 3;
  let messageText = '모두 다음 방으로 이동해요. 열린 문을 눌러 들어갈 수 있어요.';
  let route = state.roomName;
  if (finalRound && host) {
    messageText = '두 방에서 같은 최종 문제를 풀어요. 학생마다 자기 문이 열립니다.';
    route = '우승 도전 ' + state.finalistCount + '명 · 기록 도전 ' + (state.count - state.finalistCount) + '명';
  } else if (finalRound) {
    messageText = state.me.finalist ? '열린 문으로 들어가 마지막 문제에서 우승에 도전하세요.' :
      '열린 문으로 들어가 마지막 문제를 풀고 배지에 도전하세요.';
    route = state.me.finalist ? '우승 도전' : '기록 도전';
  }
  return timer() + '<p class="eyebrow">이동 시간</p><h2>다음 문이 열렸어요</h2>' +
    '<div class="route">' + route + '</div><p>' + messageText + '</p>' +
    (host ? hostPause() : '<button class="primary fill" type="button" id="door-btn" data-action="door">열린 문으로 이동</button>');
}

function finishPanel() {
  const headline = state.winners.length > 1 ? '공동 우승' : '우승';
  const winnerText = state.winners.length ? '<div class="route">' + headline + ' · ' +
    escape(state.winners.join(', ')) + '</div>' : '<p>오늘 마지막 문제의 우승자는 없어요.</p>';
  const myScore = !host ? '<span class="score-num">' + state.me.correct + ' / 4</span>' +
    '<p>내가 맞힌 문제 · 배지 ' + state.me.correct + '개</p><div class="badges" aria-hidden="true">' +
    Array.from({ length: 4 }, (_, index) => '<span class="badge ' + (index < state.me.correct ? 'earned' : '') + '">◆</span>').join('') + '</div>' : '';
  return '<p class="eyebrow">게임 결과</p><h2>모든 도전 완료</h2>' + myScore + winnerText +
    '<button class="secondary fill" type="button" data-action="leave">' + (host ? '새 판 준비' : '처음 화면으로') + '</button>';
}

function updateMission() {
  const panel = byId('mission-state');
  if (!panel) return;
  const puzzle = state.puzzle;
  const task = state.me.task;
  const current = task.visits.at(-1);
  const signature = task.visits.join(',');
  if (signature === missionSignature) return;
  missionSignature = signature;

  let status = '';
  let labels = puzzle.stations.map(station => ({ id: station.id, detail: '' }));
  let edit = '';
  if (puzzle.mode === 'evidence') {
    status = '<div class="task-caption">수집한 보고서 ' + task.visits.length + ' / 4</div>' +
      '<ul class="report-list" aria-live="polite">' + [...task.reports].sort((a, b) => a.id.localeCompare(b.id)).map(report =>
        '<li><b>' + report.id + '</b>' + escape(report.text) + '</li>').join('') + '</ul>';
  } else if (puzzle.mode === 'switches') {
    status = lampsRow('현재 전등', task.lights) + '<div class="task-caption">켜진 스위치 ' + task.visits.length + ' / 3</div>';
    labels = puzzle.stations.map(station => ({ id: station.id, detail: station.flips.join('·') }));
    edit = '<button class="compact" type="button" data-action="reset">스위치 초기화</button>';
  } else if (puzzle.mode === 'sequence') {
    status = '<div class="task-caption">칩 검수함 ' + task.visits.length + ' / 5</div><div class="mission-slots">' +
      Array.from({ length: 5 }, (_, index) => '<span class="' + (task.visits[index] ? 'filled' : '') + '">' +
        (task.visits[index] ?? (index + 1)) + '</span>').join('') + '</div>';
    edit = '<button class="compact" type="button" data-action="undo">마지막 칩 빼기</button>';
  } else {
    const remaining = puzzle.budget - task.spent;
    status = '<div class="route-resources" aria-live="polite"><span>에너지 <b>' + remaining + '</b> / ' + puzzle.budget +
      '</span><span class="blue-stamp">파랑 <b>' + task.stamps.파랑 + '</b> / 1</span>' +
      '<span class="purple-stamp">보라 <b>' + task.stamps.보라 + '</b> / 1</span></div>' +
      '<div class="route-path" aria-label="이동 경로">' + task.visits.join(' → ') + '</div>';
    labels = puzzle.edges.filter(edge => edge.from === current).map(edge =>
      ({ id: edge.to, detail: '에너지 ' + edge.cost, unaffordable: edge.cost > remaining }));
    edit = '<button class="compact" type="button" data-action="undo">한 지점 돌아가기</button>' +
      '<button class="compact" type="button" data-action="reset">출발지로</button>';
  }
  panel.innerHTML = status + '<div class="station-buttons">' + labels.map(station => {
    const visited = task.visits.includes(station.id);
    const off = station.unaffordable || (puzzle.mode === 'sequence' && visited) ||
      (puzzle.mode === 'switches' && !visited && task.visits.length === puzzle.switchCount);
    return '<button class="compact ' + (visited ? 'found' : '') + '" type="button" data-station="' + station.id +
      '" data-off="' + Boolean(off) + '" aria-label="' + station.id + ' 장치' +
      (station.detail ? ' · ' + escape(station.detail) : '') + '" aria-pressed="' + visited + '">' +
      '<strong>' + station.id + '</strong>' + (station.detail ? '<span>' + escape(station.detail) + '</span>' : '') + '</button>';
  }).join('') + '</div>' + (edit ? '<div class="mission-edits">' + edit + '</div>' : '');
}

function paintButtons() {
  const phase = state.phase;
  if (phase === 'question' && state.me) {
    const locked = state.me.submitted;
    const task = state.me.task;
    const puzzle = state.puzzle;
    const unavailable = locked || state.paused || busy || state.me.operating;
    for (const button of elements.control.querySelectorAll('[data-choice]')) {
      button.setAttribute('aria-pressed', String(Number(button.dataset.choice) === selected));
      button.disabled = unavailable || !task.ready;
    }
    for (const button of elements.control.querySelectorAll('[data-station]')) {
      button.disabled = unavailable || button.dataset.off === 'true';
    }
    for (const button of elements.control.querySelectorAll('.mission-edits button')) {
      button.disabled = unavailable || task.visits.length <= (puzzle.mode === 'route' ? 1 : 0);
    }
    const submit = byId('submit-btn');
    submit.disabled = unavailable || !task.ready || (puzzle.options && selected === null);
    submit.textContent = locked ? '제출 완료' : busy ? '처리 중…' : missionAction(puzzle);
  }
  const startBtn = byId('start-btn');
  if (startBtn) startBtn.disabled = state.count === 0 || busy;
  const pauseBtn = byId('pause-btn');
  if (pauseBtn) {
    pauseBtn.dataset.action = state.paused ? 'resume' : 'pause';
    pauseBtn.textContent = state.paused ? '계속 진행' : '일시정지';
    pauseBtn.disabled = busy;
  }
  const doorBtn = byId('door-btn');
  if (doorBtn) {
    doorBtn.disabled = state.me.entered || state.paused;
    doorBtn.textContent = state.me.entered ? '다음 방 도착' : '열린 문으로 이동';
  }
  const count = byId('submit-count');
  if (count) count.textContent = '답 제출 ' + state.submitted + ' / ' + state.count + '명';
}

function paintGame() {
  const phase = state.phase;
  const newPhase = controlPhase !== state.phaseId;
  if (newPhase) {
    if (controlPhase !== null) window.scrollTo(0, 0);
    controlPhase = state.phaseId;
    missionSignature = '#';
    lobbySignature = '';
    displayedSecond = null;
    elements.layout.className = 'game-layout ' + phase + '-mode' + (state.puzzle && !host ? ' has-mission' : '');
    const stage = state.round ? state.round + ' / 3 라운드' : '입장 중';
    byId('top-status').innerHTML = '<span class="pill stage-pill">' + stage + '</span>' +
      '<span class="pill pill-code" aria-label="방 코드 ' + state.code + '">' + state.code + '</span>';
    byId('scene-kicker').textContent = phase === 'passage' ? '다음 라운드' : stage;
    byId('scene-title').textContent = state.roomName;
    byId('scene-info').textContent = state.round === 3 && !host
      ? state.area === 'record' ? '기록 도전' : '우승 도전' : '';
    byId('map-help').textContent = host ? '학생들의 캐릭터가 여기에 보여요.' :
      phase === 'passage' ? '열린 문을 눌러 이동하세요.' :
      state.puzzle && phase === 'question' ? '지도나 조작판에서 장치를 누르면 캐릭터가 이동해요.' :
      ['lobby', 'question'].includes(phase) ? '바닥을 터치하면 캐릭터가 이동해요.' : '';
    const panels = {
      lobby: lobbyPanel,
      question: () => puzzlePanel(false),
      reveal: () => puzzlePanel(true),
      passage: passagePanel,
      finish: finishPanel,
    };
    elements.control.innerHTML = panels[phase]();
  }
  const roster = byId('roster');
  if (roster) {
    const signature = state.players.map(player => player.id).join(',');
    if (lobbySignature !== signature) {
      roster.innerHTML = playerList(state.players);
      lobbySignature = signature;
    }
    byId('seating').textContent = '입장 ' + state.count + ' / ' + state.capacity + '명';
  }
  byId('map-pop').textContent = state.players.length + '명';
  const overlay = byId('map-overlay');
  if (Boolean(overlay.firstChild) !== state.paused) {
    overlay.innerHTML = state.paused ? '<span class="pause-badge" role="status">잠시 쉬어가는 중</span>' : '';
  }
  updateMission();
  paintButtons();
}

let polling = false;
async function poll() {
  if (!session || polling) return;
  const saved = session;
  polling = true;
  const sequence = ++issued;
  try {
    const snapshot = await request('/api/state?code=' + saved.code, null, saved.token);
    if (session === saved) revealState(snapshot, sequence);
  } catch (error) {
    if (session !== saved || sequence < accepted) return;
    if ([403, 404].includes(error.status)) clearSession(error.message);
    else if (state) {
      connectionMessage = error.message;
      paintAlert();
    } else {
      byId('home-error').textContent = error.message;
    }
  } finally {
    polling = false;
  }
}

async function action(type, fields = {}, blocking = true) {
  if (!session || !state || (blocking && busy)) return;
  if (blocking) {
    busy = true;
    paintButtons();
  }
  const saved = session;
  const sequence = ++issued;
  try {
    const snapshot = await request('/api/action', { code: saved.code, action: type, ...fields }, saved.token);
    if (session === saved) revealState(snapshot, sequence);
  } catch (error) {
    if (session === saved && sequence >= accepted) message(error.message);
  } finally {
    if (blocking) {
      busy = false;
      if (state) paintButtons();
    }
  }
}

function actOnMap(x, y, mark = null, door = false) {
  if (host || !state || state.paused || !['lobby', 'question', 'passage'].includes(state.phase)) return;
  if (state.me.operating || busy || (mark && state.me.submitted)) return;
  action('move', { x, y, mark, door, phaseId: state.phaseId }, Boolean(mark));
}

function moveToDoor() {
  const open = visibleDoors(state, host).find(entry => entry.open);
  if (open) actOnMap(open.point.x, open.point.y, null, true);
}

async function enter(path, data, button) {
  button.disabled = true;
  byId('home-error').textContent = '';
  try {
    const result = await request(path, data);
    store({ code: result.code, token: result.token, urls: result.urls ?? [new URL('./', location.href).href] });
    if (result.state) revealState(result.state, ++issued);
    else await poll();
  } catch (error) {
    byId('home-error').textContent = error.message;
  } finally {
    button.disabled = false;
  }
}

byId('create-room').addEventListener('click', event => enter('/api/create', { operator: byId('teacher-key').value.trim() }, event.currentTarget));
byId('join-form').addEventListener('submit', event => {
  event.preventDefault();
  const form = event.currentTarget;
  enter('/api/join', {
    code: byId('code').value.toUpperCase(), name: byId('nickname').value, color,
  }, form.querySelector('button[type="submit"]'));
});
byId('colors').addEventListener('click', event => {
  const button = event.target.closest('[data-color]');
  if (!button) return;
  color = button.dataset.color;
  for (const swatch of byId('colors').children) swatch.setAttribute('aria-pressed', String(swatch === button));
});
elements.control.addEventListener('click', async event => {
  const button = event.target.closest('button');
  if (!button || !state) return;
  const { choice, station, action: type } = button.dataset;
  if (choice !== undefined && state.phase === 'question' && !state.me?.submitted) {
    selected = Number(choice);
    paintButtons();
    return;
  }
  if (station !== undefined) {
    const point = state.puzzle.stations.find(item => item.id === station);
    actOnMap(point.x, point.y, station);
    return;
  }
  switch (type) {
    case 'leave':
      if (!host && state.phase === 'lobby' && !busy) {
        busy = true;
        button.disabled = true;
        try {
          await request('/api/action', { code: session.code, action: 'leave' }, session.token);
          clearSession();
        } catch (error) {
          message(error.message);
        } finally {
          busy = false;
          button.disabled = false;
        }
      } else if (state.phase === 'finish') {
        clearSession();
      }
      break;
    case 'copy': {
      const input = button.previousElementSibling;
      try {
        if (navigator.clipboard && window.isSecureContext) await navigator.clipboard.writeText(input.value);
        else {
          input.select();
          if (!document.execCommand('copy')) throw new Error('copy unavailable');
        }
        message('학생 입장 주소를 복사했어요.');
      } catch {
        input.select();
        message('선택된 주소를 복사해 주세요.');
      }
      break;
    }
    case 'door':
      moveToDoor();
      break;
    case 'answer':
      action(type, { choice: selected, questionId: state.questionId });
      break;
    case 'reset':
    case 'undo':
      action(type, { questionId: state.questionId });
      break;
    case 'start':
    case 'pause':
    case 'resume':
      action(type);
      break;
  }
});

elements.map.addEventListener('pointerdown', event => {
  if (!state || host || !event.isPrimary || event.button !== 0) return;
  const rect = elements.map.getBoundingClientRect();
  const x = (event.clientX - rect.left) / rect.width;
  const y = (event.clientY - rect.top) / rect.height;
  const near = (point, distance) => Math.hypot((x - point.x) * rect.width, (y - point.y) * rect.height) < distance;
  if (state.phase === 'passage') {
    const entries = visibleDoors(state, host);
    if (entries.some(entry => entry.open && near(entry.point, 52))) return moveToDoor();
    if (entries.some(entry => !entry.open && near(entry.point, 45))) return message('빛이 켜진 문으로 들어가 주세요.');
  }
  const mark = state.phase === 'question' && state.puzzle
    ? state.puzzle.stations.find(point => near(point, 26))?.id ?? null : null;
  actOnMap(x, y, mark);
});

elements.map.addEventListener('keydown', event => {
  const directions = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
  const direction = directions[event.key];
  if (!state?.me || !direction) return;
  const player = state.players.find(entry => entry.id === state.me.id);
  if (!player) return;
  event.preventDefault();
  const base = player.move?.to ?? player.position;
  actOnMap(base.x + .075 * direction[0], base.y + .1 * direction[1]);
});

function animate(now) {
  if (state && now - lastMapFrame >= 33) {
    const elapsed = state.paused || connectionMessage ? 0 : now - stateReceived;
    const seconds = state.endsIn === null ? null : Math.max(0, state.endsIn - elapsed);
    const clock = byId('clock');
    if (clock && seconds !== null) {
      const second = Math.ceil(seconds / 1000);
      if (second !== displayedSecond) {
        clock.textContent = String(second) + '초';
        clock.classList.toggle('urgent', second <= 8);
        displayedSecond = second;
      }
      byId('clock-fill').style.transform = 'scaleX(' + Math.min(1, seconds / Math.max(1, state.duration)) + ')';
    }
    renderMap(elements.map, state, state.now + elapsed, host);
    lastMapFrame = now;
  }
  requestAnimationFrame(animate);
}

initializeEntry();
showEntry();
guideButton.addEventListener('click', openGuide);
guideSelect.addEventListener('change', paintGuide);
const stored = safeSession();
if (stored && (host || !url.searchParams.has('join') || byId('code').value === stored.code)) {
  store(stored);
  poll();
}
new ResizeObserver(() => {
  if (!elements.home.hidden) renderMap(elements.preview, { preview: true, round: 0, players: [] });
}).observe(elements.preview);
window.addEventListener('pageshow', poll);
window.addEventListener('online', poll);
setInterval(poll, 900 + Math.floor(Math.random() * 450));
requestAnimationFrame(animate);
