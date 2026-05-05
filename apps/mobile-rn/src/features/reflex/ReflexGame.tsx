import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as Haptics from "expo-haptics";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { computeScore, hashString, mulberry32 } from "@pixelz/ts-game-core";
import { AppButton, Card, SectionLabel } from "../../components/ui";
import { colors, radii } from "../../theme/tokens";
import { COUNTDOWN_MS, DELAY_AFTER_CORRECT_MS, getRoundsForLevel, REFLEX_COLORS } from "./constants";

type Phase = "idle" | "countdown" | "reaction" | "delay" | "gameover" | "submitting" | "submitError" | "submitted";
type SessionOutcome = "completed" | "disqualified" | null;
type GhostComparison = {
  targetLabel: string;
  baselineMs: number;
  targetProgressMs: number;
  currentMs: number;
  deltaMs: number;
  status: "ahead" | "behind" | "tied" | "idle";
};

export type ReflexCompletionResult = {
  score: number;
  moves: number;
  timeMs: number;
  disqualified?: boolean;
};

const COUNTDOWN_STEPS = [3, 2, 1] as const;

function formatSignedDelta(ms: number): string {
  if (ms === 0) return "0.00s";
  const sign = ms < 0 ? "-" : "+";
  return `${sign}${(Math.abs(ms) / 1000).toFixed(2)}s`;
}

function buildGhostComparison(
  ghostTarget: { label: string; timeMs: number } | null,
  completedRounds: number,
  totalRounds: number,
  cumulativeTimeMs: number
): GhostComparison | null {
  if (!ghostTarget) return null;
  const targetLabel =
    ghostTarget.label === "PB ghost"
      ? "PB"
      : ghostTarget.label === "Leaderboard ghost"
        ? "Leader"
        : ghostTarget.label;
  if (completedRounds === 0 || cumulativeTimeMs === 0) {
    return {
      targetLabel,
      baselineMs: ghostTarget.timeMs,
      targetProgressMs: Math.round(ghostTarget.timeMs / totalRounds),
      currentMs: 0,
      deltaMs: 0,
      status: "idle",
    };
  }
  // Reflex does not persist per-round ghost splits yet, so pace is estimated as a linear share of total target time.
  const targetProgressMs = Math.round((ghostTarget.timeMs * completedRounds) / totalRounds);
  const deltaMs = Math.round(cumulativeTimeMs - targetProgressMs);
  return {
    targetLabel,
    baselineMs: ghostTarget.timeMs,
    targetProgressMs,
    currentMs: cumulativeTimeMs,
    deltaMs,
    status: deltaMs < 0 ? "ahead" : deltaMs > 0 ? "behind" : "tied",
  };
}

export function ReflexGame({
  levelId,
  seed,
  ghostTarget = null,
  mode = "solo",
  onComplete,
  onProgress,
}: {
  levelId: string;
  seed?: string;
  ghostTarget?: { label: string; timeMs: number } | null;
  mode?: "solo" | "session";
  onComplete: (result: ReflexCompletionResult) => Promise<void> | void;
  onProgress?: (progress: { moves: number; timeMs: number }) => void;
}) {
  const totalRounds = getRoundsForLevel(levelId);
  const [phase, setPhase] = useState<Phase>(mode === "session" ? "countdown" : "idle");
  const [round, setRound] = useState(1);
  const [countdownStep, setCountdownStep] = useState(0);
  const [targetColor, setTargetColor] = useState<string | null>(null);
  const [cumulativeTimeMs, setCumulativeTimeMs] = useState(0);
  const [lastSplitMs, setLastSplitMs] = useState<number | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [sessionOutcome, setSessionOutcome] = useState<SessionOutcome>(null);

  const reactionStartRef = useRef<number>(0);
  const countdownTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const delayTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingSubmitRef = useRef<ReflexCompletionResult | null>(null);

  const deterministicSequence = useMemo(() => {
    if (!seed) return null;
    const rng = mulberry32(hashString(`${seed}-reflex`));
    return Array.from({ length: totalRounds }, () => {
      const index = Math.floor(rng() * REFLEX_COLORS.length);
      return REFLEX_COLORS[index];
    });
  }, [seed, totalRounds]);

  const pickTargetColor = useCallback((roundNumber: number) => {
    if (deterministicSequence) {
      return deterministicSequence[Math.max(0, roundNumber - 1)] ?? REFLEX_COLORS[0];
    }
    return REFLEX_COLORS[Math.floor(Math.random() * REFLEX_COLORS.length)];
  }, [deterministicSequence]);
  const completedRounds =
    phase === "delay"
      ? round
      : phase === "submitting" || phase === "submitted"
        ? sessionOutcome === "completed"
          ? totalRounds
          : Math.max(0, round - 1)
        : Math.max(0, round - 1);
  const ghostComparison = buildGhostComparison(ghostTarget, completedRounds, totalRounds, cumulativeTimeMs);

  const resetRun = useCallback(() => {
    pendingSubmitRef.current = null;
    setSubmitError(null);
    setSessionOutcome(null);
    setRound(1);
    setCountdownStep(0);
    setTargetColor(null);
    setCumulativeTimeMs(0);
    setLastSplitMs(null);
    setPhase(mode === "session" ? "countdown" : "idle");
  }, [mode]);

  useEffect(() => {
    resetRun();
  }, [levelId, resetRun]);

  useEffect(() => {
    return () => {
      if (countdownTimerRef.current) clearTimeout(countdownTimerRef.current);
      if (delayTimerRef.current) clearTimeout(delayTimerRef.current);
    };
  }, []);

  const startRun = useCallback(() => {
    pendingSubmitRef.current = null;
    setSubmitError(null);
    setSessionOutcome(null);
    setRound(1);
    setCountdownStep(0);
    setTargetColor(null);
    setCumulativeTimeMs(0);
    setLastSplitMs(null);
    setPhase("countdown");
  }, []);

  const submitResult = useCallback(async (payload: ReflexCompletionResult, outcome: Exclude<SessionOutcome, null>) => {
    pendingSubmitRef.current = payload;
    setSessionOutcome(outcome);
    setPhase("submitting");
    setSubmitError(null);
    try {
      await onComplete(payload);
      if (mode === "session") {
        setPhase("submitted");
      }
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : "Failed to submit result.");
      setPhase("submitError");
    }
  }, [mode, onComplete]);

  useEffect(() => {
    if (phase !== "countdown") return;
    if (countdownStep >= COUNTDOWN_STEPS.length) {
      setPhase("reaction");
      setTargetColor(pickTargetColor(round));
      reactionStartRef.current = Date.now();
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      return;
    }

    countdownTimerRef.current = setTimeout(() => {
      setCountdownStep((current) => current + 1);
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    }, COUNTDOWN_MS);

    return () => {
      if (countdownTimerRef.current) {
        clearTimeout(countdownTimerRef.current);
      }
    };
  }, [countdownStep, phase, pickTargetColor, round]);

  const handleColorPress = useCallback((clickedColor: string) => {
    if (phase !== "reaction" || !targetColor) return;

    const elapsed = Date.now() - reactionStartRef.current;
    const totalElapsed = cumulativeTimeMs + elapsed;

    if (clickedColor !== targetColor) {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
      setCumulativeTimeMs(totalElapsed);

      if (mode === "session") {
        void submitResult({
          score: computeScore(Math.max(0, round - 1), totalElapsed),
          moves: Math.max(0, round - 1),
          timeMs: totalElapsed,
          disqualified: true,
        }, "disqualified");
        return;
      }

      setPhase("gameover");
      return;
    }

    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    setLastSplitMs(elapsed);
    setCumulativeTimeMs(totalElapsed);
    onProgress?.({ moves: round, timeMs: totalElapsed });

    if (round >= totalRounds) {
      void submitResult({
        score: computeScore(totalRounds, totalElapsed),
        moves: totalRounds,
        timeMs: totalElapsed,
      }, "completed");
      return;
    }

    setTargetColor(null);
    setPhase("delay");
    delayTimerRef.current = setTimeout(() => {
      setRound((current) => current + 1);
      setCountdownStep(0);
      setPhase("countdown");
    }, DELAY_AFTER_CORRECT_MS);
  }, [cumulativeTimeMs, mode, onProgress, phase, round, submitResult, targetColor, totalRounds]);

  if (phase === "idle") {
    return (
      <View style={styles.container}>
        <Card>
          <SectionLabel>Solo Run</SectionLabel>
          <Text style={styles.title}>Reflex</Text>
          <Text style={styles.copy}>
            {totalRounds} rounds. After the countdown, tap the button that matches the target color as quickly as you can.
          </Text>
          <AppButton label="Start" onPress={startRun} />
        </Card>
      </View>
    );
  }

  if (phase === "gameover") {
    return (
      <View style={styles.container}>
        <Card>
          <SectionLabel>Run Broken</SectionLabel>
          <Text style={styles.title}>Wrong color.</Text>
          <Text style={styles.copy}>
            You reached round {round} of {totalRounds}. Reset fast and keep every split clean.
          </Text>
          <MetricRow label="Total time" value={`${(cumulativeTimeMs / 1000).toFixed(2)}s`} />
          <AppButton label="Retry Immediately" onPress={startRun} />
        </Card>
      </View>
    );
  }

  if (phase === "submitError") {
    return (
      <View style={styles.container}>
        <Card>
          <SectionLabel>Submit Failed</SectionLabel>
          <Text style={styles.title}>{sessionOutcome === "disqualified" ? "Disqualification failed" : "Result failed"}</Text>
          {submitError ? <Text style={styles.error}>{submitError}</Text> : null}
          <MetricRow label="Total time" value={`${(cumulativeTimeMs / 1000).toFixed(2)}s`} />
          <AppButton
            label="Retry Submit"
            onPress={() => {
              if (!pendingSubmitRef.current || !sessionOutcome) return;
              void submitResult(pendingSubmitRef.current, sessionOutcome);
            }}
          />
        </Card>
      </View>
    );
  }

  if (phase === "submitting" || phase === "submitted") {
    return (
      <View style={styles.container}>
        <Card>
          <SectionLabel>{sessionOutcome === "disqualified" ? "Disqualified" : "Run Complete"}</SectionLabel>
          <Text style={styles.title}>
            {sessionOutcome === "disqualified" ? "Result locked." : "Waiting on the room."}
          </Text>
          <Text style={styles.copy}>
            {phase === "submitting"
              ? "Submitting your result now."
              : "Your result is in. Stay here while the rest of the session finishes."}
          </Text>
          <MetricRow label="Total time" value={`${(cumulativeTimeMs / 1000).toFixed(2)}s`} />
        </Card>
      </View>
    );
  }

  const countdownValue = COUNTDOWN_STEPS[countdownStep] ?? null;

  return (
    <View style={styles.container}>
      <Card>
        <SectionLabel>{mode === "session" ? "Session Run" : "Solo Run"}</SectionLabel>
        <View style={styles.metrics}>
          <Metric label="Round" value={`${Math.min(round, totalRounds)} / ${totalRounds}`} />
          <Metric label="Total" value={`${(cumulativeTimeMs / 1000).toFixed(2)}s`} />
          <Metric label="Last split" value={lastSplitMs != null ? `${(lastSplitMs / 1000).toFixed(2)}s` : "—"} />
        </View>
        {ghostTarget ? (
          <>
            <View style={styles.ghostRow}>
              <Text style={styles.ghostLabel}>{ghostTarget.label}</Text>
              <Text style={styles.ghostValue}>{(ghostTarget.timeMs / 1000).toFixed(2)}s target</Text>
            </View>
            {ghostComparison ? (
              <>
                <View style={styles.ghostTracks}>
                  <View style={styles.ghostTrack}>
                    <View
                      style={[
                        styles.ghostFill,
                        styles.ghostFillTarget,
                        {
                          width: `${Math.max(0, Math.min(100, (ghostComparison.targetProgressMs / ghostComparison.baselineMs) * 100))}%`,
                        },
                      ]}
                    />
                  </View>
                  <View style={styles.ghostTrack}>
                    <View
                      style={[
                        styles.ghostFill,
                        ghostComparison.status === "behind" ? styles.ghostFillBehind : styles.ghostFillCurrent,
                        {
                          width: `${Math.max(0, Math.min(100, (ghostComparison.currentMs / ghostComparison.baselineMs) * 100))}%`,
                        },
                      ]}
                    />
                  </View>
                </View>
                <Text
                  style={[
                    styles.ghostDelta,
                    ghostComparison.status === "ahead" ? styles.ghostDeltaAhead : null,
                    ghostComparison.status === "behind" ? styles.ghostDeltaBehind : null,
                  ]}
                >
                  {ghostComparison.status === "idle"
                    ? `Waiting for first split against ${ghostComparison.targetLabel}`
                    : `${formatSignedDelta(ghostComparison.deltaMs)} vs ${ghostComparison.targetLabel}`}
                </Text>
              </>
            ) : null}
          </>
        ) : null}
      </Card>

      <Card>
        <SectionLabel>Target</SectionLabel>
        {phase === "countdown" ? (
          <View style={styles.centerPanel}>
            <Text style={styles.countdown}>{countdownValue ?? "Go"}</Text>
            <Text style={styles.copy}>Get ready for the next color.</Text>
          </View>
        ) : phase === "delay" ? (
          <View style={styles.centerPanel}>
            <Text style={styles.countdown}>Nice</Text>
            <Text style={styles.copy}>Hold steady for the next round.</Text>
          </View>
        ) : (
          <View style={styles.centerPanel}>
            <View style={[styles.targetSwatch, { backgroundColor: targetColor ?? colors.bgSecondary }]} />
            <Text style={styles.copy}>Tap the matching color button now.</Text>
          </View>
        )}
      </Card>

      <Card>
        <SectionLabel>Palette</SectionLabel>
        <View style={styles.palette}>
          {REFLEX_COLORS.map((color) => (
            <Pressable
              key={color}
              onPress={() => handleColorPress(color)}
              disabled={phase !== "reaction"}
              style={[
                styles.colorButton,
                {
                  backgroundColor: color,
                  opacity: phase === "reaction" ? 1 : 0.45,
                },
              ]}
            />
          ))}
        </View>
      </Card>
    </View>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.metric}>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={styles.metricValue}>{value}</Text>
    </View>
  );
}

function MetricRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.metricRow}>
      <Text style={styles.metricRowLabel}>{label}</Text>
      <Text style={styles.metricRowValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 16,
  },
  title: {
    color: colors.textPrimary,
    fontSize: 24,
    fontWeight: "700",
    letterSpacing: -0.4,
  },
  copy: {
    color: colors.textSecondary,
    fontSize: 14,
    lineHeight: 20,
    textAlign: "center",
  },
  error: {
    color: colors.error,
    fontSize: 14,
    lineHeight: 20,
  },
  metrics: {
    flexDirection: "row",
    gap: 12,
  },
  metric: {
    flex: 1,
    gap: 4,
    padding: 12,
    borderRadius: radii.md,
    backgroundColor: colors.bgSecondary,
  },
  metricLabel: {
    color: colors.textSecondary,
    fontSize: 12,
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  metricValue: {
    color: colors.textPrimary,
    fontSize: 18,
    fontWeight: "700",
  },
  ghostRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 12,
    paddingTop: 4,
  },
  ghostLabel: {
    color: colors.textSecondary,
    fontSize: 13,
    fontWeight: "600",
  },
  ghostValue: {
    color: colors.accentTeal,
    fontSize: 13,
    fontWeight: "700",
  },
  ghostTracks: {
    gap: 8,
    paddingTop: 4,
  },
  ghostTrack: {
    height: 8,
    borderRadius: radii.full,
    overflow: "hidden",
    backgroundColor: colors.bgSecondary,
  },
  ghostFill: {
    height: "100%",
    borderRadius: radii.full,
  },
  ghostFillTarget: {
    backgroundColor: colors.accentTeal,
  },
  ghostFillCurrent: {
    backgroundColor: colors.accent,
  },
  ghostFillBehind: {
    backgroundColor: colors.accentCoral,
  },
  ghostDelta: {
    color: colors.textSecondary,
    fontSize: 13,
    fontWeight: "600",
  },
  ghostDeltaAhead: {
    color: colors.success,
  },
  ghostDeltaBehind: {
    color: colors.accentCoral,
  },
  metricRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 12,
  },
  metricRowLabel: {
    color: colors.textSecondary,
    fontSize: 14,
  },
  metricRowValue: {
    color: colors.textPrimary,
    fontSize: 14,
    fontWeight: "700",
  },
  centerPanel: {
    alignItems: "center",
    justifyContent: "center",
    gap: 16,
    paddingVertical: 12,
  },
  countdown: {
    color: colors.textPrimary,
    fontSize: 48,
    fontWeight: "800",
    letterSpacing: -1,
  },
  targetSwatch: {
    width: 132,
    height: 132,
    borderRadius: radii.xl,
    borderWidth: 3,
    borderColor: colors.border,
  },
  palette: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
    justifyContent: "center",
  },
  colorButton: {
    width: 82,
    height: 82,
    borderRadius: radii.lg,
    borderWidth: 3,
    borderColor: colors.border,
  },
});
