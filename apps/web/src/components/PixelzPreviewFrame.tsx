/**
 * Static mid-play frame matching PixelzGame UI at fixed small size.
 */
import { PIXELZ_COLORS } from "../games/pixelz/constants";

const COLS = 7;
const ROWS = 6;
const CELL = 10;
const numColors = 5;

const previewGrid: number[][] = [];
for (let y = 0; y < ROWS; y++) {
  const row: number[] = [];
  for (let x = 0; x < COLS; x++) {
    row.push((x * 2 + y * 3) % numColors);
  }
  previewGrid.push(row);
}

export default function PixelzPreviewFrame() {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", width: 200, padding: "6px 0" }}>
      <p style={{ margin: 0, marginBottom: 2, fontSize: 12, fontWeight: 600, color: "var(--text-primary)" }}>Pixelz</p>
      <p style={{ margin: 0, marginBottom: 6, fontSize: 10, color: "var(--text-secondary)" }}>
        Moves: 4 · 5.2s
      </p>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: `repeat(${COLS}, ${CELL}px)`,
          gap: 1,
          marginBottom: 6,
          background: "var(--game-board-bg)",
          padding: 3,
          borderRadius: 4,
        }}
      >
        {previewGrid.flatMap((row, y) =>
          row.map((colorIndex, x) => (
            <div
              key={`${y}-${x}`}
              style={{
                width: CELL,
                height: CELL,
                backgroundColor: PIXELZ_COLORS[colorIndex],
                borderRadius: 2,
              }}
            />
          ))
        )}
      </div>
      <div style={{ display: "flex", gap: 4, justifyContent: "center" }}>
        {PIXELZ_COLORS.slice(0, numColors).map((hex, i) => (
          <div
            key={i}
            style={{
              width: 20,
              height: 20,
              backgroundColor: hex,
              border: "2px solid var(--game-btn-border)",
              borderRadius: 6,
            }}
          />
        ))}
      </div>
    </div>
  );
}
