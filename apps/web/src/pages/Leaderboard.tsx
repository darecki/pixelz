import { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { fetchLeaderboard } from "../lib/api";

const LEVEL_OPTIONS = ["level_1", "random"] as const;

export default function Leaderboard() {
  const [searchParams, setSearchParams] = useSearchParams();
  const levelId = (searchParams.get("level") ?? "level_1") as (typeof LEVEL_OPTIONS)[number];
  const effectiveLevel = LEVEL_OPTIONS.includes(levelId) ? levelId : "level_1";

  const [data, setData] = useState<Awaited<ReturnType<typeof fetchLeaderboard>> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    fetchLeaderboard(effectiveLevel)
      .then(setData)
      .catch((err) => setError(err instanceof Error ? err.message : "Failed"))
      .finally(() => setLoading(false));
  }, [effectiveLevel]);

  function setLevelId(next: string) {
    setSearchParams(next ? { level: next } : {});
  }

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
                {opt}
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
            <th style={{ textAlign: "right", padding: "0.5rem" }}>Score</th>
            <th style={{ textAlign: "right", padding: "0.5rem" }}>Moves</th>
            <th style={{ textAlign: "right", padding: "0.5rem" }}>Time (ms)</th>
          </tr>
        </thead>
        <tbody>
          {data.entries.length === 0 ? (
            <tr>
              <td colSpan={5} style={{ padding: "1rem", color: "#666" }}>
                No entries yet.
              </td>
            </tr>
          ) : (
            data.entries.map((e) => (
              <tr key={e.userId + e.score + e.timeMs}>
                <td style={{ padding: "0.5rem" }}>{e.rank}</td>
                <td style={{ padding: "0.5rem" }}>{e.nickname ?? e.userId.slice(0, 8)}</td>
                <td style={{ textAlign: "right", padding: "0.5rem" }}>{e.score}</td>
                <td style={{ textAlign: "right", padding: "0.5rem" }}>{e.moves}</td>
                <td style={{ textAlign: "right", padding: "0.5rem" }}>{e.timeMs}</td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
