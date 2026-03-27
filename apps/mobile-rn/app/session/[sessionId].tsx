import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { FlashList } from "@shopify/flash-list";
import { useLocalSearchParams, useRouter } from "expo-router";
import { StyleSheet, Text, View } from "react-native";
import { describeSessionFormat, formatBoardLabel } from "@pixelz/ts-game-core";
import { CenteredMessage, Screen } from "../../src/components/Screen";
import { AppButton, Badge, Card, SectionLabel, StatRow } from "../../src/components/ui";
import { PixelzGame } from "../../src/features/pixelz/PixelzGame";
import {
  beginSession,
  fetchBoard,
  fetchSession,
  finishSession,
  leaveSession,
  markSessionReady,
  type SessionResponse,
} from "../../src/lib/api";
import { toBoardSettings } from "../../src/lib/session-format";
import { useSessionRealtime } from "../../src/lib/session-realtime";
import { colors } from "../../src/theme/tokens";
import { useSessionRoomStore } from "../../src/stores/session-room-store";

export default function SessionScreen() {
  const params = useLocalSearchParams<{ sessionId: string }>();
  const router = useRouter();
  const [pendingAction, setPendingAction] = useState<"ready" | "begin" | "leave" | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const progressByUser = useSessionRoomStore((state) => state.progressByUser);
  const onlineIds = useSessionRoomStore((state) => state.onlineIds);

  const sessionQuery = useQuery({
    queryKey: ["session", params.sessionId],
    queryFn: () => fetchSession(params.sessionId),
    enabled: Boolean(params.sessionId),
    refetchInterval: (query) => {
      const data = query.state.data;
      if (!data) return 1_000;
      return data.session.status === "waiting" || data.session.status === "ready" ? 1_000 : false;
    },
  });

  const sessionData = sessionQuery.data;
  const boardSettings = sessionData ? toBoardSettings(sessionData.session.settings) : undefined;
  const currentPlayer =
    sessionData?.players.find((player) => player.userId === sessionData.currentUserId) ?? null;

  const { broadcast, broadcastProgress } = useSessionRealtime(
    sessionData?.session.id ?? null,
    sessionData?.currentUserId ?? null,
    () => {
      void sessionQuery.refetch();
    }
  );

  const boardQuery = useQuery({
    queryKey: ["session-board", sessionData?.session.levelId],
    queryFn: () => fetchBoard(sessionData!.session.levelId!),
    enabled:
      Boolean(
        sessionData?.session.game === "pixelz" &&
          sessionData.session.levelId &&
          sessionData.session.status === "playing"
      ),
  });

  useEffect(() => {
    if (sessionData?.session.status === "playing" && currentPlayer?.status === "finished") {
      const timeout = setTimeout(() => {
        void sessionQuery.refetch();
      }, 1_000);
      return () => clearTimeout(timeout);
    }
  }, [currentPlayer?.status, sessionData?.session.status, sessionQuery]);

  if (!params.sessionId) {
    return <CenteredMessage title="Missing session" message="A session id is required to open the room." />;
  }

  if (sessionQuery.isLoading) {
    return <CenteredMessage title="Loading session…" message="Fetching room state, players, and permissions." />;
  }

  if (sessionQuery.error || !sessionData) {
    return (
      <CenteredMessage
        title="Session unavailable"
        message={sessionQuery.error instanceof Error ? sessionQuery.error.message : "The session could not be loaded."}
      />
    );
  }

  async function runSessionAction(
    action: "ready" | "begin" | "leave",
    operation: () => Promise<void>
  ) {
    setPendingAction(action);
    setActionError(null);
    try {
      await operation();
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Session action failed");
    } finally {
      setPendingAction(null);
    }
  }

  return (
    <Screen
      title="Session Room"
      subtitle={`Invite ${sessionData.session.inviteCode}`}
      scroll={false}
      right={<Badge label={sessionData.session.status} tone={sessionData.session.status === "playing" ? "accent" : "neutral"} />}
    >
      <FlashList<SessionResponse["players"][number]>
        style={styles.list}
        data={sessionData.players}
        keyExtractor={(item) => item.userId}
        contentContainerStyle={styles.listContent}
        ListHeaderComponent={
          <Card>
            <SectionLabel>Match</SectionLabel>
            <StatRow label="Game" value={sessionData.session.game} />
            <StatRow
              label="Board"
              value={
                sessionData.session.levelId
                  ? formatBoardLabel(sessionData.session.levelId, boardSettings)
                  : "custom"
              }
            />
            <StatRow
              label="Format"
              value={describeSessionFormat(
                sessionData.session.game,
                sessionData.session.levelId,
                boardSettings
              )}
            />
            <StatRow label="Players" value={`${sessionData.players.length} / ${sessionData.session.maxPlayers}`} />
            {actionError ? <Text style={styles.error}>{actionError}</Text> : null}
            <View style={styles.actions}>
              {sessionData.session.status === "waiting" ? (
                <AppButton
                  label={currentPlayer?.status === "ready" ? "Ready Sent" : "Mark Ready"}
                  loading={pendingAction === "ready"}
                  disabled={currentPlayer?.status === "ready" || pendingAction != null}
                  onPress={() => {
                    void runSessionAction("ready", async () => {
                      await markSessionReady(sessionData.session.id);
                      await broadcast("player_ready", { sessionId: sessionData.session.id });
                      await sessionQuery.refetch();
                    });
                  }}
                />
              ) : null}
              {sessionData.session.status === "ready" && currentPlayer?.role === "host" ? (
                <AppButton
                  label="Begin Match"
                  tone="secondary"
                  loading={pendingAction === "begin"}
                  disabled={pendingAction != null}
                  onPress={() => {
                    void runSessionAction("begin", async () => {
                      await beginSession(sessionData.session.id);
                      await sessionQuery.refetch();
                    });
                  }}
                />
              ) : null}
              <AppButton
                label="Leave"
                tone="ghost"
                loading={pendingAction === "leave"}
                disabled={pendingAction != null}
                onPress={() => {
                  void runSessionAction("leave", async () => {
                    await leaveSession(sessionData.session.id);
                    router.replace("/(tabs)");
                  });
                }}
              />
            </View>
          </Card>
        }
        ListFooterComponent={
          <View style={styles.footerStack}>
            {sessionData.session.status === "playing" &&
            sessionData.session.game === "pixelz" &&
            currentPlayer?.status !== "finished" ? (
              boardQuery.data ? (
                <PixelzGame
                  board={boardQuery.data}
                  onProgress={(progress) => {
                    void broadcastProgress(progress);
                  }}
                  onComplete={async (result) => {
                    await finishSession(sessionData.session.id, {
                      moves: result.moves,
                      timeMs: result.timeMs,
                      moveSequence: result.moveSequence,
                    });
                    await broadcast("player_finished", { sessionId: sessionData.session.id });
                    await sessionQuery.refetch();
                  }}
                />
              ) : (
                <Card>
                  <SectionLabel>Gameplay</SectionLabel>
                  <Text style={styles.copy}>Loading the session board…</Text>
                </Card>
              )
            ) : null}
            {sessionData.session.status === "finished" ? (
              <Card>
                <SectionLabel>Results</SectionLabel>
                <Text style={styles.copy}>The first slice stops at result display and does not create the next match yet.</Text>
              </Card>
            ) : null}
          </View>
        }
        ItemSeparatorComponent={() => <View style={styles.listSeparator} />}
        renderItem={({ item }) => {
          const progress = progressByUser[item.userId];
          const isOnline = onlineIds.includes(item.userId);
          return (
            <Card>
              <SectionLabel>{item.role}</SectionLabel>
              <Text style={styles.playerName}>{item.nickname ?? item.userId.slice(0, 8)}</Text>
              <View style={styles.statusRow}>
                <Badge label={item.status} tone={item.status === "finished" ? "success" : "neutral"} />
                <Badge label={isOnline ? "online" : "offline"} tone={isOnline ? "success" : "warning"} />
              </View>
              <StatRow label="Progress" value={progress ? `${progress.moves} moves · ${(progress.timeMs / 1000).toFixed(1)}s` : "No live ping"} />
              {item.score != null ? <StatRow label="Score" value={`${item.score}`} /> : null}
            </Card>
          );
        }}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  list: {
    flex: 1,
  },
  actions: {
    gap: 10,
  },
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 24,
  },
  listSeparator: {
    height: 12,
  },
  footerStack: {
    gap: 16,
    paddingTop: 16,
  },
  playerName: {
    color: colors.textPrimary,
    fontSize: 20,
    fontWeight: "700",
  },
  statusRow: {
    flexDirection: "row",
    gap: 8,
    flexWrap: "wrap",
  },
  copy: {
    color: colors.textSecondary,
    fontSize: 14,
    lineHeight: 20,
  },
  error: {
    color: colors.error,
    fontSize: 14,
    lineHeight: 20,
  },
});
