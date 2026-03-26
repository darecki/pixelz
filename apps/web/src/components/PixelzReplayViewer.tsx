import { useEffect, useMemo, useState } from "react";
import { applyPixelzFloodFill, generatePixelzGrid } from "@pixelz/shared";
import type { BoardParams } from "../lib/api";
import { PIXELZ_COLORS } from "../games/pixelz/constants";

type PixelzReplayViewerProps = {
  board: BoardParams;
  moveSequence: number[];
  title?: string;
  subtitle?: string;
};

function formatMoveLabel(move: number | undefined) {
  if (move == null) return "Opening board";
  return `Color ${move + 1}`;
}

export default function PixelzReplayViewer({ board, moveSequence, title = "Replay", subtitle }: PixelzReplayViewerProps) {
  const [step, setStep] = useState(0);
  const [playing, setPlaying] = useState(false);

  const frames = useMemo(() => {
    const initial = generatePixelzGrid(board);
    const nextFrames = [initial];
    let current = initial;
    for (const move of moveSequence) {
      current = applyPixelzFloodFill(current, current[0][0], move);
      nextFrames.push(current);
    }
    return nextFrames;
  }, [board, moveSequence]);

  useEffect(() => {
    setStep(0);
    setPlaying(false);
  }, [board, moveSequence]);

  useEffect(() => {
    if (!playing || step >= moveSequence.length) return;
    const id = window.setTimeout(() => {
      setStep((current) => {
        const next = Math.min(current + 1, moveSequence.length);
        if (next >= moveSequence.length) {
          setPlaying(false);
        }
        return next;
      });
    }, 420);
    return () => window.clearTimeout(id);
  }, [moveSequence.length, playing, step]);

  const currentGrid = frames[Math.min(step, frames.length - 1)];
  const currentMove = step > 0 ? moveSequence[step - 1] : undefined;
  const cellSize = Math.min(28, Math.floor(220 / board.width), Math.floor(220 / board.height));

  return (
    <div className="card replay-viewer">
      <div className="replay-header">
        <div>
          <p className="section-kicker">Replay</p>
          <h3>{title}</h3>
          {subtitle && <p className="text-muted text-sm">{subtitle}</p>}
        </div>
        <div className="metric-chip-row">
          <div className="metric-chip">
            <span>Step</span>
            <strong>{step} / {moveSequence.length}</strong>
          </div>
          <div className="metric-chip">
            <span>Current move</span>
            <strong>{formatMoveLabel(currentMove)}</strong>
          </div>
        </div>
      </div>
      <div className="replay-board-shell">
        <div
          className="replay-board"
          style={{
            gridTemplateColumns: `repeat(${board.width}, ${cellSize}px)`,
          }}
        >
          {currentGrid.flatMap((row, y) =>
            row.map((colorIndex, x) => (
              <div
                key={`${y}-${x}`}
                className="replay-cell"
                style={{
                  width: cellSize,
                  height: cellSize,
                  backgroundColor: PIXELZ_COLORS[colorIndex],
                }}
              />
            ))
          )}
        </div>
      </div>
      <div className="replay-controls">
        <button type="button" onClick={() => { setStep(0); setPlaying(false); }} className="btn btn-sm">
          Restart
        </button>
        <button
          type="button"
          onClick={() => setStep((current) => Math.max(0, current - 1))}
          disabled={step === 0}
          className="btn btn-sm"
        >
          Back
        </button>
        <button
          type="button"
          onClick={() => {
            if (step >= moveSequence.length) setStep(0);
            setPlaying((current) => !current);
          }}
          disabled={moveSequence.length === 0}
          className="btn btn-sm btn-primary"
        >
          {playing ? "Pause" : step >= moveSequence.length ? "Replay again" : "Autoplay"}
        </button>
        <button
          type="button"
          onClick={() => {
            setPlaying(false);
            setStep((current) => Math.min(moveSequence.length, current + 1));
          }}
          disabled={step >= moveSequence.length}
          className="btn btn-sm"
        >
          Next
        </button>
      </div>
      <p className="text-muted text-sm replay-help">
        Replay shows the move sequence for this exact board. Use Autoplay for the full solve, or step through move by move with Back and Next.
      </p>
    </div>
  );
}
