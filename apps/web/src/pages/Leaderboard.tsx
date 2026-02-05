import { useState, useEffect } from "react";
import { fetchLeaderboard } from "../lib/api";

export default function Leaderboard() {
  const [levelId, setLevelId] = useState("level_1");
  const [data, setData] = useState<Awaited<ReturnType<typeof fetchLeaderboard>> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    fetchLeaderboard(levelId)
      .then(setData)
      .catch((err) => setError(err instanceof Error ? err.message : "Failed"))
      .finally(() => setLoading(false));
  }, [levelId]);

  if (loading) return <p>Loading leaderboard…</p>;
  if (error) return <p style={{ color: "#c00" }}>{error}</p>;
  if (!data) return null;

  return (
    <div>
      <div style={{ marginBottom: "1rem" }}>
        <label>
          Level:{" "}
          <select value={levelId} onChange={(e) => setLevelId(e.target.value)}>
            <option value="level_1">level_1</option>
            <option value="random">random</option>
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
