// Russian draughts (шашки) engine.
// 8x8 board, men capture in all 4 diagonal directions, flying kings,
// mandatory capture (must take if a capture exists), multi-jump chains.

export type Color = "w" | "b";
export interface Piece {
  color: Color;
  king: boolean;
}
export type Board = (Piece | null)[]; // length 64, row-major

export interface Capture {
  to: number;
  captured: number;
}

export interface Move {
  from: number;
  to: number;
  captured: number | null;
}

export type BotLevel = 1 | 2 | 3 | 4 | 5;

const SIZE = 8;
const DIRS: Array<[number, number]> = [
  [-1, -1],
  [-1, 1],
  [1, -1],
  [1, 1],
];

export const idx = (r: number, c: number) => r * SIZE + c;
export const rc = (i: number) => [Math.floor(i / SIZE), i % SIZE] as const;
export const isDark = (r: number, c: number) => (r + c) % 2 === 1;
const inB = (r: number, c: number) => r >= 0 && r < SIZE && c >= 0 && c < SIZE;

export function initialBoard(): Board {
  const b: Board = Array(64).fill(null);
  for (let r = 0; r < SIZE; r += 1) {
    for (let c = 0; c < SIZE; c += 1) {
      if (!isDark(r, c)) continue;
      if (r < 3) b[idx(r, c)] = { color: "b", king: false };
      else if (r > 4) b[idx(r, c)] = { color: "w", king: false };
    }
  }
  return b;
}

export function cloneBoard(b: Board): Board {
  return b.map((p) => (p ? { ...p } : null));
}

export function pieceCaptures(b: Board, i: number): Capture[] {
  const p = b[i];
  if (!p) return [];
  const [r, c] = rc(i);
  const res: Capture[] = [];
  if (!p.king) {
    for (const [dr, dc] of DIRS) {
      const er = r + dr;
      const ec = c + dc;
      const lr = r + 2 * dr;
      const lc = c + 2 * dc;
      if (!inB(lr, lc)) continue;
      const mid = b[idx(er, ec)];
      if (mid && mid.color !== p.color && !b[idx(lr, lc)]) {
        res.push({ to: idx(lr, lc), captured: idx(er, ec) });
      }
    }
  } else {
    for (const [dr, dc] of DIRS) {
      let rr = r + dr;
      let cc = c + dc;
      while (inB(rr, cc) && !b[idx(rr, cc)]) {
        rr += dr;
        cc += dc;
      }
      if (!inB(rr, cc)) continue;
      const mid = b[idx(rr, cc)];
      if (!mid || mid.color === p.color) continue;
      const captured = idx(rr, cc);
      let lr = rr + dr;
      let lc = cc + dc;
      while (inB(lr, lc) && !b[idx(lr, lc)]) {
        res.push({ to: idx(lr, lc), captured });
        lr += dr;
        lc += dc;
      }
    }
  }
  return res;
}

export function pieceSimpleMoves(b: Board, i: number): number[] {
  const p = b[i];
  if (!p) return [];
  const [r, c] = rc(i);
  const res: number[] = [];
  if (!p.king) {
    const fwd = p.color === "w" ? -1 : 1;
    for (const dc of [-1, 1]) {
      const nr = r + fwd;
      const nc = c + dc;
      if (inB(nr, nc) && !b[idx(nr, nc)]) res.push(idx(nr, nc));
    }
  } else {
    for (const [dr, dc] of DIRS) {
      let rr = r + dr;
      let cc = c + dc;
      while (inB(rr, cc) && !b[idx(rr, cc)]) {
        res.push(idx(rr, cc));
        rr += dr;
        cc += dc;
      }
    }
  }
  return res;
}

export function hasAnyCapture(b: Board, color: Color): boolean {
  for (let i = 0; i < 64; i += 1) {
    if (b[i]?.color === color && pieceCaptures(b, i).length) return true;
  }
  return false;
}

export function hasAnyMove(b: Board, color: Color): boolean {
  if (hasAnyCapture(b, color)) return true;
  for (let i = 0; i < 64; i += 1) {
    if (b[i]?.color === color && pieceSimpleMoves(b, i).length) return true;
  }
  return false;
}

export function countPieces(b: Board, color: Color): number {
  return b.reduce((n, p) => (p?.color === color ? n + 1 : n), 0);
}

// Legal targets for a piece, respecting global mandatory capture.
export function legalForPiece(b: Board, i: number): { captures: Capture[]; moves: number[] } {
  const p = b[i];
  if (!p) return { captures: [], moves: [] };
  const caps = pieceCaptures(b, i);
  if (hasAnyCapture(b, p.color)) return { captures: caps, moves: [] };
  return { captures: caps, moves: pieceSimpleMoves(b, i) };
}

export function allLegalMoves(b: Board, color: Color): Move[] {
  const out: Move[] = [];
  const mustCapture = hasAnyCapture(b, color);
  for (let i = 0; i < 64; i += 1) {
    if (b[i]?.color !== color) continue;
    const captures = pieceCaptures(b, i);
    if (mustCapture) {
      captures.forEach((capture) => out.push({ from: i, to: capture.to, captured: capture.captured }));
    } else {
      pieceSimpleMoves(b, i).forEach((to) => out.push({ from: i, to, captured: null }));
    }
  }
  return out;
}

function promote(b: Board, i: number) {
  const p = b[i];
  if (!p || p.king) return;
  const [r] = rc(i);
  if ((p.color === "w" && r === 0) || (p.color === "b" && r === SIZE - 1)) p.king = true;
}

// Apply a move/capture. Returns new board and whether the same piece must keep capturing.
export function applyMove(
  b: Board,
  from: number,
  to: number,
  captured: number | null,
): { board: Board; mustContinue: boolean; end: number } {
  const nb = cloneBoard(b);
  const p = nb[from]!;
  nb[to] = p;
  nb[from] = null;
  if (captured !== null) nb[captured] = null;
  promote(nb, to);
  let mustContinue = false;
  if (captured !== null && pieceCaptures(nb, to).length > 0) mustContinue = true;
  return { board: nb, mustContinue, end: to };
}

const other = (color: Color): Color => (color === "w" ? "b" : "w");

function randomItem<T>(items: T[]): T {
  return items[Math.floor(Math.random() * items.length)]!;
}

function reachesKingRow(b: Board, move: Move): boolean {
  const piece = b[move.from];
  if (!piece || piece.king) return false;
  const [r] = rc(move.to);
  return (piece.color === "w" && r === 0) || (piece.color === "b" && r === 7);
}

function materialScore(b: Board, color: Color): number {
  let score = 0;
  for (let i = 0; i < 64; i += 1) {
    const p = b[i];
    if (!p) continue;
    const [r, c] = rc(i);
    const center = 3.5 - Math.max(Math.abs(3.5 - r), Math.abs(3.5 - c));
    const advance = p.color === "w" ? 7 - r : r;
    const value = (p.king ? 280 : 100 + advance * 6) + center * 4;
    score += p.color === color ? value : -value;
  }
  score += allLegalMoves(b, color).length * 3;
  score -= allLegalMoves(b, other(color)).length * 3;
  return score;
}

function moveHeuristic(b: Board, color: Color, move: Move): number {
  const before = b[move.from];
  const applied = applyMove(b, move.from, move.to, move.captured);
  let score = materialScore(applied.board, color);
  if (move.captured !== null) score += 140;
  if (applied.mustContinue) score += 90;
  if (reachesKingRow(b, move)) score += 120;
  if (before?.king) score += 12;
  return score;
}

function minimax(b: Board, color: Color, root: Color, depth: number): number {
  if (depth <= 0 || !hasAnyMove(b, color)) return materialScore(b, root);
  const moves = allLegalMoves(b, color);
  if (moves.length === 0) return color === root ? -99999 : 99999;
  const maximizing = color === root;
  let best = maximizing ? -Infinity : Infinity;
  for (const move of moves) {
    const applied = applyMove(b, move.from, move.to, move.captured);
    const nextColor = applied.mustContinue ? color : other(color);
    const score = minimax(applied.board, nextColor, root, depth - 1);
    best = maximizing ? Math.max(best, score) : Math.min(best, score);
  }
  return best;
}

export function chooseBotMove(b: Board, color: Color, level: BotLevel): Move | null {
  const moves = allLegalMoves(b, color);
  if (moves.length === 0) return null;
  if (level === 1) return randomItem(moves);

  const ranked = moves
    .map((move) => ({ move, score: moveHeuristic(b, color, move) }))
    .sort((a, z) => z.score - a.score);

  if (level === 2) {
    const pool = ranked.slice(0, Math.min(3, ranked.length));
    return randomItem(pool).move;
  }

  if (level === 3) return ranked[0]!.move;

  const depth = level === 4 ? 2 : 3;
  const searched = moves
    .map((move) => {
      const applied = applyMove(b, move.from, move.to, move.captured);
      const nextColor = applied.mustContinue ? color : other(color);
      return {
        move,
        score: minimax(applied.board, nextColor, color, depth),
      };
    })
    .sort((a, z) => z.score - a.score);

  if (level === 4) {
    const pool = searched.slice(0, Math.min(2, searched.length));
    return randomItem(pool).move;
  }
  return searched[0]!.move;
}
