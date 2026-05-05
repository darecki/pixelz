import { useCallback, useEffect, useMemo, useState } from "react";
import performance from "react-native-performance";
import { useFocusEffect, useRouter } from "expo-router";
import { StyleSheet, Text, View } from "react-native";
import {
  formatBoardLabel,
  formatCountdown,
  getCurrentSeason,
  getDailyChallenges,
  getQuickPlayLevel,
  type CompetitionOverview,
} from "@pixelz/ts-game-core";
import { Screen } from "../../src/components/Screen";
import { AppButton, Badge, Card, SectionLabel, StatRow } from "../../src/components/ui";
import {
  getCompetitionOverviewSnapshot,
  getLevelProgress,
  getProfileSnapshot,
  type LevelProgressSnapshot,
  type ProfileSnapshot,
} from "../../src/lib/db";
import { colors, radii } from "../../src/theme/tokens";
import { useAuthStore } from "../../src/stores/auth-store";
import { useQueueStore } from "../../src/stores/queue-store";

type HomeSnapshot = {
  overview: CompetitionOverview;
  profile: ProfileSnapshot;
  quickPlayProgress: LevelProgressSnapshot | null;
  dailyProgress: LevelProgressSnapshot | null;
};

function formatPixelzBest(progress: LevelProgressSnapshot | null): string {
  if (!progress) return "No run yet";
  return `${progress.bestMoves} moves · ${(progress.bestTimeMs / 1000).toFixed(2)}s`;
}

function formatStreak(days: number): string {
  return `${days} day${days === 1 ? "" : "s"}`;
}

export default function HomeScreen() {
  const router = useRouter();
  const session = useAuthStore((state) => state.session);
  const pendingCount = useQueueStore((state) => state.pendingCount);
  const refreshPendingCount = useQueueStore((state) => state.refreshPendingCount);
  const [now, setNow] = useState(() => new Date());
  const [snapshot, setSnapshot] = useState<HomeSnapshot | null>(null);

  const daily = useMemo(() => getDailyChallenges(now), [now]);
  const season = useMemo(() => getCurrentSeason(now), [now]);
  const quickPlayLevel = getQuickPlayLevel("pixelz");
  const dailyPixelz = daily.challenges.find((challenge) => challenge.gameId === "pixelz") ?? null;
  const dailyDone = snapshot?.overview.completedToday.includes("pixelz") ?? false;

  const refreshDashboard = useCallback(async (currentNow = new Date()) => {
    const currentDaily = getDailyChallenges(currentNow).challenges.find((challenge) => challenge.gameId === "pixelz") ?? null;

    const [overview, profile, quickPlayProgress, dailyProgress] = await Promise.all([
      getCompetitionOverviewSnapshot(currentNow),
      getProfileSnapshot(),
      getLevelProgress("pixelz", quickPlayLevel),
      currentDaily ? getLevelProgress("pixelz", currentDaily.levelId) : Promise.resolve(null),
    ]);

    setSnapshot({
      overview,
      profile,
      quickPlayProgress,
      dailyProgress,
    });
  }, [quickPlayLevel]);

  useEffect(() => {
    performance.mark("screenInteractive");
    void refreshPendingCount();
    void refreshDashboard(new Date());
  }, [refreshDashboard, refreshPendingCount]);

  useEffect(() => {
    const id = setInterval(() => {
      setNow(new Date());
    }, 1_000);

    return () => {
      clearInterval(id);
    };
  }, []);

  useFocusEffect(
    useCallback(() => {
      const currentNow = new Date();
      setNow(currentNow);
      void refreshPendingCount();
      void refreshDashboard(currentNow);
    }, [refreshDashboard, refreshPendingCount])
  );

  useEffect(() => {
    void refreshDashboard(new Date());
  }, [daily.dateKey, refreshDashboard]);

  return (
    <Screen
      title="Pixelz"
      subtitle="Daily board, quick runs, and session entry on the same backend the web app already uses."
    >
      <Card>
        <SectionLabel>Today</SectionLabel>
        <View style={styles.metricGrid}>
          <View style={styles.metricTile}>
            <Text style={styles.metricLabel}>Daily reset</Text>
            <Text style={styles.metricValue}>{formatCountdown(daily.resetInMs)}</Text>
          </View>
          <View style={styles.metricTile}>
            <Text style={styles.metricLabel}>Current streak</Text>
            <Text style={styles.metricValue}>{formatStreak(snapshot?.overview.streak ?? 0)}</Text>
          </View>
          <View style={styles.metricTile}>
            <Text style={styles.metricLabel}>Season</Text>
            <Text style={styles.metricValue}>{season.shortLabel}</Text>
          </View>
          <View style={styles.metricTile}>
            <Text style={styles.metricLabel}>Pending sync</Text>
            <Text style={styles.metricValue}>{pendingCount}</Text>
          </View>
        </View>
        <View style={styles.badgeRow}>
          <Badge label={dailyDone ? "Daily done" : "Daily live"} tone={dailyDone ? "success" : "accent"} />
          <Badge label={session ? "Signed in" : "Guest mode"} tone={session ? "success" : "warning"} />
        </View>
      </Card>

      <Card>
        <SectionLabel>Pixelz</SectionLabel>
        <Text style={styles.cardTitle}>{dailyPixelz?.label ?? "Pixelz Quick Play"}</Text>
        <Text style={styles.copy}>
          {dailyPixelz?.subtitle ?? "Start with the standard board, then graduate into daily generated layouts."}
        </Text>
        {dailyPixelz ? <StatRow label="Today's board" value={formatBoardLabel(dailyPixelz.levelId)} /> : null}
        <StatRow label="Daily result" value={dailyDone ? formatPixelzBest(snapshot?.dailyProgress ?? null) : "Not cleared yet"} />
        <StatRow label="Quick play PB" value={formatPixelzBest(snapshot?.quickPlayProgress ?? null)} />
        <StatRow label="Total local runs" value={`${snapshot?.profile.totalPlays ?? 0}`} />
        {dailyPixelz ? (
          <AppButton
            label={dailyDone ? "Play Daily Again" : "Today's Challenge"}
            onPress={() => router.push({ pathname: "/play/[levelId]", params: { levelId: dailyPixelz.levelId } })}
          />
        ) : null}
        <AppButton
          label="Quick Play Pixelz"
          tone="secondary"
          onPress={() => router.push({ pathname: "/play/[levelId]", params: { levelId: quickPlayLevel } })}
        />
      </Card>

      <Card>
        <SectionLabel>Sessions</SectionLabel>
        <Text style={styles.copy}>
          Open any pixelz:// or app link into /join/:inviteCode to jump straight into the mobile session preview.
        </Text>
        <AppButton
          label="Create Match"
          tone="secondary"
          onPress={() => router.push({ pathname: "/configure/[gameId]", params: { gameId: "pixelz" } })}
        />
        <AppButton
          label="Open Sample Invite Route"
          tone="ghost"
          onPress={() => router.push({ pathname: "/join/[inviteCode]", params: { inviteCode: "demo1234" } })}
        />
      </Card>

      {!session ? (
        <Card>
          <SectionLabel>Account</SectionLabel>
          <Text style={styles.copy}>
            Sign in to attach synced results to your profile and carry the same identity across web and mobile.
          </Text>
          <StatRow label="Best boards" value={`${snapshot?.profile.bestBoards ?? 0}`} />
          <AppButton label="Sign In" tone="ghost" onPress={() => router.push("/auth/sign-in")} />
        </Card>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  metricGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
  },
  metricTile: {
    width: "48%",
    minWidth: 140,
    backgroundColor: colors.bgSecondary,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 12,
    paddingVertical: 12,
    gap: 6,
  },
  metricLabel: {
    color: colors.textSecondary,
    fontSize: 12,
    letterSpacing: 0.3,
    textTransform: "uppercase",
    fontWeight: "600",
  },
  metricValue: {
    color: colors.textPrimary,
    fontSize: 18,
    fontWeight: "700",
  },
  badgeRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  cardTitle: {
    color: colors.textPrimary,
    fontSize: 22,
    fontWeight: "700",
    letterSpacing: -0.4,
  },
  copy: {
    color: colors.textSecondary,
    fontSize: 14,
    lineHeight: 20,
  },
});
