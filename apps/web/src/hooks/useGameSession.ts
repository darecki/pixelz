import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "../lib/supabase";

type ProgressPayload = { userId?: string; moves: number; timeMs: number };

export function useGameSession(sessionId: string | null, selfUserId: string | null, onHint: (event?: string, payload?: Record<string, unknown>) => void) {
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const [progressByUser, setProgressByUser] = useState<Record<string, { moves: number; timeMs: number }>>({});
  const [onlineIds, setOnlineIds] = useState<string[]>([]);

  useEffect(() => {
    if (!sessionId) return;
    const channel = supabase.channel(`session:${sessionId}`);
    channelRef.current = channel;

    channel
      .on("broadcast", { event: "progress_update" }, ({ payload }) => {
        const p = (payload ?? {}) as ProgressPayload;
        if (!p.userId || typeof p.moves !== "number" || typeof p.timeMs !== "number") return;
        setProgressByUser((prev) => ({ ...prev, [p.userId!]: { moves: p.moves, timeMs: p.timeMs } }));
      })
      .on("broadcast", { event: "*" }, ({ event, payload }) => {
        if (event !== "progress_update") onHint(event, payload);
      })
      .on("presence", { event: "sync" }, () => {
        const state = channel.presenceState<{ userId?: string }>();
        const ids = Object.values(state)
          .flatMap((entries) => entries.map((entry) => entry.userId).filter(Boolean)) as string[];
        setOnlineIds(Array.from(new Set(ids)));
      })
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          channel.track({ userId: selfUserId ?? `anon-${Math.random().toString(36).slice(2)}` }).catch(() => {});
        }
      });

    return () => {
      setProgressByUser({});
      setOnlineIds([]);
      void supabase.removeChannel(channel);
      if (channelRef.current === channel) channelRef.current = null;
    };
  }, [sessionId, selfUserId, onHint]);

  async function broadcast(event: string, payload: Record<string, unknown>) {
    if (!channelRef.current) return;
    await channelRef.current.send({ type: "broadcast", event, payload });
  }

  async function broadcastProgress(progress: { moves: number; timeMs: number }) {
    await broadcast("progress_update", { userId: selfUserId, ...progress });
  }

  const onlineSet = useMemo(() => new Set(onlineIds), [onlineIds]);

  return {
    progressByUser,
    onlineSet,
    broadcast,
    broadcastProgress,
  };
}
