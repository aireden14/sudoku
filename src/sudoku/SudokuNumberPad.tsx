import React from "react";
import { padColumns, symbolFor, SudokuVariant, valuesOf } from "./sudokuVariants";

interface SudokuNumberPadProps {
  variant: SudokuVariant;
  entries: Array<number | null>;
  selectedNumber: number | null;
  notesMode: boolean;
  canUndo: boolean;
  onNumber: (value: number) => void;
  onErase: () => void;
  onUndo: () => void;
  onHint: () => void;
  onToggleNotes: () => void;
}

export function SudokuNumberPad({
  variant,
  entries,
  selectedNumber,
  notesMode,
  canUndo,
  onNumber,
  onErase,
  onUndo,
  onHint,
  onToggleNotes,
}: SudokuNumberPadProps) {
  return (
    <div className="sudoku-pad">
      <div
        className="sudoku-number-grid"
        data-size={variant.size}
        style={{ "--sudoku-pad-cols": padColumns(variant) } as React.CSSProperties}
      >
        {valuesOf(variant).map((value) => {
          const count = entries.filter((entry) => entry === value).length;
          return (
            <button
              key={value}
              className={`sudoku-number${selectedNumber === value ? " active" : ""}`}
              onClick={() => onNumber(value)}
              disabled={count >= variant.size}
            >
              <strong>{symbolFor(value)}</strong>
              <span>
                {count}/{variant.size}
              </span>
            </button>
          );
        })}
      </div>

      <div className="sudoku-actions">
        <button className="sudoku-tool" onClick={onErase}>
          Стереть
        </button>
        <button className={`sudoku-tool${notesMode ? " active" : ""}`} onClick={onToggleNotes}>
          Заметки
        </button>
        <button className="sudoku-tool" onClick={onUndo} disabled={!canUndo}>
          Назад
        </button>
        <button className="sudoku-tool accent" onClick={onHint}>
          Подсказка
        </button>
      </div>
    </div>
  );
}
