import { act, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ReflexGame from "./ReflexGame";

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

vi.mock("../../components/GameOverNickname", () => ({
  default: () => null,
}));

vi.mock("../../components/SignInPrompt", () => ({
  default: () => null,
}));

describe("ReflexGame multiplayer disqualification", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("submits a disqualification on a wrong color instead of restarting the session run", async () => {
    const onComplete = vi.fn().mockResolvedValue(undefined);

    render(
      <MemoryRouter>
        <ReflexGame
          levelId="reflex_level_0"
          sessionProps={{
            seed: "session-seed",
            onComplete,
          }}
        />
      </MemoryRouter>
    );

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
