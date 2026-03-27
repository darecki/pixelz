import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { appendEvent } from "../../lib/eventLog";
import { performSync } from "../../lib/sync";
import { fetchBoard, fetchLeaderboard, STORAGE_KEYS } from "../../lib/api";
import { supabase } from "../../lib/supabase";
import PixelzReplayViewer from "../../components/PixelzReplayViewer";
import SignInPrompt from "../../components/SignInPrompt";
import { computePixelzScore } from "@pixelz/shared";
import { generateGrid } from "./boardGenerator";
import { PIXELZ_COLORS } from "./constants";
import {
  formatPerformanceDelta,
  getLevelProgress,
  qualifiesForPrompt,
  getRivalChallengeSummary,
  getRivalIds,
  recordCompetitionResult,
  type RivalChallengeSummary,
  type GameId,
} from "../../lib/competition";

const KEYBOARD_KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "0"] as const;

type SessionGameProps = {
  seed: string;
  onComplete: (result: { moves: number; timeMs: number; moveSequence?: number[] }) => void | Promise<void>;
  onProgress?: (progress: { moves: number; timeMs: number }) => void;
};

type ResultInsight = {
  projectedRank: number | null;
  nextTarget: { moves: number; timeMs: number; rank: number } | null;
};

function applyFloodFill(grid: number[][], fromColor: number, toColor: number): { nextGrid: number[][]; changedKeys: string[] } {
  if (fromColor === toColor) return { nextGrid: grid, changedKeys: [] };
  const height = grid.length;
  const width = grid[0].length;
  const next = grid.map((row) => row.slice());
  const changedKeys: string[] = [];
  const stack: [number, number][] = [[0, 0]];
  if (next[0][0] !== fromColor) return { nextGrid: next, changedKeys };
  next[0][0] = toColor;
  changedKeys.push("0-0");
  while (stack.length > 0) {
    const [x, y] = stack.pop()!;
    for (const [dx, dy] of [
      [0, -1],
      [1, 0],
      [0, 1],
      [-1, 0],
    ]) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx >= 0 && nx < width && ny >= 0 && ny < height && next[ny][nx] === fromColor) {
        next[ny][nx] = toColor;
        changedKeys.push(`${ny}-${nx}`);
        stack.push([nx, ny]);
      }
    }
  }
  return { nextGrid: next, changedKeys };
}

function isFilled(grid: number[][]): boolean {
  const c = grid[0][0];
  return grid.flat().every((v) => v === c);
}

export default function PixelzGame({ levelId, sessionProps }: { levelId: string; sessionProps?: SessionGameProps }) {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [board, setBoard] = useState<Awaited<ReturnType<typeof fetchBoard>> | null>(null);
  const [grid, setGrid] = useState<number[][] | null>(null);
  const [numColors, setNumColors] = useState(5);
  const [moves, setMoves] = useState(0);
  const [moveSequence, setMoveSequence] = useState<number[]>([]);
  const [startTime, setStartTime] = useState<number | null>(null);
  const [won, setWon] = useState(false);
  const [timeMs, setTimeMs] = useState(0);
  const [saving, setSaving] = useState(false);
  const [sessionFinishError, setSessionFinishError] = useState<string | null>(null);
  const [showSignInPrompt, setShowSignInPrompt] = useState(false);
  const [promptRank, setPromptRank] = useState(0);
  const [recentlyChanged, setRecentlyChanged] = useState<Set<string>>(() => new Set());
  const [resultInsight, setResultInsight] = useState<ResultInsight>({ projectedRank: null, nextTarget: null });
  const [levelProgress, setLevelProgress] = useState(() => getLevelProgress("pixelz", levelId));
  const [lastResultWasBest, setLastResultWasBest] = useState<boolean | null>(null);
  const [rivalInsight, setRivalInsight] = useState<RivalChallengeSummary | null>(null);
  const [showReplay, setShowReplay] = useState(false);
  const scoreSubmittedRef = useRef(false);
  const pendingScoreRef = useRef<{ score: number; moves: number; timeMs: number; moveSequence: number[] } | null>(null);
  const pendingSessionResultRef = useRef<{ moves: number; timeMs: number; moveSequence?: number[] } | null>(null);

  const personalBest = useMemo(() => (
    levelProgress ? { moves: levelProgress.bestMoves, timeMs: levelProgress.bestTimeMs } : null
  ), [levelProgress]);
  const livePaceText = personalBest
    ? moves < personalBest.moves
      ? `${personalBest.moves - moves} moves in hand vs PB`
      : moves === personalBest.moves
        ? "Even with your PB move pace"
        : `${moves - personalBest.moves} moves behind PB pace`
    : null;

  const submitSessionCompletion = useCallback(async () => {
    if (!sessionProps?.onComplete || !pendingSessionResultRef.current) return;
    setSaving(true);
    setSessionFinishError(null);
    try {
      await sessionProps.onComplete(pendingSessionResultRef.current);
      setWon(true);
    } catch (err) {
      setSessionFinishError(err instanceof Error ? err.message : "Failed to submit result. Please retry.");
    } finally {
      setSaving(false);
    }
  }, [sessionProps]);

  useEffect(() => {
    sessionStorage.removeItem("pixelz_pending_score");
    let cancelled = false;
    scoreSubmittedRef.current = false;
    pendingSessionResultRef.current = null;
    setSessionFinishError(null);
    setLoading(true);
    setError(null);
    setBoard(null);
    setLevelProgress(getLevelProgress("pixelz", levelId));
    setRecentlyChanged(new Set());
    setResultInsight({ projectedRank: null, nextTarget: null });
    setLastResultWasBest(null);
    setRivalInsight(null);
    setShowReplay(false);
    fetchBoard(levelId)
      .then((board) => {
        if (cancelled) return;
        const g = generateGrid(board.width, board.height, board.numColors, board.seed);
        setBoard(board);
        setGrid(g);
        setNumColors(board.numColors);
        setMoves(0);
        setMoveSequence([]);
        setStartTime(null);
        setWon(false);
        setTimeMs(0);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load board");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [levelId]);

  useEffect(() => {
    if (recentlyChanged.size === 0) return;
    const id = window.setTimeout(() => setRecentlyChanged(new Set()), 180);
    return () => window.clearTimeout(id);
  }, [recentlyChanged]);

  const hydrateResultInsight = useCallback(async (finalMoves: number, elapsed: number) => {
    const leaderboard = await fetchLeaderboard(levelId).catch(() => null);
    if (!leaderboard) return;
    const nextRankIndex = leaderboard.entries.findIndex((entry) => (
      finalMoves < entry.moves || (finalMoves === entry.moves && elapsed < entry.timeMs)
    ));
    const projectedRank = nextRankIndex === -1 ? leaderboard.entries.length + 1 : nextRankIndex + 1;
    const nextTarget = projectedRank > 1 ? leaderboard.entries[projectedRank - 2] : null;
    setResultInsight({
      projectedRank,
      nextTarget: nextTarget ? { moves: nextTarget.moves, timeMs: nextTarget.timeMs, rank: nextTarget.rank } : null,
    });
    setRivalInsight(
      getRivalChallengeSummary(
        "pixelz",
        { moves: finalMoves, timeMs: elapsed },
        leaderboard.entries,
        getRivalIds(),
        leaderboard.currentUserId
      )
    );
  }, [levelId]);

  const handleColorClick = useCallback(
    (colorIndex: number) => {
      if (!grid || won || scoreSubmittedRef.current) return;
      const currentColor = grid[0][0];
      if (colorIndex === currentColor) return;
      const start = startTime ?? Date.now();
      if (startTime === null) setStartTime(start);
      const { nextGrid, changedKeys } = applyFloodFill(grid, currentColor, colorIndex);
      setGrid(nextGrid);
      setRecentlyChanged(new Set(changedKeys));
      const nextMoves = moves + 1;
      setMoves(nextMoves);
      setMoveSequence((seq) => [...seq, colorIndex]);
      const elapsedNow = Math.floor(Date.now() - start);
      sessionProps?.onProgress?.({ moves: nextMoves, timeMs: elapsedNow });
      if (isFilled(nextGrid)) {
        if (scoreSubmittedRef.current) return;
        scoreSubmittedRef.current = true;
        const elapsed = Math.floor(Date.now() - start);
        setTimeMs(elapsed);
        const finalMoves = moves + 1;
        const seq = [...moveSequence, colorIndex];
        const score = computePixelzScore(finalMoves, elapsed);
        const dailyChallenge = searchParams.get("daily") === "1";
        const recorded = recordCompetitionResult({
          gameId: "pixelz" satisfies GameId,
          levelId,
          moves: finalMoves,
          timeMs: elapsed,
          dailyChallenge,
        });
        setLevelProgress(recorded.current);
        setLastResultWasBest(recorded.isNewBest);
        hydrateResultInsight(finalMoves, elapsed).catch(() => {});

        if (sessionProps?.onComplete) {
          pendingSessionResultRef.current = { moves: finalMoves, timeMs: elapsed, moveSequence: seq };
          submitSessionCompletion().catch(() => {});
          return;
        }

        const checkAuthAndPrompt = async () => {
          const { data: { session } } = await supabase.auth.getSession();

          if (session?.access_token) {
            appendEvent({
              type: "LEVEL_COMPLETED",
              payload: {
                levelId,
                score,
                moves: finalMoves,
                timeMs: elapsed,
                moveSequence: seq,
              },
            });
            setSaving(true);
            performSync()
              .catch(() => {})
              .finally(() => {
                setSaving(false);
                setWon(true);
              });
          } else {
            const dontRemind = localStorage.getItem(STORAGE_KEYS.dontRemindSignin) === "true";
            if (dontRemind) {
              setWon(true);
              return;
            }

            try {
              const leaderboard = await fetchLeaderboard(levelId);
              const entries = leaderboard.entries;
              let rank = entries.length + 1;

              for (let i = 0; i < entries.length; i++) {
                const entry = entries[i];
                if (finalMoves < entry.moves || (finalMoves === entry.moves && elapsed < entry.timeMs)) {
                  rank = i + 1;
                  break;
                }
              }

              if (qualifiesForPrompt(rank, entries.length)) {
                pendingScoreRef.current = { score, moves: finalMoves, timeMs: elapsed, moveSequence: seq };
                setPromptRank(rank);
                setShowSignInPrompt(true);
              } else {
                setWon(true);
              }
            } catch {
              setWon(true);
            }
          }
        };

        checkAuthAndPrompt();
      }
    },
    [grid, won, startTime, moves, moveSequence, levelId, sessionProps, submitSessionCompletion, searchParams, hydrateResultInsight]
  );

  useEffect(() => {
    if (won || loading || !grid) return;
    function handleKeyDown(e: KeyboardEvent) {
      const keyIndex = KEYBOARD_KEYS.indexOf(e.key as (typeof KEYBOARD_KEYS)[number]);
      if (keyIndex >= 0 && keyIndex < numColors) {
        e.preventDefault();
        handleColorClick(keyIndex);
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [won, loading, grid, numColors, handleColorClick]);

  if (loading) {
    return (
      <div className="game-container">
        <p className="loading-text">Loading board…</p>
      </div>
    );
  }
  if (error) {
    return (
      <div className="game-container">
        <p className="text-error mb-md">{error}</p>
        <button type="button" onClick={() => navigate("/")} className="btn">Home</button>
      </div>
    );
  }
  if (!grid) return null;

  const cellSize = Math.min(36, Math.floor(320 / grid[0].length), Math.floor(400 / grid.length));

  if (won) {
    return (
      <div className="game-container game-result">
        <div className="game-result-stack">
          <span className={`status-pill ${lastResultWasBest ? "status-pill--success" : ""}`}>
            {lastResultWasBest ? "New personal best" : "Run complete"}
          </span>
          <h2>Done!</h2>
          <p className="game-result-stats">
            Moves: <strong>{moves}</strong> · Time: <strong>{(timeMs / 1000).toFixed(2)}s</strong>
          </p>
          <p className="text-secondary">
            {personalBest
              ? lastResultWasBest
                ? "You beat your previous best and set the new target."
                : moves === personalBest.moves && timeMs === personalBest.timeMs
                  ? "You matched your PB exactly. A cleaner move count or faster finish takes the next step."
                  : `You finished ${formatPerformanceDelta("pixelz", { moves, timeMs }, personalBest)} than your PB.`
              : "First result on this board. Set the tone and build a benchmark."}
          </p>
          <div className="metric-chip-row">
            <div className="metric-chip">
              <span>Projected rank</span>
              <strong>{resultInsight.projectedRank ? `#${resultInsight.projectedRank}` : "Pending"}</strong>
            </div>
            <div className="metric-chip">
              <span>Next target</span>
              <strong>
                {resultInsight.nextTarget
                  ? `#${resultInsight.nextTarget.rank} · ${formatPerformanceDelta("pixelz", { moves, timeMs }, resultInsight.nextTarget)}`
                  : "You’re leading this slice"}
              </strong>
            </div>
            {rivalInsight && (
              <div className="metric-chip">
                <span>Rival race</span>
                <strong>{rivalInsight.chipText}</strong>
              </div>
            )}
          </div>
          {rivalInsight && <p className="text-muted text-sm">{rivalInsight.message}</p>}
        </div>
        {saving && <p className="loading-text text-sm">Saving…</p>}
        <div className="game-result-actions">
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="btn btn-primary"
            disabled={saving}
          >
            {lastResultWasBest ? "Defend your PB" : "Beat your PB"}
          </button>
          <button
            type="button"
            onClick={() => navigate(`/leaderboard?game=pixelz&level=${encodeURIComponent(levelId)}&justFinished=1`)}
            className="btn"
            disabled={saving}
          >
            View ranking
          </button>
          <button
            type="button"
            onClick={(e) => {
              const url = typeof window !== "undefined" ? `${window.location.origin}/play?game=pixelz&level=${encodeURIComponent(levelId)}` : "";
              if (navigator?.clipboard?.writeText) {
                try {
                  navigator.clipboard.writeText(url).catch(() => {});
                } catch {
                  // Ignore clipboard write failures in unsupported contexts.
                }
              }
              const btn = e.currentTarget;
              const original = btn.innerText;
              btn.innerText = "Copied!";
              setTimeout(() => {
                btn.innerText = original;
              }, 2000);
            }}
            className="btn"
            disabled={saving}
          >
            Challenge a friend
          </button>
          {board && moveSequence.length > 0 && (
            <button type="button" onClick={() => setShowReplay((current) => !current)} className="btn" disabled={saving}>
              {showReplay ? "Hide replay" : "Watch solve replay"}
            </button>
          )}
          <button type="button" onClick={() => navigate("/")} className="btn btn-ghost" disabled={saving}>
            Home
          </button>
        </div>
        {showReplay && board && moveSequence.length > 0 && (
          <PixelzReplayViewer
            board={board}
            moveSequence={moveSequence}
            title="Your solve replay"
            subtitle={`This replays the ${moveSequence.length}-move solve you just made on this board.`}
          />
        )}
      </div>
    );
  }

  if (sessionProps && scoreSubmittedRef.current && !won) {
    return (
      <div className="game-container game-result">
        <h2>Submitting result…</h2>
        <p className="game-result-stats">
          Moves: <strong>{moves}</strong> · Time: <strong>{(timeMs / 1000).toFixed(2)}s</strong>
        </p>
        {saving ? (
          <p className="loading-text">Saving…</p>
        ) : (
          <p className="text-error">{sessionFinishError ?? "Could not submit your result."}</p>
        )}
        <div className="game-result-actions">
          <button type="button" disabled={saving} onClick={() => submitSessionCompletion().catch(() => {})} className="btn btn-primary">
            Retry submit
          </button>
          <button type="button" disabled={saving} onClick={() => navigate("/")} className="btn btn-ghost">
            Leave
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="game-container">
      <div className="game-header">
        <span className={`status-pill ${searchParams.get("daily") === "1" ? "status-pill--success" : ""}`}>
          {searchParams.get("daily") === "1" ? "Daily challenge" : "Solo run"}
        </span>
        <h2 className="game-title">Pixelz</h2>
        <p className="game-stats">
          Moves: <strong>{moves}</strong>
          {startTime != null && <> · <strong>{((Date.now() - startTime) / 1000).toFixed(1)}s</strong></>}
        </p>
        <div className="game-info-strip">
          <div className="metric-chip">
            <span>Target PB</span>
            <strong>{personalBest ? `${personalBest.moves} moves · ${(personalBest.timeMs / 1000).toFixed(2)}s` : "Set your first one"}</strong>
          </div>
          <div className="metric-chip">
            <span>Pace</span>
            <strong>{livePaceText ?? "Open with a clean first move"}</strong>
          </div>
        </div>
      </div>

      <div className="game-board">
        <div
          style={{
            display: "grid",
            gridTemplateColumns: `repeat(${grid[0].length}, ${cellSize}px)`,
            gap: 1,
          }}
        >
          {grid.flatMap((row, y) =>
            row.map((colorIndex, x) => (
              <div
                key={`${y}-${x}`}
                className={`pixelz-cell ${recentlyChanged.has(`${y}-${x}`) ? "pixelz-cell--pulse" : ""}`}
                style={{
                  width: cellSize,
                  height: cellSize,
                  backgroundColor: PIXELZ_COLORS[colorIndex],
                  borderRadius: "var(--game-cell-radius)",
                }}
              />
            ))
          )}
        </div>
      </div>
      <div className="color-btn-row">
        {PIXELZ_COLORS.slice(0, numColors).map((hex, i) => (
          <button
            key={i}
            type="button"
            onClick={() => handleColorClick(i)}
            className="color-btn"
            style={{ backgroundColor: hex }}
            aria-label={`Color ${i + 1}`}
          />
        ))}
      </div>
      {showSignInPrompt && (
        <SignInPrompt
          rank={promptRank}
          onSignIn={() => {
            const score = pendingScoreRef.current;
            if (score) {
              sessionStorage.setItem(
                "pixelz_pending_score",
                JSON.stringify({ levelId, ...score })
              );
            }
            const redirect = `/leaderboard?${new URLSearchParams({
              game: "pixelz",
              level: levelId,
              justFinished: "1",
            }).toString()}`;
            navigate(`/login?${new URLSearchParams({ redirect }).toString()}`);
          }}
          onSkip={() => {
            setShowSignInPrompt(false);
            setWon(true);
          }}
        />
      )}
    </div>
  );
}
