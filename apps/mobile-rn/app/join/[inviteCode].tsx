import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter } from "expo-router";
import { StyleSheet, Text } from "react-native";
import { CenteredMessage, Screen } from "../../src/components/Screen";
import { AppButton, Badge, Card, SectionLabel, StatRow } from "../../src/components/ui";
import { fetchSessionInvite, joinSession } from "../../src/lib/api";
import { colors } from "../../src/theme/tokens";

export default function JoinSessionScreen() {
  const params = useLocalSearchParams<{ inviteCode: string }>();
  const router = useRouter();
  const [joining, setJoining] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inviteQuery = useQuery({
    queryKey: ["session-invite", params.inviteCode],
    queryFn: () => fetchSessionInvite(params.inviteCode),
    enabled: Boolean(params.inviteCode),
  });

  if (!params.inviteCode) {
    return <CenteredMessage title="Missing invite" message="Open a valid invite link to join a session." />;
  }

  if (inviteQuery.isLoading) {
    return <CenteredMessage title="Loading invite…" message="Checking the invite preview and session state." />;
  }

  if (inviteQuery.error || !inviteQuery.data) {
    return (
      <CenteredMessage
        title="Invite unavailable"
        message={inviteQuery.error instanceof Error ? inviteQuery.error.message : "The invite could not be loaded."}
      />
    );
  }

  const preview = inviteQuery.data;

  async function handleJoin() {
    setJoining(true);
    setError(null);
    try {
      await joinSession(preview.sessionId);
      router.replace({ pathname: "/session/[sessionId]", params: { sessionId: preview.sessionId } });
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Failed to join session");
    } finally {
      setJoining(false);
    }
  }

  return (
    <Screen title="Join Session" subtitle="Preview the match before you jump into the room.">
      <Card>
        <SectionLabel>Preview</SectionLabel>
        <Badge label={preview.status} tone={preview.status === "waiting" ? "success" : "warning"} />
        <StatRow label="Game" value={preview.game} />
        <StatRow label="Board" value={preview.levelId ?? "custom"} />
        <StatRow label="Max players" value={`${preview.maxPlayers}`} />
        <StatRow label="Host" value={preview.hostNickname ?? "Anonymous host"} />
        {error ? <Text style={styles.error}>{error}</Text> : null}
        <AppButton
          label="Join Session"
          loading={joining}
          disabled={preview.status !== "waiting"}
          onPress={() => { void handleJoin(); }}
        />
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  error: {
    color: colors.error,
    fontSize: 14,
    lineHeight: 20,
  },
});
