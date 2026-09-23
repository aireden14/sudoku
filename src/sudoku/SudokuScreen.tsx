import React, { useEffect, useRef, useState } from "react";
import { triggerHaptic } from "../haptics";
import { celebrate } from "../celebrate";
import { Logo } from "../Logo";
import { LATEST_UPDATE } from "../news";
import { SudokuDifficulty } from "./types";
import { useSudokuStore } from "./sudokuStore";
import { SudokuBoard } from "./SudokuBoard";
import { SudokuNumberPad } from "./SudokuNumberPad";
import { difficultyLabel, formatSudokuTime, DIFFICULTY_HINTS } from "./SudokuStats";
import { TECHNIQUE_LABELS, SudokuTechnique } from "./sudokuLogic";
import { difficultiesForSize } from "./sudokuEngine";
import { SUDOKU_SIZES, SUDOKU_VARIANTS, SudokuSize, variantOf } from "./sudokuVariants";

// Тёмные эмодзи на тёмной панели не читаются — у «Бездны» намеренно светящийся значок.
const DIFFICULTY_ICONS: Partial<Record<SudokuDifficulty, string>> = {
  labyrinth: "🌀",
  abyss: "🌌",
};

type Menu = "settings" | "news" | null;
interface Toast {
  id: number;
  icon: string;
  text: string;
}

export function SudokuScreen() {
  const {
    puzzle,
    entries,
    notes,
    selectedIndex,
    selectedNumber,
    notesMode,
    checkMode,
    checkedAt,
    mistakes,
    hintsUsed,
    elapsedSeconds,
    isComplete,
    victory,
    undoStack,
    generating,
    startNew,
    startDaily,
    selectCell,
    selectNumber,
    enterNumber,
    erase,
    undo,
    hint,
    checkPuzzle,
    tick,
    setCheckMode,
    toggleNotesMode,
    dismissVictory,
  } = useSudokuStore();

  const reportedRef = useRef<string | null>(null);
  const [menu, setMenu] = useState<Menu>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const toastIdRef = useRef(0);

  function pushToast(icon: string, text: string) {
    const id = (toastIdRef.current += 1);
    setToasts((t) => [...t, { id, icon, text }]);
    window.setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 2800);
  }

  useEffect(() => {
    if (!puzzle) startNew("medium");
  }, [puzzle, startNew]);

  useEffect(() => {
    const id = window.setInterval(() => tick(), 1000);
    tick();
    return () => window.clearInterval(id);
  }, [tick]);

  useEffect(() => {
    if (!victory) return;
    const key = `${victory.mode}-${victory.difficulty}-${victory.size}-${victory.elapsedSeconds}-${victory.mistakes}-${victory.hintsUsed}`;
    if (reportedRef.current === key) return;
    reportedRef.current = key;
    celebrate();
  }, [victory]);

  if (!puzzle) {
    return (
      <div className="center-screen">
        <div className="spinner" />
      </div>
    );
  }

  const variant = variantOf(puzzle.size);
  const difficulties = difficultiesForSize(variant.size);
  const hasProgress = !isComplete && entries.some((value, index) => value !== puzzle.givens[index]);
  const showErrors = checkMode === "instant" || checkedAt !== null;
  const hasEditableSelection =
    selectedIndex !== null && puzzle.givens[selectedIndex] === null && !isComplete;

  const confirmReplace = () =>
    !hasProgress ||
    window.confirm("Начать новую партию? Текущий прогресс в судоку будет заменён.");

  const startClassic = (difficulty: SudokuDifficulty) => {
    if (!confirmReplace()) return;
    startNew(difficulty, variant.size);
    triggerHaptic("medium");
    setMenu(null);
  };

  const startSize = (size: SudokuSize) => {
    if (size === variant.size && puzzle.mode === "classic") return;
    if (!confirmReplace()) return;
    // Сложность сохраняем: «Лабиринт» и «Бездна» на больших полях сами
    // сведутся к «Эксперту» — их решателя там нет.
    startNew(puzzle.difficulty, size);
    triggerHaptic("medium");
    setMenu(null);
  };

  const startToday = () => {
    if (!confirmReplace()) return;
    startDaily();
    triggerHaptic("medium");
    setMenu(null);
  };

  const restartPuzzle = () => {
    if (!confirmReplace()) return;
    if (puzzle.mode === "daily") startDaily();
    else startNew(puzzle.difficulty, variant.size);
    triggerHaptic("medium");
  };

  const handleNumber = (value: number) => {
    selectNumber(selectedNumber === value ? null : value);
    if (!hasEditableSelection) {
      triggerHaptic("light");
      return;
    }
    const result = enterNumber(value);
    if (result === "error") triggerHaptic("warning");
    else if (result === "complete") triggerHaptic("success");
    else triggerHaptic("light");
  };

  const handleCell = (index: number) => {
    selectCell(index);
    triggerHaptic("light");
  };

  const handleHint = () => {
    const result = hint();
    if (result === "complete") triggerHaptic("success");
    else if (result === "ok") triggerHaptic("medium");
    else triggerHaptic("warning");
  };

  const handleCheck = () => {
    const result = checkPuzzle();
    if (result === "complete") triggerHaptic("success");
    else if (result === "errors") triggerHaptic("warning");
    else triggerHaptic("medium");
  };

  const modeLabel = puzzle.mode === "daily" ? "День" : difficultyLabel(puzzle.difficulty);
  const sizeLabel = variant.size === 9 ? null : variant.label;

  return (
    <div className="app-screen sudoku-screen">
      <header className="sudoku-brand">
        <Logo />
        <h1>Судоку</h1>
      </header>

      <div className="sudoku-toolbar">
        <div className="sudoku-toolbar-left">
          <span className="sudoku-toolbar-time">{formatSudokuTime(elapsedSeconds)}</span>
          <span className="sudoku-toolbar-mode">{modeLabel}</span>
          {sizeLabel && <span className="sudoku-toolbar-size">{sizeLabel}</span>}
        </div>
        <div className="sudoku-toolbar-actions">
          <button className="sudoku-iconbtn" onClick={restartPuzzle} aria-label="Новая партия" title="Новая партия">
            ↻
          </button>
          <button
            className="sudoku-iconbtn"
            onClick={() => {
              setMenu("settings");
              triggerHaptic("light");
            }}
            aria-label="Настройки"
            title="Настройки"
          >
            ⚙
          </button>
        </div>
      </div>

      <div className="sudoku-board-shell">
        {generating && (
          <div className="sudoku-generating" role="status">
            <div className="spinner" />
            <span>Подбираем расклад…</span>
          </div>
        )}
        <SudokuBoard
          puzzle={puzzle}
          entries={entries}
          notes={notes}
          selectedIndex={selectedIndex}
          selectedNumber={selectedNumber}
          showErrors={showErrors}
          onSelect={handleCell}
        />
      </div>

      <SudokuNumberPad
        variant={variant}
        entries={entries}
        selectedNumber={selectedNumber}
        notesMode={notesMode}
        canUndo={undoStack.length > 0}
        onNumber={handleNumber}
        onErase={() => {
          erase();
          triggerHaptic("light");
        }}
        onUndo={() => {
          undo();
          triggerHaptic("light");
        }}
        onHint={handleHint}
        onToggleNotes={() => {
          toggleNotesMode();
          triggerHaptic("light");
        }}
      />

      <footer className="sudoku-footer">
        <button onClick={() => setMenu("news")}>Что нового</button>
        <span>·</span>
        <a href="https://t.me/Denrech" target="_blank" rel="noreferrer">
          Powered by @Denrech
        </a>
      </footer>

      {menu === "news" && (
        <div className="modal-backdrop" onClick={() => setMenu(null)}>
          <div className="modal sudoku-menu sudoku-news" onClick={(e) => e.stopPropagation()}>
            <h3>Что нового</h3>
            <time>{LATEST_UPDATE.date}</time>
            <ul>
              {LATEST_UPDATE.items.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
            <div className="modal-actions">
              <button className="btn btn-primary" onClick={() => setMenu(null)}>
                Понятно
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ===== Toasts ===== */}
      {toasts.length > 0 && (
        <div className="sudoku-toasts">
          {toasts.map((t) => (
            <div key={t.id} className="sudoku-toast">
              <span className="sudoku-toast-icon">{t.icon}</span>
              <span>{t.text}</span>
            </div>
          ))}
        </div>
      )}

      {/* ===== Settings menu ===== */}
      {menu === "settings" && (
        <div className="modal-backdrop" onClick={() => setMenu(null)}>
          <div className="modal sudoku-menu" onClick={(e) => e.stopPropagation()}>
            <h3>Настройки</h3>
            <div className="sudoku-menu-section">
              <span className="sudoku-menu-label">Размер поля</span>
              <div className="segment sudoku-size-grid">
                {SUDOKU_SIZES.map((size) => {
                  const item = SUDOKU_VARIANTS[size];
                  return (
                    <button
                      key={size}
                      className={`seg-item seg-item-size${
                        puzzle.mode === "classic" && variant.size === size ? " active" : ""
                      }`}
                      onClick={() => startSize(size)}
                    >
                      <strong>{item.label}</strong>
                      <em>{item.name}</em>
                    </button>
                  );
                })}
              </div>
              <div className="sudoku-menu-notes">
                <p>
                  На больших полях клетки заполняются символами <strong>1–9</strong>, дальше{" "}
                  <strong>A, B, C…</strong> — двузначные числа в такой клетке нечитаемы.
                  «Лабиринт» и «Бездна» остаются только на 9×9.
                </p>
              </div>
            </div>
            <div className="sudoku-menu-section">
              <span className="sudoku-menu-label">Сложность</span>
              <div className="segment sudoku-menu-grid">
                {difficulties.map((d) => (
                  <button
                    key={d}
                    className={`seg-item${puzzle.mode === "classic" && puzzle.difficulty === d ? " active" : ""}${
                      DIFFICULTY_HINTS[d] ? " seg-item-graded" : ""
                    }`}
                    onClick={() => startClassic(d)}
                  >
                    {DIFFICULTY_ICONS[d] ? `${DIFFICULTY_ICONS[d]} ` : ""}
                    {difficultyLabel(d)}
                  </button>
                ))}
              </div>
              <div className="sudoku-menu-notes">
                {difficulties.filter((d) => DIFFICULTY_HINTS[d]).map((d) => (
                  <p key={d}>
                    <strong>
                      {DIFFICULTY_ICONS[d]} {difficultyLabel(d)}
                    </strong>{" "}
                    — {DIFFICULTY_HINTS[d]}
                  </p>
                ))}
              </div>
              <button
                className={`btn btn-block${puzzle.mode === "daily" ? " btn-primary" : ""}`}
                style={{ marginTop: 10 }}
                onClick={startToday}
              >
                Задача дня
              </button>
            </div>
            <div className="sudoku-menu-section">
              <span className="sudoku-menu-label">Проверка ошибок</span>
              <div className="segment">
                <button
                  className={`seg-item${checkMode === "instant" ? " active" : ""}`}
                  onClick={() => setCheckMode("instant")}
                >
                  Сразу
                </button>
                <button
                  className={`seg-item${checkMode === "manual" ? " active" : ""}`}
                  onClick={() => setCheckMode("manual")}
                >
                  В конце
                </button>
              </div>
              {checkMode === "manual" && (
                <button className="btn btn-block" style={{ marginTop: 10 }} onClick={handleCheck}>
                  Проверить сейчас
                </button>
              )}
            </div>
            <div className="modal-actions">
              <button className="btn btn-primary" onClick={() => setMenu(null)}>
                Готово
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ===== Victory ===== */}
      {victory && (
        <div className="sudoku-victory" role="dialog" aria-modal="true">
          <div className="sudoku-victory-card">
            <div className="sudoku-victory-orb">✓</div>
            <p className="sudoku-kicker">Решено</p>
            <h2>Чистая партия</h2>
            <p>
              {victory.mode === "daily" ? "Ежедневная" : difficultyLabel(victory.difficulty)} ·{" "}
              {SUDOKU_VARIANTS[victory.size].label} · {formatSudokuTime(victory.elapsedSeconds)} ·
              ошибок {victory.mistakes} · подсказок {victory.hintsUsed}
            </p>
            {puzzle.techniques && puzzle.techniques.length > 0 && (
              <p className="sudoku-victory-tech">
                Без этого расклад не сходился:{" "}
                {puzzle.techniques
                  .map((technique) => TECHNIQUE_LABELS[technique as SudokuTechnique] ?? technique)
                  .join(", ")}
              </p>
            )}
            <div className="sudoku-victory-actions">
              <button
                className="btn btn-primary"
                onClick={() => {
                  startNew(victory.difficulty, victory.size);
                }}
              >
                Новая
              </button>
              <button
                className="btn"
                onClick={() => {
                  dismissVictory();
                }}
              >
                Остаться
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
