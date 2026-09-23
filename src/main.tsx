import React from "react";
import ReactDOM from "react-dom/client";
import { SudokuScreen } from "./sudoku/SudokuScreen";
import "./global.css";
import "./standalone.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <div className="background-blobs" />
    <SudokuScreen />
  </React.StrictMode>,
);
