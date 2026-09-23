/**
 * Генератор судоку для полей крупнее классических 9×9.
 *
 * Классика осталась на своём движке (`sudokuEngine`): там расклад выкапывается с
 * проверкой единственности перебором, а «умные» уровни — логическим решателем на
 * 9 бит. Ни то, ни другое на 256 клеток не переносится: перебор взрывается, а
 * маски кандидатов перестают влезать в Int16.
 *
 * Здесь другой критерий копки: клетку убираем, только если расклад по-прежнему
 * доводится до конца честными приёмами. Это одновременно и гарантия
 * единственности решения (все приёмы — корректные исключения, они никогда не
 * снимают кандидата, встречающегося хоть в одном решении), и гарантия того, что
 * человеку не придётся угадывать. Заодно это линейно, а не экспоненциально.
 */

import { SudokuVariant } from "./sudokuVariants";

/** Потолок приёмов: чем выше уровень, тем труднее приёмы разрешены расклада ради. */
export type LargeTier = 1 | 2 | 3 | 4;

interface UnitTables {
  size: number;
  cells: number;
  allMask: number;
  boxW: number;
  boxH: number;
  rows: number[][];
  cols: number[][];
  boxes: number[][];
  units: number[][];
  boxOf: Int32Array;
  peers: Int32Array[];
}

const TABLES = new Map<number, UnitTables>();

function tablesFor(variant: SudokuVariant): UnitTables {
  const cached = TABLES.get(variant.size);
  if (cached) return cached;

  const { size, boxW, boxH, cells } = variant;
  const rows: number[][] = [];
  const cols: number[][] = [];
  const boxes: number[][] = Array.from({ length: size }, () => [] as number[]);
  const boxOf = new Int32Array(cells);

  for (let i = 0; i < size; i += 1) {
    const row: number[] = [];
    const col: number[] = [];
    for (let j = 0; j < size; j += 1) {
      row.push(i * size + j);
      col.push(j * size + i);
    }
    rows.push(row);
    cols.push(col);
  }

  for (let index = 0; index < cells; index += 1) {
    const row = Math.floor(index / size);
    const col = index % size;
    // Блоки нумеруются по рядам полос: полоса высотой boxH, в ней size/boxW блоков.
    const box = Math.floor(row / boxH) * Math.floor(size / boxW) + Math.floor(col / boxW);
    boxOf[index] = box;
    boxes[box].push(index);
  }

  const peers: Int32Array[] = [];
  for (let index = 0; index < cells; index += 1) {
    const row = Math.floor(index / size);
    const col = index % size;
    const set = new Set<number>([...rows[row], ...cols[col], ...boxes[boxOf[index]]]);
    set.delete(index);
    peers.push(Int32Array.from(set));
  }

  const tables: UnitTables = {
    size,
    cells,
    allMask: (1 << size) - 1,
    boxW,
    boxH,
    rows,
    cols,
    boxes,
    units: [...rows, ...cols, ...boxes],
    boxOf,
    peers,
  };
  TABLES.set(size, tables);
  return tables;
}

function bit(digit: number): number {
  return 1 << (digit - 1);
}

function popcount(mask: number): number {
  let count = 0;
  let value = mask;
  while (value) {
    value &= value - 1;
    count += 1;
  }
  return count;
}

function lowestDigit(mask: number): number {
  return 32 - Math.clz32(mask & -mask);
}

function digitsOf(mask: number, size: number): number[] {
  const digits: number[] = [];
  for (let digit = 1; digit <= size; digit += 1) {
    if (mask & bit(digit)) digits.push(digit);
  }
  return digits;
}

interface Board {
  values: Int32Array;
  /** Маски кандидатов; на 16×16 старший бит не влезает в Int16, поэтому Int32. */
  cands: Int32Array;
  empty: number;
}

function createBoard(grid: Array<number | null>, t: UnitTables): Board | null {
  const values = new Int32Array(t.cells);
  const cands = new Int32Array(t.cells).fill(t.allMask);
  let empty = t.cells;

  for (let index = 0; index < t.cells; index += 1) {
    const value = grid[index];
    if (!value) continue;
    values[index] = value;
    cands[index] = 0;
    empty -= 1;
  }

  for (let index = 0; index < t.cells; index += 1) {
    const value = values[index];
    if (!value) continue;
    const mask = ~bit(value);
    for (const peer of t.peers[index]) {
      if (values[peer] === value) return null;
      cands[peer] &= mask;
    }
  }

  for (let index = 0; index < t.cells; index += 1) {
    if (!values[index] && cands[index] === 0) return null;
  }

  return { values, cands, empty };
}

function place(board: Board, index: number, digit: number, t: UnitTables): boolean {
  board.values[index] = digit;
  board.cands[index] = 0;
  board.empty -= 1;
  const mask = ~bit(digit);
  for (const peer of t.peers[index]) {
    if (board.values[peer] === digit) return false;
    if (board.values[peer]) continue;
    board.cands[peer] &= mask;
    if (board.cands[peer] === 0) return false;
  }
  return true;
}

function eliminate(board: Board, index: number, mask: number): number {
  const before = board.cands[index];
  const after = before & ~mask;
  if (after === before) return 0;
  if (after === 0) return -1;
  board.cands[index] = after;
  return 1;
}

/**
 * Одиночки — голые и скрытые — до упора.
 *
 * Скрытые ищутся битовым проходом по юниту: `once` копит цифры, встреченные хотя
 * бы раз, `twice` — встреченные повторно. Что осталось только в `once`, стоит в
 * юните ровно в одной клетке. Это O(размер) на юнит вместо перебора по цифрам, и
 * именно поэтому копка на 16×16 укладывается в доли секунды.
 */
function propagateSingles(board: Board, t: UnitTables): boolean {
  for (;;) {
    let progressed = false;

    for (let index = 0; index < t.cells; index += 1) {
      if (board.values[index] || popcount(board.cands[index]) !== 1) continue;
      if (!place(board, index, lowestDigit(board.cands[index]), t)) return false;
      progressed = true;
    }
    if (progressed) continue;
    if (board.empty === 0) return true;

    for (const unit of t.units) {
      let once = 0;
      let twice = 0;
      let filled = 0;
      for (const index of unit) {
        if (board.values[index]) {
          filled |= bit(board.values[index]);
          continue;
        }
        const mask = board.cands[index];
        twice |= once & mask;
        once |= mask;
      }
      // Цифра, которой в юните нет ни в значениях, ни в кандидатах — тупик.
      if ((once | filled) !== t.allMask) return false;

      let unique = once & ~twice;
      while (unique) {
        const digit = lowestDigit(unique);
        unique &= unique - 1;
        const flag = bit(digit);
        const spot = unit.find((index) => !board.values[index] && board.cands[index] & flag);
        if (spot === undefined) continue;
        if (!place(board, spot, digit, t)) return false;
        progressed = true;
      }
    }

    if (!progressed) return true;
  }
}

/** Указующие пары: цифра заперта в блоке одной линией — или в линии одним блоком. */
function lockedCandidates(board: Board, t: UnitTables): boolean | null {
  const boxesPerBand = Math.floor(t.size / t.boxW);

  for (let digit = 1; digit <= t.size; digit += 1) {
    const flag = bit(digit);

    for (const box of t.boxes) {
      const spots = box.filter((index) => !board.values[index] && board.cands[index] & flag);
      if (spots.length < 2) continue;
      const rows = new Set(spots.map((index) => Math.floor(index / t.size)));
      const cols = new Set(spots.map((index) => index % t.size));
      const line =
        rows.size === 1 ? t.rows[[...rows][0]] : cols.size === 1 ? t.cols[[...cols][0]] : null;
      if (!line) continue;
      let removed = 0;
      for (const index of line) {
        if (board.values[index] || spots.includes(index)) continue;
        const step = eliminate(board, index, flag);
        if (step < 0) return null;
        removed += step;
      }
      if (removed > 0) return true;
    }

    for (const line of [...t.rows, ...t.cols]) {
      const spots = line.filter((index) => !board.values[index] && board.cands[index] & flag);
      if (spots.length < 2) continue;
      const boxes = new Set(
        spots.map(
          (index) =>
            Math.floor(Math.floor(index / t.size) / t.boxH) * boxesPerBand +
            Math.floor((index % t.size) / t.boxW),
        ),
      );
      if (boxes.size !== 1) continue;
      let removed = 0;
      for (const index of t.boxes[[...boxes][0]]) {
        if (board.values[index] || spots.includes(index)) continue;
        const step = eliminate(board, index, flag);
        if (step < 0) return null;
        removed += step;
      }
      if (removed > 0) return true;
    }
  }
  return false;
}

/** Голые пары: две клетки юнита делят одни и те же две цифры. */
function nakedPairs(board: Board, t: UnitTables): boolean | null {
  for (const unit of t.units) {
    const open = unit.filter((index) => !board.values[index] && popcount(board.cands[index]) === 2);
    for (let a = 0; a < open.length; a += 1) {
      for (let b = a + 1; b < open.length; b += 1) {
        const mask = board.cands[open[a]];
        if (mask !== board.cands[open[b]]) continue;
        let removed = 0;
        for (const index of unit) {
          if (board.values[index] || index === open[a] || index === open[b]) continue;
          const step = eliminate(board, index, mask);
          if (step < 0) return null;
          removed += step;
        }
        if (removed > 0) return true;
      }
    }
  }
  return false;
}

/** Скрытые пары: две цифры юнита живут только в одних и тех же двух клетках. */
function hiddenPairs(board: Board, t: UnitTables): boolean | null {
  for (const unit of t.units) {
    const spots: Array<{ digit: number; cells: number[] }> = [];
    for (let digit = 1; digit <= t.size; digit += 1) {
      const flag = bit(digit);
      if (unit.some((index) => board.values[index] === digit)) continue;
      const cells = unit.filter((index) => !board.values[index] && board.cands[index] & flag);
      if (cells.length === 2) spots.push({ digit, cells });
    }

    for (let a = 0; a < spots.length; a += 1) {
      for (let b = a + 1; b < spots.length; b += 1) {
        const first = spots[a];
        const second = spots[b];
        if (first.cells[0] !== second.cells[0] || first.cells[1] !== second.cells[1]) continue;
        const keep = bit(first.digit) | bit(second.digit);
        let removed = 0;
        for (const index of first.cells) {
          const step = eliminate(board, index, t.allMask & ~keep);
          if (step < 0) return null;
          removed += step;
        }
        if (removed > 0) return true;
      }
    }
  }
  return false;
}

/** Доводится ли расклад до конца приёмами не сложнее `tier`. */
export function solvesByLogic(
  grid: Array<number | null>,
  variant: SudokuVariant,
  tier: LargeTier,
): boolean {
  const t = tablesFor(variant);
  const board = createBoard(grid, t);
  if (!board) return false;

  for (;;) {
    if (!propagateSingles(board, t)) return false;
    if (board.empty === 0) return true;

    // Дорогие приёмы включаются только когда одиночки встали — иначе копка
    // на 16×16 из долей секунды превращается в десятки.
    let progressed: boolean | null = false;
    if (tier >= 2) progressed = lockedCandidates(board, t);
    if (progressed === null) return false;
    if (!progressed && tier >= 3) progressed = nakedPairs(board, t);
    if (progressed === null) return false;
    if (!progressed && tier >= 4) progressed = hiddenPairs(board, t);
    if (progressed === null) return false;
    if (!progressed) return false;
  }
}

function shuffle<T>(items: T[], rng: () => number): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

/**
 * Готовая раскладка: базовый шаблон плюс перестановки полос, линий и цифр.
 *
 * Шаблон обобщает классический: сдвиг строки внутри полосы равен ширине блока,
 * сдвиг самой полосы — единице. Для блока boxW×boxH это даёт корректный квадрат
 * при любых сторонах, кратных блоку.
 */
export function buildLargeSolution(variant: SudokuVariant, rng: () => number): number[] {
  const { size, boxW, boxH } = variant;
  const rowBands = size / boxH;
  const colStacks = size / boxW;

  const rows = shuffle(
    Array.from({ length: rowBands }, (_, i) => i),
    rng,
  ).flatMap((band) =>
    shuffle(
      Array.from({ length: boxH }, (_, i) => i),
      rng,
    ).map((row) => band * boxH + row),
  );
  const cols = shuffle(
    Array.from({ length: colStacks }, (_, i) => i),
    rng,
  ).flatMap((stack) =>
    shuffle(
      Array.from({ length: boxW }, (_, i) => i),
      rng,
    ).map((col) => stack * boxW + col),
  );
  const digits = shuffle(
    Array.from({ length: size }, (_, i) => i + 1),
    rng,
  );

  const solution: number[] = [];
  for (const row of rows) {
    for (const col of cols) {
      const pattern = (boxW * (row % boxH) + Math.floor(row / boxH) + col) % size;
      solution.push(digits[pattern]);
    }
  }
  return solution;
}

export interface LargeSpec {
  tier: LargeTier;
  /** Доля открытых клеток, к которой стремится копка. */
  givensRatio: number;
}

export function carveLarge(
  solution: number[],
  variant: SudokuVariant,
  spec: LargeSpec,
  rng: () => number,
  deadline: number,
): Array<number | null> {
  const target = Math.round(variant.cells * spec.givensRatio);
  const puzzle: Array<number | null> = [...solution];
  const order = shuffle(
    Array.from({ length: variant.cells }, (_, i) => i),
    rng,
  );
  let remaining = variant.cells;
  let step = 0;

  for (const index of order) {
    if (remaining <= target) break;
    // Считаем шаги, а не снятые клетки: под конец копки снятий почти нет, и
    // счётчик остатка застывает — дедлайн тогда не сработал бы ни разу.
    step += 1;
    if ((step & 7) === 0 && Date.now() > deadline) break;

    const previous = puzzle[index];
    puzzle[index] = null;
    if (solvesByLogic(puzzle, variant, spec.tier)) {
      remaining -= 1;
    } else {
      puzzle[index] = previous;
    }
  }

  return puzzle;
}

export { digitsOf };
