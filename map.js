import { doors } from './coordinates.mjs';

export const colors = {
  민트: '#9ceadb',
  보라: '#bda4ff',
  살구: '#ffc195',
  파랑: '#88c8ff',
  노랑: '#f7e487',
  분홍: '#f7aaca',
};

const palettes = {
  0: ['#15152b', '#262343', '#363259', '#594c81', '#b7a0fc'],
  1: ['#15152b', '#252747', '#33375c', '#4d5d8c', '#9aaff9'],
  2: ['#111d2e', '#1c3343', '#284452', '#38657a', '#93e0e6'],
  3: ['#17192e', '#292544', '#413358', '#6f5089', '#d8a4ed'],
  record: ['#151e2c', '#233748', '#344956', '#527884', '#b6e9dd'],
};

function box(ctx, x, y, width, height, radius, fill, stroke) {
  ctx.beginPath();
  ctx.roundRect(x, y, width, height, radius);
  if (fill) { ctx.fillStyle = fill; ctx.fill(); }
  if (stroke) { ctx.strokeStyle = stroke; ctx.stroke(); }
}

function ellipse(ctx, x, y, width, height, color) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.ellipse(x, y, width, height, 0, 0, 2 * Math.PI);
  ctx.fill();
}

function label(ctx, text, x, y, color, size, align = 'center') {
  ctx.font = '800 ' + size + 'px "Malgun Gothic", "Apple SD Gothic Neo", system-ui, sans-serif';
  ctx.textAlign = align;
  ctx.textBaseline = 'middle';
  ctx.fillStyle = color;
  ctx.fillText(text, x, y);
}

function line(ctx, x1, y1, x2, y2, color) {
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.strokeStyle = color;
  ctx.stroke();
}

function door(ctx, point, width, height, open, title, accent, scale, alpha = 1) {
  const x = point.x * width;
  const y = point.y * height;
  const w = 56 * scale;
  const h = 62 * scale;
  ctx.save();
  ctx.globalAlpha = alpha;
  box(ctx, x - w * 0.78, y - h * 0.88, w * 1.56, h * 1.17, 8 * scale, '#15182e', '#5c5577');
  box(ctx, x - w * 0.52, y - h * 0.73, w * 1.04, h * 0.99, [w * 0.45, w * 0.45, 4, 4],
    open ? '#d8fb91' : '#2f2b4c', open ? '#e7ffbc' : accent);
  if (open) {
    const glow = ctx.createLinearGradient(x, y - h * .3, x, y + h * .83);
    glow.addColorStop(0, '#d8fb9160');
    glow.addColorStop(1, '#d8fb9100');
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.moveTo(x - w * .5, y + h * .26);
    ctx.lineTo(x + w * .5, y + h * .26);
    ctx.lineTo(x + w * .87, y + h * .83);
    ctx.lineTo(x - w * .87, y + h * .83);
    ctx.closePath();
    ctx.fill();
    line(ctx, x - w * .35, y + h * .27, x + w * .35, y + h * .27, '#f0ffbf');
  } else {
    line(ctx, x, y - h * .60, x, y + h * .22, accent + '66');
    ellipse(ctx, x + w * .13, y - h * .13, 2.3 * scale, 2.3 * scale, accent);
  }
  label(ctx, title, x, y + h * .66, open ? '#efffce' : '#e1d8f6', Math.max(11, 13 * scale));
  ctx.restore();
}

function consoleUnit(ctx, x, y, scale, accent, mirrored) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(mirrored ? -scale : scale, scale);
  box(ctx, -17, -10, 34, 29, 6, '#121529', '#ffffff21');
  box(ctx, -13, -13, 26, 18, 5, '#23273d', accent + '88');
  line(ctx, -8, -5, 6, -5, accent);
  line(ctx, -8, -1, 0, -1, accent + '88');
  ellipse(ctx, 9, 5, 2, 2, accent);
  ctx.restore();
}

function floor(ctx, width, height, palette, scale) {
  const [edge, fill, lines, trim, accent] = palette;
  ctx.fillStyle = edge;
  ctx.fillRect(0, 0, width, height);
  box(ctx, width * .048, height * .11 + 10, width * .904, height * .81, 20 * scale, '#0d1024');
  box(ctx, width * .05, height * .095, width * .90, height * .82, 20 * scale, trim, trim);
  box(ctx, width * .069, height * .123, width * .862, height * .767, 15 * scale, fill, lines);
  ctx.save();
  box(ctx, width * .071, height * .125, width * .858, height * .763, 14 * scale);
  ctx.clip();
  const count = width > 440 ? 17 : 13;
  for (let index = 1; index < count; index += 1) {
    line(ctx, width * index / count, height * .123, width * index / count, height * .89, lines);
  }
  for (let index = 0; index < 15; index += 1) {
    line(ctx, width * .071, height * (.135 + index * .052), width * .929, height * (.135 + index * .052), lines);
  }
  box(ctx, width * .342, height * .391, width * .315, height * .253, 9 * scale, edge + '44', trim);
  box(ctx, width * .365, height * .417, width * .269, height * .201, 6 * scale, null, trim + '99');
  const glyph = 26 * scale;
  const gx = width / 2, gy = height * .518;
  line(ctx, gx - glyph, gy, gx + glyph, gy, trim);
  line(ctx, gx, gy - glyph, gx, gy + glyph, trim);
  ellipse(ctx, gx, gy, 7 * scale, 7 * scale, trim);
  ctx.restore();
  line(ctx, width * .118, height * .104, width * .882, height * .104, accent + '88');
  line(ctx, width * .12, height * .908, width * .88, height * .908, accent + '66');
  for (const x of [.09, .91]) {
    for (const y of [.19, .82]) ellipse(ctx, width * x, height * y, 3 * scale, 3 * scale, accent);
  }
  consoleUnit(ctx, width * .11, height * .46, scale, accent, false);
  consoleUnit(ctx, width * .89, height * .46, scale, accent, true);
  consoleUnit(ctx, width * .14, height * .825, scale, accent, false);
  consoleUnit(ctx, width * .86, height * .825, scale, accent, true);
  for (const x of [.09, .91]) {
    const direction = x < .5 ? 1 : -1;
    for (let index = 0; index < 3; index += 1) {
      const left = width * x + direction * index * 7 * scale;
      line(ctx, left, height * .948, left + direction * 5 * scale, height * .961, trim);
    }
  }
}

function avatar(ctx, player, x, y, size, active, walk) {
  const body = colors[player.color] ?? colors.민트;
  ellipse(ctx, x, y + size * .43, size * .64, size * .25, '#080e22a0');
  if (active) {
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#e4ff9c';
    ctx.beginPath();
    ctx.ellipse(x, y + size * .41, size * .72, size * .33, 0, 0, 2 * Math.PI);
    ctx.stroke();
    ctx.lineWidth = 1;
  }
  const offset = walk * size * .12;
  box(ctx, x - size * .40, y + size * .24 + offset, size * .31, size * .29, size * .12, body);
  box(ctx, x + size * .10, y + size * .24 - offset, size * .31, size * .29, size * .12, body);
  box(ctx, x - size * .54, y - size * .32, size * 1.08, size * .67, size * .24, body, '#222739');
  box(ctx, x - size * .54, y - size * .65, size * 1.08, size * .66, size * .26, body, '#272944');
  box(ctx, x - size * .35, y - size * .46, size * .70, size * .28, size * .13, '#242642');
  for (const eye of [-.15, .15]) ellipse(ctx, x + size * eye, y - size * .316, size * .042, size * .053, '#ecfaff');
  const font = Math.max(10, Math.min(14, size * .47));
  ctx.font = '800 ' + font + 'px system-ui';
  const name = player.name;
  const textWidth = ctx.measureText(name).width + 12;
  box(ctx, x - textWidth / 2, y + size * .59, textWidth, font + 6, 5, '#101225e8');
  label(ctx, name, x, y + size * .59 + (font + 6) / 2, active ? '#e6ffa6' : '#f1eefb', font);
}

function getPosition(player, time) {
  if (!player.move) return player.position;
  const { from, to, start, duration } = player.move;
  const ratio = Math.max(0, Math.min(1, (time - start) / duration));
  return { x: from.x + (to.x - from.x) * ratio, y: from.y + (to.y - from.y) * ratio };
}

export function visibleDoors(state, isHost) {
  if (state.preview) return [
    { point: doors.finalist, title: '기록의 방', open: true },
    { point: doors.record, title: '제어의 방', open: false },
  ];
  if (state.phase === 'passage' && state.round === 3) {
    return [
      { point: doors.finalist, title: '우승 도전', open: isHost || state.area === 'finalist' },
      { point: doors.record, title: '기록 도전', open: isHost || state.area === 'record' },
    ];
  }
  const open = state.phase === 'passage';
  const title = open ? state.roomName : state.round === 3
    ? state.area === 'record' ? '기록 도전' : '마지막 방'
    : state.round === 2 ? '결승 입구' : state.round === 1 ? '다음 방' : '첫 번째 문';
  return [{ point: doors.main, title, open }];
}

function network(ctx, puzzle, task, width, height, scale) {
  const visits = task?.visits ?? [];
  const current = visits.at(-1);
  const points = new Map(puzzle.stations.map(station => [station.id, station]));
  for (const { from, to } of puzzle.edges) {
    const a = points.get(from);
    const b = points.get(to);
    const done = visits.indexOf(from) >= 0 && visits[visits.indexOf(from) + 1] === to;
    const next = current === from;
    ctx.lineWidth = done || next ? 3 : 1.5;
    const shade = done ? '#d8fb91' : next ? '#a6e6f2' : '#8b7ea6';
    line(ctx, a.x * width, a.y * height, b.x * width, b.y * height, shade);
    const tipX = (a.x * .21 + b.x * .79) * width;
    const tipY = (a.y * .21 + b.y * .79) * height;
    const angle = Math.atan2((b.y - a.y) * height, (b.x - a.x) * width);
    ctx.save();
    ctx.translate(tipX, tipY);
    ctx.rotate(angle);
    ctx.fillStyle = shade;
    ctx.beginPath();
    ctx.moveTo(5, 0);
    ctx.lineTo(-3, -4);
    ctx.lineTo(-3, 4);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }
  ctx.lineWidth = 1;
  for (const { from, to, cost } of puzzle.edges) {
    const a = points.get(from);
    const b = points.get(to);
    const ratio = a.y === b.y ? .5 : .38;
    const x = (a.x * (1 - ratio) + b.x * ratio) * width;
    const y = (a.y * (1 - ratio) + b.y * ratio) * height;
    const size = Math.max(13, scale * 14);
    box(ctx, x - size / 2 - 2, y - size / 2 - 2, size + 4, size + 4, 5, '#15172c', '#756b9b');
    label(ctx, String(cost), x, y, '#fff0a8', Math.max(11, scale * 12));
  }
}

function drawStations(ctx, state, width, height, scale, accent, isHost) {
  const { puzzle } = state;
  const task = state.me?.task;
  const isRoute = puzzle.mode === 'route';
  if (isRoute) network(ctx, puzzle, task, width, height, scale);
  for (const station of puzzle.stations) {
    const x = station.x * width;
    const y = station.y * height;
    const found = task?.visits.includes(station.id) ?? false;
    const current = task?.visits.at(-1);
    const next = isRoute && puzzle.edges.some(edge => edge.from === current && edge.to === station.id);
    const size = Math.max(isRoute ? 29 : 34, scale * (isRoute ? 34 : 42));
    const stampColor = station.stamp === '파랑' ? '#8dd5ff' : '#d8b0ff';
    const border = found ? '#dafba1' : next ? '#a4ecf7' : station.stamp ? stampColor : accent;
    if (next) box(ctx, x - size * .66, y - size * .66, size * 1.32, size * 1.32, 14, '#83eafd28', border + '77');
    box(ctx, x - size / 2, y - size / 2, size, size, 10, found ? '#344c42' : '#202640', border);
    label(ctx, station.id, x, y + 1, found ? '#eaffb8' : '#f2edff', Math.max(14, scale * 17));
    if (station.stamp) {
      ellipse(ctx, x + size * .45, y - size * .43, 6, 6, '#11172c');
      ellipse(ctx, x + size * .45, y - size * .43, 4, 4, stampColor);
    }
    const detail = station.flips?.join('·') ?? station.name ?? station.stamp ?? '';
    if (detail) {
      box(ctx, x - size * .51, y + size * .51, size * 1.02, 16, 5, '#14172b');
      label(ctx, detail, x, y + size * .51 + 8, '#e6e4fa', Math.max(10, scale * 11));
    }
    if (!isHost && found && !isRoute && !station.flips) {
      ellipse(ctx, x + size * .47, y - size * .47, 7, 7, '#d8fb91');
      label(ctx, '✓', x + size * .47, y - size * .47, '#12182c', 9);
    }
  }
}

function drawCargo(ctx, state, x, y, size) {
  const task = state.me?.task;
  if (!task || state.phase !== 'question') return;
  if (state.puzzle.mode === 'sequence' && task.visits.length) {
    const px = x + size * .55;
    box(ctx, px - 2, y - 2, size * .49, size * .47, 4, '#deef8e', '#192638');
    label(ctx, task.visits.at(-1), px + size * .23 - 2, y + size * .22 - 2, '#202b26', 10);
  } else if (state.puzzle.mode === 'route') {
    const packs = [
      ...Array(task.stamps.파랑).fill('#8dd5ff'),
      ...Array(task.stamps.보라).fill('#d8b0ff'),
    ];
    packs.forEach((color, index) => ellipse(ctx, x + size * .52, y - size * .3 + index * 8, 3.4, 3.4, color));
  }
}

const previewPlayers = [
  ['민트', '두리', .30, .45],
  ['보라', '구름', .55, .63],
  ['노랑', '봄', .68, .38],
  ['분홍', '모아', .75, .75],
  ['파랑', '하늘', .22, .73],
].map(([color, name, x, y], index) => ({ id: String(index), color, name, position: { x, y } }));

export function renderMap(canvas, state, time = 0, isHost = false) {
  const { clientWidth: width, clientHeight: height } = canvas;
  if (!width || !height) return;
  const ratio = Math.min(window.devicePixelRatio || 1, 2);
  if (canvas.width !== Math.round(width * ratio)) canvas.width = Math.round(width * ratio);
  if (canvas.height !== Math.round(height * ratio)) canvas.height = Math.round(height * ratio);
  const ctx = canvas.getContext('2d');
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  const scale = Math.max(.69, Math.min(1.55, width / 610, height / 380));
  const palette = palettes[state.area === 'record' ? 'record' : state.round] ?? palettes[0];
  floor(ctx, width, height, palette, scale);
  if (state.puzzle && ['question', 'reveal'].includes(state.phase)) {
    drawStations(ctx, state, width, height, scale, palette[4], isHost);
  } else {
    for (const entry of visibleDoors(state, isHost)) {
      door(ctx, entry.point, width, height, entry.open, entry.title, palette[4], scale,
        state.phase === 'passage' && !entry.open ? .47 : 1);
    }
  }
  const players = (state.preview ? previewPlayers : state.players).map(player => ({
    player, spot: getPosition(player, time),
  }));
  players.sort((a, b) => a.spot.y - b.spot.y || Number(a.player.id === state.me?.id) - Number(b.player.id === state.me?.id));
  const size = Math.max(19, scale * (state.preview ? 38 : 29));
  for (const { player, spot } of players) {
    const walk = player.move && time < player.move.start + player.move.duration ? Math.sin(time / 66) : 0;
    const isMe = player.id === state.me?.id;
    avatar(ctx, player, spot.x * width, spot.y * height, size, isMe || (state.preview && player.id === '0'), walk);
    if (isMe) drawCargo(ctx, state, spot.x * width, spot.y * height, size);
  }
}
