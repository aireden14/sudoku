import React from "react";
import { SudokuPuzzle } from "./types";
import {
  blockEdgeClasses,
  noteColumns,
  noteRows,
  symbolFor,
  valuesOf,
  variantOf,
} from "./sudokuVariants";

interface SudokuBoardProps {
  puzzle: SudokuPuzzle;
  entries: Array<number | null>;
  notes: number[][];
  selectedIndex: number | null;
  selectedNumber: number | null;
  showErrors: boolean;
  onSelect: (index: number) => void;
}

export function SudokuBoard({
  puzzle,
  entries,
  notes,
  selectedIndex,
  selectedNumber,
  showErrors,
  onSelect,
}: SudokuBoardProps) {
  const variant = variantOf(puzzle.size);
  const { size, boxW, boxH } = variant;
  const selectedValue = selectedNumber ?? (selectedIndex === null ? null : entries[selectedIndex]);
  const noteValues = valuesOf(variant);

  const sameBox = (a: number, b: number): boolean =>
    Math.floor(Math.floor(a / size) / boxH) === Math.floor(Math.floor(b / size) / boxH) &&
    Math.floor((a % size) / boxW) === Math.floor((b % size) / boxW);

  return (
    <div
      className="sudoku-board"
      role="grid"
      aria-label={`Судоку ${size} на ${size}`}
      style={
        {
          "--sudoku-size": size,
          "--sudoku-note-cols": noteColumns(variant),
          "--sudoku-note-rows": noteRows(variant),
        } as React.CSSProperties
      }
    >
      {entries.map((value, index) => {
        const row = Math.floor(index / size);
        const col = index % size;
        const selectedRow = selectedIndex !== null ? Math.floor(selectedIndex / size) : -1;
        const selectedCol = selectedIndex !== null ? selectedIndex % size : -1;
        const given = puzzle.givens[index] !== null;
        const isSelected = selectedIndex === index;
        const isPeer =
          selectedIndex !== null &&
          !isSelected &&
          (row === selectedRow || col === selectedCol || sameBox(index, selectedIndex));
        const isSameValue = !!value && !!selectedValue && value === selectedValue;
        const isError = showErrors && !!value && value !== puzzle.solution[index];
        const classes = [
          "sudoku-cell",
          blockEdgeClasses(index, variant),
          given ? "given" : "",
          !given && value ? "entered" : "",
          selectedNumber && isSelected && !given && !value ? "number-target" : "",
          isSelected ? "selected" : "",
          isPeer ? "peer" : "",
          isSameValue ? "same-value" : "",
          isError ? "error" : "",
        ]
          .filter(Boolean)
          .join(" ");

        return (
          <button
            key={index}
            className={classes}
            onClick={() => onSelect(index)}
            role="gridcell"
            aria-label={`Строка ${row + 1}, колонка ${col + 1}${
              value ? `, ${symbolFor(value)}` : ""
            }`}
          >
            {value ? (
              <span>{symbolFor(value)}</span>
            ) : notes[index]?.length ? (
              <span className="sudoku-notes">
                {noteValues.map((note) => (
                  <i key={note}>{notes[index].includes(note) ? symbolFor(note) : ""}</i>
                ))}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
