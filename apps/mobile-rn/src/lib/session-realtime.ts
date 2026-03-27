import { useEffect, useRef } from "react";
import { AppState } from "react-native";
import { supabase } from "./supabase";
import { useSessionRoomStore } from "../stores/session-room-store";

type ProgressPayload = { userId?: string; moves: number; timeMs: number };

export function useSessionRealtime(
  sessionId: string | null,
  selfUserId: string | null,
  onHint?: () => void
) {
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const beginSessionState = useSessionRoomStore((state) => state.beginSessionState);
  const resetSessionState = useSessionRoomStore((state) => state.resetSessionState);
  const setOnlineIds = useSessionRoomStore((state) => state.setOnlineIds);
  const upsertProgress = useSessionRoomStore((state) => state.upsertProgress);

  useEffect(() => {
    if (!sessionId) {
      resetSessionState();
      return;
    }

    beginSessionState(sessionId);
    const channel = supabase.channel(`session:${sessionId}`);
    channelRef.current = channel;

    channel
      .on("broadcast", { event: "progress_update" }, ({ payload }) => {
        const progress = (payload ?? {}) as ProgressPayload;
        if (!progress.userId || typeof progress.moves !== "number" || typeof progress.timeMs !== "number") {
          return;
        }
        upsertProgress(progress.userId, {
          moves: progress.moves,
          timeMs: progress.timeMs,
        });
      })
      .on("broadcast", { event: "*" }, ({ event }) => {
        if (event !== "progress_update") {
          onHint?.();
        }
      })
      .on("presence", { event: "sync" }, () => {
        const state = channel.presenceState<{ userId?: string }>();
        const onlineIds = Object.values(state)
          .flatMap((entries) => entries.map((entry) => entry.userId).filter(Boolean)) as string[];
        setOnlineIds(Array.from(new Set(onlineIds)));
      })
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          void channel.track({ userId: selfUserId ?? `anon-${Date.now()}` });
        }
      });

    const appStateSubscription = AppState.addEventListener("change", (state) => {
      if (state === "active") {
        onHint?.();
      }
    });

    return () => {
      appStateSubscription.remove();
      resetSessionState();
      void supabase.removeChannel(channel);
      if (channelRef.current === channel) {
        channelRef.current = null;
      }
    };
  }, [beginSessionState, onHint, resetSessionState, selfUserId, sessionId, setOnlineIds, upsertProgress]);

  async function broadcast(event: string, payload: Record<string, unknown>) {
    if (!channelRef.current) return;
    await channelRef.current.send({ type: "broadcast", event, payload });
  }

  async function broadcastProgress(progress: { moves: number; timeMs: number }) {
    await broadcast("progress_update", {
      userId: selfUserId,
      ...progress,
    });
  }

  return {
    broadcast,
    broadcastProgress,
  };
}
