import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { appendEvent } from "../../lib/eventLog";
import { performSync } from "../../lib/sync";
import { fetchLeaderboard, STORAGE_KEYS } from "../../lib/api";
import { supabase } from "../../lib/supabase";
import GameOverNickname from "../../components/GameOverNickname";
import SignInPrompt from "../../components/SignInPrompt";
import {
  REFLEX_COLORS,
  COUNTDOWN_MS,
  DELAY_AFTER_CORRECT_MS,
  getRoundsForLevel,
} from "./constants";
import { useBeep } from "./useBeep";
import { hashString, mulberry32 } from "@pixelz/shared";
import {
  formatPerformanceDelta,
  getLevelProgress,
  qualifiesForPrompt,
  getRivalChallengeSummary,
  getRivalIds,
  recordCompetitionResult,
  type RivalChallengeSummary,
} from "../../lib/competition";

type Phase = "idle" | "countdown" | "reaction" | "delay" | "gameover" | "saving" | "finished" | "prompting" | "submitError";
type SessionGameProps = {
  seed: string;
  onComplete: (result: { moves: number; timeMs: number; disqualified?: boolean }) => void | Promise<void>;
  onProgress?: (progress: { moves: number; timeMs: number }) => void;
};

type ResultInsight = {
  projectedRank: number | null;
  nextTarget: { rank: number; timeMs: number } | null;
};

type GhostTarget = {
  label: string;
  timeMs: number;
};

const COUNTDOWN_STEPS = [3, 2, 1] as const;
const KEYBOARD_KEYS = ["q", "w", "e", "p"] as const;

export default function ReflexGame({ levelId, sessionProps }: { levelId: string; sessionProps?: SessionGameProps }) {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const totalRounds = getRoundsForLevel(levelId);
  const { shortBeep, longBeep } = useBeep();

  const [phase, setPhase] = useState<Phase>("idle");
  const [round, setRound] = useState(1);
  const [cumulativeTimeMs, setCumulativeTimeMs] = useState(0);
  const [countdownStep, setCountdownStep] = useState(0);
  const [targetColor, setTargetColor] = useState<string | null>(null);
  const [promptRank, setPromptRank] = useState(0);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [sessionOutcome, setSessionOutcome] = useState<"completed" | "disqualified" | null>(null);
  const [lastSplitMs, setLastSplitMs] = useState<number | null>(null);
  const [resultInsight, setResultInsight] = useState<ResultInsight>({ projectedRank: null, nextTarget: null });
  const [levelProgress, setLevelProgress] = useState(() => getLevelProgress("reflex", levelId));
  const [lastResultWasBest, setLastResultWasBest] = useState<boolean | null>(null);
  const [rivalInsight, setRivalInsight] = useState<RivalChallengeSummary | null>(null);
  const [ghostTarget, setGhostTarget] = useState<GhostTarget | null>(null);

  const reactionStartRef = useRef<number>(0);
  const countdownTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const delayTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const scoreSubmittedRef = useRef(false);
  const pendingScoreRef = useRef<{ moves: number; timeMs: number } | null>(null);
  const pendingSessionResultRef = useRef<{ moves: number; timeMs: number; disqualified?: boolean } | null>(null);
  const deterministicSequenceRef = useRef<string[]>([]);

  const personalBest = levelProgress ? { moves: levelProgress.bestMoves, timeMs: levelProgress.bestTimeMs } : null;
  const completedRounds =
    phase === "finished" || phase === "saving" || phase === "prompting" || phase === "submitError"
      ? totalRounds
      : Math.max(0, round - 1);
  const ghostTargetSplit = ghostTarget ? ghostTarget.timeMs / totalRounds : null;
  const ghostPaceText = (() => {
    if (!ghostTarget) return "Loading target pace";
    if (completedRounds === 0 || cumulativeTimeMs === 0) {
      return `Target split ${(ghostTargetSplit! / 1000).toFixed(2)}s`;
    }
    const expected = (ghostTarget.timeMs * completedRounds) / totalRounds;
    const diff = cumulativeTimeMs - expected;
    if (diff === 0) return `Dead even with ${ghostTarget.label}`;
    return diff < 0
      ? `${(Math.abs(diff) / 1000).toFixed(2)}s ahead of ${ghostTarget.label}`
      : `${(diff / 1000).toFixed(2)}s behind ${ghostTarget.label}`;
  })();

  const pickTargetColor = useCallback(
    (roundNumber: number) => {
      if (sessionProps?.seed) {
        if (deterministicSequenceRef.current.length === 0) {
          const rng = mulberry32(hashString(`${sessionProps.seed}-reflex`));
          deterministicSequenceRef.current = Array.from({ length: totalRounds }, () => {
            const index = Math.floor(rng() * REFLEX_COLORS.length);
            return REFLEX_COLORS[index];
          });
        }
        return deterministicSequenceRef.current[Math.max(0, roundNumber - 1)] ?? REFLEX_COLORS[0];
      }
      return REFLEX_COLORS[Math.floor(Math.random() * REFLEX_COLORS.length)];
    },
    [sessionProps?.seed, totalRounds]
  );

  useEffect(() => {
    sessionStorage.removeItem("pixelz_pending_score");
    scoreSubmittedRef.current = false;
    deterministicSequenceRef.current = [];
    const nextLevelProgress = getLevelProgress("reflex", levelId);
    setLevelProgress(nextLevelProgress);
    setResultInsight({ projectedRank: null, nextTarget: null });
    setLastResultWasBest(null);
    setLastSplitMs(null);
    setRivalInsight(null);
    setGhostTarget(nextLevelProgress ? { label: "PB ghost", timeMs: nextLevelProgress.bestTimeMs } : null);
    return () => {
      if (countdownTimerRef.current) clearTimeout(countdownTimerRef.current);
      if (delayTimerRef.current) clearTimeout(delayTimerRef.current);
    };
  }, [levelId]);

  useEffect(() => {
    if (personalBest) return;
    let cancelled = false;
    fetchLeaderboard(levelId)
      .then((leaderboard) => {
        if (cancelled) return;
        const leader = leaderboard.entries[0];
        if (leader) {
          setGhostTarget({ label: "Leaderboard ghost", timeMs: leader.timeMs });
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [levelId, personalBest]);

  function startGame() {
    scoreSubmittedRef.current = false;
    pendingSessionResultRef.current = null;
    setSubmitError(null);
    setSessionOutcome(null);
    setPhase("countdown");
    setRound(1);
    setCumulativeTimeMs(0);
    setCountdownStep(0);
    setTargetColor(null);
    setLastSplitMs(null);
  }

  const hydrateResultInsight = useCallback(async (finalTimeMs: number) => {
    const leaderboard = await fetchLeaderboard(levelId).catch(() => null);
    if (!leaderboard) return;
    const nextRankIndex = leaderboard.entries.findIndex((entry) => finalTimeMs < entry.timeMs);
    const projectedRank = nextRankIndex === -1 ? leaderboard.entries.length + 1 : nextRankIndex + 1;
    const nextTarget = projectedRank > 1 ? leaderboard.entries[projectedRank - 2] : null;
    setResultInsight({
      projectedRank,
      nextTarget: nextTarget ? { rank: nextTarget.rank, timeMs: nextTarget.timeMs } : null,
    });
    setRivalInsight(
      getRivalChallengeSummary(
        "reflex",
        { moves: totalRounds, timeMs: finalTimeMs },
        leaderboard.entries,
        getRivalIds(),
        leaderboard.currentUserId
      )
    );
  }, [levelId, totalRounds]);

  const submitSessionCompletion = useCallback(async () => {
    if (!sessionProps?.onComplete || !pendingSessionResultRef.current) return;
    setPhase("saving");
    setSubmitError(null);
    try {
      await sessionProps.onComplete(pendingSessionResultRef.current);
      setPhase("finished");
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Failed to submit result. Please retry.");
      setPhase("submitError");
    }
  }, [sessionProps]);

  useEffect(() => {
    if (phase !== "countdown") return;
    if (countdownStep >= COUNTDOWN_STEPS.length) {
      setPhase("reaction");
      setTargetColor(pickTargetColor(round));
      reactionStartRef.current = performance.now();
      longBeep();
      return;
    }
    shortBeep();
    countdownTimerRef.current = setTimeout(() => {
      setCountdownStep((s) => s + 1);
    }, COUNTDOWN_MS);
    return () => {
      if (countdownTimerRef.current) clearTimeout(countdownTimerRef.current);
    };
  }, [phase, countdownStep, pickTargetColor, shortBeep, longBeep, round]);

  const handleButtonClick = useCallback((clickedColor: string) => {
    if (phase !== "reaction" || !targetColor) return;
    if (scoreSubmittedRef.current) return;
    if (clickedColor !== targetColor) {
      if (sessionProps?.onComplete) {
        const finalTime = cumulativeTimeMs + Math.round(performance.now() - reactionStartRef.current);
        scoreSubmittedRef.current = true;
        pendingSessionResultRef.current = { moves: round - 1, timeMs: finalTime, disqualified: true };
        setSessionOutcome("disqualified");
        setCumulativeTimeMs(finalTime);
        submitSessionCompletion().catch(() => {});
        return;
      }
      setPhase("gameover");
      return;
    }
    const elapsed = Math.round(performance.now() - reactionStartRef.current);
    setLastSplitMs(elapsed);
    const newTotal = cumulativeTimeMs + elapsed;
    setCumulativeTimeMs(newTotal);
    sessionProps?.onProgress?.({ moves: round, timeMs: newTotal });
    if (round >= totalRounds) {
      if (scoreSubmittedRef.current) return;
      scoreSubmittedRef.current = true;
      setSessionOutcome("completed");

      const dailyChallenge = searchParams.get("daily") === "1";
      const recorded = recordCompetitionResult({
        gameId: "reflex",
        levelId,
        moves: totalRounds,
        timeMs: newTotal,
        dailyChallenge,
      });
      setLevelProgress(recorded.current);
      setLastResultWasBest(recorded.isNewBest);
      hydrateResultInsight(newTotal).catch(() => {});

      if (sessionProps?.onComplete) {
        pendingSessionResultRef.current = { moves: totalRounds, timeMs: newTotal };
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
              score: 0,
              moves: totalRounds,
              timeMs: newTotal,
            },
          });
          setPhase("saving");
          performSync()
            .catch(() => {})
            .finally(() => setPhase("finished"));
        } else {
          const dontRemind = localStorage.getItem(STORAGE_KEYS.dontRemindSignin) === "true";
          if (dontRemind) {
            setPhase("finished");
            return;
          }

          try {
            const leaderboard = await fetchLeaderboard(levelId);
            const entries = leaderboard.entries;
            let rank = entries.length + 1;

            for (let i = 0; i < entries.length; i++) {
              const entry = entries[i];
              if (newTotal < entry.timeMs) {
                rank = i + 1;
                break;
              }
            }

            if (qualifiesForPrompt(rank, entries.length)) {
              pendingScoreRef.current = { moves: totalRounds, timeMs: newTotal };
              setPromptRank(rank);
              setPhase("prompting");
            } else {
              setPhase("finished");
            }
          } catch {
            setPhase("finished");
          }
        }
      };

      checkAuthAndPrompt();
      return;
    }
    setPhase("delay");
    setRound((r) => r + 1);
    setTargetColor(null);
    delayTimerRef.current = setTimeout(() => {
      setPhase("countdown");
      setCountdownStep(0);
    }, DELAY_AFTER_CORRECT_MS);
  }, [
    cumulativeTimeMs,
    hydrateResultInsight,
    levelId,
    phase,
    round,
    searchParams,
    sessionProps,
    submitSessionCompletion,
    targetColor,
    totalRounds,
  ]);

  useEffect(() => {
    if (sessionProps && phase === "idle") {
      startGame();
    }
  }, [sessionProps, phase]);

  useEffect(() => {
    if (phase !== "reaction") return;
    function handleKeyDown(e: KeyboardEvent) {
      const keyIndex = KEYBOARD_KEYS.indexOf(e.key.toLowerCase() as (typeof KEYBOARD_KEYS)[number]);
      if (keyIndex >= 0 && keyIndex < REFLEX_COLORS.length) {
        e.preventDefault();
        handleButtonClick(REFLEX_COLORS[keyIndex]);
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleButtonClick, phase]);

  const isReacting = phase === "reaction";

  if (phase === "idle" && !sessionProps) {
    return (
      <div className="game-container" style={{ justifyContent: "center" }}>
        <span className={`status-pill ${searchParams.get("daily") === "1" ? "status-pill--success" : ""}`}>
          {searchParams.get("daily") === "1" ? "Daily challenge" : "Solo run"}
        </span>
        <h2 className="game-title">Reflex</h2>
        <p className="text-secondary text-center mb-md">
          {totalRounds} rounds. After the countdown, slam the button that matches the color.
        </p>
        <div className="game-info-strip mb-md">
          <div className="metric-chip">
            <span>Target PB</span>
            <strong>{personalBest ? `${(personalBest.timeMs / 1000).toFixed(2)}s` : "Set your first benchmark"}</strong>
          </div>
          <div className="metric-chip">
            <span>Ghost target</span>
            <strong>{ghostTarget ? `${ghostTarget.label} · ${(ghostTarget.timeMs / 1000).toFixed(2)}s` : "Finding pace"}</strong>
          </div>
          <div className="metric-chip">
            <span>Pressure</span>
            <strong>Miss once and the run is over</strong>
          </div>
        </div>
        <button type="button" onClick={startGame} className="btn btn-primary btn-lg">
          Start
        </button>
      </div>
    );
  }

  if (phase === "gameover") {
    return (
      <div className="game-container game-result" style={{ justifyContent: "center" }}>
        <span className="status-pill status-pill--danger">Run broken</span>
        <h2 style={{ color: "var(--color-error)" }}>Wrong color</h2>
        <p className="game-result-stats">
          You reached round <strong>{round}</strong> of {totalRounds}. Total time: <strong>{(cumulativeTimeMs / 1000).toFixed(2)}s</strong>
        </p>
        <p className="text-secondary">The next action is simple: reset fast and try to keep every split clean.</p>
        <div className="game-result-actions">
          <button type="button" onClick={startGame} className="btn btn-primary btn-lg">
            Retry immediately
          </button>
          <button type="button" onClick={() => navigate("/")} className="btn btn-ghost btn-lg">
            Home
          </button>
        </div>
      </div>
    );
  }

  if (phase === "prompting") {
    return (
      <div className="game-container" style={{ justifyContent: "center" }}>
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
              game: "reflex",
              level: levelId,
              justFinished: "1",
            }).toString()}`;
            navigate(`/login?${new URLSearchParams({ redirect }).toString()}`);
          }}
          onSkip={() => {
            setPhase("finished");
          }}
        />
      </div>
    );
  }

  if (phase === "submitError") {
    return (
      <div className="game-container game-result" style={{ justifyContent: "center" }}>
        <h2>{sessionOutcome === "disqualified" ? "Disqualification submit failed" : "Submit failed"}</h2>
        <p className="text-error mb-sm">{submitError ?? "Failed to submit result."}</p>
        <p className="game-result-stats">
          Total time: <strong>{(cumulativeTimeMs / 1000).toFixed(2)}s</strong>
        </p>
        <div className="game-result-actions">
          <button type="button" onClick={() => submitSessionCompletion().catch(() => {})} className="btn btn-primary btn-lg">
            Retry submit
          </button>
          <button type="button" onClick={() => navigate("/")} className="btn btn-ghost btn-lg">
            Leave
          </button>
        </div>
      </div>
    );
  }

  if (phase === "saving" || phase === "finished") {
    if (sessionOutcome === "disqualified") {
      return (
        <div className="game-container game-result" style={{ justifyContent: "center" }}>
          <h2 style={{ color: "var(--color-error)" }}>Disqualified</h2>
          <p className="game-result-stats">
            Wrong answer on round <strong>{round}</strong>. Final time: <strong>{(cumulativeTimeMs / 1000).toFixed(2)}s</strong>
          </p>
          {phase === "saving" ? (
            <p className="loading-text text-sm">Submitting disqualification…</p>
          ) : (
            <p className="text-secondary text-center">Your run is locked. Waiting for the rest of the session to finish.</p>
          )}
        </div>
      );
    }
    return (
      <div className="game-container game-result" style={{ justifyContent: "center" }}>
        <div className="game-result-stack">
          <span className={`status-pill ${lastResultWasBest ? "status-pill--success" : ""}`}>
            {lastResultWasBest ? "New personal best" : "Run complete"}
          </span>
          <h2>Done!</h2>
          <p className="game-result-stats" style={{ fontSize: "clamp(1.25rem, 5vmin, 1.5rem)" }}>
            Total time: <strong>{(cumulativeTimeMs / 1000).toFixed(2)}s</strong>
          </p>
          <p className="text-secondary">
            {personalBest
              ? lastResultWasBest
                ? "You lowered your best total and raised the bar for the next run."
                : cumulativeTimeMs === personalBest.timeMs
                  ? "You matched your PB exactly. One sharper split is all it takes to move it."
                  : `You finished ${formatPerformanceDelta("reflex", { moves: totalRounds, timeMs: cumulativeTimeMs }, personalBest)} than your PB.`
              : "First clean finish on this level. Now you have a time to hunt."}
          </p>
          <div className="metric-chip-row">
            <div className="metric-chip">
              <span>Last split</span>
              <strong>{lastSplitMs != null ? `${(lastSplitMs / 1000).toFixed(2)}s` : "—"}</strong>
            </div>
            <div className="metric-chip">
              <span>Projected rank</span>
              <strong>{resultInsight.projectedRank ? `#${resultInsight.projectedRank}` : "Pending"}</strong>
            </div>
            <div className="metric-chip">
              <span>Next target</span>
              <strong>
                {resultInsight.nextTarget
                  ? `#${resultInsight.nextTarget.rank} · ${formatPerformanceDelta("reflex", { moves: totalRounds, timeMs: cumulativeTimeMs }, { moves: totalRounds, timeMs: resultInsight.nextTarget.timeMs })}`
                  : "You’re pacing the field"}
              </strong>
            </div>
            {rivalInsight && (
              <div className="metric-chip">
                <span>Rival race</span>
                <strong>{rivalInsight.chipText}</strong>
              </div>
            )}
            {ghostTarget && (
              <div className="metric-chip">
                <span>Ghost result</span>
                <strong>{ghostPaceText}</strong>
              </div>
            )}
          </div>
          {rivalInsight && <p className="text-muted text-sm">{rivalInsight.message}</p>}
        </div>
        {phase === "saving" && <p className="loading-text text-sm">Saving…</p>}
        <GameOverNickname disabled={phase === "saving"} hideIfNoAuth={true} />
        <div className="game-result-actions">
          <button type="button" onClick={startGame} className="btn btn-primary" disabled={phase === "saving"}>
            {lastResultWasBest ? "Defend your PB" : "Beat your PB"}
          </button>
          <button
            type="button"
            onClick={() => navigate(`/leaderboard?game=reflex&level=${encodeURIComponent(levelId)}&justFinished=1`)}
            className="btn"
            disabled={phase === "saving"}
          >
            View ranking
          </button>
          <button
            type="button"
            onClick={(e) => {
              const url = typeof window !== "undefined" ? `${window.location.origin}/play?game=reflex&level=${encodeURIComponent(levelId)}` : "";
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
            disabled={phase === "saving"}
          >
            Challenge a friend
          </button>
          <button type="button" onClick={() => navigate("/")} className="btn btn-ghost" disabled={phase === "saving"}>
            Home
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="game-container" style={{ justifyContent: "center" }}>
      <span className={`status-pill ${searchParams.get("daily") === "1" ? "status-pill--success" : ""}`}>
        {searchParams.get("daily") === "1" ? "Daily challenge" : "Solo run"}
      </span>
      <p className="game-stats">
        Round <strong>{round}</strong> / {totalRounds}
        {cumulativeTimeMs > 0 && <> · <strong>{(cumulativeTimeMs / 1000).toFixed(2)}s</strong></>}
      </p>
      <div className="game-info-strip">
        <div className="metric-chip">
          <span>Target PB</span>
          <strong>{personalBest ? `${(personalBest.timeMs / 1000).toFixed(2)}s` : "Set your first finish"}</strong>
        </div>
        <div className="metric-chip">
          <span>Ghost target</span>
          <strong>{ghostTarget ? `${ghostTarget.label} · ${(ghostTarget.timeMs / 1000).toFixed(2)}s` : "Finding pace"}</strong>
        </div>
        <div className="metric-chip">
          <span>Last split</span>
          <strong>{lastSplitMs != null ? `${(lastSplitMs / 1000).toFixed(2)}s` : "Waiting for first hit"}</strong>
        </div>
        <div className="metric-chip">
          <span>Ghost pace</span>
          <strong>{ghostPaceText}</strong>
        </div>
      </div>
      <div
        className={`reflex-target ${!isReacting ? "reflex-target--idle" : ""} ${phase === "countdown" ? "reflex-target--arming" : ""}`}
        style={isReacting && targetColor ? { backgroundColor: targetColor } : undefined}
      />
      <div className={`countdown-number ${phase === "countdown" ? "countdown-number--pulse" : ""}`}>
        {phase === "countdown" && COUNTDOWN_STEPS[countdownStep] !== undefined && (
          <span>{COUNTDOWN_STEPS[countdownStep]}</span>
        )}
        {phase === "delay" && "✓"}
      </div>
      <div className="color-btn-row">
        {REFLEX_COLORS.map((color) => (
          <button
            key={color}
            type="button"
            className={`reflex-color-btn ${!isReacting ? "reflex-color-btn--disabled" : ""}`}
            style={{ backgroundColor: color }}
            onClick={() => handleButtonClick(color)}
            aria-label={`Color ${color}`}
          />
        ))}
      </div>
    </div>
  );
}
