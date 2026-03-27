import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { appendEvent } from "../../lib/eventLog";
import { performSync } from "../../lib/sync";
import { fetchLeaderboard, STORAGE_KEYS } from "../../lib/api";
import { supabase } from "../../lib/supabase";
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

type ReflexGhostRequest =
  | { mode: "default" }
  | { mode: "pb" }
  | { mode: "shared"; target: GhostTarget };

type GhostComparison = {
  targetLabel: string;
  baselineMs: number;
  targetProgressMs: number;
  currentMs: number;
  deltaMs: number;
  status: "ahead" | "behind" | "tied" | "idle";
};

const COUNTDOWN_STEPS = [3, 2, 1] as const;
const KEYBOARD_KEYS = ["q", "w", "e", "p"] as const;

export function parseReflexGhostRequest(searchParams: URLSearchParams): ReflexGhostRequest {
  const ghostMode = searchParams.get("ghost");
  if (ghostMode === "pb") return { mode: "pb" };
  if (ghostMode === "shared") {
    const timeMs = Number(searchParams.get("ghostTimeMs"));
    if (!Number.isFinite(timeMs) || timeMs <= 0) return { mode: "default" };
    const label = searchParams.get("ghostLabel")?.trim() || "Friend PB";
    return {
      mode: "shared",
      target: {
        label,
        timeMs: Math.round(timeMs),
      },
    };
  }
  return { mode: "default" };
}

export function buildReflexPlayUrl(
  levelId: string,
  options?: {
    ghostMode?: "pb";
    sharedGhost?: GhostTarget;
    autostartToken?: string;
  }
): string {
  const params = new URLSearchParams({
    game: "reflex",
    level: levelId,
  });
  if (options?.sharedGhost) {
    params.set("ghost", "shared");
    params.set("ghostTimeMs", `${Math.round(options.sharedGhost.timeMs)}`);
    params.set("ghostLabel", options.sharedGhost.label);
  } else if (options?.ghostMode === "pb") {
    params.set("ghost", "pb");
  }
  if (options?.autostartToken) {
    params.set("autostart", options.autostartToken);
  }
  return `/play?${params.toString()}`;
}

export function buildReflexChallengeUrl(origin: string, levelId: string, timeMs: number, label = "Friend PB"): string {
  return `${origin}${buildReflexPlayUrl(levelId, {
    sharedGhost: {
      label,
      timeMs,
    },
  })}`;
}

function formatSignedDelta(ms: number): string {
  if (ms === 0) return "0.00s";
  const sign = ms < 0 ? "-" : "+";
  return `${sign}${(Math.abs(ms) / 1000).toFixed(2)}s`;
}

export function getGhostCurrentFillClass(status: GhostComparison["status"]): string {
  return status === "behind" ? "ghost-timeline__fill--current-behind" : "ghost-timeline__fill--current";
}

export function buildGhostComparison(
  ghostTarget: GhostTarget | null,
  completedRounds: number,
  totalRounds: number,
  cumulativeTimeMs: number
): GhostComparison | null {
  if (!ghostTarget) return null;
  const targetLabel = ghostTarget.label === "PB ghost" ? "PB" : ghostTarget.label;
  if (completedRounds === 0 || cumulativeTimeMs === 0) {
    return {
      targetLabel,
      baselineMs: ghostTarget.timeMs,
      targetProgressMs: ghostTarget.timeMs / totalRounds,
      currentMs: 0,
      deltaMs: 0,
      status: "idle",
    };
  }
  // Reflex does not persist per-round ghost splits yet, so pace is estimated as a linear share of total target time.
  const splitTargetMs = Math.round((ghostTarget.timeMs * completedRounds) / totalRounds);
  const deltaMs = Math.round(cumulativeTimeMs - splitTargetMs);
  return {
    targetLabel,
    baselineMs: ghostTarget.timeMs,
    targetProgressMs: splitTargetMs,
    currentMs: cumulativeTimeMs,
    deltaMs,
    status: deltaMs < 0 ? "ahead" : deltaMs > 0 ? "behind" : "tied",
  };
}

function resolveImmediateGhostTarget(ghostRequest: ReflexGhostRequest, personalBestTimeMs: number | null): GhostTarget | null {
  if (ghostRequest.mode === "shared") {
    return ghostRequest.target;
  }
  if (ghostRequest.mode === "pb" && personalBestTimeMs != null) {
    return { label: "PB ghost", timeMs: personalBestTimeMs };
  }
  return null;
}

function GhostTimeline({ comparison, isLoading }: { comparison: GhostComparison | null; isLoading: boolean }) {
  if (!comparison) {
    return (
      <div className="ghost-timeline ghost-timeline--empty">
        {isLoading ? "Loading target pace" : "No target pace available"}
      </div>
    );
  }

  const totalMs = Math.max(comparison.baselineMs, 1);
  const targetWidth = `${Math.max(0, Math.min(100, (comparison.targetProgressMs / totalMs) * 100))}%`;
  const currentWidth = `${Math.max(0, Math.min(100, (comparison.currentMs / totalMs) * 100))}%`;

  return (
    <div className="ghost-timeline">
      <div className="ghost-timeline__group">
        <span className="ghost-timeline__label">{comparison.targetLabel}</span>
        <div className="ghost-timeline__track">
          <div className="ghost-timeline__fill ghost-timeline__fill--target" style={{ width: targetWidth }} />
        </div>
      </div>
      <div className="ghost-timeline__group">
        <span className="ghost-timeline__label">Current</span>
        <div className="ghost-timeline__track">
          <div
            className={`ghost-timeline__fill ${getGhostCurrentFillClass(comparison.status)}`}
            style={{ width: currentWidth }}
          />
        </div>
      </div>
      <div className={`ghost-timeline__delta ghost-timeline__delta--${comparison.status}`}>
        {comparison.status === "idle" ? "Waiting for first split" : formatSignedDelta(comparison.deltaMs)}
      </div>
    </div>
  );
}

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
  const [isGhostTargetLoading, setIsGhostTargetLoading] = useState(true);

  const reactionStartRef = useRef<number>(0);
  const countdownTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const delayTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const scoreSubmittedRef = useRef(false);
  const pendingScoreRef = useRef<{ moves: number; timeMs: number } | null>(null);
  const pendingSessionResultRef = useRef<{ moves: number; timeMs: number; disqualified?: boolean } | null>(null);
  const deterministicSequenceRef = useRef<string[]>([]);
  const consumedAutostartRef = useRef<string | null>(null);

  const personalBestTimeMs = levelProgress?.bestTimeMs ?? null;
  const personalBest = levelProgress ? { moves: levelProgress.bestMoves, timeMs: levelProgress.bestTimeMs } : null;
  const ghostRequest = parseReflexGhostRequest(searchParams);
  const ghostRequestMode = ghostRequest.mode;
  const ghostRequestLabel = ghostRequest.mode === "shared" ? ghostRequest.target.label : "";
  const ghostRequestTimeMs = ghostRequest.mode === "shared" ? ghostRequest.target.timeMs : 0;
  const autoStartToken = searchParams.get("autostart");
  const completedRounds =
    phase === "finished" || phase === "saving" || phase === "prompting" || phase === "submitError"
      ? totalRounds
      : Math.max(0, round - 1);
  const ghostComparison = buildGhostComparison(ghostTarget, completedRounds, totalRounds, cumulativeTimeMs);

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
    consumedAutostartRef.current = null;
    const nextLevelProgress = getLevelProgress("reflex", levelId);
    setLevelProgress(nextLevelProgress);
    setResultInsight({ projectedRank: null, nextTarget: null });
    setLastResultWasBest(null);
    setLastSplitMs(null);
    setRivalInsight(null);
    const immediateGhostTarget = resolveImmediateGhostTarget(ghostRequest, nextLevelProgress?.bestTimeMs ?? null);
    setGhostTarget(immediateGhostTarget);
    setIsGhostTargetLoading(immediateGhostTarget == null);
    return () => {
      if (countdownTimerRef.current) clearTimeout(countdownTimerRef.current);
      if (delayTimerRef.current) clearTimeout(delayTimerRef.current);
    };
  }, [ghostRequestLabel, ghostRequestMode, ghostRequestTimeMs, levelId]);

  useEffect(() => {
    let cancelled = false;
    if (ghostRequestMode === "shared") {
      setIsGhostTargetLoading(false);
      setGhostTarget({ label: ghostRequestLabel, timeMs: ghostRequestTimeMs });
      return () => {
        cancelled = true;
      };
    }
    if (ghostRequestMode === "pb" && personalBestTimeMs != null) {
      setIsGhostTargetLoading(false);
      setGhostTarget({ label: "PB ghost", timeMs: personalBestTimeMs });
      return () => {
        cancelled = true;
      };
    }
    setIsGhostTargetLoading(true);
    fetchLeaderboard(levelId)
      .then((leaderboard) => {
        if (cancelled) return;
        const leader = leaderboard.entries[0];
        if (leader) {
          setGhostTarget({ label: "Leaderboard ghost", timeMs: leader.timeMs });
        } else {
          setGhostTarget(null);
        }
        setIsGhostTargetLoading(false);
      })
      .catch(() => {
        if (cancelled) return;
        setGhostTarget(null);
        setIsGhostTargetLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [ghostRequestLabel, ghostRequestMode, ghostRequestTimeMs, levelId, personalBestTimeMs]);

  const startGame = useCallback(() => {
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
  }, []);

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

      const recorded = recordCompetitionResult({
        gameId: "reflex",
        levelId,
        moves: totalRounds,
        timeMs: newTotal,
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
    sessionProps,
    submitSessionCompletion,
    targetColor,
    totalRounds,
  ]);

  useEffect(() => {
    if (sessionProps && phase === "idle") {
      startGame();
    }
  }, [phase, sessionProps, startGame]);

  useEffect(() => {
    if (sessionProps || !autoStartToken) return;
    if (consumedAutostartRef.current === autoStartToken) return;
    if (!(phase === "idle" || phase === "finished" || phase === "gameover")) return;
    consumedAutostartRef.current = autoStartToken;
    startGame();
  }, [autoStartToken, phase, sessionProps, startGame]);

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
  const ghostTargetSummary = ghostTarget
    ? `${ghostTarget.label} · ${(ghostTarget.timeMs / 1000).toFixed(2)}s`
    : isGhostTargetLoading
      ? "Finding pace"
      : "No target available";

  if (phase === "idle" && !sessionProps) {
    return (
      <div className="game-container reflex-game-shell" style={{ justifyContent: "center" }}>
        <div className="reflex-run-layout reflex-run-layout--intro">
          <div className="reflex-run-header">
            <span className="status-pill">Solo run</span>
            <h2 className="game-title">Reflex</h2>
            <p className="text-secondary text-center">
              {totalRounds} rounds. After the countdown, slam the button that matches the color.
            </p>
          </div>
          <div className="game-info-strip reflex-info-grid mb-md">
            <div className="metric-chip">
              <span>Target PB</span>
              <strong>{personalBest ? `${(personalBest.timeMs / 1000).toFixed(2)}s` : "Set your first benchmark"}</strong>
            </div>
            <div className="metric-chip">
              <span>Ghost target</span>
              <strong>{ghostTargetSummary}</strong>
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
                <GhostTimeline comparison={ghostComparison} isLoading={isGhostTargetLoading} />
              </div>
            )}
          </div>
          {rivalInsight && <p className="text-muted text-sm">{rivalInsight.message}</p>}
          {sessionProps && <p className="text-secondary text-center">Your result is locked in. Stay in the session while the rest of the lobby finishes.</p>}
        </div>
        {phase === "saving" && <p className="loading-text text-sm">Saving…</p>}
        {!sessionProps && (
          <div className="game-result-actions">
            <button
              type="button"
              onClick={() => navigate(buildReflexPlayUrl(levelId, { ghostMode: "pb", autostartToken: `${Date.now()}` }))}
              className="btn btn-primary"
              disabled={phase === "saving"}
            >
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
                const ghostTimeMs = levelProgress?.bestTimeMs ?? cumulativeTimeMs;
                const url = typeof window !== "undefined"
                  ? buildReflexChallengeUrl(window.location.origin, levelId, ghostTimeMs)
                  : buildReflexPlayUrl(levelId, {
                      sharedGhost: {
                        label: "Friend PB",
                        timeMs: ghostTimeMs,
                      },
                    });
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
        )}
      </div>
    );
  }

  return (
    <div className="game-container reflex-game-shell" style={{ justifyContent: "center" }}>
      <div className="reflex-run-layout">
        <div className="reflex-run-header">
          <span className="status-pill">Solo run</span>
          <p className="game-stats reflex-game-stats">
            Round <strong>{round}</strong> / {totalRounds}
            {cumulativeTimeMs > 0 && <> · <strong>{(cumulativeTimeMs / 1000).toFixed(2)}s</strong></>}
          </p>
        </div>
        <div className="game-info-strip reflex-info-grid">
          <div className="metric-chip">
            <span>Target PB</span>
            <strong>{personalBest ? `${(personalBest.timeMs / 1000).toFixed(2)}s` : "Set your first finish"}</strong>
          </div>
          <div className="metric-chip">
            <span>Ghost target</span>
            <strong>{ghostTargetSummary}</strong>
          </div>
          <div className="metric-chip">
            <span>Last split</span>
            <strong>{lastSplitMs != null ? `${(lastSplitMs / 1000).toFixed(2)}s` : "Waiting for first hit"}</strong>
          </div>
          <div className="metric-chip">
            <span>Ghost pace</span>
            <GhostTimeline comparison={ghostComparison} isLoading={isGhostTargetLoading} />
          </div>
        </div>
        <div className="reflex-stage">
          <div
            className={`reflex-target ${!isReacting ? "reflex-target--idle" : ""} ${phase === "countdown" ? "reflex-target--arming" : ""}`}
            style={isReacting && targetColor ? { backgroundColor: targetColor } : undefined}
          />
          <div className={`countdown-number reflex-stage-countdown ${phase === "countdown" ? "countdown-number--pulse" : ""}`}>
            {phase === "countdown" && COUNTDOWN_STEPS[countdownStep] !== undefined && (
              <span>{COUNTDOWN_STEPS[countdownStep]}</span>
            )}
            {phase === "delay" && "✓"}
          </div>
        </div>
        <div className="color-btn-row reflex-color-row">
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
    </div>
  );
}
