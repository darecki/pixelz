import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
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

type Phase = "idle" | "countdown" | "reaction" | "delay" | "gameover" | "saving" | "finished" | "prompting" | "submitError";
type SessionGameProps = {
  seed: string;
  onComplete: (result: { moves: number; timeMs: number; disqualified?: boolean }) => void | Promise<void>;
  onProgress?: (progress: { moves: number; timeMs: number }) => void;
};

const COUNTDOWN_STEPS = [3, 2, 1] as const;
const KEYBOARD_KEYS = ["q", "w", "e", "p"] as const;

function qualifiesForPrompt(rank: number, leaderboardSize: number): boolean {
  if (leaderboardSize < 100) return rank <= 10;
  return rank <= Math.ceil(leaderboardSize * 0.1);
}

export default function ReflexGame({ levelId, sessionProps }: { levelId: string; sessionProps?: SessionGameProps }) {
  const navigate = useNavigate();
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

  const reactionStartRef = useRef<number>(0);
  const countdownTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const delayTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const scoreSubmittedRef = useRef(false);
  const pendingScoreRef = useRef<{ moves: number; timeMs: number } | null>(null);
  const pendingSessionResultRef = useRef<{ moves: number; timeMs: number; disqualified?: boolean } | null>(null);

  const deterministicSequenceRef = useRef<string[]>([]);
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
    return () => {
      if (countdownTimerRef.current) clearTimeout(countdownTimerRef.current);
      if (delayTimerRef.current) clearTimeout(delayTimerRef.current);
    };
  }, [levelId]);

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
  }

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
  }, [phase]);

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

  function handleButtonClick(clickedColor: string) {
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
    const newTotal = cumulativeTimeMs + elapsed;
    setCumulativeTimeMs(newTotal);
    sessionProps?.onProgress?.({ moves: round, timeMs: newTotal });
    if (round >= totalRounds) {
      if (scoreSubmittedRef.current) return;
      scoreSubmittedRef.current = true;
      setSessionOutcome("completed");

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
  }

  const isReacting = phase === "reaction";

  if (phase === "idle" && !sessionProps) {
    return (
      <div className="game-container" style={{ justifyContent: "center" }}>
        <h2 className="game-title">Reflex</h2>
        <p className="text-secondary text-center mb-md">
          {totalRounds} rounds. After the countdown, tap the button that matches the color.
        </p>
        <button type="button" onClick={startGame} className="btn btn-primary btn-lg">
          Start
        </button>
      </div>
    );
  }

  if (phase === "gameover") {
    return (
      <div className="game-container game-result" style={{ justifyContent: "center" }}>
        <h2 style={{ color: "var(--color-error)" }}>Wrong color!</h2>
        <p className="game-result-stats">
          Round {round} of {totalRounds}. Total time: <strong>{(cumulativeTimeMs / 1000).toFixed(2)}s</strong>
        </p>
        <div className="game-result-actions">
          <button type="button" onClick={startGame} className="btn btn-primary btn-lg">
            Play again
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
        <h2>Done! 🎉</h2>
        <p className="game-result-stats" style={{ fontSize: "clamp(1.25rem, 5vmin, 1.5rem)" }}>
          Total time: <strong>{(cumulativeTimeMs / 1000).toFixed(2)}s</strong>
        </p>
        {phase === "saving" && <p className="loading-text text-sm">Saving…</p>}
        <GameOverNickname disabled={phase === "saving"} hideIfNoAuth={true} />
        <div className="game-result-actions">
          <button
            type="button"
            onClick={() => navigate(`/leaderboard?game=reflex&level=${encodeURIComponent(levelId)}&justFinished=1`)}
            className="btn btn-primary"
            disabled={phase === "saving"}
          >
            View leaderboard
          </button>
          <button
            type="button"
            onClick={(e) => {
              const url = typeof window !== "undefined" ? `${window.location.origin}/play?game=reflex&level=${encodeURIComponent(levelId)}` : "";
              navigator.clipboard.writeText(url).catch(() => {});
              const btn = e.currentTarget;
              const original = btn.innerText;
              btn.innerText = "Copied!";
              setTimeout(() => { btn.innerText = original; }, 2000);
            }}
            className="btn"
            disabled={phase === "saving"}
          >
            Challenge a friend
          </button>
          <button type="button" onClick={startGame} className="btn" disabled={phase === "saving"}>
            Play again
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
      <p className="game-stats">
        Round <strong>{round}</strong> / {totalRounds}
        {cumulativeTimeMs > 0 && <> · <strong>{(cumulativeTimeMs / 1000).toFixed(2)}s</strong></>}
      </p>
      <div
        className={`reflex-target ${!isReacting ? "reflex-target--idle" : ""}`}
        style={isReacting && targetColor ? { backgroundColor: targetColor } : undefined}
      />
      <div className="countdown-number">
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
