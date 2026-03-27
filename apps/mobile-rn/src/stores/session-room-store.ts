import { create } from "zustand";

type SessionProgress = Record<string, { moves: number; timeMs: number }>;

type SessionRoomState = {
  sessionId: string | null;
  progressByUser: SessionProgress;
  onlineIds: string[];
  beginSessionState: (sessionId: string) => void;
  resetSessionState: () => void;
  setOnlineIds: (onlineIds: string[]) => void;
  upsertProgress: (userId: string, progress: { moves: number; timeMs: number }) => void;
};

export const useSessionRoomStore = create<SessionRoomState>((set) => ({
  sessionId: null,
  progressByUser: {},
  onlineIds: [],
  beginSessionState: (sessionId) => set({ sessionId, progressByUser: {}, onlineIds: [] }),
  resetSessionState: () => set({ sessionId: null, progressByUser: {}, onlineIds: [] }),
  setOnlineIds: (onlineIds) => set({ onlineIds }),
  upsertProgress: (userId, progress) =>
    set((state) => ({
      progressByUser: {
        ...state.progressByUser,
        [userId]: progress,
      },
    })),
}));
