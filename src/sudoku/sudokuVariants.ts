/**
 * Размеры поля судоку.
 *
 * Сторона обязана раскладываться на прямоугольные блоки, поэтому «в полтора раза
 * больше клеток» ровно не бывает: ближайшие рабочие ступени от классических 81 —
 * это 144 (12×12, блок 4×3) и 256 (16×16, блок 4×4).
 */

export type SudokuSize = 9 | 12 | 16;

export interface SudokuVariant {
  size: SudokuSize;
  /** Ширина блока в клетках. */
  boxW: number;
  /** Высота блока в клетках. */
  boxH: number;
  cells: number;
  label: string;
  name: string;
  /** Множитель опыта за партию — им же платит сервер. */
  xpFactor: number;
}

export const SUDOKU_VARIANTS: Record<SudokuSize, SudokuVariant> = {
  9: { size: 9, boxW: 3, boxH: 3, cells: 81, label: "9×9", name: "Классика", xpFactor: 1 },
  12: { size: 12, boxW: 4, boxH: 3, cells: 144, label: "12×12", name: "Большое", xpFactor: 1.5 },
  16: { size: 16, boxW: 4, boxH: 4, cells: 256, label: "16×16", name: "Огромное", xpFactor: 2 },
};

export const SUDOKU_SIZES: SudokuSize[] = [9, 12, 16];

export function isSudokuSize(value: unknown): value is SudokuSize {
  return value === 9 || value === 12 || value === 16;
}

/** Старые сохранения размер не писали — там всегда была классика. */
export function variantOf(size: number | undefined | null): SudokuVariant {
  return SUDOKU_VARIANTS[isSudokuSize(size) ? size : 9];
}

/**
 * Один символ на клетку: двузначные «10…16» в клетке поля 16×16 на телефоне
 * нечитаемы, поэтому после девятки идут буквы.
 */
const SYMBOLS = "123456789ABCDEFG";

export function symbolFor(value: number): string {
  return SYMBOLS[value - 1] ?? String(value);
}

export function valuesOf(variant: SudokuVariant): number[] {
  return Array.from({ length: variant.size }, (_, i) => i + 1);
}

/** Толстые линии между блоками — правая и нижняя граница клетки. */
export function blockEdgeClasses(index: number, variant: SudokuVariant): string {
  const { size, boxW, boxH } = variant;
  const row = Math.floor(index / size);
  const col = index % size;
  const right = col !== size - 1 && (col + 1) % boxW === 0 ? "blk-r" : "";
  const bottom = row !== size - 1 && (row + 1) % boxH === 0 ? "blk-b" : "";
  return `${right} ${bottom}`.trim();
}

/** Сколько колонок у сетки заметок внутри клетки. */
export function noteColumns(variant: SudokuVariant): number {
  return variant.boxW;
}

export function noteRows(variant: SudokuVariant): number {
  return Math.ceil(variant.size / variant.boxW);
}

/** Раскладка цифровой панели: 16 кнопок в один ряд на телефон не влезают. */
export function padColumns(variant: SudokuVariant): number {
  if (variant.size === 9) return 9;
  if (variant.size === 12) return 6;
  return 8;
}

/** Ключ рекорда: у каждого размера поля свои лучшие времена. */
export function bestTimeKey(size: number | undefined | null, difficulty: string): string {
  const variant = variantOf(size);
  return variant.size === 9 ? difficulty : `${variant.size}:${difficulty}`;
}
