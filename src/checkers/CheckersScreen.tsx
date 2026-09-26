import React, { useEffect, useMemo, useState } from "react";
import { triggerHaptic } from "../haptics";
import { celebrate } from "../celebrate";
import { Logo } from "../Logo";
import {
  Board,
  BotLevel,
  Color,
  Move,
  applyMove,
  chooseBotMove,
  hasAnyMove,
  idx,
  initialBoard,
  isDark,
  legalForPiece,
  pieceCaptures,
  rc,
} from "./checkersEngine";
import "./checkers.css";

// Копия шашек из GamePass без онлайна: вдвоём на одном экране или против бота.
const SAVE_KEY = "sudoku-alina-checkers-v1";

type Mode = "local" | "bot";

interface Target {
  to: number;
  captured: number | null;
}

interface Saved {
  board: Board;
  turn: Color;
  autoFlip: boolean;
  mode: Mode;
  botLevel: BotLevel;
}

const BOT_LEVELS: Array<{ value: BotLevel; label: string; desc: string }> = [
  { value: 1, label: "1", desc: "Новичок" },
  { value: 2, label: "2", desc: "Лёгкий" },
  { value: 3, label: "3", desc: "Средний" },
  { value: 4, label: "4", desc: "Сильный" },
  { value: 5, label: "5", desc: "Мастер" },
];

function normalizeBotLevel(value: unknown): BotLevel {
  const n = Number(value);
  return n >= 1 && n <= 5 ? (n as BotLevel) : 3;
}

function loadSaved(): Saved {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed?.board) && parsed.board.length === 64 && (parsed.turn === "w" || parsed.turn === "b")) {
        return {
          board: parsed.board,
          turn: parsed.turn,
          autoFlip: parsed.autoFlip !== false,
          mode: parsed.mode === "local" ? "local" : "bot",
          botLevel: normalizeBotLevel(parsed.botLevel),
        };
      }
    }
  } catch {}
  return { board: initialBoard(), turn: "w", autoFlip: true, mode: "bot", botLevel: 2 };
}

const other = (color: Color): Color => (color === "w" ? "b" : "w");

export function CheckersScreen({ switcher }: { switcher: React.ReactNode }) {
  const init = useMemo(loadSaved, []);
  const [mode, setMode] = useState<Mode>(init.mode);
  const [board, setBoard] = useState<Board>(init.board);
  const [turn, setTurn] = useState<Color>(init.turn);
  const [autoFlip, setAutoFlip] = useState(init.autoFlip);
  const [botLevel, setBotLevel] = useState<BotLevel>(init.botLevel);
  const [selected, setSelected] = useState<number | null>(null);
  const [targets, setTargets] = useState<Target[]>([]);
  const [chainFrom, setChainFrom] = useState<number | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify({ board, turn, autoFlip, mode, botLevel }));
    } catch {}
  }, [autoFlip, board, botLevel, mode, turn]);

  const status = useMemo(() => {
    if (!hasAnyMove(board, turn)) return { over: true, winner: other(turn) };
    return { over: false, winner: null as Color | null };
  }, [board, turn]);

  useEffect(() => {
    if (status.over) {
      setDismissed(false);
      celebrate();
    }
  }, [status.over]);

  useEffect(() => {
    if (mode !== "bot" || turn !== "b" || status.over || chainFrom !== null) return;
    const timer = window.setTimeout(() => {
      let nextBoard = board;
      let forcedFrom: number | null = null;
      let safety = 0;

      while (safety < 8) {
        const move = forcedFrom === null ? chooseBotMove(nextBoard, "b", botLevel) : chooseForcedBotCapture(nextBoard, forcedFrom);
        if (!move) break;
        const result = applyMove(nextBoard, move.from, move.to, move.captured);
        nextBoard = result.board;
        if (!result.mustContinue) break;
        forcedFrom = result.end;
        safety += 1;
      }

      triggerHaptic("light");
      setBoard(nextBoard);
      setTurn("w");
      setChainFrom(null);
      setSelected(null);
      setTargets([]);
    }, 520);
    return () => window.clearTimeout(timer);
  }, [board, botLevel, chainFrom, mode, status.over, turn]);

  const targetSet = useMemo(() => new Set(targets.map((t) => t.to)), [targets]);
  const order = useMemo(() => {
    const cells: number[] = [];
    for (let r = 0; r < 8; r += 1) {
      for (let c = 0; c < 8; c += 1) cells.push(idx(r, c));
    }
    return cells;
  }, []);

  function chooseForcedBotCapture(current: Board, from: number): Move | null {
    const captures = pieceCaptures(current, from);
    if (!captures.length) return null;
    const capture = botLevel <= 2 ? captures[Math.floor(Math.random() * captures.length)]! : captures[0]!;
    return { from, to: capture.to, captured: capture.captured };
  }

  function clearSel() {
    setSelected(null);
    setTargets([]);
  }

  function resetBoard() {
    setBoard(initialBoard());
    setTurn("w");
    setChainFrom(null);
    clearSel();
  }

  function setModeAndReset(nextMode: Mode) {
    if (nextMode === mode) return;
    triggerHaptic("light");
    setMode(nextMode);
    resetBoard();
  }

  function selectPiece(i: number) {
    if (chainFrom !== null && i !== chainFrom) return;
    const { captures, moves } = legalForPiece(board, i);
    if (captures.length === 0 && moves.length === 0) return;
    setSelected(i);
    setTargets([
      ...captures.map((c) => ({ to: c.to, captured: c.captured })),
      ...moves.map((m) => ({ to: m, captured: null as number | null })),
    ]);
  }

  function canAct(): boolean {
    if (status.over) return false;
    if (mode === "bot") return turn === "w";
    return true;
  }

  function onCellClick(i: number) {
    if (!canAct()) return;
    if (selected !== null && targetSet.has(i)) {
      const t = targets.find((x) => x.to === i)!;
      const result = applyMove(board, selected, i, t.captured);
      triggerHaptic(t.captured !== null ? "medium" : "light");
      setBoard(result.board);
      if (result.mustContinue) {
        setSelected(result.end);
        setChainFrom(result.end);
        setTargets(pieceCaptures(result.board, result.end).map((c) => ({ to: c.to, captured: c.captured })));
      } else {
        clearSel();
        setChainFrom(null);
        setTurn(other(turn));
      }
      return;
    }

    if (chainFrom !== null) return;
    const piece = board[i];
    if (piece && piece.color === turn) selectPiece(i);
    else clearSel();
  }

  function restart() {
    const isFresh = JSON.stringify(board) === JSON.stringify(initialBoard());
    if (!status.over && !isFresh && !window.confirm("Начать новую партию? Текущая будет сброшена.")) return;
    triggerHaptic("medium");
    resetBoard();
  }

  const flipped = mode === "local" && autoFlip && turn === "b";
  const display = flipped ? [...order].reverse() : order;
  const whiteLeft = board.filter((p) => p?.color === "w").length;
  const blackLeft = board.filter((p) => p?.color === "b").length;
  const statusText = status.over
    ? "Партия окончена"
    : mode === "bot" && turn === "b"
      ? "Бот думает…"
      : turn === "w"
        ? "Ход белых"
        : "Ход чёрных";

  return (
    <div className="app-screen checkers-screen">
      <header className="sudoku-brand">
        <Logo />
        <h1>Шашки</h1>
        {switcher}
      </header>

      <div className="menu-group checkers-mode-card">
        <div className="segment checkers-mode-segment">
          <button className={`seg-item${mode === "bot" ? " active" : ""}`} onClick={() => setModeAndReset("bot")}>
            С ботом
          </button>
          <button className={`seg-item${mode === "local" ? " active" : ""}`} onClick={() => setModeAndReset("local")}>
            Вдвоём
          </button>
        </div>

        {mode === "bot" && (
          <div className="checkers-level-grid">
            {BOT_LEVELS.map((level) => (
              <button
                key={level.value}
                className={`checkers-level${botLevel === level.value ? " active" : ""}`}
                onClick={() => setBotLevel(level.value)}
                type="button"
              >
                <strong>{level.label}</strong>
                <span>{level.desc}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="local-turn">
        <span className={`local-turn-dot ${turn === "w" ? "white" : "black"}`} />
        <span>{statusText}</span>
      </div>

      <div className="board-wrap">
        <div className="checkers-board">
          {display.map((i) => {
            const [r, c] = rc(i);
            const dark = isDark(r, c);
            const piece = board[i];
            const isTarget = targetSet.has(i);
            return (
              <div
                key={i}
                className={`checkers-cell${dark ? " dark" : " light"}${selected === i ? " selected" : ""}${
                  isTarget ? " target" : ""
                }`}
                onClick={() => dark && onCellClick(i)}
              >
                {piece && (
                  <span className={`checkers-piece ${piece.color}${piece.king ? " king" : ""}`}>
                    {piece.king ? "★" : ""}
                  </span>
                )}
                {isTarget && !piece && <span className="checkers-dot" />}
              </div>
            );
          })}
        </div>
      </div>

      <div className="checkers-counts">
        <span>♙ Белые: {whiteLeft}</span>
        <span>♟ Чёрные: {blackLeft}</span>
      </div>

      {mode === "local" && (
        <div className="segment">
          <button className={`seg-item${autoFlip ? " active" : ""}`} onClick={() => setAutoFlip(true)}>
            Переворачивать доску
          </button>
          <button className={`seg-item${!autoFlip ? " active" : ""}`} onClick={() => setAutoFlip(false)}>
            Не переворачивать
          </button>
        </div>
      )}

      <button className="btn btn-block" onClick={restart}>
        Заново
      </button>

      {status.over && !dismissed && (
        <div className="modal-backdrop">
          <div className="modal" role="dialog">
            <h3>
              {mode === "bot"
                ? status.winner === "w"
                  ? "Победа!"
                  : "Бот выиграл"
                : status.winner === "w"
                  ? "Победа белых"
                  : "Победа чёрных"}
            </h3>
            <p>Соперник не может ходить.</p>
            <div className="modal-actions">
              <button className="btn" onClick={() => setDismissed(true)}>
                Посмотреть доску
              </button>
              <button className="btn btn-primary" onClick={restart}>
                Сыграть снова
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
