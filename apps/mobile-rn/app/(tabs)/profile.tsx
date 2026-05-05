import { useEffect, useState } from "react";
import { FlashList } from "@shopify/flash-list";
import { useRouter } from "expo-router";
import { StyleSheet, Text, View } from "react-native";
import { formatBoardLabel } from "@pixelz/ts-game-core";
import { Screen } from "../../src/components/Screen";
import { AppButton, Card, SectionLabel, StatRow } from "../../src/components/ui";
import { getProfileSnapshot, type ProfileSnapshot } from "../../src/lib/db";
import { signOut } from "../../src/lib/api";
import { colors } from "../../src/theme/tokens";
import { useAuthStore } from "../../src/stores/auth-store";
import { useQueueStore } from "../../src/stores/queue-store";

export default function ProfileScreen() {
  const router = useRouter();
  const session = useAuthStore((state) => state.session);
  const pendingCount = useQueueStore((state) => state.pendingCount);
  const [snapshot, setSnapshot] = useState<ProfileSnapshot | null>(null);

  useEffect(() => {
    void getProfileSnapshot().then(setSnapshot).catch(() => {});
  }, []);

  return (
    <Screen
      title="Profile"
      subtitle="Your local mobile runs and sync status."
      scroll={false}
    >
      <FlashList<ProfileSnapshot["recentRuns"][number]>
        style={styles.list}
        data={snapshot?.recentRuns ?? []}
        keyExtractor={(item) => `${item.gameId}:${item.levelId}`}
        ItemSeparatorComponent={() => <View style={styles.listSeparator} />}
        ListHeaderComponent={
          <View style={styles.headerStack}>
            <Card>
              <SectionLabel>Identity</SectionLabel>
              <StatRow label="Mode" value={session?.user.email ?? "Guest"} />
              <StatRow label="Pending sync" value={`${pendingCount}`} />
              {session ? (
                <AppButton
                  label="Sign Out"
                  tone="ghost"
                  onPress={() => {
                    void signOut();
                  }}
                />
              ) : (
                <AppButton label="Sign In" onPress={() => router.push("/auth/sign-in")} />
              )}
            </Card>

            <Card>
              <SectionLabel>Stats</SectionLabel>
              <StatRow label="Total plays" value={`${snapshot?.totalPlays ?? 0}`} />
              <StatRow label="Best boards" value={`${snapshot?.bestBoards ?? 0}`} />
            </Card>
          </View>
        }
        ListEmptyComponent={
          <Card>
            <Text style={styles.emptyTitle}>No local runs yet.</Text>
            <Text style={styles.emptyCopy}>Play a Pixelz board to seed your mobile profile.</Text>
          </Card>
        }
        contentContainerStyle={styles.listContent}
        renderItem={({ item }) => (
          <Card>
            <SectionLabel>{item.gameId}</SectionLabel>
            <Text style={styles.runTitle}>{formatBoardLabel(item.levelId)}</Text>
            <StatRow label="Best" value={`${item.bestMoves} moves · ${(item.bestTimeMs / 1000).toFixed(2)}s`} />
            <StatRow label="Plays" value={`${item.plays}`} />
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
    gap: 16,
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
  runTitle: {
    color: colors.textPrimary,
    fontSize: 18,
    fontWeight: "700",
    textTransform: "capitalize",
  },
});
