import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter } from "expo-router";
import { StyleSheet, Text } from "react-native";
import { formatBoardLabel, isDailyPixelzBoardId } from "@pixelz/ts-game-core";
import { CenteredMessage, Screen } from "../../src/components/Screen";
import { AppButton, Card, SectionLabel, StatRow } from "../../src/components/ui";
import { PixelzGame } from "../../src/features/pixelz/PixelzGame";
import { fetchBoard } from "../../src/lib/api";
import { enqueueEvent, trySyncInBackground } from "../../src/lib/offline-sync";
import { recordLevelResult } from "../../src/lib/db";
import { colors } from "../../src/theme/tokens";

export default function PlayLevelScreen() {
  const params = useLocalSearchParams<{ levelId: string }>();
  const router = useRouter();
  const [completion, setCompletion] = useState<{ moves: number; timeMs: number } | null>(null);

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
        <Card>
          <SectionLabel>Run Complete</SectionLabel>
          <StatRow label="Moves" value={`${completion.moves}`} />
          <StatRow label="Time" value={`${(completion.timeMs / 1000).toFixed(2)}s`} />
          <AppButton label="Play Again" onPress={() => setCompletion(null)} />
          <AppButton label="Go To Leaderboard" tone="secondary" onPress={() => router.push("/(tabs)/leaderboard")} />
        </Card>
      ) : null}

      {!completion ? (
        <PixelzGame
          board={boardQuery.data}
          onComplete={async (result) => {
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
            trySyncInBackground();
            setCompletion({ moves: result.moves, timeMs: result.timeMs });
          }}
        />
      ) : (
        <Text style={styles.copy}>
          Your result was stored locally and queued for sync. If you are online, the background sync worker will flush it.
        </Text>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  copy: {
    color: colors.textSecondary,
    fontSize: 14,
    lineHeight: 20,
  },
});
