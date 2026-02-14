import { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { appendEvent } from "../../lib/eventLog";
import { performSync } from "../../lib/sync";
import { fetchBoard } from "../../lib/api";
import GameOverNickname from "../../components/GameOverNickname";
import { computePixelzScore } from "@pixelz/shared";
import { generateGrid } from "./boardGenerator";
import { PIXELZ_COLORS } from "./constants";

function applyFloodFill(
  grid: number[][],
  fromColor: number,
  toColor: number
): number[][] {
  if (fromColor === toColor) return grid;
  const height = grid.length;
  const width = grid[0].length;
  const next = grid.map((row) => row.slice());
  const stack: [number, number][] = [[0, 0]];
  if (next[0][0] !== fromColor) return next;
  next[0][0] = toColor;
  while (stack.length > 0) {
    const [x, y] = stack.pop()!;
    for (const [dx, dy] of [
      [0, -1],
      [1, 0],
      [0, 1],
      [-1, 0],
    ]) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx >= 0 && nx < width && ny >= 0 && ny < height && next[ny][nx] === fromColor) {
        next[ny][nx] = toColor;
        stack.push([nx, ny]);
      }
    }
  }
  return next;
}

function isFilled(grid: number[][]): boolean {
  const c = grid[0][0];
  return grid.flat().every((v) => v === c);
}

export default function PixelzGame({ levelId }: { levelId: string }) {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [grid, setGrid] = useState<number[][] | null>(null);
  const [numColors, setNumColors] = useState(5);
  const [moves, setMoves] = useState(0);
  const [moveSequence, setMoveSequence] = useState<number[]>([]);
  const [startTime, setStartTime] = useState<number | null>(null);
  const [won, setWon] = useState(false);
  const [timeMs, setTimeMs] = useState(0);
  const [saving, setSaving] = useState(false);
  const scoreSubmittedRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    scoreSubmittedRef.current = false;
    setLoading(true);
    setError(null);
    fetchBoard(levelId)
      .then((board) => {
        if (cancelled) return;
        const g = generateGrid(board.width, board.height, board.numColors, board.seed);
        setGrid(g);
        setNumColors(board.numColors);
        setMoves(0);
        setMoveSequence([]);
        setStartTime(null);
        setWon(false);
        setTimeMs(0);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load board");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [levelId]);

  const handleColorClick = useCallback(
    (colorIndex: number) => {
      if (!grid || won) return;
      const currentColor = grid[0][0];
      if (colorIndex === currentColor) return;
      const start = startTime ?? Date.now();
      if (startTime === null) setStartTime(start);
      const nextGrid = applyFloodFill(grid, currentColor, colorIndex);
      setGrid(nextGrid);
      setMoves((m) => m + 1);
      setMoveSequence((seq) => [...seq, colorIndex]);
      if (isFilled(nextGrid)) {
        if (scoreSubmittedRef.current) return;
        scoreSubmittedRef.current = true;
        const elapsed = Math.floor(Date.now() - start);
        setTimeMs(elapsed);
        setWon(true);
        const finalMoves = moves + 1;
        const score = computePixelzScore(finalMoves, elapsed);
        appendEvent({
          type: "LEVEL_COMPLETED",
          payload: {
            levelId,
            score,
            moves: finalMoves,
            timeMs: elapsed,
            moveSequence: [...moveSequence, colorIndex],
          },
        });
        setSaving(true);
        performSync()
          .catch(() => {})
          .finally(() => setSaving(false));
      }
    },
    [grid, won, startTime, moves, moveSequence, levelId]
  );

  const containerStyle: React.CSSProperties = {
    padding: "clamp(0.5rem, 2vmin, 1rem)",
    maxWidth: 480,
    margin: "0 auto",
    minHeight: "100dvh",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    boxSizing: "border-box",
    touchAction: "manipulation",
  };

  if (loading) {
    return (
      <div style={containerStyle}>
        <p>Loading board…</p>
      </div>
    );
  }
  if (error) {
    return (
      <div style={containerStyle}>
        <p style={{ color: "#c00", marginBottom: "1rem" }}>{error}</p>
        <button type="button" onClick={() => navigate("/")} style={{ padding: "0.5rem 1rem" }}>
          Home
        </button>
      </div>
    );
  }
  if (!grid) return null;

  const cellSize = Math.min(36, Math.floor(320 / grid[0].length), Math.floor(400 / grid.length));

  if (won) {
    return (
      <div style={containerStyle}>
        <h2 style={{ marginBottom: "0.5rem" }}>Done!</h2>
        <p style={{ fontSize: "clamp(1rem, 4vmin, 1.25rem)", marginBottom: "0.5rem" }}>
          Moves: <strong>{moves}</strong> · Time: <strong>{(timeMs / 1000).toFixed(2)}s</strong>
        </p>
        <p style={{ color: "#666", marginBottom: "0.5rem", fontSize: "0.9rem" }}>
          {saving ? "Saving…" : "Saved to leaderboard."}
        </p>
        <GameOverNickname disabled={saving} />
        <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem", justifyContent: "center" }}>
          <button
            type="button"
            onClick={() => navigate(`/leaderboard?game=pixelz&level=${encodeURIComponent(levelId)}&justFinished=1`)}
            style={{ padding: "0.5rem 1rem" }}
            disabled={saving}
          >
            View leaderboard
          </button>
          <button
            type="button"
            onClick={() => window.location.reload()}
            style={{ padding: "0.5rem 1rem" }}
            disabled={saving}
          >
            Play this board again
          </button>
          <button type="button" onClick={() => navigate("/")} style={{ padding: "0.5rem 1rem" }} disabled={saving}>
            Home
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={containerStyle}>
      <h2 style={{ fontSize: "clamp(1.25rem, 5vmin, 1.5rem)", marginBottom: "0.5rem" }}>Pixelz</h2>
      <p style={{ marginBottom: "0.5rem", fontSize: "clamp(0.9rem, 2.5vmin, 1rem)" }}>
        Moves: {moves}
        {startTime != null && ` · ${((Date.now() - startTime) / 1000).toFixed(1)}s`}
      </p>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: `repeat(${grid[0].length}, ${cellSize}px)`,
          gap: 1,
          marginBottom: "1rem",
        }}
      >
        {grid.flatMap((row, y) =>
          row.map((colorIndex, x) => (
            <div
              key={`${y}-${x}`}
              style={{
                width: cellSize,
                height: cellSize,
                backgroundColor: PIXELZ_COLORS[colorIndex],
                borderRadius: 2,
              }}
            />
          ))
        )}
      </div>
      <div style={{ display: "flex", gap: "clamp(6px, 2vmin, 12px)", justifyContent: "center", flexWrap: "wrap" }}>
        {PIXELZ_COLORS.slice(0, numColors).map((hex, i) => (
          <button
            key={i}
            type="button"
            onClick={() => handleColorClick(i)}
            style={{
              width: "clamp(44px, 12vmin, 56px)",
              height: "clamp(44px, 12vmin, 56px)",
              minWidth: 44,
              minHeight: 44,
              backgroundColor: hex,
              border: "3px solid #333",
              borderRadius: 10,
              cursor: "pointer",
              touchAction: "manipulation",
            }}
            aria-label={`Color ${i + 1}`}
          />
        ))}
      </div>
    </div>
  );
}
