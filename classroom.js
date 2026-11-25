import { apiBase, publicKey } from './online-config.js';
import { archiveActivity, currentTurns, fitPieceMarkup } from './archive-activities.mjs?v=legible-1';
import { fitLayout, pieceSquares } from './spatial-tools.mjs';

const find = id => document.getElementById(id);
const url = new URL(location.href);
const host = url.searchParams.get('host') === '1';
const storageKey = host ? 'logic-rooms-host-v4' : 'logic-rooms-player-v4';
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
let pieceDrag = null;
let skipClick = 0;

function escape(value) {
  return String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
}

function blankDraft() {
  return { memory: [], piece: null, turns: {}, placements: [], wire: [], changes: [], sequence: [], lock: [] };
}

function draftKey() {
  return 'logic-rooms-draft-v4:' + session?.code + ':' + state?.questionId;
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
  window.dispatchEvent(new CustomEvent('room-phase', { detail: { phase: 'entry', kind: null } }));
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
  const labels = { story: '첫 문제 열기', intro: '설명 마치기', study: '암기 건너뛰기', question: '문제 넘기기',
    reveal: '풀이 마치기', passage: '다음 라운드 열기' };
  const advance = labels[state.phase]
    ? '<button type="button" class="button" data-action="advance">' + labels[state.phase] + '</button>' : '';
  const extend = state.phase === 'question' ? '<button type="button" class="button" data-action="extend">풀이 +30초</button>' : '';
  return '<footer class="admin-bar"><p class="status-line" id="submitted-count"></p>' + advance +
    extend + '<button type="button" class="button quiet" data-action="pause">일시정지</button></footer>';
}

function lobby() {
  if (!host) return sceneHeader('입장했어요', '대기실') + '<div class="scene-body">' +
    '<h2>' + escape(state.me.name) + ' 님</h2><p class="callout">선생님이 시작하면 첫 번째 문제 설명이 열려요.</p>' +
    '<button type="button" class="button quiet" data-action="leave">입장 화면으로</button></div>';
  const join = new URL('./', location.href);
  join.searchParams.set('join', state.code);
  const edition = url.searchParams.get('edition');
  if (edition) join.searchParams.set('edition', edition);
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

function submitRow(question) {
  if (host) return '';
  const label = question.kind === 'fit' ? '조각 초기화' : question.kind === 'wire' ? '타일 초기화' : '선택 지우기';
  const reset = '<div class="reset-line"><button type="button" class="button quiet" data-action="reset">' + label + '</button></div>';
  return '<div class="answer-actions">' + reset + '<button type="button" class="button primary" data-action="answer">답 제출</button></div>' +
    '<p id="live-result" class="live-result" role="status" hidden></p>';
}

function activity(question) {
  const { board, panel } = question.kind === 'memory' ? {
    board: memoryGrid(question, false),
    panel: '<h2>찾을 그림</h2>' + targets(question) + '<p>' + (host ? '학생이 세 칸을 순서대로 누릅니다.' :
      draft.memory.length + ' / 3칸 선택. 고른 칸을 다시 누르면 뺄 수 있어요.') + '</p>',
  } : archiveActivity(question, draft, host, false, escape);
  return '<div class="stage-layout"><div>' + board + '</div><section class="task-panel">' + panel + submitRow(question) + '</section></div>';
}

function tapeFragment() {
  const words = ['축제에 와 준', ' 여러분,', ' 마지막 곡까지', ' 함께해 줘서 고마워요.', ' 이상으로', ' 오늘의', ' 축제 방송을', ' 마칩니다.'];
  const end = state.questionId + 1;
  if (end < 1 || end > words.length) return '';
  const recovered = words.slice(0, end).join('');
  return '<details class="tape-fragment"><summary>▶ 복구된 방송 확인 · ' + end + '/8</summary><p>' +
    escape(recovered) + (end < words.length ? ' ▒▒…' : '') + '</p></details>';
}

function reveal(question) {
  const visual = question.kind === 'memory' ? memoryGrid(question, true, question.correct) :
    archiveActivity(question, draft, host, true, escape).board;
  const result = state.me ? '<span class="result-label">' + (state.me.result === true ? '정답을 맞혔어요' :
    state.me.result === false ? '내 답을 풀이와 비교해 보세요' : '이 문제의 답을 제출하지 않았어요') + '</span>' : '';
  return '<div class="stage-layout solution-layout"><div>' + visual + '</div><section class="task-panel">' + result +
    '<div class="solution-text">' + escape(question.answer) + '</div><div class="explanation">' +
    escape(question.explanation) + '</div>' + (question.discovery ?
      '<p class="discovery">' + escape(question.discovery) + '</p>' : '') + tapeFragment() + '</section></div>';
}

function playing() {
  const question = state.puzzle;
  let content;
  if (state.phase === 'intro') content = intro(question);
  if (state.phase === 'study') content = study(question);
  if (state.phase === 'question') content = '<p class="callout">' + escape(question.prompt) + '</p><div id="activity">' + activity(question) + '</div>';
  if (state.phase === 'reveal') content = reveal(question);
  const evidence = ['study', 'question'].includes(state.phase) && question.evidence
    ? '<p class="case-note">' + escape(question.evidence) + '</p>' : '';
  const finalNote = state.phase === 'intro' && state.round === state.roundCount ? '<p class="final-note">' + (host
    ? '결승 진출 ' + (state.finalists ?? 0) + '명. 모두 같은 마지막 문제를 풀어요.'
    : state.area === 'finalist' ? '결승 진출! 이 문제를 맞히면 우승이에요.' : '결승에는 못 갔지만, 마지막 문제로 내 점수에 도전해요.') + '</p>' : '';
  const board = host && ['question', 'reveal'].includes(state.phase)
    ? '<section class="live-board" aria-label="학생별 채점 현황"><h2>실시간 채점</h2><ul id="live-board"></ul></section>' : '';
  return sceneHeader(question.title, activityTitle(question)) +
    '<p id="paused-note" class="paused-note" hidden>진행자가 게임을 잠시 멈췄어요.</p><div class="scene-body">' +
    finalNote + evidence + content + board + '</div>' + controls();
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
  const question = state.puzzle;
  switch (question?.kind) {
    case 'memory': return draft.memory.length === 3;
    case 'fit': return draft.placements.length === question.pieces.length;
    case 'wire': return true;
    case 'switches': return draft.changes.length === 3;
    case 'compare': return question.hiddenCount ? draft.changes.length > 0 : draft.changes.length === 4;
    case 'order': return draft.sequence.length === question.places.length;
    case 'lock': return draft.lock.length === 4;
    default: return false;
  }
}

function sync() {
  const pauseNotice = find('paused-note');
  if (pauseNotice) pauseNotice.hidden = !state.paused;
  const counter = find('submitted-count');
  if (counter) counter.textContent = ['question', 'reveal'].includes(state.phase)
    ? '답 제출 ' + state.submitted + ' / ' + state.count + '명 · 정답 ' + (state.correctCount ?? 0) + '명' : '참가 ' + state.count + '명';
  const liveBoard = find('live-board');
  if (liveBoard) {
    const rows = (state.results ?? []).map(entry => '<li class="' + (entry.correct === true ? 'is-correct' :
      entry.correct === false ? 'is-wrong' : 'is-waiting') + '"><b aria-hidden="true">' +
      (entry.correct === true ? 'O' : entry.correct === false ? 'X' : '…') + '</b>' + escape(entry.name) +
      '<span class="visually-hidden">' + (entry.correct === true ? ' 정답' : entry.correct === false ? ' 오답' : ' 푸는 중') + '</span></li>').join('');
    if (liveBoard.innerHTML !== rows) liveBoard.innerHTML = rows;
  }
  const liveResult = find('live-result');
  if (liveResult && state.me) {
    const result = state.me.submitted ? state.me.result : null;
    const text = result === true ? '정답이에요! 문이 한 칸 더 열렸어요.' : result === false ? '틀렸어요… 풀이 시간이 끝나면 정답이 공개돼요.' : '';
    if (liveResult.textContent !== text) {
      liveResult.textContent = text;
      liveResult.hidden = !text;
      liveResult.className = 'live-result' + (result === true ? ' is-correct' : result === false ? ' is-wrong' : '');
      if (text) window.dispatchEvent(new CustomEvent('room-result', { detail: result }));
    }
  }
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
  for (const button of scene.querySelectorAll('[data-action=advance], [data-action=extend]')) button.disabled = state.paused || busy;
  const start = scene.querySelector('[data-action=start]');
  if (start) start.disabled = state.count < 1 || busy;
  const submit = scene.querySelector('[data-action=answer]');
  if (submit) {
    const locked = state.me.submitted || state.paused || busy;
    submit.disabled = locked || !answerReady();
    submit.textContent = state.me.submitted ? '제출 완료' : '답 제출';
    for (const input of scene.querySelectorAll('[data-memory], [data-action=reset], [data-archive-edit]')) {
      input.disabled = locked || input.dataset.notReady === 'true';
    }
  }
}

const studentInstructions = {
  "memory": {
    "intro": "사진에 있는 그림 아홉 개의 위치를 기억하세요.",
    "steps": [
      "사진이 사라지면 그림 세 개가 나옵니다.",
      "왼쪽 그림부터, 사진에서 그 그림이 있던 칸을 누르세요."
    ],
    "prompt": "그림 세 개를 왼쪽부터 보고, 각각 어디에 있었는지 빈 판에서 누르세요."
  },
  "fit": {
    "intro": "다섯 조각을 모두 써서 빈칸을 채우세요. 빗금 칸은 비워 두세요.",
    "steps": [
      "조각을 고르세요. 방향을 바꾸려면 ‘90° 돌리기’를 누르세요.",
      "조각의 ● 표시를 놓을 칸을 누르세요. 직접 끌어다 놓아도 됩니다."
    ],
    "prompt": "조각을 겹치지 않게 놓아 빈칸을 모두 채우세요."
  },
  "wire": {
    "intro": "끊어진 스피커 선을 이으세요. 선은 모든 타일을 지나야 합니다.",
    "steps": [
      "타일을 한 번 누르면 시계 방향으로 90° 돌아갑니다.",
      "시작점에서 끝점까지 선이 끊긴 곳이 없는지 확인하세요."
    ],
    "prompt": "타일을 돌려 모든 칸을 지나는 선 하나를 만드세요."
  },
  "switches": {
    "intro": "스위치를 누르면 그 칸과 상하좌우로 붙은 칸의 불이 바뀝니다.",
    "steps": [
      "켜진 불은 꺼지고, 꺼진 불은 켜집니다.",
      "서로 다른 스위치 세 개를 고르세요. 고른 스위치를 다시 누르면 선택이 취소됩니다."
    ],
    "prompt": "스위치 세 개를 눌러 가운데 전구(E)만 켜진 상태로 만드세요."
  },
  "order": {
    "intro": "테이프는 다섯 장소를 한 번씩 거쳤습니다. 메모 네 줄이 이동 순서를 알려 줍니다.",
    "steps": [
      "테이프가 처음 있던 장소부터 차례대로 누르세요.",
      "순서를 바꾸려면 이미 채운 칸을 눌러 그 장소를 빼세요."
    ],
    "prompt": "메모 네 줄을 모두 만족하도록 장소 다섯 곳을 순서대로 고르세요.",
    "notes": [
      "창가와 책상 사이에 다른 장소 한 곳을 거쳤다.",
      "철제함을 떠난 직후 방송실로 갔다.",
      "책상과 철제함에 가기 전에 카트를 거쳤다.",
      "창가를 거친 뒤에 카트로 갔다."
    ]
  },
  "lock": {
    "intro": "표의 각 줄은 누군가 암호를 한 번 입력한 기록입니다. 네 기록을 모두 만족하는 암호를 찾으세요.",
    "steps": [
      "‘자리까지’는 그림과 위치가 모두 맞은 개수입니다.",
      "‘그림만’은 암호에 들어 있지만 위치가 틀린 그림의 개수입니다."
    ],
    "prompt": "암호에 들어갈 그림 네 개를 순서대로 누르세요. 같은 그림은 두 번 쓸 수 없습니다."
  }
};

function accept(next, sequence) {
  if (sequence < accepted) return;
  if (next.format !== 4) throw new Error('게임 화면을 새로고침해 주세요.');
  accepted = sequence;
  if (connectionLost) {
    connectionLost = false;
    notice('');
  }
  const newQuestion = !state || state.questionId !== next.questionId;
  if (next.puzzle) Object.assign(next.puzzle, studentInstructions[next.puzzle.kind]);
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
    window.dispatchEvent(new CustomEvent('room-phase', { detail: { phase: state.phase, kind: state.puzzle?.kind ?? null } }));
    scene.className = state.puzzle ? 'scene record-sheet ' + state.puzzle.kind :
      ['story', 'epilogue', 'passage', 'finish'].includes(state.phase) ? 'scene record-sheet story-sheet' : 'scene';
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
    const urgent = state.phase === 'question' && left > 0 && left <= 10000 && !state.paused;
    if (scene.classList.contains('urgent') !== urgent) {
      scene.classList.toggle('urgent', urgent);
      window.dispatchEvent(new CustomEvent('room-urgent', { detail: urgent }));
    }
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
    const result = await request(path, { format: 4, ...body });
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

function studentCanEdit() {
  return !host && !busy && state?.phase === 'question' && !state.paused && !state.me?.submitted;
}

function placeFit(id, x, y) {
  const question = state.puzzle;
  const next = [...draft.placements.filter(item => item.id !== id),
    { id, x, y, turn: draft.turns[id] ?? 0 }];
  if (!fitLayout(question.frame, question.pieces, next)) {
    notice('조각이 틀 밖에 있거나 다른 조각과 겹쳐요.');
    return false;
  }
  draft.placements = next;
  draft.piece = null;
  return true;
}

function handleSelection(button) {
  if (!studentCanEdit()) return false;
  const { memory, fitPiece, fitCell, fitTool, wire, drawer, place, orderSlot, lockSymbol, lockSlot } = button.dataset;
  if (memory !== undefined) {
    const index = Number(memory);
    if (draft.memory.includes(index)) draft.memory = draft.memory.filter(item => item !== index);
    else if (draft.memory.length < 3) draft.memory.push(index);
    else {
      notice('선택한 칸 하나를 빼고 다시 골라 주세요.');
      return true;
    }
  } else if (fitPiece !== undefined) {
    draft.piece = fitPiece;
  } else if (fitCell !== undefined) {
    const [x, y] = fitCell.split(',').map(Number);
    if (draft.piece) placeFit(draft.piece, x, y);
    else if (button.dataset.fitFilled) draft.piece = button.dataset.fitFilled;
    else notice('먼저 조각을 하나 골라 주세요.');
  } else if (fitTool !== undefined) {
    const id = draft.piece;
    if (!id) return true;
    const existing = draft.placements.find(item => item.id === id);
    if (fitTool === 'remove') draft.placements = draft.placements.filter(item => item.id !== id);
    else {
      draft.turns[id] = ((draft.turns[id] ?? 0) + 1) % 4;
      if (existing) {
        const updated = draft.placements.map(item => item.id === id ? { ...item, turn: draft.turns[id] } : item);
        if (fitLayout(state.puzzle.frame, state.puzzle.pieces, updated)) draft.placements = updated;
        else {
          draft.placements = draft.placements.filter(item => item.id !== id);
          notice('돌린 조각을 다시 놓아 주세요.');
        }
      }
    }
  } else if (wire !== undefined) {
    const index = Number(wire);
    draft.wire = currentTurns(state.puzzle, draft).slice();
    draft.wire[index] = (draft.wire[index] + 1) % 4;
  } else if (drawer !== undefined) {
    const index = Number(drawer);
    if (draft.changes.includes(index)) draft.changes = draft.changes.filter(item => item !== index);
    else if (state.puzzle.hiddenCount || draft.changes.length < (state.puzzle.kind === 'switches' ? 3 : 4)) draft.changes.push(index);
    else {
      notice('선택한 칸 하나를 빼고 다시 골라 주세요.');
      return true;
    }
  } else if (place !== undefined) draft.sequence.push(place);
  else if (orderSlot !== undefined) draft.sequence.splice(Number(orderSlot), 1);
  else if (lockSymbol !== undefined) {
    if (draft.lock.length === 4) { notice('그림 하나를 빼고 다시 골라 주세요.'); return true; }
    draft.lock.push(lockSymbol);
  } else if (lockSlot !== undefined) draft.lock.splice(Number(lockSlot), 1);
  else return false;
  refreshActivity(button);
  return true;
}

function refreshActivity(oldButton) {
  saveDraft();
  const selection = oldButton?.getAttributeNames().find(name => name.startsWith('data-') && name !== 'data-archive-edit');
  find('activity').innerHTML = activity(state.puzzle);
  sync();
  if (selection) scene.querySelector('[' + selection + '="' + CSS.escape(oldButton.getAttribute(selection)) + '"]')?.focus({ preventScroll: true });
}

function submission() {
  switch (state.puzzle.kind) {
    case 'memory': return draft.memory;
    case 'fit': return draft.placements;
    case 'wire': return currentTurns(state.puzzle, draft);
    case 'switches':
    case 'compare': return draft.changes;
    case 'order': return draft.sequence;
    case 'lock': return draft.lock;
  }
}

scene.addEventListener('click', async event => {
  const button = event.target.closest('button');
  if (performance.now() < skipClick && button?.matches('[data-fit-cell], [data-fit-piece]')) return;
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
    case 'advance':
      if (state.phase === 'question' && !confirm('지금 문제를 넘길까요?\n아직 제출하지 않은 학생은 이 문제를 놓치고, 바로 정답과 풀이가 열려요.')) break;
      action('advance');
      break;
    case 'start':
    case 'pause':
    case 'resume':
    case 'extend':
      action(button.dataset.action);
      break;
  }
});

function fitCellAt(event) {
  return document.elementFromPoint(event.clientX, event.clientY)?.closest('[data-fit-cell]');
}

function clearFitHover() {
  for (const cell of scene.querySelectorAll('.fit-hover, .fit-blocked')) cell.classList.remove('fit-hover', 'fit-blocked');
}

scene.addEventListener('pointerdown', event => {
  skipClick = 0;
  const pressed = event.target.closest('[data-fit-piece], [data-fit-cell]');
  if (!pressed || pressed.disabled || event.button !== 0 || !studentCanEdit()) return;
  pieceDrag = {
    pointer: event.pointerId, button: pressed, id: pressed.dataset.fitPiece ?? pressed.dataset.fitFilled,
    startX: event.clientX, startY: event.clientY, phase: state.phaseId, ghost: null,
  };
});

window.addEventListener('pointermove', event => {
  const drag = pieceDrag;
  if (!drag?.id || drag.pointer !== event.pointerId || drag.phase !== state?.phaseId || !studentCanEdit()) return;
  const { id } = drag;
  const question = state.puzzle;
  const piece = question.pieces.find(item => item.id === id);
  const turn = draft.turns[id] ?? 0;
  if (!drag.ghost) {
    if (Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) < 9) return;
    drag.ghost = document.createElement('div');
    drag.ghost.className = 'piece-ghost';
    drag.ghost.innerHTML = fitPieceMarkup(piece, turn);
    document.body.append(drag.ghost);
  }
  drag.ghost.style.left = event.clientX + 'px';
  drag.ghost.style.top = event.clientY + 'px';
  clearFitHover();
  const cell = fitCellAt(event);
  if (!cell) return;
  const [x, y] = cell.dataset.fitCell.split(',').map(Number);
  const placement = { id, x, y, turn };
  const next = [...draft.placements.filter(item => item.id !== id), placement];
  const marker = fitLayout(question.frame, question.pieces, next) ? 'fit-hover' : 'fit-blocked';
  for (const [cx, cy] of pieceSquares(piece, placement)) {
    scene.querySelector('[data-fit-cell="' + cx + ',' + cy + '"]')?.classList.add(marker);
  }
});

function endFitDrag(event) {
  const drag = pieceDrag;
  if (!drag || drag.pointer !== event.pointerId) return;
  pieceDrag = null;
  const canPlace = event.type === 'pointerup' && studentCanEdit() && drag.phase === state.phaseId;
  if (!drag.ghost) {
    if (canPlace && event.pointerType === 'touch' &&
        document.elementFromPoint(event.clientX, event.clientY)?.closest('button') === drag.button) {
      skipClick = performance.now() + 250;
      handleSelection(drag.button);
    }
    return;
  }
  drag.ghost.remove();
  clearFitHover();
  skipClick = performance.now() + 250;
  if (!canPlace) return;
  const cell = fitCellAt(event);
  if (!cell) return;
  const [x, y] = cell.dataset.fitCell.split(',').map(Number);
  draft.piece = drag.id;
  placeFit(drag.id, x, y);
  refreshActivity();
}

window.addEventListener('pointerup', endFitDrag);
window.addEventListener('pointercancel', endFitDrag);

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
