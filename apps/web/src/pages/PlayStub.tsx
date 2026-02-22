import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { computeScore } from "@pixelz/shared";
import { appendEvent } from "../lib/eventLog";
import { performSync, trySyncInBackground } from "../lib/sync";

export default function PlayStub({
  levelId,
  seed,
}: {
  levelId: string;
  seed: string | null;
}) {
  const navigate = useNavigate();
  const [moves, setMoves] = useState(0);
  const [timeMs, setTimeMs] = useState(0);
  const [started, setStarted] = useState(false);
  const [completed, setCompleted] = useState(false);
  const [finalScore, setFinalScore] = useState<number | null>(null);
  const [syncing, setSyncing] = useState(false);
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
    trySyncInBackground();
  }

  const isRandom = seed != null && seed !== "";
  const leaderboardLevel = isRandom ? "random" : levelId;

  async function handleSyncAndViewLeaderboard() {
    setSyncing(true);
    try {
      await performSync();
    } catch {
      // Still navigate; user can sync from Home
    } finally {
      setSyncing(false);
    }
    navigate(`/leaderboard?level=${encodeURIComponent(leaderboardLevel)}`);
  }

  return (
    <div className="page-container page-container--narrow">
      <h2 className="mb-md">{isRandom ? `Random (seed: ${seed})` : `Level: ${levelId}`}</h2>

      {!started ? (
        <div>
          <p className="text-secondary mb-md">Complete the level in as few moves as possible. Timer starts when you click Start.</p>
          <button type="button" onClick={start} className="btn btn-primary btn-lg">
            Start
          </button>
        </div>
      ) : !completed ? (
        <div>
          <p className="game-stats mb-md">
            Moves: <strong>{moves}</strong> &nbsp; Time: <strong>{(timeMs / 1000).toFixed(1)}s</strong>
          </p>
          <div className="flex gap-sm">
            <button type="button" onClick={makeMove} className="btn">
              Move (+1)
            </button>
            <button type="button" onClick={finish} className="btn btn-primary">
              Complete
            </button>
          </div>
        </div>
      ) : (
        <div className="game-result">
          <p style={{ fontSize: "1.25rem" }} className="mb-sm">
            <strong>Score: {finalScore}</strong> (moves: {moves}, time: {(timeMs / 1000).toFixed(1)}s)
          </p>
          <p className="text-muted mb-md">
            Result saved offline. Sync to upload your score to the leaderboard.
          </p>
          <div className="game-result-actions">
            <button
              type="button"
              onClick={handleSyncAndViewLeaderboard}
              disabled={syncing}
              className="btn btn-primary"
            >
              {syncing ? "Syncing…" : "Sync and view leaderboard"}
            </button>
            <button
              type="button"
              onClick={() => navigate(`/leaderboard?level=${encodeURIComponent(leaderboardLevel)}`)}
              className="btn"
            >
              View leaderboard
            </button>
            <button type="button" onClick={start} className="btn">
              Play again
            </button>
            <button type="button" onClick={() => navigate("/")} className="btn btn-ghost">
              Home
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
