import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { appendEvent } from "../../lib/eventLog";
import { performSync } from "../../lib/sync";
import {
  REFLEX_COLORS,
  COUNTDOWN_MS,
  DELAY_AFTER_CORRECT_MS,
  getRoundsForLevel,
} from "./constants";
import { useBeep } from "./useBeep";

type Phase = "idle" | "countdown" | "reaction" | "delay" | "gameover" | "saving" | "finished";

const COUNTDOWN_STEPS = [3, 2, 1] as const;

export default function ReflexGame({ levelId }: { levelId: string }) {
  const navigate = useNavigate();
  const totalRounds = getRoundsForLevel(levelId);
  const { shortBeep, longBeep } = useBeep();

  const [phase, setPhase] = useState<Phase>("idle");
  const [round, setRound] = useState(1);
  const [cumulativeTimeMs, setCumulativeTimeMs] = useState(0);
  const [countdownStep, setCountdownStep] = useState(0);
  const [targetColor, setTargetColor] = useState<string | null>(null);

  const reactionStartRef = useRef<number>(0);
  const countdownTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const delayTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const pickTargetColor = useCallback(() => REFLEX_COLORS[Math.floor(Math.random() * REFLEX_COLORS.length)], []);

  useEffect(() => {
    return () => {
      if (countdownTimerRef.current) clearTimeout(countdownTimerRef.current);
      if (delayTimerRef.current) clearTimeout(delayTimerRef.current);
    };
  }, []);

  function startGame() {
    setPhase("countdown");
    setRound(1);
    setCumulativeTimeMs(0);
    setCountdownStep(0);
    setTargetColor(null);
  }

  useEffect(() => {
    if (phase !== "countdown") return;
    if (countdownStep >= COUNTDOWN_STEPS.length) {
      setPhase("reaction");
      setTargetColor(pickTargetColor());
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
  }, [phase, countdownStep, pickTargetColor, shortBeep, longBeep]);

  function handleButtonClick(clickedColor: string) {
    if (phase !== "reaction" || !targetColor) return;
    if (clickedColor !== targetColor) {
      setPhase("gameover");
      return;
    }
    const elapsed = Math.round(performance.now() - reactionStartRef.current);
    const newTotal = cumulativeTimeMs + elapsed;
    setCumulativeTimeMs(newTotal);
    if (round >= totalRounds) {
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

  if (phase === "idle") {
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

  if (phase === "saving" || phase === "finished") {
    return (
      <div style={containerStyle}>
        <h2 style={{ marginBottom: "0.5rem" }}>Done!</h2>
        <p style={{ fontSize: "clamp(1.25rem, 5vmin, 1.5rem)", marginBottom: "1rem" }}>
          Total time: <strong>{(cumulativeTimeMs / 1000).toFixed(2)}s</strong>
        </p>
        <p style={{ color: "#666", marginBottom: "1rem", fontSize: "0.9rem" }}>
          {phase === "saving" ? "Saving…" : "Saved to leaderboard."}
        </p>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem", justifyContent: "center" }}>
          <button
            type="button"
            onClick={() => navigate(`/leaderboard?level=${encodeURIComponent(levelId)}&justFinished=1`)}
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
