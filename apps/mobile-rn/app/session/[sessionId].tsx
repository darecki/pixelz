import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { FlashList } from "@shopify/flash-list";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Share, StyleSheet, Text, View } from "react-native";
import { describeSessionFormat, formatBoardLabel, getSeriesMeta } from "@pixelz/ts-game-core";
import { PixelzReplayViewer } from "../../src/components/PixelzReplayViewer";
import { CenteredMessage, Screen } from "../../src/components/Screen";
import { AppButton, Badge, Card, SectionLabel, StatRow } from "../../src/components/ui";
import { PixelzGame } from "../../src/features/pixelz/PixelzGame";
import { ReflexGame } from "../../src/features/reflex/ReflexGame";
import {
  beginSession,
  createNextSession,
  fetchBoard,
  fetchSession,
  finishSession,
  leaveSession,
  markSessionReady,
  type SessionResponse,
} from "../../src/lib/api";
import { buildSessionInviteShareMessage } from "../../src/lib/share";
import { toBoardSettings } from "../../src/lib/session-format";
import { useSessionRealtime } from "../../src/lib/session-realtime";
import { colors, radii } from "../../src/theme/tokens";
import { useSessionRoomStore } from "../../src/stores/session-room-store";

function gameLabel(gameId: "pixelz" | "reflex") {
  return gameId === "pixelz" ? "Pixelz" : "Reflex";
}

function getStatusTone(status: SessionResponse["session"]["status"]): "neutral" | "success" | "accent" | "warning" {
  if (status === "finished") return "success";
  if (status === "playing" || status === "ready") return "accent";
  if (status === "cancelled" || status === "abandoned") return "warning";
  return "neutral";
}

function getPlayerStatusTone(status: SessionResponse["players"][number]["status"]): "neutral" | "success" | "accent" | "warning" {
  if (status === "finished") return "success";
  if (status === "playing" || status === "ready") return "accent";
  if (status === "abandoned") return "warning";
  return "neutral";
}

export default function SessionScreen() {
  const params = useLocalSearchParams<{ sessionId: string }>();
  const router = useRouter();
  const pendingNavigationRef = useRef<string | null>(null);
  const [pendingAction, setPendingAction] = useState<"ready" | "begin" | "leave" | "next" | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [showWinnerReplay, setShowWinnerReplay] = useState(false);
  const progressByUser = useSessionRoomStore((state) => state.progressByUser);
  const onlineIds = useSessionRoomStore((state) => state.onlineIds);

  const sessionQuery = useQuery({
    queryKey: ["session", params.sessionId],
    queryFn: () => fetchSession(params.sessionId),
    enabled: Boolean(params.sessionId),
    refetchInterval: (query) => {
      const data = query.state.data;
      if (!data) return 1_000;
      const currentPlayer = data.players.find((player) => player.userId === data.currentUserId) ?? null;
      const isTerminalSession =
        data.session.status === "finished" || data.session.status === "cancelled" || data.session.status === "abandoned";
      if (data.session.status === "waiting" || data.session.status === "ready") {
        return 1_000;
      }
      if (data.session.status === "playing" && currentPlayer?.status === "finished") {
        return 1_000;
      }
      if (isTerminalSession && !data.session.nextSessionId && !data.session.partyEndedAt) {
        return 1_000;
      }
      return false;
    },
  });

  const sessionData = sessionQuery.data;
  const boardSettings = sessionData ? toBoardSettings(sessionData.session.settings) : undefined;
  const currentPlayer =
    sessionData?.players.find((player) => player.userId === sessionData.currentUserId) ?? null;
  const isTerminalSession =
    sessionData?.session.status === "finished" ||
    sessionData?.session.status === "cancelled" ||
    sessionData?.session.status === "abandoned";

  const { broadcast, broadcastProgress } = useSessionRealtime(
    sessionData?.session.id ?? null,
    sessionData?.currentUserId ?? null,
    () => {
      void sessionQuery.refetch();
    }
  );

  useEffect(() => {
    pendingNavigationRef.current = params.sessionId;
  }, [params.sessionId]);

  function replaceWithSession(nextSessionId: string) {
    if (!nextSessionId || nextSessionId === params.sessionId || pendingNavigationRef.current === nextSessionId) {
      return;
    }
    pendingNavigationRef.current = nextSessionId;
    router.replace({ pathname: "/session/[sessionId]", params: { sessionId: nextSessionId } });
  }

  useEffect(() => {
    const nextSessionId = sessionData?.session.nextSessionId;
    if (!nextSessionId) return;
    replaceWithSession(nextSessionId);
  }, [params.sessionId, sessionData?.session.nextSessionId]);

  const boardQuery = useQuery({
    queryKey: ["session-board", sessionData?.session.levelId],
    queryFn: () => fetchBoard(sessionData!.session.levelId!),
    enabled:
      Boolean(
        sessionData?.session.game === "pixelz" &&
          sessionData.session.levelId &&
          (sessionData.session.status === "playing" || isTerminalSession)
      ),
  });

  const sortedPlayers = useMemo(() => {
    if (!sessionData) return [];
    return [...sessionData.players].sort((a, b) => {
      if (a.placement != null && b.placement != null) return a.placement - b.placement;
      if (a.placement != null) return -1;
      if (b.placement != null) return 1;
      return a.userId.localeCompare(b.userId);
    });
  }, [sessionData]);

  const seriesMeta = useMemo(
    () => getSeriesMeta(boardSettings, isTerminalSession ? sessionData?.session.winnerId : null),
    [boardSettings, isTerminalSession, sessionData?.session.winnerId]
  );

  const replayWinner = useMemo(() => {
    return sortedPlayers.find((player) => player.placement === 1 && (player.moveSequence?.length ?? 0) > 0) ?? null;
  }, [sortedPlayers]);

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

  const boardLabel = sessionData.session.levelId
    ? formatBoardLabel(sessionData.session.levelId, boardSettings)
    : "Custom format";
  const formatLabel = describeSessionFormat(
    sessionData.session.game,
    sessionData.session.levelId,
    boardSettings
  );
  const canCreateNextSession = Boolean(
    isTerminalSession &&
      currentPlayer?.role === "host" &&
      sessionData.session.status === "finished" &&
      !seriesMeta.decided
  );
  const nextRoundLabel =
    seriesMeta.length === 3
      ? seriesMeta.round + 1 === 3
        ? "Play Decider"
        : `Play Round ${seriesMeta.round + 1}`
      : "Play Next Game";

  async function runSessionAction(
    action: "ready" | "begin" | "leave" | "next",
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

  async function handleShareInvite() {
    if (!sessionData) return;
    await Share.share({
      message: buildSessionInviteShareMessage({
        inviteCode: sessionData.session.inviteCode,
        gameLabel: gameLabel(sessionData.session.game),
        boardLabel,
        formatLabel,
      }),
    });
  }

  if (isTerminalSession) {
    const continuationMessage =
      seriesMeta.length === 3 && seriesMeta.decided
        ? "Series complete. Start a fresh match to run it back."
        : sessionData.session.partyEndedAt
          ? "The host ended the party."
          : sessionData.session.status === "cancelled"
            ? "The lobby was cancelled before the round could start."
            : sessionData.session.status === "abandoned"
              ? "The match was abandoned before the final result settled."
              : "Waiting for host to start the next game.";

    return (
      <Screen
        title="Session Results"
        subtitle={`Invite ${sessionData.session.inviteCode}`}
        right={<Badge label={sessionData.session.status} tone={getStatusTone(sessionData.session.status)} />}
      >
        <Card>
          <SectionLabel>Match Complete</SectionLabel>
          <Text style={styles.title}>{gameLabel(sessionData.session.game)}</Text>
          <View style={styles.metricGrid}>
            <View style={styles.metricTile}>
              <Text style={styles.metricLabel}>Board</Text>
              <Text style={styles.metricValue}>{boardLabel}</Text>
            </View>
            <View style={styles.metricTile}>
              <Text style={styles.metricLabel}>Format</Text>
              <Text style={styles.metricValue}>{formatLabel}</Text>
            </View>
            <View style={styles.metricTile}>
              <Text style={styles.metricLabel}>Series</Text>
              <Text style={styles.metricValue}>{seriesMeta.length === 3 ? `Round ${seriesMeta.round} of 3` : "Single match"}</Text>
            </View>
            <View style={styles.metricTile}>
              <Text style={styles.metricLabel}>Players</Text>
              <Text style={styles.metricValue}>{`${sessionData.players.length} / ${sessionData.session.maxPlayers}`}</Text>
            </View>
          </View>
          {actionError ? <Text style={styles.error}>{actionError}</Text> : null}
        </Card>

        {seriesMeta.length === 3 ? (
          <Card>
            <SectionLabel>Series Score</SectionLabel>
            <View style={styles.scoreboard}>
              {sortedPlayers.map((player) => (
                <View key={player.userId} style={styles.scoreChip}>
                  <Text style={styles.scoreChipName}>{player.nickname ?? player.userId.slice(0, 8)}</Text>
                  <Text style={styles.scoreChipValue}>{seriesMeta.wins[player.userId] ?? 0} wins</Text>
                </View>
              ))}
            </View>
          </Card>
        ) : null}

        <View style={styles.stack}>
          {sortedPlayers.map((item) => (
            <Card key={item.userId}>
              <View style={styles.resultHeader}>
                <View style={styles.resultHeaderCopy}>
                  <SectionLabel>{item.role}</SectionLabel>
                  <Text style={styles.playerName}>{item.nickname ?? item.userId.slice(0, 8)}</Text>
                </View>
                <View style={styles.resultBadges}>
                  {item.placement != null ? <Badge label={`#${item.placement}`} tone={item.placement === 1 ? "success" : "accent"} /> : null}
                  <Badge label={item.status} tone={getPlayerStatusTone(item.status)} />
                  {item.disqualified ? <Badge label="DQ" tone="warning" /> : null}
                </View>
              </View>
              {item.moves != null ? <StatRow label="Moves" value={`${item.moves}`} /> : null}
              {item.timeMs != null ? <StatRow label="Time" value={`${(item.timeMs / 1000).toFixed(2)}s`} /> : null}
              {item.score != null ? <StatRow label="Score" value={`${item.score}`} /> : null}
            </Card>
          ))}
        </View>

        <Card>
          <SectionLabel>Continue</SectionLabel>
          <Text style={styles.copy}>{continuationMessage}</Text>
          <View style={styles.actions}>
            {canCreateNextSession ? (
              <AppButton
                label={nextRoundLabel}
                loading={pendingAction === "next"}
                disabled={pendingAction != null}
                onPress={() => {
                  void runSessionAction("next", async () => {
                    const created = await createNextSession(sessionData.session.id);
                    await broadcast("next_game_created", { nextSessionId: created.sessionId });
                    replaceWithSession(created.sessionId);
                  });
                }}
              />
            ) : null}
            {sessionData.session.game === "pixelz" && replayWinner && boardQuery.data ? (
              <AppButton
                label={showWinnerReplay ? "Hide Winner Replay" : "Watch Winner Replay"}
                tone="ghost"
                onPress={() => setShowWinnerReplay((current) => !current)}
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
                  if (!sessionData.session.nextSessionId && currentPlayer?.role === "host") {
                    await broadcast("party_closed", { sessionId: sessionData.session.id }).catch(() => {});
                  }
                  router.replace("/(tabs)");
                });
              }}
            />
          </View>
        </Card>

        {showWinnerReplay && replayWinner && boardQuery.data && replayWinner.moveSequence ? (
          <PixelzReplayViewer
            board={boardQuery.data}
            moveSequence={replayWinner.moveSequence}
            title={`${replayWinner.nickname ?? replayWinner.userId.slice(0, 8)}'s winning solve`}
            subtitle={`Replaying the ${replayWinner.moveSequence.length}-move winning path.`}
          />
        ) : null}
      </Screen>
    );
  }

  return (
    <Screen
      title="Session Room"
      subtitle={`Invite ${sessionData.session.inviteCode}`}
      scroll={false}
      right={<Badge label={sessionData.session.status} tone={getStatusTone(sessionData.session.status)} />}
    >
      <FlashList<SessionResponse["players"][number]>
        style={styles.list}
        data={sessionData.players}
        keyExtractor={(item) => item.userId}
        contentContainerStyle={styles.listContent}
        ListHeaderComponent={
          <Card>
            <SectionLabel>{sessionData.session.status === "playing" ? "Match" : "Lobby"}</SectionLabel>
            <StatRow label="Game" value={gameLabel(sessionData.session.game)} />
            <StatRow label="Board" value={boardLabel} />
            <StatRow label="Format" value={formatLabel} />
            <StatRow
              label="Series"
              value={seriesMeta.length === 3 ? `Round ${seriesMeta.round} of 3` : "Single match"}
            />
            <StatRow label="Players" value={`${sessionData.players.length} / ${sessionData.session.maxPlayers}`} />
            {actionError ? <Text style={styles.error}>{actionError}</Text> : null}
            <View style={styles.actions}>
              {sessionData.session.status !== "playing" ? (
                <AppButton
                  label="Share Invite"
                  tone="ghost"
                  onPress={() => {
                    void handleShareInvite().catch(() => {});
                  }}
                />
              ) : null}
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

            {sessionData.session.status === "playing" &&
            sessionData.session.game === "reflex" &&
            currentPlayer?.status !== "finished" ? (
              <ReflexGame
                levelId={sessionData.session.levelId ?? "reflex_level_1"}
                seed={sessionData.session.seed}
                mode="session"
                onProgress={(progress) => {
                  void broadcastProgress(progress);
                }}
                onComplete={async (result) => {
                  await finishSession(sessionData.session.id, {
                    moves: result.moves,
                    timeMs: result.timeMs,
                    disqualified: result.disqualified,
                  });
                  await broadcast("player_finished", { sessionId: sessionData.session.id });
                  await sessionQuery.refetch();
                }}
              />
            ) : null}

            {sessionData.session.status === "playing" && currentPlayer?.status === "finished" ? (
              <Card>
                <SectionLabel>Result Submitted</SectionLabel>
                <Text style={styles.copy}>
                  Your run is locked in. Stay here while the other players finish and the session resolves placements.
                </Text>
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
                <Badge label={item.status} tone={getPlayerStatusTone(item.status)} />
                <Badge label={isOnline ? "online" : "offline"} tone={isOnline ? "success" : "warning"} />
                {item.disqualified ? <Badge label="DQ" tone="warning" /> : null}
              </View>
              <StatRow
                label="Progress"
                value={progress ? `${progress.moves} moves · ${(progress.timeMs / 1000).toFixed(1)}s` : "No live ping"}
              />
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
  stack: {
    gap: 12,
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
  title: {
    color: colors.textPrimary,
    fontSize: 24,
    fontWeight: "700",
    letterSpacing: -0.4,
  },
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
    fontSize: 16,
    fontWeight: "700",
  },
  scoreboard: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  scoreChip: {
    minWidth: 132,
    backgroundColor: colors.bgSecondary,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 4,
  },
  scoreChipName: {
    color: colors.textSecondary,
    fontSize: 13,
    fontWeight: "600",
  },
  scoreChipValue: {
    color: colors.textPrimary,
    fontSize: 16,
    fontWeight: "700",
  },
  resultHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 12,
  },
  resultHeaderCopy: {
    flex: 1,
    gap: 4,
  },
  resultBadges: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    justifyContent: "flex-end",
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
