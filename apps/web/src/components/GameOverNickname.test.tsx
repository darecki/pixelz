import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import GameOverNickname from "./GameOverNickname";
import { STORAGE_KEYS } from "../lib/api";

const appendEvent = vi.fn();
const getPendingEvents = vi.fn();
const removeFirstEvents = vi.fn();
const performSync = vi.fn();

vi.mock("../lib/eventLog", () => ({
  appendEvent: (...args: unknown[]) => appendEvent(...args),
  getPendingEvents: () => getPendingEvents(),
  removeFirstEvents: (n: number) => removeFirstEvents(n),
}));

vi.mock("../lib/sync", () => ({
  performSync: () => performSync(),
}));

describe("GameOverNickname", () => {
  const storage: Record<string, string> = {};

  beforeEach(() => {
    vi.clearAllMocks();
    for (const key of Object.keys(storage)) delete storage[key];
    Object.defineProperty(global, "localStorage", {
      value: {
        getItem: (key: string) => storage[key] ?? null,
        setItem: (key: string, value: string) => {
          storage[key] = value;
        },
        removeItem: (key: string) => {
          delete storage[key];
        },
        clear: () => {
          for (const k of Object.keys(storage)) delete storage[k];
        },
      },
      writable: true,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("reads nickname from localStorage on mount and shows it", async () => {
    storage[STORAGE_KEYS.nickname] = "Hello";
    render(<GameOverNickname />);
    await waitFor(() => {
      expect(screen.getByText(/Saved to leaderboard as/)).toBeInTheDocument();
    });
    expect(screen.getByText("Hello")).toBeInTheDocument();
  });

  it("shows ellipsis when localStorage nickname is empty", async () => {
    render(<GameOverNickname />);
    await waitFor(() => {
      expect(screen.getByText(/Saved to leaderboard as/)).toBeInTheDocument();
    });
    expect(screen.getByText("…")).toBeInTheDocument();
  });

  it("on successful update: persists nickname to localStorage and closes form", async () => {
    storage[STORAGE_KEYS.nickname] = "Hello";
    performSync.mockResolvedValueOnce({ accepted: 1, rejected: 0 });
    getPendingEvents.mockResolvedValue([]);

    const user = userEvent.setup();
    render(<GameOverNickname />);
    await waitFor(() => expect(screen.getByText("Hello")).toBeInTheDocument());

    await user.click(screen.getByRole("button", { name: /change/i }));
    await user.clear(screen.getByRole("textbox"));
    await user.type(screen.getByRole("textbox"), "player1");
    await user.click(screen.getByRole("button", { name: /update/i }));

    expect(appendEvent).toHaveBeenCalledWith({
      type: "UPDATE_LAST_SCORE_NICKNAME",
      payload: { nickname: "player1" },
    });
    expect(performSync).toHaveBeenCalled();

    await waitFor(() => {
      expect(storage[STORAGE_KEYS.nickname]).toBe("player1");
    });
    await waitFor(() => {
      expect(screen.getByText("player1")).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: /update/i })).not.toBeInTheDocument();
    });
  });

  it("on nickname_taken: does not persist rejected nickname and reverts display to previous", async () => {
    storage[STORAGE_KEYS.nickname] = "Hello";
    performSync.mockResolvedValueOnce({
      accepted: 0,
      rejected: 1,
      rejectedReasons: { "0": "nickname_taken" },
    });
    getPendingEvents.mockResolvedValue([{ type: "UPDATE_LAST_SCORE_NICKNAME", payload: { nickname: "darecki" } }]);

    const user = userEvent.setup();
    render(<GameOverNickname />);
    await waitFor(() => expect(screen.getByText("Hello")).toBeInTheDocument());

    await user.click(screen.getByRole("button", { name: /change/i }));
    const input = screen.getByRole("textbox");
    await user.clear(input);
    await user.type(input, "darecki");
    await user.click(screen.getByRole("button", { name: /update/i }));

    await waitFor(() => {
      expect(screen.getByText("Username already taken")).toBeInTheDocument();
    });
    expect(storage[STORAGE_KEYS.nickname]).toBe("Hello");
    expect(screen.getByText("Hello")).toBeInTheDocument();
    expect(removeFirstEvents).toHaveBeenCalledWith(1);
  });

  it("on nickname_taken when previous equals rejected (stale): clears storage and display", async () => {
    storage[STORAGE_KEYS.nickname] = "darecki";
    performSync.mockResolvedValueOnce({
      accepted: 0,
      rejected: 1,
      rejectedReasons: { "0": "nickname_taken" },
    });
    getPendingEvents.mockResolvedValue([{ type: "UPDATE_LAST_SCORE_NICKNAME", payload: { nickname: "darecki" } }]);

    const user = userEvent.setup();
    render(<GameOverNickname />);
    await waitFor(() => expect(screen.getByText("darecki")).toBeInTheDocument());

    await user.click(screen.getByRole("button", { name: /change/i }));
    await user.click(screen.getByRole("button", { name: /update/i }));

    await waitFor(() => {
      expect(screen.getByText("Username already taken")).toBeInTheDocument();
    });
    expect(storage[STORAGE_KEYS.nickname]).toBe("");
    expect(screen.getByText("…")).toBeInTheDocument();
    expect(removeFirstEvents).toHaveBeenCalledWith(1);
  });

  it("on sync throw: shows failed message and does not persist attempted nickname", async () => {
    storage[STORAGE_KEYS.nickname] = "Hello";
    performSync.mockRejectedValueOnce(new Error("Network error"));

    const user = userEvent.setup();
    render(<GameOverNickname />);
    await waitFor(() => expect(screen.getByText("Hello")).toBeInTheDocument());

    await user.click(screen.getByRole("button", { name: /change/i }));
    await user.type(screen.getByRole("textbox"), "newname");
    await user.click(screen.getByRole("button", { name: /update/i }));

    await waitFor(() => {
      expect(screen.getByText("Failed to save")).toBeInTheDocument();
    });
    expect(storage[STORAGE_KEYS.nickname]).toBe("Hello");
  });

  it("on nickname_taken with SET_NICKNAME first in queue: removes one event", async () => {
    storage[STORAGE_KEYS.nickname] = "Hi";
    performSync.mockResolvedValueOnce({
      accepted: 0,
      rejected: 1,
      rejectedReasons: { "0": "nickname_taken" },
    });
    getPendingEvents.mockResolvedValue([{ type: "SET_NICKNAME", payload: { nickname: "taken" } }]);

    const user = userEvent.setup();
    render(<GameOverNickname />);
    await waitFor(() => expect(screen.getByText("Hi")).toBeInTheDocument());
    await user.click(screen.getByRole("button", { name: /change/i }));
    await user.type(screen.getByRole("textbox"), "taken");
    await user.click(screen.getByRole("button", { name: /update/i }));

    await waitFor(() => {
      expect(removeFirstEvents).toHaveBeenCalledWith(1);
    });
  });

  it("does not persist nickname to localStorage before sync completes", async () => {
    storage[STORAGE_KEYS.nickname] = "Hello";
    let resolveSync: (v: unknown) => void;
    performSync.mockImplementation(() => new Promise((r) => { resolveSync = r; }));

    const user = userEvent.setup();
    render(<GameOverNickname />);
    await waitFor(() => expect(screen.getByText("Hello")).toBeInTheDocument());
    await user.click(screen.getByRole("button", { name: /change/i }));
    await user.clear(screen.getByRole("textbox"));
    await user.type(screen.getByRole("textbox"), "player2");
    await user.click(screen.getByRole("button", { name: /update/i }));

    expect(storage[STORAGE_KEYS.nickname]).toBe("Hello");
    resolveSync!({ accepted: 1, rejected: 0 });
    await waitFor(() => {
      expect(storage[STORAGE_KEYS.nickname]).toBe("player2");
    });
  });
});
