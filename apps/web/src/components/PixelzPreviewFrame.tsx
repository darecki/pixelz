/**
 * Static mid-play frame matching PixelzGame UI at fixed small size (no scale/overflow).
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
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        width: 200,
        padding: "4px 0",
        background: "#fafafa",
        borderRadius: 8,
      }}
    >
      <p style={{ margin: 0, marginBottom: 2, fontSize: 12, fontWeight: 600 }}>Pixelz</p>
      <p style={{ margin: 0, marginBottom: 4, fontSize: 10, color: "#333" }}>
        Moves: 4 · 5.2s
      </p>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: `repeat(${COLS}, ${CELL}px)`,
          gap: 1,
          marginBottom: 6,
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
                borderRadius: 1,
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
              width: 22,
              height: 22,
              backgroundColor: hex,
              border: "2px solid #333",
              borderRadius: 6,
            }}
          />
        ))}
      </div>
    </div>
  );
}
