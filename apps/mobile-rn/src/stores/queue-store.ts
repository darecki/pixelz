import { create } from "zustand";
import { getPendingQueueCount } from "../lib/db";

type QueueState = {
  pendingCount: number;
  setPendingCount: (count: number) => void;
  refreshPendingCount: () => Promise<void>;
};

export const useQueueStore = create<QueueState>((set) => ({
  pendingCount: 0,
  setPendingCount: (pendingCount) => set({ pendingCount }),
  refreshPendingCount: async () => {
    const pendingCount = await getPendingQueueCount();
    set({ pendingCount });
  },
}));
