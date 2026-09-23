import React from "react";
import { bestTimeKey, variantOf } from "./sudokuVariants";
import { SudokuDifficulty, SudokuPuzzle, SudokuStats as Stats } from "./types";

const DIFFICULTY_LABELS: Record<SudokuDifficulty, string> = {
  easy: "Легко",
  medium: "Средне",
  hard: "Сложно",
  expert: "Эксперт",
  labyrinth: "Лабиринт",
  abyss: "Бездна",
};

/** Короткое обещание уровня: что именно придётся уметь. */
export const DIFFICULTY_HINTS: Partial<Record<SudokuDifficulty, string>> = {
  labyrinth: "Одиночки кончаются рано — дальше только пары и тройки. Без угадывания.",
  abyss: "Не сходится без X-Wing, XY-Wing или Swordfish. Тоже без угадывания.",
};

export function formatSudokuTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}

export function difficultyLabel(difficulty: SudokuDifficulty): string {
  return DIFFICULTY_LABELS[difficulty];
}

interface SudokuStatsProps {
  puzzle: SudokuPuzzle;
  elapsedSeconds: number;
  mistakes: number;
  hintsUsed: number;
  entries: Array<number | null>;
  stats: Stats;
}

export function SudokuStats({
  puzzle,
  elapsedSeconds,
  mistakes,
  hintsUsed,
  entries,
  stats,
}: SudokuStatsProps) {
  const variant = variantOf(puzzle.size);
  const filled = entries.filter(Boolean).length;
  const progress = Math.round((filled / variant.cells) * 100);
  const best = stats.bestTimes[bestTimeKey(variant.size, puzzle.difficulty)] ?? null;

  return (
    <div className="sudoku-stat-grid">
      <div className="sudoku-stat">
        <span>Время</span>
        <strong>{formatSudokuTime(elapsedSeconds)}</strong>
      </div>
      <div className="sudoku-stat">
        <span>Ошибки</span>
        <strong>{mistakes}</strong>
      </div>
      <div className="sudoku-stat">
        <span>Прогресс</span>
        <strong>{progress}%</strong>
      </div>
      <div className="sudoku-stat">
        <span>Лучшее</span>
        <strong>{best === null ? "—" : formatSudokuTime(best)}</strong>
      </div>
      <div className="sudoku-stat wide">
        <span>
          {puzzle.mode === "daily"
            ? `День · ${puzzle.dailyDate}`
            : difficultyLabel(puzzle.difficulty)}
        </span>
        <strong>{hintsUsed ? `${hintsUsed} подсказ.` : "без подсказок"}</strong>
      </div>
      <div className="sudoku-stat">
        <span>Серия</span>
        <strong>{stats.dailyStreak}</strong>
      </div>
      <div className="sudoku-stat">
        <span>Сыграно</span>
        <strong>{stats.played}</strong>
      </div>
      <div className="sudoku-stat">
        <span>Решено</span>
        <strong>{stats.completed}</strong>
      </div>
    </div>
  );
}
