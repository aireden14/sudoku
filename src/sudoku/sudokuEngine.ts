import { SudokuDifficulty, SudokuPuzzle } from "./types";
import { analyzePuzzle, SudokuAnalysis } from "./sudokuLogic";
import { SudokuSize, SudokuVariant, variantOf } from "./sudokuVariants";
import { buildLargeSolution, carveLarge, LargeSpec } from "./sudokuLarge";

const SIZE = 9;
const CELLS = 81;

const TARGET_GIVENS: Record<SudokuDifficulty, number> = {
  easy: 43,
  medium: 36,
  hard: 31,
  expert: 27,
  labyrinth: 24,
  abyss: 22,
};

/**
 * Уровни для полей крупнее 9×9.
 *
 * Доли открытых клеток взяты у классики (43/81, 36/81, 31/81, 27/81), а `tier` —
 * потолок приёмов, которыми расклад обязан решаться. Чем выше уровень, тем
 * труднее приёмы разрешены и тем глубже получается выкопать.
 */
const LARGE_SPECS: Record<"easy" | "medium" | "hard" | "expert", LargeSpec> = {
  easy: { tier: 1, givensRatio: 0.53 },
  medium: { tier: 2, givensRatio: 0.44 },
  hard: { tier: 3, givensRatio: 0.38 },
  expert: { tier: 4, givensRatio: 0.33 },
};

/** «Лабиринт» и «Бездна» живут только на 9×9: их решатель — на 9 бит. */
export function difficultiesForSize(size: SudokuSize): SudokuDifficulty[] {
  return size === 9
    ? ["easy", "medium", "hard", "expert", "labyrinth", "abyss"]
    : ["easy", "medium", "hard", "expert"];
}

export function normalizeDifficulty(
  difficulty: SudokuDifficulty,
  size: SudokuSize,
): SudokuDifficulty {
  return difficultiesForSize(size).includes(difficulty) ? difficulty : "expert";
}

/**
 * Уровни, которые собираются логическим решателем, а не просто выкапыванием клеток.
 *
 * `maxTier` — потолок приёмов, которыми расклад обязан решаться до конца: всё, что
 * требует угадывания, отбраковывается. `minTier` — планка снизу: без приёма такого
 * ранга решение не сходится, иначе уровень был бы неотличим от «Эксперта».
 */
export interface GradedSpec {
  maxTier: number;
  minTier: number;
  minAdvancedSteps: number;
  /** Ниже этого числа подсказок не копаем — страховка, а не цель. */
  floorGivens: number;
}

export const GRADED_SPECS: Partial<Record<SudokuDifficulty, GradedSpec>> = {
  // Лабиринт: одиночки заканчиваются рано, дальше — пары и тройки. X-Wing не нужен.
  labyrinth: { maxTier: 5, minTier: 4, minAdvancedSteps: 2, floorGivens: 22 },
  // Бездна: без рыб и XY-Wing расклад не сходится вовсе.
  abyss: { maxTier: 8, minTier: 6, minAdvancedSteps: 3, floorGivens: 20 },
};

export function isGradedDifficulty(difficulty: SudokuDifficulty): boolean {
  return Boolean(GRADED_SPECS[difficulty]);
}

function hashSeed(seed: string): number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i += 1) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function makeRng(seed: string) {
  let t = hashSeed(seed) || 1;
  return () => {
    t += 0x6d2b79f5;
    let x = t;
    x = Math.imul(x ^ (x >>> 15), x | 1);
    x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffle<T>(items: T[], rng: () => number): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

function pattern(row: number, col: number): number {
  return (row * 3 + Math.floor(row / 3) + col) % SIZE;
}

function buildSolution(seed: string): number[] {
  const rng = makeRng(seed);
  const base = [0, 1, 2];
  const rows = shuffle(base, rng).flatMap((band) =>
    shuffle(base, rng).map((row) => band * 3 + row),
  );
  const cols = shuffle(base, rng).flatMap((stack) =>
    shuffle(base, rng).map((col) => stack * 3 + col),
  );
  const nums = shuffle([1, 2, 3, 4, 5, 6, 7, 8, 9], rng);

  const solution: number[] = [];
  for (const row of rows) {
    for (const col of cols) {
      solution.push(nums[pattern(row, col)]);
    }
  }
  return solution;
}

function candidates(grid: Array<number | null>, index: number): number[] {
  if (grid[index]) return [];
  const row = Math.floor(index / SIZE);
  const col = index % SIZE;
  const used = new Set<number>();

  for (let i = 0; i < SIZE; i += 1) {
    const rowValue = grid[row * SIZE + i];
    const colValue = grid[i * SIZE + col];
    if (rowValue) used.add(rowValue);
    if (colValue) used.add(colValue);
  }

  const boxRow = Math.floor(row / 3) * 3;
  const boxCol = Math.floor(col / 3) * 3;
  for (let r = boxRow; r < boxRow + 3; r += 1) {
    for (let c = boxCol; c < boxCol + 3; c += 1) {
      const value = grid[r * SIZE + c];
      if (value) used.add(value);
    }
  }

  return [1, 2, 3, 4, 5, 6, 7, 8, 9].filter((value) => !used.has(value));
}

function findBestEmpty(grid: Array<number | null>): { index: number; values: number[] } | null {
  let best: { index: number; values: number[] } | null = null;
  for (let index = 0; index < CELLS; index += 1) {
    if (grid[index] !== null) continue;
    const values = candidates(grid, index);
    if (values.length === 0) return { index, values };
    if (!best || values.length < best.values.length) {
      best = { index, values };
      if (values.length === 1) return best;
    }
  }
  return best;
}

export function countSolutions(grid: Array<number | null>, limit = 2): number {
  const draft = [...grid];
  let count = 0;

  function solve(): void {
    if (count >= limit) return;
    const empty = findBestEmpty(draft);
    if (!empty) {
      count += 1;
      return;
    }
    if (empty.values.length === 0) return;

    for (const value of empty.values) {
      draft[empty.index] = value;
      solve();
      draft[empty.index] = null;
      if (count >= limit) return;
    }
  }

  solve();
  return count;
}

export function hasUniqueSolution(grid: Array<number | null>): boolean {
  return countSolutions(grid, 2) === 1;
}

function carvePuzzle(solution: number[], difficulty: SudokuDifficulty, seed: string): Array<number | null> {
  const rng = makeRng(`${seed}:carve`);
  const givensTarget = TARGET_GIVENS[difficulty];
  const puzzle: Array<number | null> = [...solution];
  const order = shuffle(Array.from({ length: CELLS }, (_, i) => i), rng);

  for (const index of order) {
    const currentGivens = puzzle.filter((value) => value !== null).length;
    if (currentGivens <= givensTarget) break;

    const previous = puzzle[index];
    puzzle[index] = null;
    if (!hasUniqueSolution(puzzle)) {
      puzzle[index] = previous;
    }
  }

  return puzzle;
}

/**
 * Выкапывает клетки, пока расклад продолжает решаться разрешёнными приёмами.
 *
 * Критерий «остаётся логически решаемым» строже, чем «решение единственно»:
 * единственность допускает раскладки, которые человек проходит только перебором.
 * Заодно он и дешевле — пропагация линейна, а поиск всех решений экспоненциален.
 */
export function carveGraded(
  solution: number[],
  spec: GradedSpec,
  floorGivens: number,
  seed: string,
): { givens: Array<number | null>; analysis: SudokuAnalysis } {
  const rng = makeRng(`${seed}:graded`);
  const puzzle: Array<number | null> = [...solution];
  const order = shuffle(Array.from({ length: CELLS }, (_, i) => i), rng);
  let remaining = CELLS;

  // Два прохода: клетка, которую не удалось снять раньше, часто снимается позже,
  // когда вокруг стало пусто и решателю приходится идти длинным путём.
  for (let pass = 0; pass < 2; pass += 1) {
    for (const index of order) {
      if (remaining <= floorGivens) break;
      if (puzzle[index] === null) continue;

      const previous = puzzle[index];
      puzzle[index] = null;
      if (analyzePuzzle(puzzle, spec.maxTier).solvable) {
        remaining -= 1;
      } else {
        puzzle[index] = previous;
      }
    }
  }

  return { givens: puzzle, analysis: analyzePuzzle(puzzle, spec.maxTier) };
}

function gradedScore(analysis: SudokuAnalysis, givens: number): number {
  if (!analysis.solvable) return -1;
  return analysis.hardestTier * 1000 + analysis.advancedSteps * 10 + (81 - givens);
}

/**
 * Докручивает расклад обменом подсказок.
 *
 * Простая копка упирается не в сложность, а в порог единственности решения: почти все
 * минимальные раскладки проходятся скрытыми одиночками. Сколько именно подсказок убрано,
 * на трудность влияет слабо — решает то, КАКИЕ клетки открыты. Поэтому число подсказок
 * держим неизменным и перебираем расстановки: открываем одну клетку, закрываем другую и
 * оставляем размен, если расклад стал требовать более трудных приёмов.
 */
function hardenGraded(
  solution: number[],
  spec: GradedSpec,
  start: { givens: Array<number | null>; analysis: SudokuAnalysis },
  seed: string,
  deadline: number,
): { givens: Array<number | null>; analysis: SudokuAnalysis } {
  const rng = makeRng(`${seed}:harden`);
  const current = [...start.givens];
  let analysis = start.analysis;
  let score = gradedScore(analysis, current.filter((value) => value !== null).length);

  for (let iteration = 0; iteration < 220; iteration += 1) {
    if (iteration % 16 === 0 && Date.now() > deadline) break;
    if (analysis.hardestTier >= spec.minTier && analysis.advancedSteps >= spec.minAdvancedSteps) break;

    const filled: number[] = [];
    const empty: number[] = [];
    for (let index = 0; index < CELLS; index += 1) {
      if (current[index] === null) empty.push(index);
      else filled.push(index);
    }
    if (!filled.length || !empty.length) break;

    const openIndex = empty[Math.floor(rng() * empty.length)];
    const closeIndex = filled[Math.floor(rng() * filled.length)];

    const previousOpen = current[openIndex];
    const previousClose = current[closeIndex];
    current[openIndex] = solution[openIndex];
    current[closeIndex] = null;

    const nextAnalysis = analyzePuzzle(current, spec.maxTier);
    const nextScore = gradedScore(nextAnalysis, current.filter((value) => value !== null).length);

    // Равный счёт принимаем тоже — иначе поиск застревает на первом же плато.
    if (nextAnalysis.solvable && nextScore >= score) {
      analysis = nextAnalysis;
      score = nextScore;
    } else {
      current[openIndex] = previousOpen;
      current[closeIndex] = previousClose;
    }
  }

  return { givens: current, analysis };
}

/** Собирает расклад под спецификацию уровня; при неудаче отдаёт лучший из попыток. */
function generateGradedGivens(
  difficulty: SudokuDifficulty,
  spec: GradedSpec,
  seed: string,
): { solution: number[]; givens: Array<number | null>; analysis: SudokuAnalysis } {
  const deadline = Date.now() + 2000;
  let best: { solution: number[]; givens: Array<number | null>; analysis: SudokuAnalysis } | null = null;
  let bestScore = -Infinity;

  for (let attempt = 0; attempt < 12; attempt += 1) {
    const attemptSeed = `${seed}:${attempt}`;
    const solution = buildSolution(attemptSeed);
    const carved = carveGraded(solution, spec, spec.floorGivens, attemptSeed);
    const { givens, analysis } = hardenGraded(solution, spec, carved, attemptSeed, deadline);
    const givenCount = givens.filter((value) => value !== null).length;
    const score = gradedScore(analysis, givenCount);

    if (score > bestScore) {
      bestScore = score;
      best = { solution, givens, analysis };
    }

    const fits =
      analysis.solvable &&
      analysis.hardestTier >= spec.minTier &&
      analysis.advancedSteps >= spec.minAdvancedSteps;
    if (fits) return { solution, givens, analysis };
    if (Date.now() > deadline && best) break;
  }

  return best!;
}

/** Расклад для 12×12 и 16×16: копка идёт под контролем логического решателя. */
function generateLargePuzzle(
  variant: SudokuVariant,
  difficulty: SudokuDifficulty,
  seed: string,
): { givens: Array<number | null>; solution: number[] } {
  const spec = LARGE_SPECS[difficulty as keyof typeof LARGE_SPECS] ?? LARGE_SPECS.medium;
  const deadline = Date.now() + 4000;

  let best: { givens: Array<number | null>; solution: number[] } | null = null;
  let bestGivens = Infinity;

  for (let attempt = 0; attempt < 4; attempt += 1) {
    const rng = makeRng(`${seed}:large:${attempt}`);
    const solution = buildLargeSolution(variant, rng);
    const givens = carveLarge(solution, variant, spec, rng, deadline);
    const count = givens.filter((value) => value !== null).length;

    if (count < bestGivens) {
      bestGivens = count;
      best = { givens, solution };
    }
    // Попали в целевую плотность — дальше искать нечего.
    if (count <= Math.round(variant.cells * spec.givensRatio)) break;
    if (Date.now() > deadline) break;
  }

  return best!;
}

export function generateSudokuPuzzle(
  difficulty: SudokuDifficulty,
  options: {
    seed?: string;
    mode?: "classic" | "daily";
    dailyDate?: string;
    size?: SudokuSize;
  } = {},
): SudokuPuzzle {
  const variant = variantOf(options.size);
  const seed =
    options.seed ||
    `${difficulty}:${variant.size}:${Date.now().toString(36)}:${Math.random().toString(36).slice(2)}`;

  if (variant.size !== 9) {
    const level = normalizeDifficulty(difficulty, variant.size);
    const large = generateLargePuzzle(variant, level, seed);
    return {
      id: `${options.mode || "classic"}-${variant.size}-${level}-${hashSeed(seed).toString(36)}`,
      difficulty: level,
      size: variant.size,
      givens: large.givens,
      solution: large.solution,
      createdAt: Date.now(),
      mode: options.mode || "classic",
      dailyDate: options.dailyDate,
    };
  }

  const spec = GRADED_SPECS[difficulty];

  if (spec) {
    const graded = generateGradedGivens(difficulty, spec, seed);
    return {
      id: `${options.mode || "classic"}-${difficulty}-${hashSeed(seed).toString(36)}`,
      difficulty,
      size: 9,
      givens: graded.givens,
      solution: graded.solution,
      createdAt: Date.now(),
      mode: options.mode || "classic",
      dailyDate: options.dailyDate,
      techniques: graded.analysis.advanced,
    };
  }

  const solution = buildSolution(seed);
  const givens = carvePuzzle(solution, difficulty, seed);

  return {
    id: `${options.mode || "classic"}-${difficulty}-${hashSeed(seed).toString(36)}`,
    difficulty,
    size: 9,
    givens,
    solution,
    createdAt: Date.now(),
    mode: options.mode || "classic",
    dailyDate: options.dailyDate,
  };
}

export function getTodayKey(date = new Date()): string {
  return date.toISOString().slice(0, 10);
}

export function generateDailySudoku(dateKey = getTodayKey()): SudokuPuzzle {
  return generateSudokuPuzzle("medium", {
    seed: `daily-sudoku-${dateKey}`,
    mode: "daily",
    dailyDate: dateKey,
  });
}

export function isSolved(entries: Array<number | null>, solution: number[]): boolean {
  return (
    solution.length > 0 &&
    entries.length === solution.length &&
    entries.every((value, index) => value === solution[index])
  );
}
