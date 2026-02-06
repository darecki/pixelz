import { useState, useEffect, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { REFLEX_LEVEL_IDS, REFLEX_LEVELS } from "@pixelz/shared";
import { fetchLeaderboard, createLeaderboardTimeoutSignal } from "../lib/api";
import { supabase } from "../lib/supabase";

function displayUser(e: { nickname: string | null; userId: string }) {
  return e.nickname ?? e.userId.slice(0, 8);
}

function formatTimestamp(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString(undefined, { dateStyle: "short", timeStyle: "short" });
}

const LEVEL_OPTIONS = [...REFLEX_LEVEL_IDS] as const;
const DEFAULT_LEVEL: (typeof REFLEX_LEVEL_IDS)[number] = "reflex_level_1";

export default function Leaderboard() {
  const [searchParams, setSearchParams] = useSearchParams();
  const levelId = (searchParams.get("level") ?? DEFAULT_LEVEL) as (typeof LEVEL_OPTIONS)[number];
  const effectiveLevel = (LEVEL_OPTIONS as readonly string[]).includes(levelId) ? levelId : DEFAULT_LEVEL;
  const justFinished = searchParams.get("justFinished") === "1";

  const [data, setData] = useState<Awaited<ReturnType<typeof fetchLeaderboard>> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Sync URL when level param is missing or invalid so dropdown and address bar match
  useEffect(() => {
    if (levelId !== effectiveLevel) {
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev);
        next.set("level", effectiveLevel);
        return next;
      });
    }
  }, [levelId, effectiveLevel, setSearchParams]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    const { signal, cleanup: cleanupTimeout } = createLeaderboardTimeoutSignal();
    const run = async () => {
      try {
        // Fetch without token first so the table appears immediately (getSession can hang)
        const result = await fetchLeaderboard(effectiveLevel, undefined, signal);
        cleanupTimeout();
        if (!cancelled) {
          setData(result);
          setLoading(false);
        }
        if (!cancelled && justFinished) {
          try {
            const token = (await supabase.auth.getSession()).data.session?.access_token ?? undefined;
            const withUser = await fetchLeaderboard(effectiveLevel, token);
            if (!cancelled) setData(withUser);
          } catch {
            // Already have data; highlight may be missing
          }
        }
      } catch (err) {
        cleanupTimeout();
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed");
          setLoading(false);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    run();
    return () => {
      cancelled = true;
      cleanupTimeout();
    };
  }, [effectiveLevel, justFinished]);

  function setLevelId(next: string) {
    setSearchParams(next ? { level: next } : {});
  }

  const highlightedRowKey = useMemo(() => {
    if (!data?.entries.length || !justFinished || !data.currentUserId) return null;
    const mine = data.entries.filter((e) => e.userId === data.currentUserId);
    if (mine.length === 0) return null;
    const latest = mine.reduce((a, b) => (a.createdAt > b.createdAt ? a : b));
    return `${latest.userId}-${latest.createdAt}`;
  }, [data?.entries, data?.currentUserId, justFinished]);

  if (loading) return <p>Loading leaderboard…</p>;
  if (error) return <p style={{ color: "#c00" }}>{error}</p>;
  if (!data) return null;

  return (
    <div>
      <div style={{ marginBottom: "1rem" }}>
        <label>
          Level:{" "}
          <select value={effectiveLevel} onChange={(e) => setLevelId(e.target.value)}>
            {LEVEL_OPTIONS.map((opt) => (
              <option key={opt} value={opt}>
                {REFLEX_LEVELS[opt as keyof typeof REFLEX_LEVELS] != null ? `${REFLEX_LEVELS[opt as keyof typeof REFLEX_LEVELS]} rounds` : opt}
              </option>
            ))}
          </select>
        </label>
      </div>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr>
            <th style={{ textAlign: "left", padding: "0.5rem" }}>Rank</th>
            <th style={{ textAlign: "left", padding: "0.5rem" }}>User</th>
            <th style={{ textAlign: "right", padding: "0.5rem" }}>Time (s)</th>
            <th style={{ textAlign: "left", padding: "0.5rem" }}>When</th>
          </tr>
        </thead>
        <tbody>
          {data.entries.length === 0 ? (
            <tr>
              <td colSpan={4} style={{ padding: "1rem", color: "#666" }}>
                No entries yet.
              </td>
            </tr>
          ) : (
            data.entries.map((e) => {
              const rowKey = `${e.userId}-${e.createdAt}`;
              const isHighlighted = highlightedRowKey === rowKey;
              return (
                <tr
                  key={rowKey}
                  style={
                    isHighlighted
                      ? { backgroundColor: "rgba(255, 220, 100, 0.35)" }
                      : undefined
                  }
                >
                  <td style={{ padding: "0.5rem" }}>{e.rank}</td>
                  <td style={{ padding: "0.5rem" }}>{displayUser(e)}</td>
                  <td style={{ textAlign: "right", padding: "0.5rem" }}>
                    {(e.timeMs / 1000).toFixed(2)}
                  </td>
                  <td style={{ padding: "0.5rem", fontSize: "0.9rem", color: "#666" }}>
                    {formatTimestamp(e.createdAt)}
                  </td>
                </tr>
              );
            })
          )}
        </tbody>
      </table>
    </div>
  );
}
