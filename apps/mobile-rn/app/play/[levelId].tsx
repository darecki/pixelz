import { useState } from "react";
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
  isNewPixelzBest,
  qualifiesForLeaderboardPrompt,
} from "../../src/lib/play-results";
import { buildPlayShareMessage } from "../../src/lib/share";
import { colors } from "../../src/theme/tokens";
import { useAuthStore } from "../../src/stores/auth-store";

type CompletionState = {
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

function formatPixelzBest(progress: LevelProgressSnapshot): string {
  return `${progress.bestMoves} moves · ${(progress.bestTimeMs / 1000).toFixed(2)}s`;
}

function describeCompletion(completion: CompletionState): string {
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

export default function PlayLevelScreen() {
  const params = useLocalSearchParams<{ levelId: string }>();
  const router = useRouter();
  const session = useAuthStore((state) => state.session);
  const [completion, setCompletion] = useState<CompletionState | null>(null);
  const [showReplay, setShowReplay] = useState(false);
  const [showSignInPrompt, setShowSignInPrompt] = useState(false);

  const boardQuery = useQuery({
    queryKey: ["board", params.levelId],
    queryFn: () => fetchBoard(params.levelId),
    enabled: Boolean(params.levelId),
  });

  if (!params.levelId) {
    return <CenteredMessage title="Missing level" message="A board id is required to start a run." />;
  }

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
      message: buildPlayShareMessage(params.levelId, completion),
    });
  }

  async function handleComplete(result: { score: number; moves: number; timeMs: number; moveSequence: number[] }) {
    const previousBestProgress = await getLevelProgress("pixelz", params.levelId);
    const previousBest = previousBestProgress
      ? { moves: previousBestProgress.bestMoves, timeMs: previousBestProgress.bestTimeMs }
      : null;

    await recordLevelResult({
      gameId: "pixelz",
      levelId: params.levelId,
      moves: result.moves,
      timeMs: result.timeMs,
      dailyChallenge: isDailyPixelzBoardId(params.levelId),
    });
    await enqueueEvent({
      type: "LEVEL_COMPLETED",
      payload: {
        levelId: params.levelId,
        score: result.score,
        moves: result.moves,
        timeMs: result.timeMs,
        moveSequence: result.moveSequence,
      },
    });
    void trySyncInBackground();

    const [savedBest, leaderboard, dontRemindSignin] = await Promise.all([
      getLevelProgress("pixelz", params.levelId),
      fetchLeaderboard(params.levelId).catch(() => null),
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
    const nextCompletion: CompletionState = {
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
      subtitle={formatBoardLabel(params.levelId)}
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
            <Text style={styles.copy}>{describeCompletion(completion)}</Text>
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
