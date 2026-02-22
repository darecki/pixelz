import { Suspense } from "react";
import { useSearchParams } from "react-router-dom";
import { getGameById, isReflexLevel, isPixelzBoardId } from "../games/registry";
import PlayStub from "./PlayStub";

export default function Play() {
  const [searchParams] = useSearchParams();
  const gameId = searchParams.get("game");
  const levelId = searchParams.get("level") ?? "level_1";

  const game = gameId
    ? getGameById(gameId)
    : isReflexLevel(levelId)
      ? getGameById("reflex")
      : isPixelzBoardId(levelId)
        ? getGameById("pixelz")
        : null;
  const effectiveLevel =
    game?.id === "reflex"
      ? (game.levelIds.includes(levelId) ? levelId : game.levelIds[0])
      : levelId;

  if (game?.id === "reflex") {
    const ReflexGame = game.component;
    return (
      <Suspense fallback={<div className="page-container"><p className="loading-text">Loading…</p></div>}>
        <ReflexGame levelId={effectiveLevel} />
      </Suspense>
    );
  }

  if (game?.id === "pixelz" && levelId) {
    const PixelzGame = game.component;
    return (
      <Suspense fallback={<div className="page-container"><p className="loading-text">Loading…</p></div>}>
        <PixelzGame levelId={levelId} />
      </Suspense>
    );
  }

  return <PlayStub levelId={levelId} seed={searchParams.get("seed")} />;
}
