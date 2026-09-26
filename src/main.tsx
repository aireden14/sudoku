import React, { useState } from "react";
import ReactDOM from "react-dom/client";
import { SudokuScreen } from "./sudoku/SudokuScreen";
import { CheckersScreen } from "./checkers/CheckersScreen";
import { triggerHaptic } from "./haptics";
import "./global.css";
import "./standalone.css";

type Game = "sudoku" | "checkers";
const GAME_KEY = "sudoku-alina-game";

function readGame(): Game {
  try {
    return localStorage.getItem(GAME_KEY) === "checkers" ? "checkers" : "sudoku";
  } catch {
    return "sudoku";
  }
}

function App() {
  const [game, setGame] = useState<Game>(readGame);

  const pick = (next: Game) => {
    if (next === game) return;
    triggerHaptic("light");
    setGame(next);
    try {
      localStorage.setItem(GAME_KEY, next);
    } catch {}
  };

  const switcher = (
    <nav className="game-switch" aria-label="Игра">
      <button className={game === "sudoku" ? "active" : ""} onClick={() => pick("sudoku")}>
        Судоку
      </button>
      <button className={game === "checkers" ? "active" : ""} onClick={() => pick("checkers")}>
        Шашки
      </button>
    </nav>
  );

  return game === "checkers" ? <CheckersScreen switcher={switcher} /> : <SudokuScreen switcher={switcher} />;
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <div className="background-blobs" />
    <App />
  </React.StrictMode>,
);
