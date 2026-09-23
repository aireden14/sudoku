/**
 * Логический решатель судоку с градацией приёмов.
 *
 * Нужен для «умных» уровней сложности: расклад считается честным, только если он
 * решается человеческими приёмами без перебора, а его сложность — это самый
 * трудный приём, без которого решение не доводится до конца.
 */

export type SudokuTechnique =
  | "naked-single"
  | "hidden-single"
  | "locked-candidates"
  | "naked-pair"
  | "hidden-pair"
  | "naked-triple"
  | "hidden-triple"
  | "x-wing"
  | "xy-wing"
  | "swordfish";

/** Чем выше ранг, тем труднее приём для человека. */
export const TECHNIQUE_TIER: Record<SudokuTechnique, number> = {
  "naked-single": 1,
  "hidden-single": 2,
  "locked-candidates": 3,
  "naked-pair": 4,
  "hidden-pair": 4,
  "naked-triple": 5,
  "hidden-triple": 5,
  "x-wing": 6,
  "xy-wing": 7,
  swordfish: 8,
};

export const TECHNIQUE_LABELS: Record<SudokuTechnique, string> = {
  "naked-single": "Одиночки",
  "hidden-single": "Скрытые одиночки",
  "locked-candidates": "Указующие пары",
  "naked-pair": "Голые пары",
  "hidden-pair": "Скрытые пары",
  "naked-triple": "Голые тройки",
  "hidden-triple": "Скрытые тройки",
  "x-wing": "X-Wing",
  "xy-wing": "XY-Wing",
  swordfish: "Swordfish",
};

const SIZE = 9;
const CELLS = 81;
const ALL_MASK = 0x1ff;

const ROW_UNITS: number[][] = [];
const COL_UNITS: number[][] = [];
const BOX_UNITS: number[][] = [];

for (let i = 0; i < SIZE; i += 1) {
  const row: number[] = [];
  const col: number[] = [];
  const box: number[] = [];
  for (let j = 0; j < SIZE; j += 1) {
    row.push(i * SIZE + j);
    col.push(j * SIZE + i);
    const boxRow = Math.floor(i / 3) * 3 + Math.floor(j / 3);
    const boxCol = (i % 3) * 3 + (j % 3);
    box.push(boxRow * SIZE + boxCol);
  }
  ROW_UNITS.push(row);
  COL_UNITS.push(col);
  BOX_UNITS.push(box);
}

const ALL_UNITS = [...ROW_UNITS, ...COL_UNITS, ...BOX_UNITS];

const PEERS: number[][] = [];
for (let index = 0; index < CELLS; index += 1) {
  const row = Math.floor(index / SIZE);
  const col = index % SIZE;
  const boxIndex = Math.floor(row / 3) * 3 + Math.floor(col / 3);
  const peers = new Set<number>([...ROW_UNITS[row], ...COL_UNITS[col], ...BOX_UNITS[boxIndex]]);
  peers.delete(index);
  PEERS.push([...peers]);
}

const SEES: boolean[][] = [];
for (let index = 0; index < CELLS; index += 1) {
  const row = new Array<boolean>(CELLS).fill(false);
  for (const peer of PEERS[index]) row[peer] = true;
  SEES.push(row);
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

function digitsOf(mask: number): number[] {
  const digits: number[] = [];
  for (let digit = 1; digit <= SIZE; digit += 1) {
    if (mask & bit(digit)) digits.push(digit);
  }
  return digits;
}

interface Board {
  values: Int8Array;
  cands: Int16Array;
  empty: number;
}

function createBoard(grid: Array<number | null>): Board | null {
  const values = new Int8Array(CELLS);
  const cands = new Int16Array(CELLS).fill(ALL_MASK);
  let empty = CELLS;

  for (let index = 0; index < CELLS; index += 1) {
    const value = grid[index];
    if (!value) continue;
    values[index] = value;
    cands[index] = 0;
    empty -= 1;
  }

  for (let index = 0; index < CELLS; index += 1) {
    const value = values[index];
    if (!value) continue;
    for (const peer of PEERS[index]) {
      if (values[peer] === value) return null;
      cands[peer] &= ~bit(value);
    }
  }

  for (let index = 0; index < CELLS; index += 1) {
    if (!values[index] && cands[index] === 0) return null;
  }

  return { values, cands, empty };
}

function place(board: Board, index: number, digit: number): boolean {
  board.values[index] = digit;
  board.cands[index] = 0;
  board.empty -= 1;
  const mask = ~bit(digit);
  for (const peer of PEERS[index]) {
    if (board.values[peer] === digit) return false;
    if (board.values[peer]) continue;
    board.cands[peer] &= mask;
    if (board.cands[peer] === 0) return false;
  }
  return true;
}

/** Убирает кандидатов; возвращает число снятых меток. */
function eliminate(board: Board, index: number, mask: number): number {
  const before = board.cands[index];
  const after = before & ~mask;
  if (after === before) return 0;
  if (after === 0) return -1;
  board.cands[index] = after;
  return popcount(before) - popcount(after);
}

/** Приёмы-размещения дополнительно сообщают, какую клетку они закрыли. */
type StepResult =
  | { technique: SudokuTechnique; placement?: { index: number; digit: number } }
  | null
  | false;

function nakedSingle(board: Board): StepResult {
  for (let index = 0; index < CELLS; index += 1) {
    if (board.values[index]) continue;
    const mask = board.cands[index];
    if (popcount(mask) === 1) {
      const digit = digitsOf(mask)[0];
      if (!place(board, index, digit)) return false;
      return { technique: "naked-single", placement: { index, digit } };
    }
  }
  return null;
}

function hiddenSingle(board: Board): StepResult {
  for (const unit of ALL_UNITS) {
    for (let digit = 1; digit <= SIZE; digit += 1) {
      const flag = bit(digit);
      let spot = -1;
      let count = 0;
      let placed = false;
      for (const index of unit) {
        if (board.values[index] === digit) {
          placed = true;
          break;
        }
        if (!board.values[index] && board.cands[index] & flag) {
          spot = index;
          count += 1;
          if (count > 1) break;
        }
      }
      if (placed) continue;
      if (count === 0) return false;
      if (count === 1) {
        if (!place(board, spot, digit)) return false;
        return { technique: "hidden-single", placement: { index: spot, digit } };
      }
    }
  }
  return null;
}

function lockedCandidates(board: Board): StepResult {
  for (let digit = 1; digit <= SIZE; digit += 1) {
    const flag = bit(digit);

    // Указующая пара: в блоке цифра стоит только в одной строке/столбце.
    for (let boxIndex = 0; boxIndex < SIZE; boxIndex += 1) {
      const spots = BOX_UNITS[boxIndex].filter(
        (index) => !board.values[index] && board.cands[index] & flag,
      );
      if (spots.length < 2) continue;
      const rows = new Set(spots.map((index) => Math.floor(index / SIZE)));
      const cols = new Set(spots.map((index) => index % SIZE));
      const line =
        rows.size === 1 ? ROW_UNITS[[...rows][0]] : cols.size === 1 ? COL_UNITS[[...cols][0]] : null;
      if (!line) continue;
      let removed = 0;
      for (const index of line) {
        if (spots.includes(index) || board.values[index]) continue;
        const step = eliminate(board, index, flag);
        if (step < 0) return false;
        removed += step;
      }
      if (removed > 0) return { technique: "locked-candidates" };
    }

    // Обратный случай: в строке/столбце цифра заперта внутри одного блока.
    for (const line of [...ROW_UNITS, ...COL_UNITS]) {
      const spots = line.filter((index) => !board.values[index] && board.cands[index] & flag);
      if (spots.length < 2) continue;
      const boxes = new Set(
        spots.map((index) => Math.floor(Math.floor(index / SIZE) / 3) * 3 + Math.floor((index % SIZE) / 3)),
      );
      if (boxes.size !== 1) continue;
      let removed = 0;
      for (const index of BOX_UNITS[[...boxes][0]]) {
        if (spots.includes(index) || board.values[index]) continue;
        const step = eliminate(board, index, flag);
        if (step < 0) return false;
        removed += step;
      }
      if (removed > 0) return { technique: "locked-candidates" };
    }
  }
  return null;
}

function nakedSubset(board: Board, size: number): StepResult {
  const technique: SudokuTechnique = size === 2 ? "naked-pair" : "naked-triple";
  for (const unit of ALL_UNITS) {
    const open = unit.filter(
      (index) => !board.values[index] && popcount(board.cands[index]) <= size && popcount(board.cands[index]) > 1,
    );
    if (open.length <= size) continue;

    const combos = combinations(open, size);
    for (const combo of combos) {
      let union = 0;
      for (const index of combo) union |= board.cands[index];
      if (popcount(union) !== size) continue;

      let removed = 0;
      for (const index of unit) {
        if (combo.includes(index) || board.values[index]) continue;
        const step = eliminate(board, index, union);
        if (step < 0) return false;
        removed += step;
      }
      if (removed > 0) return { technique };
    }
  }
  return null;
}

function hiddenSubset(board: Board, size: number): StepResult {
  const technique: SudokuTechnique = size === 2 ? "hidden-pair" : "hidden-triple";
  for (const unit of ALL_UNITS) {
    const spotsByDigit = new Map<number, number[]>();
    for (let digit = 1; digit <= SIZE; digit += 1) {
      const flag = bit(digit);
      if (unit.some((index) => board.values[index] === digit)) continue;
      const spots = unit.filter((index) => !board.values[index] && board.cands[index] & flag);
      if (spots.length >= 2 && spots.length <= size) spotsByDigit.set(digit, spots);
    }
    if (spotsByDigit.size < size) continue;

    const digits = [...spotsByDigit.keys()];
    for (const combo of combinations(digits, size)) {
      const cells = new Set<number>();
      let mask = 0;
      for (const digit of combo) {
        for (const index of spotsByDigit.get(digit)!) cells.add(index);
        mask |= bit(digit);
      }
      if (cells.size !== size) continue;

      let removed = 0;
      for (const index of cells) {
        const step = eliminate(board, index, ALL_MASK & ~mask);
        if (step < 0) return false;
        removed += step;
      }
      if (removed > 0) return { technique };
    }
  }
  return null;
}

function fish(board: Board, size: number): StepResult {
  const technique: SudokuTechnique = size === 2 ? "x-wing" : "swordfish";
  for (let digit = 1; digit <= SIZE; digit += 1) {
    const flag = bit(digit);

    for (const orientation of [0, 1]) {
      const lines = orientation === 0 ? ROW_UNITS : COL_UNITS;
      const crossLines = orientation === 0 ? COL_UNITS : ROW_UNITS;

      const usable: Array<{ line: number; positions: number[] }> = [];
      for (let lineIndex = 0; lineIndex < SIZE; lineIndex += 1) {
        const spots = lines[lineIndex].filter(
          (index) => !board.values[index] && board.cands[index] & flag,
        );
        if (spots.length >= 2 && spots.length <= size) {
          const positions = spots.map((index) => (orientation === 0 ? index % SIZE : Math.floor(index / SIZE)));
          usable.push({ line: lineIndex, positions });
        }
      }
      if (usable.length < size) continue;

      for (const combo of combinations(usable, size)) {
        const cover = new Set<number>();
        for (const entry of combo) for (const position of entry.positions) cover.add(position);
        if (cover.size !== size) continue;

        const lineSet = new Set(combo.map((entry) => entry.line));
        let removed = 0;
        for (const position of cover) {
          for (const index of crossLines[position]) {
            const lineOfCell = orientation === 0 ? Math.floor(index / SIZE) : index % SIZE;
            if (lineSet.has(lineOfCell) || board.values[index]) continue;
            const step = eliminate(board, index, flag);
            if (step < 0) return false;
            removed += step;
          }
        }
        if (removed > 0) return { technique };
      }
    }
  }
  return null;
}

function xyWing(board: Board): StepResult {
  const bivalue: number[] = [];
  for (let index = 0; index < CELLS; index += 1) {
    if (!board.values[index] && popcount(board.cands[index]) === 2) bivalue.push(index);
  }

  for (const pivot of bivalue) {
    const [x, y] = digitsOf(board.cands[pivot]);
    const wings = bivalue.filter((index) => index !== pivot && SEES[pivot][index]);

    for (let a = 0; a < wings.length; a += 1) {
      for (let b = a + 1; b < wings.length; b += 1) {
        const first = wings[a];
        const second = wings[b];
        const maskA = board.cands[first];
        const maskB = board.cands[second];

        // Крылья должны делить с осью разные цифры и совпадать в третьей.
        const shared = maskA & maskB & ~board.cands[pivot];
        if (popcount(shared) !== 1) continue;
        const hasX = (maskA & bit(x)) !== 0 && (maskB & bit(y)) !== 0;
        const hasY = (maskA & bit(y)) !== 0 && (maskB & bit(x)) !== 0;
        if (!hasX && !hasY) continue;
        if ((maskA & board.cands[pivot]) === 0 || (maskB & board.cands[pivot]) === 0) continue;
        if (popcount(maskA & board.cands[pivot]) !== 1 || popcount(maskB & board.cands[pivot]) !== 1) continue;
        if ((maskA & board.cands[pivot]) === (maskB & board.cands[pivot])) continue;

        let removed = 0;
        for (let index = 0; index < CELLS; index += 1) {
          if (board.values[index]) continue;
          if (index === pivot || index === first || index === second) continue;
          if (!SEES[first][index] || !SEES[second][index]) continue;
          const step = eliminate(board, index, shared);
          if (step < 0) return false;
          removed += step;
        }
        if (removed > 0) return { technique: "xy-wing" };
      }
    }
  }
  return null;
}

function combinations<T>(items: T[], size: number): T[][] {
  const result: T[][] = [];
  const current: T[] = [];
  const walk = (start: number) => {
    if (current.length === size) {
      result.push([...current]);
      return;
    }
    for (let i = start; i < items.length; i += 1) {
      current.push(items[i]);
      walk(i + 1);
      current.pop();
    }
  };
  walk(0);
  return result;
}

const STRATEGIES: Array<{ technique: SudokuTechnique; run: (board: Board) => StepResult }> = [
  { technique: "naked-single", run: nakedSingle },
  { technique: "hidden-single", run: hiddenSingle },
  { technique: "locked-candidates", run: lockedCandidates },
  { technique: "naked-pair", run: (board) => nakedSubset(board, 2) },
  { technique: "hidden-pair", run: (board) => hiddenSubset(board, 2) },
  { technique: "naked-triple", run: (board) => nakedSubset(board, 3) },
  { technique: "hidden-triple", run: (board) => hiddenSubset(board, 3) },
  { technique: "x-wing", run: (board) => fish(board, 2) },
  { technique: "xy-wing", run: xyWing },
  { technique: "swordfish", run: (board) => fish(board, 3) },
];

export interface SudokuAnalysis {
  /** Расклад доводится до конца разрешёнными приёмами, без перебора. */
  solvable: boolean;
  /** Ранг самого трудного приёма, который понадобился. */
  hardestTier: number;
  /** Приёмы, без которых решение не сходится (ранг ≥ 4). */
  advanced: SudokuTechnique[];
  /** Сколько раз пришлось применить продвинутые приёмы. */
  advancedSteps: number;
}

/**
 * Прогоняет расклад приёмами не сложнее `maxTier` и рассказывает, что понадобилось.
 * Перебора здесь нет специально: то, что решается только угадыванием, честным не считается.
 */
export function analyzePuzzle(grid: Array<number | null>, maxTier = 8): SudokuAnalysis {
  const board = createBoard(grid);
  if (!board) return { solvable: false, hardestTier: 0, advanced: [], advancedSteps: 0 };

  const strategies = STRATEGIES.filter((entry) => TECHNIQUE_TIER[entry.technique] <= maxTier);
  const used = new Set<SudokuTechnique>();
  let hardestTier = 0;
  let advancedSteps = 0;

  while (board.empty > 0) {
    let progressed = false;
    for (const strategy of strategies) {
      const step = strategy.run(board);
      if (step === false) return { solvable: false, hardestTier, advanced: [], advancedSteps };
      if (!step) continue;
      const tier = TECHNIQUE_TIER[step.technique];
      used.add(step.technique);
      if (tier > hardestTier) hardestTier = tier;
      if (tier >= 4) advancedSteps += 1;
      progressed = true;
      break;
    }
    if (!progressed) {
      return { solvable: false, hardestTier, advanced: collectAdvanced(used), advancedSteps };
    }
  }

  return {
    solvable: true,
    hardestTier,
    advanced: collectAdvanced(used),
    advancedSteps,
  };
}

function collectAdvanced(used: Set<SudokuTechnique>): SudokuTechnique[] {
  return [...used]
    .filter((technique) => TECHNIQUE_TIER[technique] >= 4)
    .sort((a, b) => TECHNIQUE_TIER[a] - TECHNIQUE_TIER[b]);
}

export interface Deduction {
  index: number;
  digit: number;
  /** Ранг самого трудного приёма, который понадобился ради этого хода. */
  tier: number;
}

/**
 * Ищет ближайшую клетку, которую можно закрыть приёмами не сложнее `maxTier`.
 *
 * Это и есть «мозг» бота в «Переделе»: он видит ровно то, что выводится из доски
 * прямо сейчас, и ничего сверх того. Поэтому каждая закрытая игроком клетка
 * действительно открывает боту новые ходы — подглядывать в решение он не умеет.
 * `null` означает «пока нечего вывести», а не «расклад сломан».
 */
export function findDeduction(grid: Array<number | null>, maxTier: number): Deduction | null {
  const board = createBoard(grid);
  if (!board) return null;

  const strategies = STRATEGIES.filter((entry) => TECHNIQUE_TIER[entry.technique] <= maxTier);
  let hardestTier = 0;

  // Приёмы-исключения сами цифр не ставят, но открывают дорогу одиночкам,
  // поэтому крутим до первого размещения. Потолок — страховка от зацикливания.
  for (let guard = 0; guard < 800; guard += 1) {
    let progressed = false;
    for (const strategy of strategies) {
      const step = strategy.run(board);
      if (step === false) return null;
      if (!step) continue;
      const tier = TECHNIQUE_TIER[step.technique];
      if (tier > hardestTier) hardestTier = tier;
      if (step.placement) return { ...step.placement, tier: hardestTier };
      progressed = true;
      break;
    }
    if (!progressed) return null;
  }
  return null;
}

/** Кандидаты в каждой пустой клетке — для подсветки и для цены клетки. */
export function cellCandidates(grid: Array<number | null>): number[][] {
  const board = createBoard(grid);
  if (!board) return Array.from({ length: CELLS }, () => []);
  const result: number[][] = [];
  for (let index = 0; index < CELLS; index += 1) {
    result.push(board.values[index] ? [] : digitsOf(board.cands[index]));
  }
  return result;
}

export function describeTechniques(techniques: SudokuTechnique[]): string {
  if (techniques.length === 0) return "Одиночки и указующие пары";
  return techniques.map((technique) => TECHNIQUE_LABELS[technique]).join(", ");
}
