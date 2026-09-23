import { SudokuSize } from "./sudokuVariants";

export type SudokuDifficulty = "easy" | "medium" | "hard" | "expert" | "labyrinth" | "abyss";
export type SudokuCheckMode = "instant" | "manual";

export interface SudokuCell {
  index: number;
  row: number;
  col: number;
  value: number | null;
  solution: number;
  given: boolean;
  notes: number[];
}

export interface SudokuPuzzle {
  id: string;
  difficulty: SudokuDifficulty;
  /** Сторона поля. У раскладов, сохранённых до появления больших полей, её нет. */
  size?: SudokuSize;
  givens: Array<number | null>;
  solution: number[];
  createdAt: number;
  mode: "classic" | "daily";
  dailyDate?: string;
  /** Есть только у раскладов, проверенных логическим решателем (Лабиринт, Бездна). */
  techniques?: string[];
}

export interface SudokuStats {
  played: number;
  completed: number;
  /** Ключ — сложность для 9×9 и `размер:сложность` для остальных полей. */
  bestTimes: Record<string, number | null>;
  dailyStreak: number;
  lastDailyDate: string | null;
}

export interface SudokuGameState {
  puzzle: SudokuPuzzle | null;
  entries: Array<number | null>;
  notes: number[][];
  selectedIndex: number | null;
  selectedNumber: number | null;
  notesMode: boolean;
  checkMode: SudokuCheckMode;
  checkedAt: number | null;
  mistakes: number;
  hintsUsed: number;
  elapsedSeconds: number;
  lastTickAt: number | null;
  isComplete: boolean;
  victory: {
    difficulty: SudokuDifficulty;
    size: SudokuSize;
    elapsedSeconds: number;
    mistakes: number;
    hintsUsed: number;
    mode: "classic" | "daily";
  } | null;
}
