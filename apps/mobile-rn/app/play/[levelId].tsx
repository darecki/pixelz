import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Share, StyleSheet, Text, View } from "react-native";
import {
  formatBoardLabel,
  formatPerformanceDelta,
  isDailyPixelzBoardId,
  type ResultSnapshot,
} from "@pixelz/ts-game-core";
import { PixelzReplayViewer } from "../../src/components/PixelzReplayViewer";
import { CenteredMessage, Screen } from "../../src/components/Screen";
import { AppButton, Badge, Card, SectionLabel, StatRow } from "../../src/components/ui";
import { PixelzGame } from "../../src/features/pixelz/PixelzGame";
import { ReflexGame } from "../../src/features/reflex/ReflexGame";
import { fetchBoard, fetchLeaderboard } from "../../src/lib/api";
import {
  getLevelProgress,
  getPreference,
  PREFERENCE_KEYS,
  recordLevelResult,
  setPreference,
  type LevelProgressSnapshot,
} from "../../src/lib/db";
import { enqueueEvent, trySyncInBackground } from "../../src/lib/offline-sync";
import {
  getProjectedLeaderboardInsight,
  getProjectedReflexLeaderboardInsight,
  isNewReflexBest,
  isNewPixelzBest,
  qualifiesForLeaderboardPrompt,
} from "../../src/lib/play-results";
import { buildPlayShareMessage, buildReflexChallengeShareMessage } from "../../src/lib/share";
import { colors } from "../../src/theme/tokens";
import { useAuthStore } from "../../src/stores/auth-store";

type PixelzCompletionState = {
  moves: number;
  timeMs: number;
  moveSequence: number[];
  previousBest: ResultSnapshot | null;
  currentBest: LevelProgressSnapshot;
  isNewBest: boolean;
  projectedRank: number | null;
  nextTarget: {
    rank: number;
    moves: number;
    timeMs: number;
  } | null;
  leaderboardSize: number;
};

type ReflexCompletionState = {
  moves: number;
  timeMs: number;
  previousBest: ResultSnapshot | null;
  currentBest: LevelProgressSnapshot;
  isNewBest: boolean;
  projectedRank: number | null;
  nextTarget: {
    rank: number;
    moves: number;
    timeMs: number;
  } | null;
  leaderboardSize: number;
};

type GhostTarget = {
  label: string;
  timeMs: number;
};

function isReflexLevel(levelId: string) {
  return levelId.startsWith("reflex_");
}

function formatPixelzBest(progress: LevelProgressSnapshot): string {
  return `${progress.bestMoves} moves · ${(progress.bestTimeMs / 1000).toFixed(2)}s`;
}

function formatReflexBest(progress: LevelProgressSnapshot): string {
  return `${(progress.bestTimeMs / 1000).toFixed(2)}s`;
}

function describePixelzCompletion(completion: PixelzCompletionState): string {
  const current = { moves: completion.moves, timeMs: completion.timeMs };
  const bestNow = {
    moves: completion.currentBest.bestMoves,
    timeMs: completion.currentBest.bestTimeMs,
  };
  if (completion.isNewBest) {
    return completion.previousBest
      ? "You beat your previous best and set the new mobile target."
      : "First result on this board. Set the tone and build a benchmark.";
  }
  if (current.moves === bestNow.moves && current.timeMs === bestNow.timeMs) {
    return "You matched your personal best exactly. A faster tie-break or cleaner move count wins the next step.";
  }
  return `You finished ${formatPerformanceDelta("pixelz", current, bestNow)} versus your PB.`;
}

function describeReflexCompletion(completion: ReflexCompletionState): string {
  const current = { moves: completion.moves, timeMs: completion.timeMs };
  const bestNow = {
    moves: completion.currentBest.bestMoves,
    timeMs: completion.currentBest.bestTimeMs,
  };
  if (completion.isNewBest) {
    return completion.previousBest
      ? "You lowered your best total and raised the bar for the next run."
      : "First clean finish on this level. Now you have a time to hunt.";
  }
  if (current.timeMs === bestNow.timeMs) {
    return "You matched your PB exactly. One sharper split is all it takes to move it.";
  }
  return `You finished ${formatPerformanceDelta("reflex", current, bestNow)} versus your PB.`;
}

function resolveReflexGhostTarget(
  params: { ghost?: string | string[]; ghostTimeMs?: string | string[]; ghostLabel?: string | string[] },
  personalBest: LevelProgressSnapshot | null
): GhostTarget | null {
  const ghostMode = Array.isArray(params.ghost) ? params.ghost[0] : params.ghost;
  if (ghostMode === "shared") {
    const rawTimeMs = Array.isArray(params.ghostTimeMs) ? params.ghostTimeMs[0] : params.ghostTimeMs;
    const parsed = Number(rawTimeMs);
    if (!Number.isFinite(parsed) || parsed <= 0) return null;
    const labelRaw = Array.isArray(params.ghostLabel) ? params.ghostLabel[0] : params.ghostLabel;
    return {
      label: labelRaw?.trim() || "Friend PB",
      timeMs: Math.round(parsed),
    };
  }
  if (ghostMode === "pb" && personalBest) {
    return {
      label: "PB ghost",
      timeMs: personalBest.bestTimeMs,
    };
  }
  return null;
}

export default function PlayLevelScreen() {
  const params = useLocalSearchParams<{
    levelId: string;
    ghost?: string | string[];
    ghostTimeMs?: string | string[];
    ghostLabel?: string | string[];
  }>();

  if (!params.levelId) {
    return <CenteredMessage title="Missing level" message="A board id is required to start a run." />;
  }

  return isReflexLevel(params.levelId)
    ? <ReflexPlayLevelScreen levelId={params.levelId} ghostParams={params} />
    : <PixelzPlayLevelScreen levelId={params.levelId} />;
}

function PixelzPlayLevelScreen({ levelId }: { levelId: string }) {
  const router = useRouter();
  const session = useAuthStore((state) => state.session);
  const [completion, setCompletion] = useState<PixelzCompletionState | null>(null);
  const [showReplay, setShowReplay] = useState(false);
  const [showSignInPrompt, setShowSignInPrompt] = useState(false);

  const boardQuery = useQuery({
    queryKey: ["board", levelId],
    queryFn: () => fetchBoard(levelId),
    enabled: Boolean(levelId),
  });

  if (boardQuery.isLoading) {
    return <CenteredMessage title="Loading board…" message="Fetching the deterministic board payload." />;
  }

  if (boardQuery.error || !boardQuery.data) {
    return (
      <CenteredMessage
        title="Board unavailable"
        message={boardQuery.error instanceof Error ? boardQuery.error.message : "Could not load the board."}
      />
    );
  }

  async function handleShare() {
    if (!completion) return;
    await Share.share({
      message: buildPlayShareMessage(levelId, completion),
    });
  }

  async function handleComplete(result: { score: number; moves: number; timeMs: number; moveSequence: number[] }) {
    const previousBestProgress = await getLevelProgress("pixelz", levelId);
    const previousBest = previousBestProgress
      ? { moves: previousBestProgress.bestMoves, timeMs: previousBestProgress.bestTimeMs }
      : null;

    await recordLevelResult({
      gameId: "pixelz",
      levelId,
      moves: result.moves,
      timeMs: result.timeMs,
      dailyChallenge: isDailyPixelzBoardId(levelId),
    });
    await enqueueEvent({
      type: "LEVEL_COMPLETED",
      payload: {
        levelId,
        score: result.score,
        moves: result.moves,
        timeMs: result.timeMs,
        moveSequence: result.moveSequence,
      },
    });
    void trySyncInBackground();

    const [savedBest, leaderboard, dontRemindSignin] = await Promise.all([
      getLevelProgress("pixelz", levelId),
      fetchLeaderboard(levelId).catch(() => null),
      session ? Promise.resolve(null) : getPreference(PREFERENCE_KEYS.dontRemindSignin),
    ]);
    const currentBest = savedBest ?? {
      bestMoves: result.moves,
      bestTimeMs: result.timeMs,
      lastMoves: result.moves,
      lastTimeMs: result.timeMs,
      plays: 1,
      lastPlayedAt: new Date().toISOString(),
    };

    const insight = getProjectedLeaderboardInsight(
      { moves: result.moves, timeMs: result.timeMs },
      leaderboard
    );
    const nextCompletion: PixelzCompletionState = {
      moves: result.moves,
      timeMs: result.timeMs,
      moveSequence: result.moveSequence,
      previousBest,
      currentBest,
      isNewBest: isNewPixelzBest(previousBest, currentBest),
      projectedRank: insight.projectedRank,
      nextTarget: insight.nextTarget,
      leaderboardSize: leaderboard?.entries.length ?? 0,
    };

    setShowReplay(false);
    setCompletion(nextCompletion);

    if (
      !session &&
      dontRemindSignin !== "true" &&
      qualifiesForLeaderboardPrompt(insight.projectedRank, nextCompletion.leaderboardSize)
    ) {
      setShowSignInPrompt(true);
    } else {
      setShowSignInPrompt(false);
    }
  }

  function resetRun() {
    setCompletion(null);
    setShowReplay(false);
    setShowSignInPrompt(false);
  }

  return (
    <Screen
      title="Play Pixelz"
      subtitle={formatBoardLabel(levelId)}
      right={
        <AppButton
          label="Leaderboard"
          tone="ghost"
          size="sm"
          onPress={() => router.push("/(tabs)/leaderboard")}
        />
      }
    >
      {completion ? (
        <>
          <Card>
            <SectionLabel>{completion.isNewBest ? "New personal best" : "Run complete"}</SectionLabel>
            <Text style={styles.resultTitle}>{completion.isNewBest ? "You raised the bar." : "Board cleared."}</Text>
            <View style={styles.badgeRow}>
              {completion.projectedRank ? <Badge label={`Projected #${completion.projectedRank}`} tone="accent" /> : null}
              <Badge label={completion.isNewBest ? "PB" : "Saved locally"} tone={completion.isNewBest ? "success" : "neutral"} />
            </View>
            <StatRow label="Moves" value={`${completion.moves}`} />
            <StatRow label="Time" value={`${(completion.timeMs / 1000).toFixed(2)}s`} />
            <StatRow label="Best on board" value={formatPixelzBest(completion.currentBest)} />
            <Text style={styles.copy}>{describePixelzCompletion(completion)}</Text>
          </Card>

          <Card>
            <SectionLabel>Insights</SectionLabel>
            <StatRow
              label="Projected rank"
              value={completion.projectedRank ? `#${completion.projectedRank}` : "Leaderboard unavailable"}
            />
            <StatRow
              label="Next target"
              value={
                completion.nextTarget
                  ? `#${completion.nextTarget.rank} · ${formatPerformanceDelta(
                      "pixelz",
                      { moves: completion.moves, timeMs: completion.timeMs },
                      completion.nextTarget
                    )}`
                  : completion.projectedRank === 1
                    ? "You would lead this slice"
                    : "No target loaded"
              }
            />
            <Text style={styles.copy}>
              Your result was stored locally and queued for sync. If you are online, the background sync worker will flush it.
            </Text>
          </Card>

          {showSignInPrompt && !session && completion.projectedRank ? (
            <Card>
              <SectionLabel>Strong guest run</SectionLabel>
              <Text style={styles.resultTitle}>This pace would land around #{completion.projectedRank}.</Text>
              <Text style={styles.copy}>
                Sign in to keep the same identity across web and mobile and make sure your best runs stay attached to your profile.
              </Text>
              <View style={styles.actions}>
                <AppButton label="Sign In" onPress={() => router.push("/auth/sign-in")} />
                <AppButton label="Not Now" tone="ghost" onPress={() => setShowSignInPrompt(false)} />
                <AppButton
                  label="Don't Remind Again"
                  tone="ghost"
                  onPress={() => {
                    void setPreference(PREFERENCE_KEYS.dontRemindSignin, "true").then(() => {
                      setShowSignInPrompt(false);
                    });
                  }}
                />
              </View>
            </Card>
          ) : null}

          <View style={styles.actions}>
            <AppButton label={completion.isNewBest ? "Defend PB" : "Play Again"} onPress={resetRun} />
            <AppButton label="View Ranking" tone="secondary" onPress={() => router.push("/(tabs)/leaderboard")} />
            <AppButton
              label="Challenge a Friend"
              tone="ghost"
              onPress={() => {
                void handleShare().catch(() => {});
              }}
            />
            {completion.moveSequence.length > 0 ? (
              <AppButton
                label={showReplay ? "Hide Replay" : "Watch Replay"}
                tone="ghost"
                onPress={() => setShowReplay((current) => !current)}
              />
            ) : null}
          </View>

          {showReplay ? (
            <PixelzReplayViewer
              board={boardQuery.data}
              moveSequence={completion.moveSequence}
              title="Your solve replay"
              subtitle={`Replaying the ${completion.moveSequence.length}-move path you just used on this board.`}
            />
          ) : null}
        </>
      ) : (
        <PixelzGame
          board={boardQuery.data}
          onComplete={async (result) => {
            await handleComplete(result);
          }}
        />
      )}
    </Screen>
  );
}

function ReflexPlayLevelScreen({
  levelId,
  ghostParams,
}: {
  levelId: string;
  ghostParams: {
    ghost?: string | string[];
    ghostTimeMs?: string | string[];
    ghostLabel?: string | string[];
  };
}) {
  const router = useRouter();
  const session = useAuthStore((state) => state.session);
  const [runKey, setRunKey] = useState(0);
  const [completion, setCompletion] = useState<ReflexCompletionState | null>(null);
  const [showSignInPrompt, setShowSignInPrompt] = useState(false);
  const [ghostOverride, setGhostOverride] = useState<GhostTarget | null>(null);
  const personalBest = useQuery({
    queryKey: ["local-reflex-progress", levelId, runKey],
    queryFn: () => getLevelProgress("reflex", levelId),
  });
  const requestedGhostTarget = useMemo(() => resolveReflexGhostTarget(ghostParams, personalBest.data ?? null), [ghostParams, personalBest.data]);
  const leaderboardGhostQuery = useQuery({
    queryKey: ["reflex-ghost-target", levelId],
    queryFn: () => fetchLeaderboard(levelId),
    enabled: requestedGhostTarget == null,
  });
  const fallbackGhostTarget = useMemo(() => {
    const leader = leaderboardGhostQuery.data?.entries[0];
    if (!leader) return null;
    return {
      label: "Leaderboard ghost",
      timeMs: leader.timeMs,
    };
  }, [leaderboardGhostQuery.data]);
  const isFallbackGhostLoading = requestedGhostTarget == null && leaderboardGhostQuery.isPending;
  const ghostTarget = ghostOverride ?? requestedGhostTarget ?? fallbackGhostTarget;

  async function handleShare() {
    if (!completion) return;
    await Share.share({
      message: buildReflexChallengeShareMessage(levelId, completion.currentBest.bestTimeMs || completion.timeMs),
    });
  }

  async function handleComplete(result: { score: number; moves: number; timeMs: number; disqualified?: boolean }) {
    const previousBestProgress = await getLevelProgress("reflex", levelId);
    const previousBest = previousBestProgress
      ? { moves: previousBestProgress.bestMoves, timeMs: previousBestProgress.bestTimeMs }
      : null;

    await recordLevelResult({
      gameId: "reflex",
      levelId,
      moves: result.moves,
      timeMs: result.timeMs,
    });
    await enqueueEvent({
      type: "LEVEL_COMPLETED",
      payload: {
        levelId,
        score: result.score,
        moves: result.moves,
        timeMs: result.timeMs,
      },
    });
    void trySyncInBackground();

    const [savedBest, leaderboard, dontRemindSignin] = await Promise.all([
      getLevelProgress("reflex", levelId),
      fetchLeaderboard(levelId).catch(() => null),
      session ? Promise.resolve(null) : getPreference(PREFERENCE_KEYS.dontRemindSignin),
    ]);
    const currentBest = savedBest ?? {
      bestMoves: result.moves,
      bestTimeMs: result.timeMs,
      lastMoves: result.moves,
      lastTimeMs: result.timeMs,
      plays: 1,
      lastPlayedAt: new Date().toISOString(),
    };

    const insight = getProjectedReflexLeaderboardInsight(result.timeMs, leaderboard);
    const nextCompletion: ReflexCompletionState = {
      moves: result.moves,
      timeMs: result.timeMs,
      previousBest,
      currentBest,
      isNewBest: isNewReflexBest(previousBest, currentBest),
      projectedRank: insight.projectedRank,
      nextTarget: insight.nextTarget,
      leaderboardSize: leaderboard?.entries.length ?? 0,
    };

    setCompletion(nextCompletion);

    if (
      !session &&
      dontRemindSignin !== "true" &&
      qualifiesForLeaderboardPrompt(insight.projectedRank, nextCompletion.leaderboardSize)
    ) {
      setShowSignInPrompt(true);
    } else {
      setShowSignInPrompt(false);
    }
  }

  function restart(nextGhost: GhostTarget | null) {
    setCompletion(null);
    setShowSignInPrompt(false);
    setGhostOverride(nextGhost);
    setRunKey((current) => current + 1);
  }

  function resetRun() {
    restart(null);
  }

  function restartWithGhost(nextGhost: GhostTarget | null) {
    restart(nextGhost);
  }

  return (
    <Screen
      title="Play Reflex"
      subtitle={formatBoardLabel(levelId)}
      right={
        <AppButton
          label="Leaderboard"
          tone="ghost"
          size="sm"
          onPress={() => router.push("/(tabs)/leaderboard")}
        />
      }
    >
      {ghostTarget ? (
        <Card>
          <SectionLabel>Ghost Target</SectionLabel>
          <Text style={styles.resultTitle}>{ghostTarget.label}</Text>
          <Text style={styles.copy}>
            Chase {(ghostTarget.timeMs / 1000).toFixed(2)}s on this level.
          </Text>
        </Card>
      ) : isFallbackGhostLoading ? (
        <Card>
          <SectionLabel>Ghost Target</SectionLabel>
          <Text style={styles.resultTitle}>Loading target…</Text>
          <Text style={styles.copy}>
            Pulling the leaderboard pace before the run starts.
          </Text>
        </Card>
      ) : null}

      {completion ? (
        <>
          <Card>
            <SectionLabel>{completion.isNewBest ? "New personal best" : "Run complete"}</SectionLabel>
            <Text style={styles.resultTitle}>{completion.isNewBest ? "You lowered the target." : "Level cleared."}</Text>
            <View style={styles.badgeRow}>
              {completion.projectedRank ? <Badge label={`Projected #${completion.projectedRank}`} tone="accent" /> : null}
              <Badge label={completion.isNewBest ? "PB" : "Saved locally"} tone={completion.isNewBest ? "success" : "neutral"} />
            </View>
            <StatRow label="Rounds" value={`${completion.moves}`} />
            <StatRow label="Total time" value={`${(completion.timeMs / 1000).toFixed(2)}s`} />
            <StatRow label="Best on level" value={formatReflexBest(completion.currentBest)} />
            {ghostTarget ? (
              <StatRow
                label="Ghost result"
                value={formatPerformanceDelta("reflex", { moves: completion.moves, timeMs: completion.timeMs }, { moves: completion.moves, timeMs: ghostTarget.timeMs })}
              />
            ) : null}
            <Text style={styles.copy}>{describeReflexCompletion(completion)}</Text>
          </Card>

          <Card>
            <SectionLabel>Insights</SectionLabel>
            <StatRow
              label="Projected rank"
              value={completion.projectedRank ? `#${completion.projectedRank}` : "Leaderboard unavailable"}
            />
            <StatRow
              label="Next target"
              value={
                completion.nextTarget
                  ? `#${completion.nextTarget.rank} · ${formatPerformanceDelta(
                      "reflex",
                      { moves: completion.moves, timeMs: completion.timeMs },
                      completion.nextTarget
                    )}`
                  : completion.projectedRank === 1
                    ? "You would pace this slice"
                    : "No target loaded"
              }
            />
            <Text style={styles.copy}>
              Your result was stored locally and queued for sync. If you are online, the background sync worker will flush it.
            </Text>
          </Card>

          {showSignInPrompt && !session && completion.projectedRank ? (
            <Card>
              <SectionLabel>Strong guest run</SectionLabel>
              <Text style={styles.resultTitle}>This time would land around #{completion.projectedRank}.</Text>
              <Text style={styles.copy}>
                Sign in to keep your Reflex times attached to the same identity across mobile and web.
              </Text>
              <View style={styles.actions}>
                <AppButton label="Sign In" onPress={() => router.push("/auth/sign-in")} />
                <AppButton label="Not Now" tone="ghost" onPress={() => setShowSignInPrompt(false)} />
                <AppButton
                  label="Don't Remind Again"
                  tone="ghost"
                  onPress={() => {
                    void setPreference(PREFERENCE_KEYS.dontRemindSignin, "true").then(() => {
                      setShowSignInPrompt(false);
                    });
                  }}
                />
              </View>
            </Card>
          ) : null}

          <View style={styles.actions}>
            <AppButton label={completion.isNewBest ? "Defend PB" : "Play Again"} onPress={resetRun} />
            <AppButton
              label="Run PB Ghost"
              tone="ghost"
              onPress={() => restartWithGhost({
                label: "PB ghost",
                timeMs: completion.currentBest.bestTimeMs,
              })}
            />
            <AppButton label="View Ranking" tone="secondary" onPress={() => router.push("/(tabs)/leaderboard")} />
            <AppButton
              label="Challenge a Friend"
              tone="ghost"
              onPress={() => {
                void handleShare().catch(() => {});
              }}
            />
          </View>
        </>
      ) : isFallbackGhostLoading ? (
        <Card>
          <SectionLabel>Solo Run</SectionLabel>
          <Text style={styles.resultTitle}>Preparing ghost pace</Text>
          <Text style={styles.copy}>
            The run will unlock as soon as the fallback target finishes loading.
          </Text>
        </Card>
      ) : (
        <ReflexGame
          key={`${levelId}:${runKey}`}
          levelId={levelId}
          ghostTarget={ghostTarget}
          onComplete={async (result) => {
            await handleComplete(result);
          }}
        />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  resultTitle: {
    color: colors.textPrimary,
    fontSize: 22,
    fontWeight: "700",
    letterSpacing: -0.4,
  },
  badgeRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  copy: {
    color: colors.textSecondary,
    fontSize: 14,
    lineHeight: 20,
  },
  actions: {
    gap: 10,
  },
});
