import { useQuery } from "@tanstack/react-query";
import { FlashList } from "@shopify/flash-list";
import { useRouter } from "expo-router";
import { RefreshControl, StyleSheet, Text, View } from "react-native";
import { Screen } from "../../src/components/Screen";
import { AppButton, Badge, Card, SectionLabel, StatRow } from "../../src/components/ui";
import { fetchLeaderboard } from "../../src/lib/api";
import { colors } from "../../src/theme/tokens";
import type { LeaderboardResponse } from "@pixelz/ts-contracts";

const DEFAULT_LEVEL_ID = "pixelz_level_1";
type LeaderboardEntry = LeaderboardResponse["entries"][number];

export default function LeaderboardScreen() {
  const router = useRouter();
  const leaderboardQuery = useQuery({
    queryKey: ["leaderboard", DEFAULT_LEVEL_ID],
    queryFn: () => fetchLeaderboard(DEFAULT_LEVEL_ID),
  });

  return (
    <Screen
      title="Leaderboard"
      subtitle="See the fastest Pixelz runs for the current mobile board."
      scroll={false}
      right={
        <AppButton
          label="Play"
          tone="secondary"
          size="sm"
          onPress={() => router.push({ pathname: "/play/[levelId]", params: { levelId: DEFAULT_LEVEL_ID } })}
        />
      }
    >
      <FlashList<LeaderboardEntry>
        style={styles.list}
        data={leaderboardQuery.data?.entries ?? []}
        keyExtractor={(item) => `${item.userId}-${item.createdAt}`}
        ItemSeparatorComponent={() => <View style={styles.listSeparator} />}
        refreshControl={
          <RefreshControl
            refreshing={leaderboardQuery.isRefetching}
            onRefresh={() => {
              void leaderboardQuery.refetch();
            }}
            tintColor={colors.accent}
          />
        }
        ListHeaderComponent={
          <View style={styles.headerStack}>
            <Card>
              <SectionLabel>Board</SectionLabel>
              <StatRow label="Current level" value="Pixelz Level 1" />
              <Badge label="Live standings" tone="accent" />
            </Card>
          </View>
        }
        ListEmptyComponent={
          leaderboardQuery.isLoading ? (
            <Card>
              <Text style={styles.emptyTitle}>Loading leaderboard…</Text>
            </Card>
          ) : (
            <Card>
              <Text style={styles.emptyTitle}>No runs yet.</Text>
              <Text style={styles.emptyCopy}>Complete a Pixelz board to seed the mobile board.</Text>
            </Card>
          )
        }
        contentContainerStyle={styles.listContent}
        renderItem={({ item }) => (
          <Card>
            <SectionLabel>Rank #{item.rank}</SectionLabel>
            <Text style={styles.playerName}>{item.nickname ?? item.userId.slice(0, 8)}</Text>
            <StatRow label="Moves" value={`${item.moves}`} />
            <StatRow label="Time" value={`${(item.timeMs / 1000).toFixed(2)}s`} />
          </Card>
        )}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  list: {
    flex: 1,
  },
  headerStack: {
    paddingBottom: 16,
  },
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 32,
  },
  listSeparator: {
    height: 12,
  },
  emptyTitle: {
    color: colors.textPrimary,
    fontSize: 18,
    fontWeight: "700",
  },
  emptyCopy: {
    color: colors.textSecondary,
    fontSize: 14,
    lineHeight: 20,
  },
  playerName: {
    color: colors.textPrimary,
    fontSize: 20,
    fontWeight: "700",
  },
});
