/**
 * Static mid-play frame matching ReflexGame UI at fixed small size.
 */
import { REFLEX_COLORS } from "../games/reflex/constants";

const W = 200;
const TARGET_H = 56;
const BUTTON = 26;

export default function ReflexPreviewFrame() {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", width: W, padding: "6px 0" }}>
      <p style={{ margin: 0, marginBottom: 4, fontSize: 11, color: "var(--text-secondary)" }}>
        Round 3 / 10 · 2.45s
      </p>
      <div
        style={{
          width: W - 24,
          height: TARGET_H,
          backgroundColor: "#1e88e5",
          borderRadius: 8,
          marginBottom: 8,
          boxShadow: "var(--shadow-sm)",
        }}
      />
      <div style={{ fontSize: 20, fontWeight: 700, marginBottom: 6, color: "var(--text-primary)" }}>2</div>
      <div style={{ display: "flex", gap: 6, justifyContent: "center" }}>
        {REFLEX_COLORS.map((color) => (
          <div
            key={color}
            style={{
              width: BUTTON,
              height: BUTTON,
              backgroundColor: color,
              border: "2px solid var(--game-btn-border)",
              borderRadius: 7,
            }}
          />
        ))}
      </div>
    </div>
  );
}
