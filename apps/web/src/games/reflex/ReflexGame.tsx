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
  onComplete: (result: { moves: number; timeMs: number }) => void | Promise<void>;
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

  const reactionStartRef = useRef<number>(0);
  const countdownTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const delayTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const scoreSubmittedRef = useRef(false);
  const pendingScoreRef = useRef<{ moves: number; timeMs: number } | null>(null);
  const pendingSessionResultRef = useRef<{ moves: number; timeMs: number } | null>(null);

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

  const containerStyle: React.CSSProperties = {
    padding: "clamp(0.5rem, 2vmin, 1rem)",
    maxWidth: 480,
    margin: "0 auto",
    minHeight: "100dvh",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    boxSizing: "border-box",
    touchAction: "manipulation",
  };

  const targetStyle: React.CSSProperties = {
    width: "min(90vw, 320px)",
    height: "clamp(120px, 28vmin, 180px)",
    backgroundColor: phase === "reaction" && targetColor ? targetColor : "#f5f5f5",
    borderRadius: 12,
    marginBottom: "clamp(0.75rem, 3vmin, 1.5rem)",
    transition: "background-color 0.05s",
  };

  const countdownStyle: React.CSSProperties = {
    fontSize: "clamp(2.5rem, 12vmin, 5rem)",
    fontWeight: 700,
    marginBottom: "clamp(0.5rem, 2vmin, 1rem)",
    minHeight: "1.2em",
  };

  const buttonRowStyle: React.CSSProperties = {
    display: "flex",
    gap: "clamp(6px, 2vmin, 12px)",
    justifyContent: "center",
    flexWrap: "wrap",
  };

  const colorButtonStyle = (color: string): React.CSSProperties => ({
    width: "clamp(52px, 15vmin, 72px)",
    height: "clamp(52px, 15vmin, 72px)",
    minWidth: 52,
    minHeight: 52,
    backgroundColor: color,
    border: "3px solid #333",
    borderRadius: 12,
    cursor: phase === "reaction" ? "pointer" : "default",
    pointerEvents: phase === "reaction" ? "auto" : "none",
    opacity: phase === "reaction" ? 1 : 0.6,
    touchAction: "manipulation",
  });

  const ctaButtonStyle: React.CSSProperties = {
    padding: "clamp(12px, 3vmin, 16px) clamp(20px, 5vmin, 28px)",
    minHeight: 44,
    margin: "4px",
    touchAction: "manipulation",
  };

  if (phase === "idle" && !sessionProps) {
    return (
      <div style={containerStyle}>
        <h2 style={{ fontSize: "clamp(1.25rem, 5vmin, 1.5rem)", marginBottom: "0.5rem" }}>Reflex</h2>
        <p style={{ marginBottom: "1rem", textAlign: "center" }}>
          {totalRounds} rounds. After the countdown, tap the button that matches the color.
        </p>
        <button type="button" onClick={startGame} style={ctaButtonStyle}>
          Start
        </button>
      </div>
    );
  }

  if (phase === "gameover") {
    return (
      <div style={containerStyle}>
        <h2 style={{ color: "#c00", marginBottom: "0.5rem" }}>Wrong color!</h2>
        <p style={{ marginBottom: "1rem" }}>
          Round {round} of {totalRounds}. Total time: {(cumulativeTimeMs / 1000).toFixed(2)}s
        </p>
        <button type="button" onClick={startGame} style={ctaButtonStyle}>
          Play again
        </button>
        <button type="button" onClick={() => navigate("/")} style={ctaButtonStyle}>
          Home
        </button>
      </div>
    );
  }

  if (phase === "prompting") {
    return (
      <div style={containerStyle}>
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
      <div style={containerStyle}>
        <h2 style={{ marginBottom: "0.5rem" }}>Submit failed</h2>
        <p style={{ color: "#c00", marginBottom: "0.75rem" }}>{submitError ?? "Failed to submit result."}</p>
        <p style={{ marginBottom: "1rem" }}>
          Total time: <strong>{(cumulativeTimeMs / 1000).toFixed(2)}s</strong>
        </p>
        <div style={{ display: "flex", gap: "0.5rem" }}>
          <button type="button" onClick={() => submitSessionCompletion().catch(() => {})} style={ctaButtonStyle}>
            Retry submit
          </button>
          <button type="button" onClick={() => navigate("/")} style={ctaButtonStyle}>
            Leave
          </button>
        </div>
      </div>
    );
  }

  if (phase === "saving" || phase === "finished") {
    return (
      <div style={containerStyle}>
        <h2 style={{ marginBottom: "0.5rem" }}>Done!</h2>
        <p style={{ fontSize: "clamp(1.25rem, 5vmin, 1.5rem)", marginBottom: "1rem" }}>
          Total time: <strong>{(cumulativeTimeMs / 1000).toFixed(2)}s</strong>
        </p>
        {phase === "saving" && (
          <p style={{ color: "#666", marginBottom: "0.25rem", fontSize: "0.9rem" }}>Saving…</p>
        )}
        <GameOverNickname disabled={phase === "saving"} buttonStyle={ctaButtonStyle} hideIfNoAuth={true} />
        <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem", justifyContent: "center" }}>
          <button
            type="button"
            onClick={() => navigate(`/leaderboard?game=reflex&level=${encodeURIComponent(levelId)}&justFinished=1`)}
            style={ctaButtonStyle}
            disabled={phase === "saving"}
          >
            View leaderboard
          </button>
          <button type="button" onClick={startGame} style={ctaButtonStyle} disabled={phase === "saving"}>
            Play again
          </button>
          <button type="button" onClick={() => navigate("/")} style={ctaButtonStyle} disabled={phase === "saving"}>
            Home
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={containerStyle}>
      <p style={{ marginBottom: "0.25rem", fontSize: "clamp(0.9rem, 2.5vmin, 1rem)" }}>
        Round {round} / {totalRounds}
        {cumulativeTimeMs > 0 && ` · ${(cumulativeTimeMs / 1000).toFixed(2)}s`}
      </p>
      <div style={targetStyle} />
      <div style={countdownStyle}>
        {phase === "countdown" && COUNTDOWN_STEPS[countdownStep] !== undefined && (
          <span>{COUNTDOWN_STEPS[countdownStep]}</span>
        )}
        {phase === "delay" && "✓"}
      </div>
      <div style={buttonRowStyle}>
        {REFLEX_COLORS.map((color) => (
          <button
            key={color}
            type="button"
            style={colorButtonStyle(color)}
            onClick={() => handleButtonClick(color)}
            aria-label={`Color ${color}`}
          />
        ))}
      </div>
    </div>
  );
}
