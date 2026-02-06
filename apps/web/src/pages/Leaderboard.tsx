import { useState, useEffect, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { REFLEX_LEVEL_IDS } from "@pixelz/shared";
import { fetchLeaderboard } from "../lib/api";
import { supabase } from "../lib/supabase";

function displayUser(e: { nickname: string | null; userId: string }) {
  return e.nickname ?? e.userId.slice(0, 8);
}

function formatTimestamp(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString(undefined, { dateStyle: "short", timeStyle: "short" });
}

const LEVEL_OPTIONS = [...REFLEX_LEVEL_IDS] as const;

export default function Leaderboard() {
  const [searchParams, setSearchParams] = useSearchParams();
  const levelId = (searchParams.get("level") ?? REFLEX_LEVEL_IDS[0]) as (typeof LEVEL_OPTIONS)[number];
  const effectiveLevel = (LEVEL_OPTIONS as readonly string[]).includes(levelId) ? levelId : REFLEX_LEVEL_IDS[0];
  const justFinished = searchParams.get("justFinished") === "1";

  const [data, setData] = useState<Awaited<ReturnType<typeof fetchLeaderboard>> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentUserEmail, setCurrentUserEmail] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    fetchLeaderboard(effectiveLevel)
      .then(setData)
      .catch((err) => setError(err instanceof Error ? err.message : "Failed"))
      .finally(() => setLoading(false));
  }, [effectiveLevel]);

  useEffect(() => {
    if (!justFinished) return;
    supabase.auth.getSession().then(({ data: { session } }) => {
      setCurrentUserEmail(session?.user?.email ?? null);
    });
  }, [justFinished]);

  function setLevelId(next: string) {
    setSearchParams(next ? { level: next } : {});
  }

  const highlightedRowKey = useMemo(() => {
    if (!data?.entries.length || !justFinished || !currentUserEmail) return null;
    const mine = data.entries.filter((e) => e.nickname === currentUserEmail);
    if (mine.length === 0) return null;
    const latest = mine.reduce((a, b) => (a.createdAt > b.createdAt ? a : b));
    return `${latest.userId}-${latest.createdAt}`;
  }, [data?.entries, justFinished, currentUserEmail]);

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
                {opt === "reflex_level_1" ? "10 rounds" : "15 rounds"}
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
