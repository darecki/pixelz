import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, act, fireEvent } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import SessionRoom from "./SessionRoom";
import type { SessionResponse } from "../lib/api";

const {
  fetchSession,
  beginSession,
  createNextSession,
  finishSession,
  joinSession,
  leaveSession,
  markSessionReady,
  useGameSession,
} = vi.hoisted(() => {
  const fetchSession = vi.fn();
  const beginSession = vi.fn();
  const createNextSession = vi.fn();
  const finishSession = vi.fn();
  const joinSession = vi.fn();
  const leaveSession = vi.fn();
  const markSessionReady = vi.fn();
  const useGameSession = vi.fn();

  return {
    fetchSession,
    beginSession,
    createNextSession,
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
    createNextSession,
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

function LocationDisplay() {
  const location = useLocation();
  return <div data-testid="location">{location.pathname}</div>;
}

function renderSessionRoom(initialEntry = "/session/session-1") {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <Routes>
        <Route path="/" element={<div>Home</div>} />
        <Route path="/session/:sessionId" element={<SessionRoom />} />
      </Routes>
      <LocationDisplay />
    </MemoryRouter>
  );
}

function makeResponse(
  overrides: Partial<SessionResponse["session"]> = {},
  playerOverrides: SessionResponse["players"] = [],
  currentUserId = "host-1"
): SessionResponse {
  return {
    currentUserId,
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
      nextSessionId: null,
      partyEndedAt: null,
      ...overrides,
    },
    players: playerOverrides.length > 0
      ? playerOverrides
      : [
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
}

describe("SessionRoom", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    beginSession.mockResolvedValue(undefined);
    createNextSession.mockResolvedValue({ sessionId: "next-session", inviteCode: "next123" });
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
    const firstResponse = makeResponse();
    const secondResponse = makeResponse(
      {},
      [
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
      ]
    );
    fetchSession.mockResolvedValueOnce(firstResponse).mockResolvedValueOnce(secondResponse);

    renderSessionRoom();

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(screen.getByText("Lobby")).toBeInTheDocument();
    expect(screen.getByText("Players").closest(".metric-chip")).toHaveTextContent("1 / 2");

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
      await Promise.resolve();
    });

    expect(screen.getByText("Players").closest(".metric-chip")).toHaveTextContent("2 / 2");
    expect(screen.getAllByText("Guest")[0]).toBeInTheDocument();
  });

  it("lets a 2-of-3 lobby ready up instead of blocking on max capacity", async () => {
    fetchSession.mockResolvedValueOnce(makeResponse({
      maxPlayers: 3,
    }, [
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
    ]));

    renderSessionRoom();

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    const readyButton = screen.getByRole("button", { name: "Ready" });
    expect(readyButton).toBeEnabled();
    expect(screen.queryByText("Waiting for players…")).not.toBeInTheDocument();
  });

  it("has the host create the successor session and navigate directly to the new lobby", async () => {
    fetchSession
      .mockResolvedValueOnce(makeResponse({
        status: "finished",
        finishedAt: "2026-03-24T10:00:00Z",
      }))
      .mockResolvedValueOnce(makeResponse({
        id: "next-session",
        inviteCode: "next123",
      }));

    renderSessionRoom();

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(screen.getByText("Session Results")).toBeInTheDocument();
    const playNextButton = screen.getByRole("button", { name: "Play Next Game" });

    await act(async () => {
      fireEvent.click(playNextButton);
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(createNextSession).toHaveBeenCalledWith("session-1");
    expect(fetchSession).toHaveBeenCalledWith("next-session");
    expect(screen.getByTestId("location")).toHaveTextContent("/session/next-session");
    expect(joinSession).not.toHaveBeenCalled();
  });

  it("still navigates to the next session when the next_game_created broadcast fails", async () => {
    const broadcast = vi.fn().mockRejectedValue(new Error("socket offline"));
    useGameSession.mockReturnValue({
      progressByUser: {},
      onlineSet: new Set<string>(),
      broadcast,
      broadcastProgress: vi.fn().mockResolvedValue(undefined),
    });
    fetchSession
      .mockResolvedValueOnce(makeResponse({
        status: "finished",
        finishedAt: "2026-03-24T10:00:00Z",
      }))
      .mockResolvedValueOnce(makeResponse({
        id: "next-session",
        inviteCode: "next123",
      }));

    renderSessionRoom();

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(screen.getByText("Session Results")).toBeInTheDocument();
    const playNextButton = screen.getByRole("button", { name: "Play Next Game" });

    await act(async () => {
      fireEvent.click(playNextButton);
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(createNextSession).toHaveBeenCalledWith("session-1");
    expect(broadcast).toHaveBeenCalledWith("next_game_created", { nextSessionId: "next-session" });
    expect(screen.getByTestId("location")).toHaveTextContent("/session/next-session");
    expect(screen.queryByText("Failed to create next session")).not.toBeInTheDocument();
  });

  it("calls leaveSession when the host leaves from the results screen", async () => {
    fetchSession.mockResolvedValueOnce(makeResponse({
      status: "finished",
      finishedAt: "2026-03-24T10:00:00Z",
    }));

    renderSessionRoom();

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Leave" }));
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(leaveSession).toHaveBeenCalledWith("session-1");
    expect(screen.getByTestId("location")).toHaveTextContent("/");
  });

  it("still lets the host leave when the party_closed broadcast fails", async () => {
    const broadcast = vi.fn().mockRejectedValue(new Error("socket offline"));
    useGameSession.mockReturnValue({
      progressByUser: {},
      onlineSet: new Set<string>(),
      broadcast,
      broadcastProgress: vi.fn().mockResolvedValue(undefined),
    });
    fetchSession.mockResolvedValueOnce(makeResponse({
      status: "finished",
      finishedAt: "2026-03-24T10:00:00Z",
    }));

    renderSessionRoom();

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Leave" }));
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(leaveSession).toHaveBeenCalledWith("session-1");
    expect(broadcast).toHaveBeenCalledWith("party_closed", { sessionId: "session-1" });
    expect(screen.getByTestId("location")).toHaveTextContent("/");
    expect(screen.queryByText("Failed to leave session")).not.toBeInTheDocument();
  });

  it("polls a terminal session until nextSessionId appears and then redirects participants", async () => {
    fetchSession
      .mockResolvedValueOnce(makeResponse({
        status: "finished",
        finishedAt: "2026-03-24T10:00:00Z",
      }, [
        {
          userId: "host-1",
          role: "host",
          status: "finished",
          score: 100,
          moves: 10,
          timeMs: 5000,
          moveSequence: null,
          finishedAt: "2026-03-24T10:00:00Z",
          nickname: "Host",
          placement: 1,
          disqualified: false,
        },
        {
          userId: "guest-1",
          role: "guest",
          status: "finished",
          score: 120,
          moves: 11,
          timeMs: 5200,
          moveSequence: null,
          finishedAt: "2026-03-24T10:00:01Z",
          nickname: "Guest",
          placement: 2,
          disqualified: false,
        },
      ]))
      .mockResolvedValueOnce(makeResponse({
        status: "finished",
        finishedAt: "2026-03-24T10:00:00Z",
        nextSessionId: "session-2",
      }, [
        {
          userId: "host-1",
          role: "host",
          status: "finished",
          score: 100,
          moves: 10,
          timeMs: 5000,
          moveSequence: null,
          finishedAt: "2026-03-24T10:00:00Z",
          nickname: "Host",
          placement: 1,
          disqualified: false,
        },
        {
          userId: "guest-1",
          role: "guest",
          status: "finished",
          score: 120,
          moves: 11,
          timeMs: 5200,
          moveSequence: null,
          finishedAt: "2026-03-24T10:00:01Z",
          nickname: "Guest",
          placement: 2,
          disqualified: false,
        },
      ]))
      .mockResolvedValueOnce(makeResponse({
        id: "session-2",
        inviteCode: "next123",
      }, [
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
      ]));
    useGameSession.mockReturnValue({
      progressByUser: {},
      onlineSet: new Set<string>(),
      broadcast: vi.fn().mockResolvedValue(undefined),
      broadcastProgress: vi.fn().mockResolvedValue(undefined),
    });

    render(
      <MemoryRouter initialEntries={["/session/session-1"]}>
        <Routes>
          <Route path="/session/:sessionId" element={<SessionRoom />} />
        </Routes>
        <LocationDisplay />
      </MemoryRouter>
    );

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(fetchSession).toHaveBeenCalledWith("session-2");
    expect(screen.getByText("Lobby")).toBeInTheDocument();
    expect(screen.getByTestId("location")).toHaveTextContent("/session/session-2");
    expect(joinSession).not.toHaveBeenCalled();
  });

  it("shows guests that the party is over when the host leaves instead of starting another game", async () => {
    fetchSession
      .mockResolvedValueOnce(makeResponse({
        status: "finished",
        finishedAt: "2026-03-24T10:00:00Z",
      }, [
        {
          userId: "host-1",
          role: "host",
          status: "finished",
          score: 100,
          moves: 10,
          timeMs: 5000,
          moveSequence: null,
          finishedAt: "2026-03-24T10:00:00Z",
          nickname: "Host",
          placement: 1,
          disqualified: false,
        },
        {
          userId: "guest-1",
          role: "guest",
          status: "finished",
          score: 120,
          moves: 11,
          timeMs: 5200,
          moveSequence: null,
          finishedAt: "2026-03-24T10:00:01Z",
          nickname: "Guest",
          placement: 2,
          disqualified: false,
        },
      ], "guest-1"))
      .mockResolvedValueOnce({
        ...makeResponse({
          status: "finished",
          finishedAt: "2026-03-24T10:00:00Z",
          partyEndedAt: "2026-03-24T10:02:00Z",
        }, [
          {
            userId: "host-1",
            role: "host",
            status: "finished",
            score: 100,
            moves: 10,
            timeMs: 5000,
            moveSequence: null,
            finishedAt: "2026-03-24T10:00:00Z",
            nickname: "Host",
            placement: 1,
            disqualified: false,
          },
          {
            userId: "guest-1",
            role: "guest",
            status: "finished",
            score: 120,
            moves: 11,
            timeMs: 5200,
            moveSequence: null,
            finishedAt: "2026-03-24T10:00:01Z",
            nickname: "Guest",
            placement: 2,
          disqualified: false,
          },
        ]),
        currentUserId: "guest-1",
      });

    renderSessionRoom();

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(screen.getByText("Waiting for host to start the next game.")).toBeInTheDocument();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(screen.getByText("The host ended the party.")).toBeInTheDocument();
  });

  it("keeps polling a finished/disqualified player during gameplay and switches to session results once the match ends", async () => {
    fetchSession
      .mockResolvedValueOnce(makeResponse({
        status: "playing",
      }, [
        {
          userId: "host-1",
          role: "host",
          status: "finished",
          score: 120,
          moves: 1,
          timeMs: 3100,
          moveSequence: null,
          finishedAt: "2026-03-24T10:00:00Z",
          nickname: "Host",
          placement: null,
          disqualified: true,
        },
        {
          userId: "guest-1",
          role: "guest",
          status: "playing",
          score: null,
          moves: null,
          timeMs: null,
          moveSequence: null,
          finishedAt: null,
          nickname: "Guest",
          placement: null,
          disqualified: false,
        },
      ]))
      .mockResolvedValueOnce(makeResponse({
        status: "finished",
        finishedAt: "2026-03-24T10:00:05Z",
      }, [
        {
          userId: "host-1",
          role: "host",
          status: "finished",
          score: 120,
          moves: 1,
          timeMs: 3100,
          moveSequence: null,
          finishedAt: "2026-03-24T10:00:00Z",
          nickname: "Host",
          placement: 2,
          disqualified: true,
        },
        {
          userId: "guest-1",
          role: "guest",
          status: "finished",
          score: 100,
          moves: 5,
          timeMs: 2800,
          moveSequence: null,
          finishedAt: "2026-03-24T10:00:05Z",
          nickname: "Guest",
          placement: 1,
          disqualified: false,
        },
      ]));

    renderSessionRoom();

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(screen.getByText("Session Results")).toBeInTheDocument();
    expect(screen.getByText("Guest")).toBeInTheDocument();
    expect(fetchSession).toHaveBeenCalledWith("session-1");
  });

  it("uses realtime hints to refresh, then redirects from the fetched nextSessionId", async () => {
    let onHint: ((event?: string, payload?: Record<string, unknown>) => void) | undefined;
    useGameSession.mockImplementation((_sessionId: string | null, _selfUserId: string | null, hint: typeof onHint) => {
      onHint = hint;
      return {
        progressByUser: {},
        onlineSet: new Set<string>(),
        broadcast: vi.fn().mockResolvedValue(undefined),
        broadcastProgress: vi.fn().mockResolvedValue(undefined),
      };
    });

    fetchSession
      .mockResolvedValueOnce(makeResponse({
        status: "finished",
        finishedAt: "2026-03-24T10:00:00Z",
      }))
      .mockResolvedValueOnce(makeResponse({
        status: "finished",
        finishedAt: "2026-03-24T10:00:00Z",
        nextSessionId: "session-2",
      }))
      .mockResolvedValueOnce(makeResponse({
        id: "session-2",
        inviteCode: "next123",
      }));

    renderSessionRoom();

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    await act(async () => {
      await onHint?.("next_game_created", { nextSessionId: "session-2" });
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(fetchSession).toHaveBeenCalledWith("session-1");
    expect(fetchSession).toHaveBeenCalledWith("session-2");
    expect(screen.getByTestId("location")).toHaveTextContent("/session/session-2");
    expect(joinSession).not.toHaveBeenCalled();
  });
});
