import { Link } from "react-router-dom";
import { GAMES } from "../games/registry";
import ReflexPreviewFrame from "../components/ReflexPreviewFrame";
import PixelzPreviewFrame from "../components/PixelzPreviewFrame";

const GAME_CAPTIONS: Record<string, string> = {
  reflex: "Tap the button that matches the color. Fast reaction = better time.",
  pixelz: "Flood the board with one color. Fewer moves and less time = better score.",
};

export default function Home() {
  return (
    <div>
      <h1>Pixelz</h1>

      <section style={{ marginTop: "1.5rem", marginBottom: "2rem" }} aria-label="Select game">
        <h3 style={{ marginBottom: "1rem", fontSize: "1.1rem", fontWeight: 600 }}>Select game</h3>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
            gap: "1.25rem",
            maxWidth: 600,
          }}
        >
          {GAMES.map((game) => {
            return (
              <Link
                key={game.id}
                to={`/configure/${game.id}`}
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "stretch",
                  padding: 0,
                  border: `2px solid #ddd`,
                  borderRadius: 12,
                  background: "#fff",
                  cursor: "pointer",
                  textAlign: "left",
                  boxShadow: "0 1px 3px rgba(0,0,0,0.08)",
                  overflow: "hidden",
                  textDecoration: "none",
                  color: "inherit"
                }}
              >
                <div
                  style={{
                    padding: "0.5rem",
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    justifyContent: "center",
                    background: "#fafafa",
                  }}
                >
                  {game.id === "reflex" ? <ReflexPreviewFrame /> : <PixelzPreviewFrame />}
                </div>
                <div style={{ padding: "1rem" }}>
                  <p style={{ margin: 0, fontWeight: 700, fontSize: "1.1rem" }}>{game.name}</p>
                  <p style={{ margin: "0.5rem 0 0", fontSize: "0.9rem", color: "#555", lineHeight: 1.4 }}>
                    {GAME_CAPTIONS[game.id] ?? ""}
                  </p>
                </div>
              </Link>
            );
          })}
        </div>
      </section>
    </div>
  );
}
