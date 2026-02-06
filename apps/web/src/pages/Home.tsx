import { Link } from "react-router-dom";
import { REFLEX_LEVELS } from "@pixelz/shared";
import { GAMES } from "../games/registry";

export default function Home() {
  return (
    <div>
      <h2>Home</h2>
      <div style={{ marginTop: "1.5rem" }}>
        <h3>Games</h3>
        {GAMES.map((game) => (
          <div key={game.id} style={{ marginBottom: "1rem" }}>
            <p style={{ marginBottom: "0.5rem", fontWeight: 600 }}>{game.name}</p>
            <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
              {game.levelIds.map((id) => (
                <Link
                  key={id}
                  to={`/play?game=${game.id}&level=${id}`}
                  style={{ padding: "0.5rem 1rem", background: "#eee", borderRadius: 4 }}
                >
                  {REFLEX_LEVELS[id as keyof typeof REFLEX_LEVELS] != null ? `${REFLEX_LEVELS[id as keyof typeof REFLEX_LEVELS]} rounds` : id}
                </Link>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
