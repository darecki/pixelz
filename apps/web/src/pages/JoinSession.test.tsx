import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import JoinSession from "./JoinSession";
import type { SessionInvitePreview } from "../lib/api";

const { fetchSessionInvite, joinSession, removeChannel, send, subscribe, channel } = vi.hoisted(() => {
  const fetchSessionInvite = vi.fn();
  const joinSession = vi.fn();
  const removeChannel = vi.fn();
  const send = vi.fn();
  const subscribe = vi.fn();
  const channel = vi.fn(() => ({
    subscribe,
    send,
  }));

  return {
    fetchSessionInvite,
    joinSession,
    removeChannel,
    send,
    subscribe,
    channel,
  };
});

vi.mock("../lib/api", async () => {
  const actual = await vi.importActual<typeof import("../lib/api")>("../lib/api");
  return {
    ...actual,
    fetchSessionInvite,
    joinSession,
  };
});

vi.mock("../lib/supabase", () => ({
  supabase: {
    channel,
    removeChannel,
  },
}));

describe("JoinSession", () => {
  const preview: SessionInvitePreview = {
    sessionId: "session-1",
    game: "reflex",
    levelId: "reflex_level_0",
    settings: { rounds: 10 },
    status: "waiting",
    maxPlayers: 2,
    hostNickname: "Host",
  };

  beforeEach(() => {
    vi.clearAllMocks();
    fetchSessionInvite.mockResolvedValue(preview);
    joinSession.mockResolvedValue(undefined);
    send.mockResolvedValue(undefined);
    removeChannel.mockResolvedValue(undefined);
    subscribe.mockImplementation(() => ({ unsubscribe: vi.fn() }));
  });

  it("navigates to the session room after a successful join even if realtime never subscribes", async () => {
    const user = userEvent.setup();

    render(
      <MemoryRouter initialEntries={["/join/abc123"]}>
        <Routes>
          <Route path="/join/:inviteCode" element={<JoinSession />} />
          <Route path="/session/:sessionId" element={<div>Session room loaded</div>} />
        </Routes>
      </MemoryRouter>
    );

    expect(await screen.findByText("Game Invite")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /join game/i }));

    await waitFor(() => {
      expect(screen.getByText("Session room loaded")).toBeInTheDocument();
    });
    expect(screen.queryByRole("button", { name: /joining/i })).not.toBeInTheDocument();
  });
});
