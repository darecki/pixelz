import { Link } from "react-router-dom";
import { GAMES } from "../games/registry";
import ReflexPreviewFrame from "../components/ReflexPreviewFrame";
import PixelzPreviewFrame from "../components/PixelzPreviewFrame";

const GAME_CAPTIONS: Record<string, string> = {
  reflex: "Tap the button that matches the color. Fast reaction = better time.",
  pixelz: "Flood the board with one color. Fewer moves and less time = better score.",
};

const GAME_ACCENTS: Record<string, string> = {
  reflex: "card-accent-strip--coral",
  pixelz: "card-accent-strip--teal",
};

export default function Home() {
  return (
    <div className="page-container">
      <div className="page-header">
        <h1>Pixelz</h1>
        <p className="home-subtitle">Select your challenge</p>
      </div>

      <section aria-label="Select game">
        <div className="game-selector">
          {GAMES.map((game) => (
            <Link
              key={game.id}
              to={`/configure/${game.id}`}
              className="card card--interactive"
            >
              <div className={`card-accent-strip ${GAME_ACCENTS[game.id] ?? "card-accent-strip--accent"}`} />
              <div className="game-card-preview">
                {game.id === "reflex" ? <ReflexPreviewFrame /> : <PixelzPreviewFrame />}
              </div>
              <div className="game-card-body">
                <p className="game-card-title">{game.name}</p>
                <p className="game-card-desc">
                  {GAME_CAPTIONS[game.id] ?? ""}
                </p>
              </div>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
