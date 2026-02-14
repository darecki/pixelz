import { REFLEX_LEVEL_IDS, isPixelzBoardId } from "@pixelz/shared";
import { lazy } from "react";

export type GameLevelType = "predefined" | "random" | "none" | "board";

export type GameDef = {
  id: string;
  name: string;
  levelType: GameLevelType;
  levelIds: readonly string[];
  component: React.LazyExoticComponent<React.ComponentType<{ levelId: string }>>;
};

export const GAMES: GameDef[] = [
  {
    id: "reflex",
    name: "Reflex",
    levelType: "predefined",
    levelIds: REFLEX_LEVEL_IDS,
    component: lazy(() => import("./reflex/ReflexGame")),
  },
  {
    id: "pixelz",
    name: "Pixelz",
    levelType: "board",
    levelIds: [],
    component: lazy(() => import("./pixelz/PixelzGame")),
  },
];

export function getGameById(id: string): GameDef | undefined {
  return GAMES.find((g) => g.id === id);
}

export function isReflexLevel(levelId: string): boolean {
  return levelId.startsWith("reflex_");
}

export { isPixelzBoardId };
