import { fitLayout, rotatePiece, wireDirections, wirePorts } from './spatial-tools.mjs';

export function currentTurns(question, draft) {
  return draft.wire.length === question.wire.length ? draft.wire : question.starting;
}

export function fitPieceMarkup(piece, turn) {
  const cells = rotatePiece(piece.cells, turn);
  const width = Math.max(...cells.map(point => point[0])) + 1;
  const height = Math.max(...cells.map(point => point[1])) + 1;
  return '<span class="piece-diagram piece-' + piece.id + '" style="--piece-width:' + width +
    ';--piece-height:' + height + '" aria-hidden="true">' +
    cells.map(([x, y], index) => '<i style="grid-area:' + (y + 1) + '/' + (x + 1) + '">' +
      (index === 0 ? '·' : '') + '</i>').join('') + '</span>';
}

function fitActivity(question, draft, host, reveal) {
  const assignments = reveal ? question.correct : draft.placements;
  const occupied = fitLayout(question.frame, question.pieces, assignments) ?? new Map();
  const board = '<div class="fit-board" aria-label="조각을 놓을 틀">' + question.frame.flatMap((row, y) =>
    row.map((active, x) => {
      const position = x + ',' + y;
      const piece = occupied.get(position);
      const tone = piece ? ' piece-' + piece : '';
      const marker = assignments.find(item => item.id === piece && item.x === x && item.y === y) ? '·' : '';
      if (!active) return '<span class="fit-void" aria-hidden="true"></span>';
      if (reveal) return '<span class="fit-cell' + tone + '">' + marker + '</span>';
      return '<button type="button" class="fit-cell' + tone + '" data-fit-cell="' + position + '" data-archive-edit ' +
        (piece ? 'data-fit-filled="' + piece + '" ' : '') + 'aria-label="' + (y + 1) + '줄 ' + (x + 1) +
        '칸' + (piece ? ', 조각 ' + piece : '') + '"' + (host ? ' disabled' : '') + '>' + marker + '</button>';
    })).join('') + '</div>';
  if (reveal) return { board, panel: '' };
  const tray = '<div class="piece-tray" aria-label="조각">' + question.pieces.map(piece => {
    const placed = assignments.some(item => item.id === piece.id);
    return '<button type="button" class="piece-choice" data-fit-piece="' + piece.id + '" data-archive-edit aria-label="' +
      '조각 ' + piece.id + (placed ? ', 놓음' : '') + '" aria-pressed="' + (piece.id === draft.piece) + '"' +
      (host ? ' disabled' : '') + '>' + fitPieceMarkup(piece, draft.turns[piece.id] ?? 0) +
      '<span>' + piece.id + (placed ? ' · 놓음' : '') + '</span></button>';
  }).join('') + '</div>';
  const buttons = host ? '' : '<div class="archive-actions"><button type="button" class="button" data-fit-tool="rotate" data-archive-edit data-not-ready="' +
    (!draft.piece) + '">90° 돌리기</button><button type="button" class="button quiet" data-fit-tool="remove" data-archive-edit data-not-ready="' +
    (!assignments.some(item => item.id === draft.piece)) + '">조각 빼기</button></div>';
  return {
    board: board + '<p class="board-count">놓은 조각 ' + assignments.length + ' / ' + question.pieces.length + '</p>',
    panel: '<h2>조각 고르기</h2>' + tray + buttons +
      '<p>조각의 점이 놓일 칸을 누르세요. 조각을 직접 끌어서 옮겨도 돼요.</p>',
  };
}

function wireActivity(question, draft, host, reveal) {
  const turns = reveal ? question.correct : currentTurns(question, draft);
  const board = '<div class="wire-board" aria-label="기록선 연결판">' + question.wire.map((tile, index) => {
    const ports = wirePorts(tile, turns[index]);
    const end = index === question.terminals[0] ? '시작' : index === question.terminals[1] ? '끝' : '';
    const diagram = ports.map(port => '<i class="wire-port ' + wireDirections[port].side + '" aria-hidden="true"></i>').join('') +
      '<b class="wire-center" aria-hidden="true"></b>' + (end ? '<span class="wire-tag">' + end + '</span>' : '');
    if (reveal) return '<span class="wire-tile">' + diagram + '</span>';
    return '<button type="button" class="wire-tile" data-wire="' + index + '" data-archive-edit aria-label="' +
      (end || (Math.floor(index / question.columns) + 1) + '줄 ' + (index % question.columns + 1) + '칸') +
      ', ' + ports.map(port => wireDirections[port].label).join(' 및 ') + ' 연결"' +
      (host ? ' disabled' : '') + '>' + diagram + '</button>';
  }).join('') + '</div>';
  return { board, panel: '<h2>선을 맞추는 법</h2><p>칸을 누를 때마다 선이 한 번 돌아요. 맞닿은 선의 끝을 맞춰 보세요.</p>' };
}

function compareActivity(question, draft, host, reveal, escape) {
  const chosen = reveal ? question.correct : draft.changes;
  const shelf = (marks, later) => '<div class="shelf-group"><h3>' + (later ? '나중 화면' : '처음 화면') +
    '</h3><div class="shelf-board" style="grid-template-columns:repeat(' + question.columns + ',minmax(0,1fr))">' + marks.map((mark, index) => {
      const selected = later && chosen.includes(index);
      const visual = '<span aria-hidden="true" class="shelf-mark mark-' + mark + '"></span>';
      const name = (Math.floor(index / question.columns) + 1) + '줄 ' + (index % question.columns + 1) +
        '칸, ' + escape(question.shelfLabels[mark]);
      if (!later || reveal) return '<span class="shelf-drawer' + (selected ? ' selected' : '') +
        '" role="img" aria-label="' + name + '">' + visual + '</span>';
      return '<button type="button" class="shelf-drawer' + (selected ? ' selected' : '') + '" data-drawer="' + index +
        '" data-archive-edit aria-label="' + name + '" aria-pressed="' + selected + '"' + (host ? ' disabled' : '') +
        '>' + visual + '</button>';
    }).join('') + '</div></div>';
  return {
    board: '<div class="shelf-pair">' + shelf(question.shelfStart, false) + shelf(question.shelfEnd, true) + '</div>',
    panel: question.hiddenCount
      ? '<h2>바뀐 곳에 표시</h2><p>나중 화면에서 달라진 서랍을 모두 고르세요. 몇 곳인지는 알려 주지 않아요. 다시 누르면 표시가 지워져요.</p>' +
        '<p class="board-count">' + chosen.length + '칸 선택</p>'
      : '<h2>바뀐 곳에 표시</h2><p>나중 화면의 서랍 네 칸을 고르세요. 다시 누르면 표시가 지워져요.</p>' +
        '<p class="board-count">' + chosen.length + ' / 4칸 선택</p>',
  };
}

function orderActivity(question, draft, host, reveal, escape) {
  const order = reveal ? question.correct : draft.sequence;
  const list = '<ol class="note-list">' + question.notes.map(note => '<li>' + escape(note) + '</li>').join('') + '</ol>';
  const choices = '<div class="place-tray">' + question.places.map(place =>
    '<button type="button" class="button quiet" data-place="' + place.id + '" data-archive-edit data-not-ready="' +
    order.includes(place.id) + '"' + (host ? ' disabled' : '') + '>' + escape(place.name) + '</button>').join('') + '</div>';
  const slots = '<ol class="sequence-slots">' + question.places.map((_, index) => {
    const name = question.places.find(place => place.id === order[index])?.name ?? '—';
    return '<li>' + (reveal ? '<span>' + escape(name) + '</span>' :
      '<button type="button" class="button quiet" data-order-slot="' + index + '" data-archive-edit data-not-ready="' +
      !order[index] + '"' + (host ? ' disabled' : '') + '>' + escape(name) + '</button>') + '</li>';
  }).join('') + '</ol>';
  return { board: list + (reveal ? slots : ''), panel: '<h2>이동 순서</h2>' + slots + choices +
    '<p>이미 채운 칸을 누르면 그 장소를 뺄 수 있어요.</p>' };
}

function lockActivity(question, draft, host, reveal, escape) {
  const answer = reveal ? question.correct : draft.lock;
  const symbol = id => question.symbols.find(item => item.id === id);
  const clues = '<table class="clue-table pictogram-clues"><thead><tr><th scope="col">눌러 본 그림</th>' +
    '<th scope="col">자리까지</th><th scope="col">그림만</th></tr></thead><tbody>' + question.clues.map(row =>
      '<tr><td><span class="pictograms">' + row.attempt.map(id => {
        const item = symbol(id);
        return '<span aria-label="' + escape(item.name) + '">' + escape(item.icon) + '</span>';
      }).join('') + '</span></td><td>' + row.exact + '개</td><td>' + row.moved + '개</td></tr>').join('') + '</tbody></table>';
  const slots = '<div class="lock-slots" aria-label="고른 그림">' + Array.from({ length: 4 }, (_, index) => {
    const item = symbol(answer[index]);
    const glyph = item ? escape(item.icon) : '·';
    const label = item ? escape(item.name) : '빈 자리';
    return reveal ? '<span aria-label="' + label + '">' + glyph + '</span>' :
      '<button type="button" data-lock-slot="' + index + '" data-archive-edit data-not-ready="' + !item +
      '" aria-label="' + (index + 1) + '번째, ' + label + '"' + (host ? ' disabled' : '') + '>' + glyph + '</button>';
  }).join('') + '</div>';
  const keys = '<div class="lock-keys">' + question.symbols.map(item =>
    '<button type="button" data-lock-symbol="' + item.id + '" data-archive-edit data-not-ready="' + answer.includes(item.id) +
    '" aria-label="' + escape(item.name) + '"' + (host ? ' disabled' : '') + '>' + escape(item.icon) + '</button>').join('') + '</div>';
  return { board: clues + (reveal ? slots : ''), panel: '<h2>그림 네 개</h2>' + slots + keys +
    '<p>이미 고른 그림을 칸에서 눌러 뺄 수 있어요.</p>' };
}

export function archiveActivity(question, draft, host, reveal, escape) {
  switch (question.kind) {
    case 'fit': return fitActivity(question, draft, host, reveal);
    case 'wire': return wireActivity(question, draft, host, reveal);
    case 'switches': {
      const chosen = reveal ? question.correct : draft.changes;
      const buttons = question.lamps.map((start, i) => {
        const flips = chosen.filter(j => Math.abs(i % 3 - j % 3) + Math.abs(Math.floor(i / 3) - Math.floor(j / 3)) <= 1).length;
        const on = (start + flips) % 2;
        return '<button type="button" class="button lamp-key" data-drawer="' + i + '" data-archive-edit aria-pressed="' + chosen.includes(i) + '" data-on="' + on + '"' + (host || reveal ? ' disabled' : '') + '>' + String.fromCharCode(65 + i) + '<small>' + (on ? '● 켜짐' : '○ 꺼짐') + '</small></button>';
      }).join('');
      return { board: '<div class="lamp-grid">' + buttons + '</div>', panel: '<h2>선택한 스위치</h2><p>' + (chosen.map(i => String.fromCharCode(65 + i)).join(' · ') || '아직 없어요') + ' (' + chosen.length + '/3)</p><p>선택한 스위치를 다시 누르면 그 효과가 취소돼요.</p>' };
    }
    case 'compare': return compareActivity(question, draft, host, reveal, escape);
    case 'order': return orderActivity(question, draft, host, reveal, escape);
    case 'lock': return lockActivity(question, draft, host, reveal, escape);
    default: return null;
  }
}
