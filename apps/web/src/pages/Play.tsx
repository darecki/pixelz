import { useState, useEffect, useRef } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { computeScore } from "@pixelz/shared";
import { appendEvent } from "../lib/eventLog";

export default function Play() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const levelId = searchParams.get("level") ?? "level_1";
  const seed = searchParams.get("seed");

  const [moves, setMoves] = useState(0);
  const [timeMs, setTimeMs] = useState(0);
  const [started, setStarted] = useState(false);
  const [completed, setCompleted] = useState(false);
  const [finalScore, setFinalScore] = useState<number | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startTimeRef = useRef<number>(0);

  useEffect(() => {
    if (!started || completed) return;
    intervalRef.current = setInterval(() => {
      setTimeMs(Math.floor(Date.now() - startTimeRef.current));
    }, 100);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [started, completed]);

  function start() {
    startTimeRef.current = Date.now();
    setTimeMs(0);
    setMoves(0);
    setCompleted(false);
    setFinalScore(null);
    setStarted(true);
  }

  function makeMove() {
    if (!started || completed) return;
    setMoves((m) => m + 1);
  }

  function finish() {
    if (!started || completed) return;
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    const elapsed = Math.floor(Date.now() - startTimeRef.current);
    const score = computeScore(moves, elapsed);
    setTimeMs(elapsed);
    setFinalScore(score);
    setCompleted(true);

    const payload = { score, moves, timeMs: elapsed };
    if (seed) {
      appendEvent({
        type: "RANDOM_LEVEL_PLAYED",
        payload: { seed, ...payload },
      });
    } else {
      appendEvent({
        type: "LEVEL_COMPLETED",
        payload: { levelId, ...payload },
      });
    }
  }

  const isRandom = seed != null && seed !== "";

  return (
    <div style={{ padding: "1rem", maxWidth: 400, margin: "0 auto" }}>
      <h2>{isRandom ? `Random (seed: ${seed})` : `Level: ${levelId}`}</h2>

      {!started ? (
        <div>
          <p>Complete the level in as few moves as possible. Timer starts when you click Start.</p>
          <button type="button" onClick={start} style={{ padding: "0.5rem 1rem" }}>
            Start
          </button>
        </div>
      ) : !completed ? (
        <div>
          <p>
            <strong>Moves:</strong> {moves} &nbsp; <strong>Time:</strong> {(timeMs / 1000).toFixed(1)}s
          </p>
          <div style={{ display: "flex", gap: "0.5rem", marginTop: "1rem" }}>
            <button type="button" onClick={makeMove} style={{ padding: "0.5rem 1rem" }}>
              Move (+1)
            </button>
            <button type="button" onClick={finish} style={{ padding: "0.5rem 1rem" }}>
              Complete
            </button>
          </div>
        </div>
      ) : (
        <div>
          <p style={{ fontSize: "1.25rem" }}>
            <strong>Score: {finalScore}</strong> (moves: {moves}, time: {(timeMs / 1000).toFixed(1)}s)
          </p>
          <p style={{ color: "#666" }}>Result saved to offline log. Sync from Home to upload.</p>
          <div style={{ display: "flex", gap: "0.5rem", marginTop: "1rem" }}>
            <button type="button" onClick={() => navigate("/")} style={{ padding: "0.5rem 1rem" }}>
              Home
            </button>
            <button
              type="button"
              onClick={() => navigate("/leaderboard")}
              style={{ padding: "0.5rem 1rem" }}
            >
              Leaderboard
            </button>
            <button type="button" onClick={start} style={{ padding: "0.5rem 1rem" }}>
              Play again
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
