import { act, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ReflexGame, {
  buildGhostComparison,
  buildReflexChallengeUrl,
  buildReflexPlayUrl,
  getGhostCurrentFillClass,
  parseReflexGhostRequest,
} from "./ReflexGame";

const fetchLeaderboardMock = vi.fn();

vi.mock("./constants", () => ({
  REFLEX_COLORS: ["#e53935", "#1e88e5", "#43a047", "#fdd835", "#8e24aa"],
  COUNTDOWN_MS: 1,
  DELAY_AFTER_CORRECT_MS: 1,
  getRoundsForLevel: () => 5,
}));

vi.mock("./useBeep", () => ({
  useBeep: () => ({
    shortBeep: vi.fn(),
    longBeep: vi.fn(),
  }),
}));

vi.mock("../../lib/api", () => ({
  fetchLeaderboard: (...args: unknown[]) => fetchLeaderboardMock(...args),
  STORAGE_KEYS: {
    dontRemindSignin: "pixelz_dont_remind_signin",
  },
}));

vi.mock("../../components/SignInPrompt", () => ({
  default: () => null,
}));

function seedReflexProgress(bestTimeMs: number) {
  localStorage.setItem("pixelz_competition_state_v1", JSON.stringify({
    version: 1,
    levels: {
      "reflex:reflex_level_0": {
        bestMoves: 5,
        bestTimeMs,
        lastMoves: 5,
        lastTimeMs: bestTimeMs,
        plays: 1,
        lastPlayedAt: "2026-03-26T12:00:00.000Z",
      },
    },
    dailyCompletions: {},
    rivals: [],
  }));
}

function renderReflex(initialEntry = "/play?game=reflex&level=reflex_level_0", sessionProps?: {
  seed: string;
  onComplete: (result: { moves: number; timeMs: number; disqualified?: boolean }) => void | Promise<void>;
}) {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <ReflexGame levelId="reflex_level_0" sessionProps={sessionProps} />
    </MemoryRouter>
  );
}

describe("ReflexGame", () => {
  beforeEach(() => {
    fetchLeaderboardMock.mockReset();
    fetchLeaderboardMock.mockResolvedValue({
      currentUserId: null,
      levelId: "reflex_level_0",
      entries: [
        {
          rank: 1,
          userId: "leader-1",
          nickname: "Leader",
          score: 0,
          moves: 5,
          timeMs: 3100,
          createdAt: "2026-03-26T12:00:00.000Z",
        },
      ],
    });
    const storage: Record<string, string> = {};
    Object.defineProperty(globalThis, "localStorage", {
      value: {
        getItem: (key: string) => storage[key] ?? null,
        setItem: (key: string, value: string) => {
          storage[key] = value;
        },
        removeItem: (key: string) => {
          delete storage[key];
        },
        clear: () => {
          for (const key of Object.keys(storage)) delete storage[key];
        },
      },
      writable: true,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("parses explicit ghost requests and falls back on invalid shared params", () => {
    expect(parseReflexGhostRequest(new URLSearchParams("ghost=pb"))).toEqual({ mode: "pb" });
    expect(parseReflexGhostRequest(new URLSearchParams("ghost=shared&ghostTimeMs=4200&ghostLabel=Friend%20PB"))).toEqual({
      mode: "shared",
      target: { label: "Friend PB", timeMs: 4200 },
    });
    expect(parseReflexGhostRequest(new URLSearchParams("ghost=shared&ghostTimeMs=oops"))).toEqual({ mode: "default" });
  });

  it("builds reflex play and challenge links with explicit ghost params", () => {
    expect(buildReflexPlayUrl("reflex_level_0", { ghostMode: "pb", autostartToken: "123" })).toBe(
      "/play?game=reflex&level=reflex_level_0&ghost=pb&autostart=123"
    );
    expect(buildReflexPlayUrl("reflex_level_0", {
      ghostMode: "pb",
      sharedGhost: { label: "Friend PB", timeMs: 3950 },
    })).toBe(
      "/play?game=reflex&level=reflex_level_0&ghost=shared&ghostTimeMs=3950&ghostLabel=Friend+PB"
    );
    expect(buildReflexChallengeUrl("https://pixelz.test", "reflex_level_0", 3950)).toBe(
      "https://pixelz.test/play?game=reflex&level=reflex_level_0&ghost=shared&ghostTimeMs=3950&ghostLabel=Friend+PB"
    );
  });

  it("uses leaderboard leader as the default ghost even when a PB exists", async () => {
    seedReflexProgress(3950);
    renderReflex();

    expect(await screen.findByText("Leaderboard ghost · 3.10s")).toBeInTheDocument();
  });

  it("uses the local PB ghost when ghost=pb is requested", async () => {
    seedReflexProgress(3950);
    renderReflex("/play?game=reflex&level=reflex_level_0&ghost=pb");

    expect(await screen.findByText("PB ghost · 3.95s")).toBeInTheDocument();
  });

  it("prefers a shared ghost from the URL over PB and leaderboard", async () => {
    seedReflexProgress(3950);
    renderReflex("/play?game=reflex&level=reflex_level_0&ghost=shared&ghostTimeMs=4200&ghostLabel=Friend%20PB");

    expect(await screen.findByText("Friend PB · 4.20s")).toBeInTheDocument();
  });

  it("shows a non-loading empty state when no leaderboard ghost is available", async () => {
    fetchLeaderboardMock.mockResolvedValueOnce({
      currentUserId: null,
      levelId: "reflex_level_0",
      entries: [],
    });

    renderReflex();

    expect(await screen.findByText("No target available")).toBeInTheDocument();
  });

  it("marks the current ghost line as behind when the cumulative split exceeds the target split", () => {
    const comparison = buildGhostComparison({ label: "Leaderboard ghost", timeMs: 3100 }, 1, 5, 1000);

    expect(comparison).toEqual(expect.objectContaining({
      status: "behind",
      deltaMs: 380,
    }));
    expect(getGhostCurrentFillClass(comparison!.status)).toBe("ghost-timeline__fill--current-behind");
  });

  it("treats sub-millisecond pace drift as tied after rounding", () => {
    const comparison = buildGhostComparison({ label: "Leaderboard ghost", timeMs: 1001 }, 1, 5, 200);

    expect(comparison).toEqual(expect.objectContaining({
      targetProgressMs: 200,
      deltaMs: 0,
      status: "tied",
    }));
  });

  it("submits a disqualification on a wrong color instead of restarting the session run", async () => {
    vi.useFakeTimers();
    const onComplete = vi.fn().mockResolvedValue(undefined);

    renderReflex("/play?game=reflex&level=reflex_level_0", {
      seed: "session-seed",
      onComplete,
    });

    await act(async () => {
      // Flush the auto-start effect before stepping through the countdown timers.
    });

    for (let i = 0; i < 6; i += 1) {
      await act(async () => {
        await vi.advanceTimersByTimeAsync(1);
      });
    }

    const target = document.querySelector(".reflex-target") as HTMLDivElement | null;
    expect(target?.style.backgroundColor).toBeTruthy();
    const wrongButton = screen
      .getAllByRole("button")
      .find((button) => (button as HTMLButtonElement).style.backgroundColor !== target?.style.backgroundColor);

    expect(wrongButton).toBeDefined();
    fireEvent.click(wrongButton!);

    await act(async () => {
      await Promise.resolve();
    });

    expect(onComplete).toHaveBeenCalledWith(
      expect.objectContaining({
        moves: 0,
        disqualified: true,
      })
    );
    expect(screen.queryByRole("button", { name: /play again/i })).not.toBeInTheDocument();
  });
});
