import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, act } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import SessionRoom from "./SessionRoom";
import type { SessionResponse } from "../lib/api";

const {
  fetchSession,
  beginSession,
  createSession,
  finishSession,
  joinSession,
  leaveSession,
  markSessionReady,
  useGameSession,
} = vi.hoisted(() => {
  const fetchSession = vi.fn();
  const beginSession = vi.fn();
  const createSession = vi.fn();
  const finishSession = vi.fn();
  const joinSession = vi.fn();
  const leaveSession = vi.fn();
  const markSessionReady = vi.fn();
  const useGameSession = vi.fn();

  return {
    fetchSession,
    beginSession,
    createSession,
    finishSession,
    joinSession,
    leaveSession,
    markSessionReady,
    useGameSession,
  };
});

vi.mock("../lib/api", async () => {
  const actual = await vi.importActual<typeof import("../lib/api")>("../lib/api");
  return {
    ...actual,
    beginSession,
    createSession,
    fetchSession,
    finishSession,
    joinSession,
    leaveSession,
    markSessionReady,
  };
});

vi.mock("../hooks/useGameSession", () => ({
  useGameSession,
}));

vi.mock("../games/registry", () => ({
  getGameById: () => ({
    component: () => null,
  }),
}));

describe("SessionRoom", () => {
  const firstResponse: SessionResponse = {
    currentUserId: "host-1",
    session: {
      id: "session-1",
      game: "reflex",
      inviteCode: "abc123",
      levelId: "reflex_level_0",
      seed: "seed-1",
      settings: { rounds: 10 },
      status: "waiting",
      maxPlayers: 2,
      startsAt: null,
      finishedAt: null,
      winnerId: null,
    },
    players: [
      {
        userId: "host-1",
        role: "host",
        status: "joined",
        score: null,
        moves: null,
        timeMs: null,
        moveSequence: null,
        finishedAt: null,
        nickname: "Host",
        placement: null,
        disqualified: false,
      },
    ],
  };

  const secondResponse: SessionResponse = {
    ...firstResponse,
    players: [
      ...firstResponse.players,
      {
        userId: "guest-1",
        role: "guest",
        status: "joined",
        score: null,
        moves: null,
        timeMs: null,
        moveSequence: null,
        finishedAt: null,
        nickname: "Guest",
        placement: null,
        disqualified: false,
      },
    ],
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    fetchSession.mockResolvedValueOnce(firstResponse).mockResolvedValueOnce(secondResponse);
    beginSession.mockResolvedValue(undefined);
    createSession.mockResolvedValue({ sessionId: "next-session", inviteCode: "next123" });
    finishSession.mockResolvedValue(undefined);
    joinSession.mockResolvedValue(undefined);
    leaveSession.mockResolvedValue(undefined);
    markSessionReady.mockResolvedValue(undefined);
    useGameSession.mockReturnValue({
      progressByUser: {},
      onlineSet: new Set<string>(),
      broadcast: vi.fn().mockResolvedValue(undefined),
      broadcastProgress: vi.fn().mockResolvedValue(undefined),
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("refreshes the waiting lobby from server state even when realtime hints never arrive", async () => {
    render(
      <MemoryRouter initialEntries={["/session/session-1"]}>
        <Routes>
          <Route path="/session/:sessionId" element={<SessionRoom />} />
        </Routes>
      </MemoryRouter>
    );

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(screen.getByText("Lobby")).toBeInTheDocument();
    expect(screen.getByText(/players:/i)).toHaveTextContent("Players: 1 / 2");

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
      await Promise.resolve();
    });

    expect(screen.getByText(/players:/i)).toHaveTextContent("Players: 2 / 2");
    expect(screen.getByText("Guest")).toBeInTheDocument();
  });
});
