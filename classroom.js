import { apiBase, publicKey } from './online-config.js';

const find = id => document.getElementById(id);
const url = new URL(location.href);
const host = url.searchParams.get('host') === '1';
const storageKey = host ? 'logic-rooms-host-v3' : 'logic-rooms-player-v3';
const keyboardKey = 'logic-rooms-operator';
const scene = find('scene');
const guide = find('guide');
const phaseNames = { intro: '문제 설명', study: '암기 시간', question: '문제 풀이', reveal: '정답과 풀이' };

let session = null;
let state = null;
let phase = null;
let receivedAt = 0;
let issued = 0;
let accepted = 0;
let polling = false;
let busy = false;
let noticeTimer = 0;
let connectionLost = false;
let configuredGuide = [];
let draft = blankDraft();

function escape(value) {
  return String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
}

function blankDraft() {
  return { memory: [], numbers: Array(8).fill(null), slot: 0, pairs: [], face: null,
    corners: [[], []], corner: 0, times: [], choice: '', code: '' };
}

function draftKey() {
  return 'logic-rooms-draft-v3:' + session?.code + ':' + state?.questionId;
}

function savedDraft() {
  try {
    return { ...blankDraft(), ...JSON.parse(sessionStorage.getItem(draftKey()) || '{}') };
  } catch {
    return blankDraft();
  }
}

function saveDraft() {
  try { sessionStorage.setItem(draftKey(), JSON.stringify(draft)); } catch {}
}

function rememberSession(next) {
  session = next;
  try {
    if (next) sessionStorage.setItem(storageKey, JSON.stringify(next));
    else sessionStorage.removeItem(storageKey);
  } catch {}
}

async function request(path, data, token) {
  let reply;
  try {
    reply = await fetch(apiBase + '/api/' + path, {
      method: data ? 'POST' : 'GET',
      headers: {
        apikey: publicKey,
        ...(token ? { 'X-Room-Token': token } : {}),
        ...(data ? { 'Content-Type': 'application/json' } : {}),
      },
      ...(data ? { body: JSON.stringify(data) } : {}),
      signal: AbortSignal.timeout(9500),
    });
  } catch {
    throw new Error('연결 상태를 확인하고 있어요. 잠시 후 다시 시도해 주세요.');
  }
  const payload = await reply.json().catch(() => ({}));
  if (!reply.ok) throw Object.assign(new Error(payload.error || '게임 서버의 응답을 확인해 주세요.'), { status: reply.status });
  return payload;
}

function setEntryError(text) {
  find('entry-error').textContent = text;
  find('entry-error').hidden = !text;
}

function notice(text, timeout = 3500) {
  clearTimeout(noticeTimer);
  const region = find('live-alert');
  region.textContent = text;
  region.hidden = !text;
  if (text && timeout) noticeTimer = setTimeout(() => notice(''), timeout);
}

function resetSession(error = '') {
  rememberSession(null);
  state = null;
  phase = null;
  accepted = ++issued;
  find('entry').hidden = false;
  find('live').hidden = true;
  find('room-badge').hidden = true;
  find('guide-button').hidden = true;
  if (guide.open) guide.close();
  setEntryError(error);
  notice('');
}

function sceneHeader(title, caption) {
  const time = state.endsIn === null ? '' : '<div class="timer" role="timer" aria-label="남은 시간"><span id="timer"></span><div class="timer-track" aria-hidden="true"><span id="timer-fill"></span></div></div>';
  return '<header class="scene-heading"><div><p class="section-label">' + escape(caption) +
    '</p><h1 id="scene-title">' + escape(title) + '</h1></div>' + time + '</header>';
}

function activityTitle(question) {
  return state.round + '라운드 · ' + question.label + ' · ' + phaseNames[state.phase];
}

function controls() {
  if (!host || ['lobby', 'finish'].includes(state.phase)) return '';
  const labels = { story: '첫 문제 열기', intro: '설명 마치기', reveal: '풀이 마치기', passage: '다음 라운드 열기' };
  const advance = labels[state.phase]
    ? '<button type="button" class="button" data-action="advance">' + labels[state.phase] + '</button>' : '';
  return '<footer class="admin-bar"><p class="status-line" id="submitted-count"></p>' + advance +
    '<button type="button" class="button quiet" data-action="pause">일시정지</button></footer>';
}

function lobby() {
  if (!host) return sceneHeader('입장했어요', '대기실') + '<div class="scene-body">' +
    '<h2>' + escape(state.me.name) + ' 님</h2><p class="callout">선생님이 시작하면 첫 번째 문제 설명이 열려요.</p>' +
    '<button type="button" class="button quiet" data-action="leave">입장 화면으로</button></div>';
  const join = new URL('./', location.href);
  join.searchParams.set('join', state.code);
  return sceneHeader('학생 입장', '대기실') + '<div class="scene-body lobby-split"><section class="task-panel">' +
    '<p class="section-label">방 코드</p><div class="large-code">' + escape(state.code) + '</div>' +
    '<label for="join-address">학생 입장 주소</label><div class="link-row"><input id="join-address" readonly value="' + escape(join.href) + '">' +
    '<button class="button quiet" type="button" data-action="copy">복사</button></div></section>' +
    '<section class="task-panel"><h2>입장 명단</h2><p id="roster-summary"></p><ul class="roster" id="roster"></ul>' +
    '<button class="button primary" type="button" data-action="start">게임 시작</button></section></div>';
}

function intro(question) {
  return '<div class="intro-layout"><p class="intro-text">' + escape(question.intro) + '</p>' +
    '<ol class="instructions">' + question.steps.map(step => '<li>' + escape(step) + '</li>').join('') + '</ol></div>';
}

function targets(question) {
  return '<div class="target-list">' + question.targets.map((target, index) => '<span><b>' + (index + 1) +
    '</b> · <b class="symbol-' + escape(target.tone) + '">' + escape(target.icon) + '</b> ' + escape(target.name) + '</span>').join('') + '</div>';
}

function memoryGrid(question, showCards, answer = draft.memory) {
  const rows = ['위', '가운데', '아래'];
  const columns = question.columns ?? 3;
  return '<div class="memory-grid' + (columns === 4 ? ' twelve' : '') + '" aria-label="3×' + columns + ' 기억판">' + Array.from({ length: columns * 3 }, (_, index) => {
    const order = answer.indexOf(index);
    const marker = order < 0 ? '' : '<span class="memory-order" aria-hidden="true">' + (order + 1) + '</span>';
    if (showCards) {
      const card = question.cards[index];
      return '<div class="memory-cell ' + (order < 0 ? '' : 'selected') + '">' + marker +
        '<span class="icon symbol-' + escape(card.tone) + '" aria-hidden="true">' + escape(card.icon) +
        '</span><span class="name">' + escape(card.name) + '</span></div>';
    }
    const locationName = rows[Math.floor(index / columns)] + ' 줄 ' + (index % columns + 1) + '번째 칸';
    return '<button type="button" class="memory-cell ' + (order < 0 ? '' : 'selected') +
      '" data-memory="' + index + '" aria-label="' + locationName + (order < 0 ? '' : ', ' + (order + 1) + '번째 선택') +
      '" aria-pressed="' + (order >= 0) + '"' + (host ? ' disabled' : '') + '>' + (marker || '<span aria-hidden="true">·</span>') + '</button>';
  }).join('') + '</div>';
}

function study(question) {
  return '<div class="stage-layout"><div id="study-cards">' + memoryGrid(question, true, []) +
    '</div><section class="task-panel"><h2>그림의 위치를 기억하세요</h2><p>시간이 끝나면 그림이 사라져요.</p>' +
    (question.targets ? targets(question) : '<p>다음 화면에서 찾을 그림 세 개가 공개돼요.</p>') +
    '<p id="study-mask" hidden>기억판이 잠겼어요.</p></section></div>';
}

function mathBoard() {
  return '<div class="math-grid" aria-label="두 자리 수 네 개"><span></span><span class="position-title">십의 자리</span><span class="position-title">일의 자리</span>' +
    Array.from({ length: 4 }, (_, row) => '<span class="row-title">' + (row + 1) + '번째</span>' +
      [0, 1].map(column => {
        const index = row * 2 + column;
        const value = draft.numbers[index];
        return '<button type="button" class="number-slot" data-slot="' + index + '" aria-label="' + (row + 1) + '번째 수 ' +
          (column === 0 ? '십의 자리' : '일의 자리') + (value === null ? ', 빈 칸' : ', ' + value) +
          '" aria-pressed="' + (index === draft.slot) + '"' + (host ? ' disabled' : '') + '>' + (value ?? '') + '</button>';
      }).join('')).join('') + '</div>';
}

function mathControls(question) {
  const placed = draft.numbers.filter(digit => digit !== null);
  const complete = placed.length === 8;
  const total = draft.numbers.reduce((sum, value, index) => sum + (value ?? 0) * (index % 2 === 0 ? 10 : 1), 0);
  const highest = Math.max(...[0, 2, 4, 6].map(index => (draft.numbers[index] ?? 0) * 10 + (draft.numbers[index + 1] ?? 0)));
  return '<h2>숫자 카드</h2><p>숫자가 든 칸을 누르면 카드를 뺄 수 있어요.</p><div class="digit-bank">' +
    question.digits.map(digit => '<button type="button" class="digit-card" data-digit="' + digit + '"' +
      (host || placed.includes(digit) ? ' disabled' : '') + '>' + digit + '</button>').join('') + '</div>' +
    '<div class="running-sum"><span>목표 <b>' + question.target + '</b></span><span>현재 합 <b>' +
    (complete ? total : '—') + '</b></span><span>' + (question.minimizeLargest ? '가장 큰 수' : '차이') +
    ' <b>' + (complete ? question.minimizeLargest ? highest : Math.abs(total - question.target) : '—') + '</b></span></div>';
}

function cubeNet(question, pairs = draft.pairs, reveal = false) {
  return '<div class="cube-net" aria-label="정육면체 전개도">' + question.faces.map(face => {
    const pair = pairs.findIndex(items => items.includes(face.id));
    const style = 'grid-area:' + face.row + '/' + face.column;
    const className = 'face' + (pair >= 0 ? ' pair-' + (pair + 1) : '');
    if (reveal) return '<div class="' + className + '" style="' + style + '">' + face.id + '</div>';
    return '<button type="button" class="' + className + '" data-face="' + face.id + '" style="' + style + '" aria-label="' +
      face.id + ' 면' + (pair < 0 ? '' : ', ' + (pair + 1) + '번째 짝') + '" aria-pressed="' + (draft.face === face.id) +
      '"' + (host ? ' disabled' : '') + '>' + face.id + '</button>';
  }).join('') + '</div>';
}

function pairList(pairs) {
  return '<div class="pair-list">' + pairs.map((pair, index) =>
    '<span class="pair-' + (index + 1) + '">' + escape(pair.join('–')) + '</span>').join('') + '</div>';
}

function cornerNet(question, reveal = false) {
  const marked = reveal ? question.correct : draft.corners;
  return '<div class="cube-net corner-net" aria-label="정육면체 전개도">' + question.faces.map(face => {
    const style = 'grid-area:' + face.row + '/' + face.column;
    if (face.id === 'B') {
      return '<div class="face base-face" style="' + style + '">B<span class="corner-marker left">①</span><span class="corner-marker right">②</span></div>';
    }
    const chosen = marked[draft.corner]?.includes(face.id);
    if (reveal) return '<div class="face" style="' + style + '">' + face.id + '</div>';
    return '<button type="button" class="face' + (chosen ? ' pair-' + (draft.corner + 1) : '') + '" style="' + style +
      '" data-corner-face="' + face.id + '" aria-label="' + face.id + ' 면" aria-pressed="' + Boolean(chosen) + '"' +
      (host ? ' disabled' : '') + '>' + face.id + '</button>';
  }).join('') + '</div>';
}

function cornerChoices(question, choices, reveal = false) {
  return '<div class="corner-choices">' + question.cornerNames.map((name, index) => {
    const label = escape(name) + ' <strong>' + (choices[index].length ? escape(choices[index].join(' · ')) : '—') + '</strong>';
    return reveal ? '<div class="corner-answer">' + label + '</div>' :
      '<button type="button" class="button" data-corner="' + index + '" aria-pressed="' +
      (index === draft.corner) + '"' + (host ? ' disabled' : '') + '>' + label + '</button>';
  }).join('') + '</div>';
}

function timeBoard(question, reveal = false) {
  const selected = reveal ? question.correct : draft.times;
  return '<div class="time-board" aria-label="알림이 울린 시각">' + question.times.map(time => {
    const chosen = selected.includes(time);
    return reveal ? '<span class="time-chip' + (chosen ? ' selected' : '') + '">' + time + '분</span>' :
      '<button type="button" class="time-chip' + (chosen ? ' selected' : '') + '" data-time="' + time +
      '" aria-pressed="' + chosen + '"' + (host ? ' disabled' : '') + '>' + time + '분</button>';
  }).join('') + '</div>';
}

function readingsTable(question, reveal = false) {
  return '<table class="clue-table readings"><thead><tr><th scope="col">장치</th><th scope="col">시작</th>' +
    '<th scope="col">중간</th><th scope="col">마지막</th></tr></thead><tbody>' + question.readings.map(row => {
    const chosen = row.id === (reveal ? question.correct : draft.choice);
    const control = reveal ? row.id : '<button type="button" class="button quiet" data-record="' + row.id +
      '" aria-label="' + row.id + ' 장치 고르기" aria-pressed="' + chosen + '"' + (host ? ' disabled' : '') + '>' + row.id + '</button>';
    return '<tr class="' + (chosen ? 'selected' : '') + '"><th scope="row">' + control + '</th>' +
      row.data.map(value => '<td>' + value + '</td>').join('') + '</tr>';
  }).join('') + '</tbody></table>';
}

function clueTable(question) {
  return '<table class="clue-table"><thead><tr><th scope="col">시도</th><th scope="col">위치까지 맞음</th><th scope="col">숫자만 맞음</th></tr></thead><tbody>' +
    question.records.map(row => '<tr><td>' + escape(row.guess) + '</td><td>' + row.exact + '개</td><td>' + row.moved + '개</td></tr>').join('') + '</tbody></table>';
}

function submitRow(question) {
  if (host) return '';
  const reset = question.kind === 'logic' ? '' : '<div class="reset-line"><button type="button" class="button quiet" data-action="reset">다시 선택</button></div>';
  return '<div class="answer-actions">' + reset + '<button type="button" class="button primary" data-action="answer">답 제출</button></div>';
}

function activity(question) {
  let board;
  let panel;
  switch (question.kind) {
    case 'memory':
      board = memoryGrid(question, false);
      panel = '<h2>세 자리 기억하기</h2>' + targets(question) + '<p>' + (host ? '학생들이 빈 칸을 찾아 순서대로 누릅니다.' :
        '현재 ' + draft.memory.length + ' / 3칸을 골랐어요. 선택한 칸을 한 번 더 누르면 뺄 수 있어요.') + '</p>';
      break;
    case 'number':
      board = mathBoard();
      panel = mathControls(question);
      break;
    case 'shape':
      board = cubeNet(question);
      panel = '<h2>마주 보는 세 쌍</h2><p>' + (host ? '학생들이 전개도의 면을 두 개씩 짝지어요.' :
        draft.face ? escape(draft.face) + ' 면과 마주 보는 면을 누르세요.' : '두 면을 차례로 눌러 짝지으세요.') + '</p>' +
        pairList(draft.pairs) + '<p>이미 짝지은 면을 누르면 연결을 풀 수 있어요.</p>';
      break;
    case 'corner':
      board = cornerNet(question);
      panel = '<h2>꼭짓점별로 두 면</h2><p>① 또는 ②를 고른 뒤 전개도의 면을 두 개 누르세요.</p>' +
        cornerChoices(question, draft.corners);
      break;
    case 'schedule':
      board = timeBoard(question);
      panel = '<h2>울린 간격</h2><p>' + question.intervals.join('분 · ') + '분</p><p>정확히 두 알림이 겹친 시각을 모두 골라요.</p>' +
        '<p class="section-label">' + draft.times.length + '개 선택</p>';
      break;
    case 'data':
      board = readingsTable(question);
      panel = '<h2>검사 기준</h2><ol class="checklist">' + question.conditions.map(condition =>
        '<li>' + escape(condition) + '</li>').join('') + '</ol>';
      break;
    case 'logic':
      board = clueTable(question);
      panel = '<h2>비밀번호</h2><p>서로 다른 숫자 ' + (question.codeLength ?? 3) + '개를 입력해요.</p>' +
        (host ? '' : '<label for="logic-code">비밀번호 입력</label><input id="logic-code" class="code-input" inputmode="numeric" maxlength="' +
          (question.codeLength ?? 3) + '" autocomplete="off" value="' +
          escape(draft.code) + '">');
      break;
  }
  return '<div class="stage-layout"><div>' + board + '</div><section class="task-panel">' + panel + submitRow(question) + '</section></div>';
}

function reveal(question) {
  let visual = '';
  if (question.kind === 'memory') visual = memoryGrid(question, true, question.correct);
  if (question.kind === 'number') {
    const nums = [];
    for (let index = 0; index < question.example.length; index += 2) nums.push(question.example[index] * 10 + question.example[index + 1]);
    visual = '<div class="task-panel"><p class="answer-example">' + nums.join(' + ') + ' = ' + question.correct + '</p></div>';
  }
  if (question.kind === 'shape') visual = cubeNet(question, question.correct, true);
  if (question.kind === 'corner') visual = cornerNet(question, true) + cornerChoices(question, question.correct, true);
  if (question.kind === 'schedule') visual = timeBoard(question, true);
  if (question.kind === 'data') visual = readingsTable(question, true);
  if (question.kind === 'logic') visual = clueTable(question);
  const result = state.me ? '<span class="result-label">' + (state.me.result === true ? '정답을 맞혔어요' :
    state.me.result === false ? '내 답을 풀이와 비교해 보세요' : '이 문제의 답을 제출하지 않았어요') + '</span>' : '';
  return '<div class="stage-layout solution-layout"><div>' + visual + '</div><section class="task-panel">' + result +
    '<div class="solution-text">' + escape(question.answer) + '</div><div class="explanation">' +
    escape(question.explanation) + '</div></section></div>';
}

function playing() {
  const question = state.puzzle;
  let content;
  if (state.phase === 'intro') content = intro(question);
  if (state.phase === 'study') content = study(question);
  if (state.phase === 'question') content = '<p class="callout">' + escape(question.prompt) + '</p><div id="activity">' + activity(question) + '</div>';
  if (state.phase === 'reveal') content = reveal(question);
  return sceneHeader(question.title, activityTitle(question)) +
    '<p id="paused-note" class="paused-note" hidden>진행자가 게임을 잠시 멈췄어요.</p><div class="scene-body">' +
    content + '</div>' + controls();
}

function storyText(story) {
  const lines = story.lines.map(line => '<p>' + escape(line) + '</p>').join('');
  const quote = story.quote ? '<blockquote>“' + escape(story.quote) + '”</blockquote>' : '';
  return '<div class="story-text">' + lines + quote + '</div>';
}

function storyScreen() {
  return sceneHeader(state.story.title, state.phase === 'epilogue' ? '기록실 이야기 · 엔딩' : '기록실 이야기 · 시작') +
    '<p id="paused-note" class="paused-note" hidden>진행자가 게임을 잠시 멈췄어요.</p>' +
    '<div class="scene-body">' + storyText(state.story) + '</div>' + controls();
}

function passage() {
  const text = state.round < state.roundCount ? '' :
    host ? '결승 진출 ' + state.finalists + '명. 모두 같은 마지막 문제를 풀어요.' :
    state.area === 'finalist' ? '결승 진출! 마지막 문제에서 우승에 도전해요.' :
    state.area === 'record' ? '마지막 문제도 계속 풀고 내 점수에 도전해요.' : '모두 같은 마지막 문제를 풀어요.';
  return sceneHeader(state.story?.title ?? '다음 라운드', state.round + '라운드') +
    '<p id="paused-note" class="paused-note" hidden>진행자가 게임을 잠시 멈췄어요.</p>' +
    '<div class="scene-body">' + (state.story ? storyText(state.story) : '') +
    (text ? '<p class="status-line">' + text + '</p>' : '') + '</div>' + controls();
}

function finish() {
  const winners = state.winners.length ? (state.winners.length > 1 ? '공동 우승 · ' : '우승 · ') + state.winners.join(', ') :
    '이번 판 결승에서 나온 정답이 없어요.';
  return sceneHeader('게임이 끝났어요', '최종 결과') + '<div class="scene-body">' +
    (state.story ? '<div class="ending-story"><h2>' + escape(state.story.title) + '</h2>' + storyText(state.story) + '</div>' : '') +
    '<h2>' + escape(winners) + '</h2>' +
    (host ? '' : '<p class="score">' + state.me.total + ' / ' + state.questionCount + '</p><p class="callout">내가 맞힌 문제</p>') +
    '<button class="button quiet" type="button" data-action="leave">' + (host ? '새 판 준비' : '입장 화면으로') + '</button></div>';
}

function answerReady() {
  const length = state.puzzle?.codeLength ?? 3;
  switch (state.puzzle?.kind) {
    case 'memory': return draft.memory.length === 3;
    case 'number': return draft.numbers.every(digit => digit !== null);
    case 'shape': return draft.pairs.length === 3;
    case 'corner': return draft.corners.every(pair => pair.length === 2);
    case 'schedule': return draft.times.length > 0;
    case 'data': return Boolean(draft.choice);
    case 'logic': return draft.code.length === length && /^\d+$/.test(draft.code) && new Set(draft.code).size === length;
    default: return false;
  }
}

function sync() {
  const pauseNotice = find('paused-note');
  if (pauseNotice) pauseNotice.hidden = !state.paused;
  const counter = find('submitted-count');
  if (counter) counter.textContent = state.phase === 'question'
    ? '답 제출 ' + state.submitted + ' / ' + state.count + '명' : '참가 ' + state.count + '명';
  const roster = find('roster');
  if (roster) {
    roster.innerHTML = state.roster.map(name => '<li>' + escape(name) + '</li>').join('');
    find('roster-summary').textContent = state.count + ' / ' + state.capacity + '명';
  }
  const pause = scene.querySelector('[data-action=pause], [data-action=resume]');
  if (pause) {
    pause.dataset.action = state.paused ? 'resume' : 'pause';
    pause.textContent = state.paused ? '계속 진행' : '일시정지';
    pause.disabled = busy;
  }
  const advance = scene.querySelector('[data-action=advance]');
  if (advance) advance.disabled = state.paused || busy;
  const start = scene.querySelector('[data-action=start]');
  if (start) start.disabled = state.count < 1 || busy;
  const submit = scene.querySelector('[data-action=answer]');
  if (submit) {
    const locked = state.me.submitted || state.paused || busy;
    submit.disabled = locked || !answerReady();
    submit.textContent = state.me.submitted ? '제출 완료' : '답 제출';
    for (const input of scene.querySelectorAll('[data-memory], [data-slot], [data-face], [data-corner-face], [data-corner], [data-time], [data-record], [data-action=reset], #logic-code')) input.disabled = locked;
    for (const input of scene.querySelectorAll('[data-digit]')) input.disabled = locked || draft.numbers.includes(Number(input.dataset.digit));
  }
}

function accept(next, sequence) {
  if (sequence < accepted) return;
  if (next.format !== 3) throw new Error('게임 화면을 새로고침해 주세요.');
  accepted = sequence;
  if (connectionLost) {
    connectionLost = false;
    notice('');
  }
  const newQuestion = !state || state.questionId !== next.questionId;
  state = next;
  receivedAt = performance.now();
  find('entry').hidden = true;
  find('live').hidden = false;
  find('guide-button').hidden = !host;
  find('room-badge').hidden = false;
  find('room-badge').textContent = state.code;
  if (newQuestion) draft = savedDraft();
  if (state.phaseId !== phase) {
    phase = state.phaseId;
    scene.className = state.puzzle ? 'scene record-sheet ' + state.puzzle.kind : 'scene';
    scene.innerHTML = state.phase === 'lobby' ? lobby() :
      state.phase === 'finish' ? finish() : state.phase === 'passage' ? passage() :
      ['story', 'epilogue'].includes(state.phase) ? storyScreen() : playing();
    window.scrollTo(0, 0);
  }
  sync();
  displayTime();
}

function displayTime() {
  const clock = find('timer');
  if (clock && state && state.endsIn !== null) {
    const elapsed = state.paused ? 0 : performance.now() - receivedAt;
    const left = Math.max(0, state.endsIn - elapsed);
    const text = Math.ceil(left / 1000) + '초';
    if (clock.textContent !== text) clock.textContent = text;
    find('timer-fill').style.transform = 'scaleX(' + Math.min(1, left / Math.max(1, state.duration)) + ')';
    const cards = find('study-cards');
    if (cards) {
      cards.hidden = left === 0 || state.paused;
      find('study-mask').hidden = !cards.hidden;
    }
  }
}

async function poll() {
  if (!session || polling) return;
  const current = session;
  const sequence = ++issued;
  polling = true;
  try {
    const snapshot = await request('state?code=' + current.code, null, current.token);
    if (current === session) accept(snapshot, sequence);
  } catch (error) {
    if (current !== session || sequence < accepted) return;
    if ([403, 404].includes(error.status)) resetSession(error.message);
    else if (state) {
      connectionLost = true;
      notice(error.message, 0);
    } else setEntryError(error.message);
  } finally {
    polling = false;
  }
}

async function action(type, extra = {}) {
  if (!session || !state || busy) return;
  const current = session;
  const sequence = ++issued;
  busy = true;
  sync();
  try {
    const snapshot = await request('action', { code: current.code, action: type, phaseId: state.phaseId, ...extra }, current.token);
    if (current === session) {
      if (snapshot.left) resetSession();
      else accept(snapshot, sequence);
    }
  } catch (error) {
    if (current === session) notice(error.message);
  } finally {
    busy = false;
    if (state) sync();
  }
}

async function enter(path, body, button) {
  if (busy) return;
  busy = true;
  button.disabled = true;
  setEntryError('');
  try {
    const result = await request(path, { format: 3, ...body });
    rememberSession({ code: result.code, token: result.token });
    if (result.state) accept(result.state, ++issued);
    else await poll();
  } catch (error) {
    setEntryError(error.message);
  } finally {
    busy = false;
    button.disabled = false;
    if (state) sync();
  }
}

function handleSelection(button) {
  if (host || busy || state.paused || state.me.submitted || state.phase !== 'question') return false;
  const { memory, slot, digit, face, corner, cornerFace, time, record } = button.dataset;
  if (memory !== undefined) {
    const index = Number(memory);
    if (draft.memory.includes(index)) draft.memory = draft.memory.filter(item => item !== index);
    else if (draft.memory.length < 3) draft.memory.push(index);
    else {
      notice('선택한 칸 하나를 빼고 다시 골라 주세요.');
      return true;
    }
  } else if (slot !== undefined) {
    draft.slot = Number(slot);
    draft.numbers[draft.slot] = null;
  } else if (digit !== undefined) {
    const chosen = Number(digit);
    if (!draft.numbers.includes(chosen)) draft.numbers[draft.slot] = chosen;
    const next = draft.numbers.indexOf(null);
    if (next >= 0) draft.slot = next;
  } else if (face !== undefined) {
    const paired = draft.pairs.findIndex(pair => pair.includes(face));
    if (paired >= 0) {
      draft.pairs.splice(paired, 1);
      draft.face = face;
    } else if (draft.face === face) draft.face = null;
    else if (!draft.face) draft.face = face;
    else {
      draft.pairs.push([draft.face, face]);
      draft.face = null;
    }
  } else if (corner !== undefined) {
    draft.corner = Number(corner);
  } else if (cornerFace !== undefined) {
    const pair = draft.corners[draft.corner];
    if (pair.includes(cornerFace)) draft.corners[draft.corner] = pair.filter(item => item !== cornerFace);
    else if (pair.length < 2) pair.push(cornerFace);
    else {
      notice('선택한 면 하나를 빼고 다시 골라 주세요.');
      return true;
    }
  } else if (time !== undefined) {
    const minute = Number(time);
    if (draft.times.includes(minute)) draft.times = draft.times.filter(item => item !== minute);
    else draft.times.push(minute);
  } else if (record !== undefined) {
    draft.choice = record;
  } else return false;
  refreshActivity(button);
  return true;
}

function refreshActivity(oldButton) {
  saveDraft();
  const selection = oldButton && ['memory', 'slot', 'digit', 'face'].find(name => name in oldButton.dataset);
  find('activity').innerHTML = activity(state.puzzle);
  sync();
  if (selection) scene.querySelector('[data-' + selection + '="' + oldButton.dataset[selection] + '"]')?.focus({ preventScroll: true });
}

function submission() {
  switch (state.puzzle.kind) {
    case 'memory': return draft.memory;
    case 'number': return draft.numbers;
    case 'shape': return draft.pairs;
    case 'corner': return draft.corners;
    case 'schedule': return draft.times;
    case 'data': return draft.choice;
    case 'logic': return draft.code;
  }
}

scene.addEventListener('click', async event => {
  const button = event.target.closest('button');
  if (!button || !state || button.disabled || handleSelection(button)) return;
  switch (button.dataset.action) {
    case 'copy': {
      const address = find('join-address');
      try {
        await navigator.clipboard.writeText(address.value);
        notice('학생 입장 주소를 복사했어요.');
      } catch {
        address.select();
        notice('선택된 입장 주소를 복사해 주세요.');
      }
      break;
    }
    case 'reset':
      draft = blankDraft();
      refreshActivity();
      break;
    case 'answer':
      if (answerReady()) action('answer', { questionId: state.questionId, answer: submission() });
      break;
    case 'leave':
      if (state.phase === 'finish') resetSession();
      else action('leave');
      break;
    case 'start':
    case 'pause':
    case 'resume':
    case 'advance':
      action(button.dataset.action);
      break;
  }
});

scene.addEventListener('input', event => {
  if (event.target.id !== 'logic-code') return;
  draft.code = event.target.value.replace(/[^0-9]/g, '').slice(0, state.puzzle.codeLength ?? 3);
  event.target.value = draft.code;
  saveDraft();
  sync();
});

const guideSelect = find('guide-question');
function guideSelection() {
  const item = configuredGuide[Number(guideSelect.value)];
  if (!item) return;
  find('guide-answer').textContent = '정답 · ' + item.answer;
  find('guide-explanation').textContent = item.explanation;
}

find('guide-button').addEventListener('click', async () => {
  if (!host || !session || !state || guide.open) return;
  const current = session;
  const question = Math.max(0, state.questionId);
  const status = find('guide-status');
  find('guide-content').hidden = true;
  status.textContent = '풀이를 불러오는 중이에요.';
  guide.showModal();
  try {
    const questions = await request('host-guide?code=' + current.code, null, current.token);
    if (current !== session || !guide.open) return;
    configuredGuide = questions;
    guideSelect.replaceChildren(...questions.map((entry, index) => new Option(entry.round + '라운드 · ' + entry.title, index)));
    guideSelect.value = String(Math.min(question, questions.length - 1));
    guideSelection();
    find('guide-content').hidden = false;
    status.textContent = '';
  } catch (error) {
    status.textContent = error.message;
  }
});
guideSelect.addEventListener('change', guideSelection);

find('join-form').addEventListener('submit', event => {
  event.preventDefault();
  enter('join', { code: find('join-code').value.trim().toUpperCase(), name: find('join-name').value }, event.currentTarget.querySelector('button[type=submit]'));
});
find('host-form').addEventListener('submit', event => {
  event.preventDefault();
  const key = find('teacher-key').value.trim();
  try { sessionStorage.setItem(keyboardKey, key); } catch {}
  enter('create', { operator: key }, event.currentTarget.querySelector('button[type=submit]'));
});

function initialize() {
  if (host) {
    find('join-form').hidden = true;
    find('host-form').hidden = false;
    find('home-link').href = './?host=1';
    find('entry-label').textContent = '선생님 화면';
    find('entry-description').textContent = '방을 열고 학생이 모두 입장하면 게임을 시작하세요.';
    const fromLink = new URLSearchParams(url.hash.slice(1)).get('operator');
    const isPin = key => /^[0-9]{4}$/.test(key ?? '');
    let pin = isPin(fromLink) ? fromLink : '';
    try {
      if (pin) sessionStorage.setItem(keyboardKey, pin);
      const saved = sessionStorage.getItem(keyboardKey);
      if (!pin && isPin(saved)) pin = saved;
      else if (!pin) sessionStorage.removeItem(keyboardKey);
    } catch {}
    find('teacher-key').value = pin;
    if (fromLink) history.replaceState(null, '', url.pathname + url.search);
  } else {
    find('join-code').value = url.searchParams.get('join')?.slice(0, 5).toUpperCase() ?? '';
  }
  try {
    const previous = JSON.parse(sessionStorage.getItem(storageKey) || 'null');
    if (previous && (host || !url.searchParams.has('join') || find('join-code').value === previous.code)) {
      rememberSession(previous);
      poll();
    }
  } catch {}
}

initialize();
window.addEventListener('online', poll);
setInterval(poll, 900 + Math.floor(Math.random() * 350));
setInterval(displayTime, 100);
