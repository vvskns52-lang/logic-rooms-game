export function rotatePiece(cells, turn) {
  let rotated = cells;
  for (let count = 0; count < turn; count++) rotated = rotated.map(([x, y]) => [-y, x]);
  const x0 = Math.min(...rotated.map(point => point[0]));
  const y0 = Math.min(...rotated.map(point => point[1]));
  return rotated.map(([x, y]) => [x - x0, y - y0])
    .sort(([ax, ay], [bx, by]) => ay - by || ax - bx);
}

export function pieceSquares(piece, placement) {
  const rotated = rotatePiece(piece.cells, placement.turn);
  const [anchorX, anchorY] = rotated[0];
  return rotated.map(([x, y]) => [x - anchorX + placement.x, y - anchorY + placement.y]);
}

export function fitLayout(frame, pieces, placements) {
  const occupied = new Map();
  const byId = new Set();
  for (const placement of placements) {
    if (!placement || !Number.isInteger(placement.x) || !Number.isInteger(placement.y) ||
        !Number.isInteger(placement.turn) || placement.turn < 0 || placement.turn > 3 || byId.has(placement.id)) return null;
    const piece = pieces.find(item => item.id === placement.id);
    if (!piece) return null;
    for (const [x, y] of pieceSquares(piece, placement)) {
      const key = x + ',' + y;
      if (frame[y]?.[x] !== 1 || occupied.has(key)) return null;
      occupied.set(key, piece.id);
    }
    byId.add(piece.id);
  }
  return occupied;
}

export const wireDirections = [
  { x: 0, y: -1, label: '위', side: 'top' },
  { x: 1, y: 0, label: '오른쪽', side: 'right' },
  { x: 0, y: 1, label: '아래', side: 'bottom' },
  { x: -1, y: 0, label: '왼쪽', side: 'left' },
];

export function wirePorts(ports, turns) {
  return ports.map(port => (port + turns) % 4);
}

export function connectedWire(question, turns) {
  const { wire, columns, terminals } = question;
  if (turns.length !== wire.length || turns.some(turn => !Number.isInteger(turn) || turn < 0 || turn > 3)) return false;
  const ports = wire.map((tile, index) => wirePorts(tile, turns[index]));
  const visited = new Set();
  const pending = [terminals[0]];
  while (pending.length) {
    const index = pending.pop();
    if (visited.has(index)) continue;
    visited.add(index);
    for (const direction of ports[index]) {
      const offset = wireDirections[direction];
      const x = index % columns + offset.x;
      const y = Math.floor(index / columns) + offset.y;
      const next = y * columns + x;
      if (x < 0 || x >= columns || y < 0 || next >= wire.length || !ports[next].includes((direction + 2) % 4)) return false;
      pending.push(next);
    }
  }
  return visited.size === wire.length && visited.has(terminals[1]);
}
