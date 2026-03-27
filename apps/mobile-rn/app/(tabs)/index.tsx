import { useEffect } from "react";
import performance from "react-native-performance";
import { useRouter } from "expo-router";
import { StyleSheet, Text } from "react-native";
import { Screen } from "../../src/components/Screen";
import { AppButton, Badge, Card, SectionLabel, StatRow } from "../../src/components/ui";
import { colors } from "../../src/theme/tokens";
import { useAuthStore } from "../../src/stores/auth-store";
import { useQueueStore } from "../../src/stores/queue-store";

const QUICK_PLAY_LEVEL = "pixelz_level_1";

export default function HomeScreen() {
  const router = useRouter();
  const session = useAuthStore((state) => state.session);
  const pendingCount = useQueueStore((state) => state.pendingCount);
  const refreshPendingCount = useQueueStore((state) => state.refreshPendingCount);

  useEffect(() => {
    performance.mark("screenInteractive");
    void refreshPendingCount();
  }, [refreshPendingCount]);

  return (
    <Screen
      title="Pixelz"
      subtitle="Quick play, leaderboard reads, and session entry on the same backend as the web app."
    >
      <Card>
        <SectionLabel>Status</SectionLabel>
        <Badge label={session ? "Signed in" : "Guest mode"} tone={session ? "success" : "accent"} />
        <StatRow label="Pending sync events" value={`${pendingCount}`} />
      </Card>

      <Card>
        <SectionLabel>Quick Start</SectionLabel>
        <AppButton
          label="Quick Play Pixelz"
          onPress={() => router.push({ pathname: "/play/[levelId]", params: { levelId: QUICK_PLAY_LEVEL } })}
        />
        {!session ? (
          <AppButton
            label="Sign In"
            tone="ghost"
            onPress={() => router.push("/auth/sign-in")}
          />
        ) : null}
      </Card>

      <Card>
        <SectionLabel>Sessions</SectionLabel>
        <Text style={styles.copy}>
          Open any pixelz:// or app link into /join/:inviteCode to jump straight into a session preview.
        </Text>
        <AppButton
          label="Open Sample Invite Route"
          tone="ghost"
          onPress={() => router.push({ pathname: "/join/[inviteCode]", params: { inviteCode: "demo1234" } })}
        />
      </Card>
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
