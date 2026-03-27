import { useEffect, useMemo, useState } from "react";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";
import type { CreateSessionRequest } from "@pixelz/ts-contracts";
import {
  formatBoardLabel,
  getDailyChallenge,
  PIXELZ_PRESET_CHALLENGES,
  REFLEX_PRESET_CHALLENGES,
  toDateKey,
} from "@pixelz/ts-game-core";
import { CenteredMessage, Screen } from "../../src/components/Screen";
import { AppButton, AppTextField, Badge, Card, SectionLabel, StatRow } from "../../src/components/ui";
import { createBoard, createSession } from "../../src/lib/api";
import { colors, radii } from "../../src/theme/tokens";
import { useAuthStore } from "../../src/stores/auth-store";

type ModeTab = "solo" | "multi";
type PixelzBoardMode = "predefined" | "generated";
type PixelzBoardForm = {
  width: string;
  height: string;
  numColors: string;
};

const PIXELZ_DEFAULTS: PixelzBoardForm = {
  width: "7",
  height: "10",
  numColors: "5",
};

function clampInt(value: string, fallback: number, min: number, max: number) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.min(max, Math.max(min, Math.trunc(numeric)));
}

function clampInviteMaxPlayers(value: string) {
  return clampInt(value, 2, 2, 10);
}

function sanitizePixelzParams(form: PixelzBoardForm) {
  return {
    width: clampInt(form.width, 7, 1, 30),
    height: clampInt(form.height, 10, 1, 30),
    numColors: clampInt(form.numColors, 5, 2, 10),
  };
}

function ModeToggle({
  value,
  onChange,
}: {
  value: ModeTab;
  onChange: (next: ModeTab) => void;
}) {
  return (
    <View style={styles.toggleRow}>
      {(["solo", "multi"] as const).map((mode) => {
        const active = value === mode;
        return (
          <Pressable
            key={mode}
            onPress={() => onChange(mode)}
            style={[styles.toggleButton, active ? styles.toggleButtonActive : null]}
          >
            <Text style={[styles.toggleLabel, active ? styles.toggleLabelActive : null]}>
              {mode === "solo" ? "Solo" : "Multiplayer"}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function BoardModeToggle({
  value,
  onChange,
}: {
  value: PixelzBoardMode;
  onChange: (next: PixelzBoardMode) => void;
}) {
  return (
    <View style={styles.toggleRow}>
      <Pressable
        onPress={() => onChange("predefined")}
        style={[styles.toggleButton, value === "predefined" ? styles.toggleButtonActive : null]}
      >
        <Text style={[styles.toggleLabel, value === "predefined" ? styles.toggleLabelActive : null]}>
          Official Boards
        </Text>
      </Pressable>
      <Pressable
        onPress={() => onChange("generated")}
        style={[styles.toggleButton, value === "generated" ? styles.toggleButtonActive : null]}
      >
        <Text style={[styles.toggleLabel, value === "generated" ? styles.toggleLabelActive : null]}>
          Generated
        </Text>
      </Pressable>
    </View>
  );
}

export default function ConfigureGameScreen() {
  const params = useLocalSearchParams<{ gameId: string }>();
  const router = useRouter();
  const session = useAuthStore((state) => state.session);
  const [mode, setMode] = useState<ModeTab>("solo");
  const [boardMode, setBoardMode] = useState<PixelzBoardMode>("predefined");
  const [pixelzForm, setPixelzForm] = useState<PixelzBoardForm>(PIXELZ_DEFAULTS);
  const [inviteMaxPlayers, setInviteMaxPlayers] = useState("2");
  const [seriesLength, setSeriesLength] = useState<1 | 3>(1);
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [todayKey, setTodayKey] = useState(() => toDateKey(new Date()));

  const isPixelz = params.gameId === "pixelz";
  const isReflex = params.gameId === "reflex";
  const dailyChallenge = useMemo(() => getDailyChallenge("pixelz", new Date(`${todayKey}T12:00:00.000Z`)), [todayKey]);
  const pixelzParams = sanitizePixelzParams(pixelzForm);
  const createDisabled = !session;

  useEffect(() => {
    const id = setInterval(() => {
      const nextKey = toDateKey(new Date());
      setTodayKey((current) => (current === nextKey ? current : nextKey));
    }, 60_000);

    return () => {
      clearInterval(id);
    };
  }, []);

  if (!params.gameId) {
    return <CenteredMessage title="Missing game" message="Choose a game to configure before creating a run or invite." />;
  }

  if (!isPixelz && !isReflex) {
    return (
      <CenteredMessage
        title="Coming Soon"
        message="That mobile configure flow is not available yet."
      />
    );
  }

  async function withAction(name: string, action: () => Promise<void>) {
    setPendingAction(name);
    setError(null);
    try {
      await action();
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Action failed");
    } finally {
      setPendingAction(null);
    }
  }

  async function handleGenerateAndPlay() {
    await withAction("solo-generated", async () => {
      const board = await createBoard(pixelzParams);
      router.push({ pathname: "/play/[levelId]", params: { levelId: board.boardId } });
    });
  }

  async function handleCreateSession(payload: CreateSessionRequest) {
    await withAction(`invite:${payload.mode === "predefined" ? payload.levelId : "generated"}`, async () => {
      const created = await createSession(payload);
      router.push({ pathname: "/session/[sessionId]", params: { sessionId: created.sessionId } });
    });
  }

  return (
    <Screen
      title={isPixelz ? "Configure Pixelz" : "Configure Reflex"}
      subtitle={
        isPixelz
          ? "Set up a solo run or package a multiplayer invite without leaving the mobile app."
          : "Reflex invite creation is ready on mobile so you can set the room up here before native gameplay lands."
      }
    >
      {isPixelz && dailyChallenge ? (
        <Card>
          <SectionLabel>Daily Challenge</SectionLabel>
          <Text style={styles.cardTitle}>{dailyChallenge.label}</Text>
          <Text style={styles.copy}>{dailyChallenge.subtitle}</Text>
          <AppButton
            label="Play Global Daily"
            onPress={() => router.push({ pathname: "/play/[levelId]", params: { levelId: dailyChallenge.levelId } })}
          />
        </Card>
      ) : null}

      <Card>
        <SectionLabel>Mode</SectionLabel>
        <ModeToggle value={mode} onChange={setMode} />
        <StatRow
          label="Flow"
          value={
            mode === "solo"
              ? isPixelz
                ? "Launch straight into a run"
                : "Native Reflex solo play lands in the gameplay phase."
              : "Create a lobby and invite players"
          }
        />
      </Card>

      {mode === "solo" && isPixelz ? (
        <>
          <Card>
            <SectionLabel>Official Boards</SectionLabel>
            <Text style={styles.copy}>Start from the same preset boards the web app offers for fast clean runs.</Text>
            <View style={styles.stack}>
              {PIXELZ_PRESET_CHALLENGES.map((preset) => (
                <View key={preset.levelId} style={styles.presetRow}>
                  <View style={styles.presetCopy}>
                    <Text style={styles.presetTitle}>{preset.label}</Text>
                    <Text style={styles.presetMeta}>{formatBoardLabel(preset.levelId)}</Text>
                    <Text style={styles.copy}>{preset.description}</Text>
                  </View>
                  <AppButton
                    label="Play"
                    size="sm"
                    onPress={() => router.push({ pathname: "/play/[levelId]", params: { levelId: preset.levelId } })}
                  />
                </View>
              ))}
            </View>
          </Card>

          <Card>
            <SectionLabel>Generated Board</SectionLabel>
            <Text style={styles.copy}>Dial in a custom shape, generate it on the backend, and jump straight into the run.</Text>
            <AppTextField
              label="Width"
              placeholder="7"
              value={pixelzForm.width}
              keyboardType="number-pad"
              onChangeText={(width) => setPixelzForm((current) => ({ ...current, width }))}
            />
            <AppTextField
              label="Height"
              placeholder="10"
              value={pixelzForm.height}
              keyboardType="number-pad"
              onChangeText={(height) => setPixelzForm((current) => ({ ...current, height }))}
            />
            <AppTextField
              label="Colors"
              placeholder="5"
              value={pixelzForm.numColors}
              keyboardType="number-pad"
              onChangeText={(numColors) => setPixelzForm((current) => ({ ...current, numColors }))}
            />
            <StatRow
              label="Preview"
              value={`Custom ${pixelzParams.width}x${pixelzParams.height} · ${pixelzParams.numColors} colors`}
            />
            {error ? <Text style={styles.error}>{error}</Text> : null}
            <AppButton
              label="Generate & Play"
              loading={pendingAction === "solo-generated"}
              onPress={() => { void handleGenerateAndPlay(); }}
            />
          </Card>
        </>
      ) : mode === "solo" && isReflex ? (
        <Card>
          <SectionLabel>Coming Soon</SectionLabel>
          <Text style={styles.cardTitle}>Reflex gameplay is next.</Text>
          <Text style={styles.copy}>
            Mobile can already create Reflex rooms, but the native round experience ships in the next parity phase.
          </Text>
          <AppButton label="Switch To Multiplayer" onPress={() => setMode("multi")} />
        </Card>
      ) : isPixelz ? (
        <>
          <Card>
            <SectionLabel>Lobby</SectionLabel>
            <Text style={styles.copy}>
              Set the lobby size and format first, then choose whether the invite should use an official board or a generated one.
            </Text>
            <AppTextField
              label="Max Players"
              placeholder="2"
              value={inviteMaxPlayers}
              keyboardType="number-pad"
              onChangeText={setInviteMaxPlayers}
            />
            <View style={styles.segmentedRow}>
              <Pressable
                onPress={() => setSeriesLength(1)}
                style={[styles.segmentedButton, seriesLength === 1 ? styles.segmentedButtonActive : null]}
              >
                <Text style={[styles.segmentedLabel, seriesLength === 1 ? styles.segmentedLabelActive : null]}>Single Match</Text>
              </Pressable>
              <Pressable
                onPress={() => setSeriesLength(3)}
                style={[styles.segmentedButton, seriesLength === 3 ? styles.segmentedButtonActive : null]}
              >
                <Text style={[styles.segmentedLabel, seriesLength === 3 ? styles.segmentedLabelActive : null]}>Best of 3</Text>
              </Pressable>
            </View>
            <StatRow label="Ready check" value="Players join first, then confirm before the run starts" />
            {!session ? (
              <View style={styles.signInBlock}>
                <Badge label="Sign in required" tone="warning" />
                <AppButton label="Sign In" tone="ghost" onPress={() => router.push("/auth/sign-in")} />
              </View>
            ) : null}
          </Card>

          <Card>
            <SectionLabel>Board Type</SectionLabel>
            <BoardModeToggle value={boardMode} onChange={setBoardMode} />
            {boardMode === "predefined" ? (
              <View style={styles.stack}>
                {PIXELZ_PRESET_CHALLENGES.map((preset) => (
                  <View key={preset.levelId} style={styles.presetRow}>
                    <View style={styles.presetCopy}>
                      <Text style={styles.presetTitle}>{preset.label}</Text>
                      <Text style={styles.presetMeta}>{formatBoardLabel(preset.levelId)}</Text>
                      <Text style={styles.copy}>{preset.description}</Text>
                    </View>
                    <AppButton
                      label="Create Invite"
                      size="sm"
                      loading={pendingAction === `invite:${preset.levelId}`}
                      disabled={createDisabled || pendingAction != null}
                      onPress={() => {
                        void handleCreateSession({
                          game: "pixelz",
                          mode: "predefined",
                          levelId: preset.levelId,
                          maxPlayers: clampInviteMaxPlayers(inviteMaxPlayers),
                          seriesLength,
                        });
                      }}
                    />
                  </View>
                ))}
              </View>
            ) : (
              <View style={styles.stack}>
                <AppTextField
                  label="Width"
                  placeholder="7"
                  value={pixelzForm.width}
                  keyboardType="number-pad"
                  onChangeText={(width) => setPixelzForm((current) => ({ ...current, width }))}
                />
                <AppTextField
                  label="Height"
                  placeholder="10"
                  value={pixelzForm.height}
                  keyboardType="number-pad"
                  onChangeText={(height) => setPixelzForm((current) => ({ ...current, height }))}
                />
                <AppTextField
                  label="Colors"
                  placeholder="5"
                  value={pixelzForm.numColors}
                  keyboardType="number-pad"
                  onChangeText={(numColors) => setPixelzForm((current) => ({ ...current, numColors }))}
                />
                <StatRow
                  label="Invite board"
                  value={`Custom ${pixelzParams.width}x${pixelzParams.height} · ${pixelzParams.numColors} colors`}
                />
                <AppButton
                  label="Create Generated Invite"
                  loading={pendingAction === "invite:generated"}
                  disabled={createDisabled || pendingAction != null}
                  onPress={() => {
                    void handleCreateSession({
                      game: "pixelz",
                      mode: "generated",
                      settings: pixelzParams,
                      maxPlayers: clampInviteMaxPlayers(inviteMaxPlayers),
                      seriesLength,
                    });
                  }}
                />
              </View>
            )}
            {error ? <Text style={styles.error}>{error}</Text> : null}
          </Card>
        </>
      ) : (
        <>
          <Card>
            <SectionLabel>Lobby</SectionLabel>
            <Text style={styles.copy}>
              Create a Reflex duel or best-of-three set from mobile, then share the invite into the room.
            </Text>
            <AppTextField
              label="Max Players"
              placeholder="2"
              value={inviteMaxPlayers}
              keyboardType="number-pad"
              onChangeText={setInviteMaxPlayers}
            />
            <View style={styles.segmentedRow}>
              <Pressable
                onPress={() => setSeriesLength(1)}
                style={[styles.segmentedButton, seriesLength === 1 ? styles.segmentedButtonActive : null]}
              >
                <Text style={[styles.segmentedLabel, seriesLength === 1 ? styles.segmentedLabelActive : null]}>Single Match</Text>
              </Pressable>
              <Pressable
                onPress={() => setSeriesLength(3)}
                style={[styles.segmentedButton, seriesLength === 3 ? styles.segmentedButtonActive : null]}
              >
                <Text style={[styles.segmentedLabel, seriesLength === 3 ? styles.segmentedLabelActive : null]}>Best of 3</Text>
              </Pressable>
            </View>
            <StatRow label="Rounds" value="Use the preset ladder below to pick the duel length" />
            {!session ? (
              <View style={styles.signInBlock}>
                <Badge label="Sign in required" tone="warning" />
                <AppButton label="Sign In" tone="ghost" onPress={() => router.push("/auth/sign-in")} />
              </View>
            ) : null}
          </Card>

          <Card>
            <SectionLabel>Reflex Presets</SectionLabel>
            <View style={styles.stack}>
              {REFLEX_PRESET_CHALLENGES.map((preset) => (
                <View key={preset.levelId} style={styles.presetRow}>
                  <View style={styles.presetCopy}>
                    <Text style={styles.presetTitle}>{preset.label}</Text>
                    <Text style={styles.presetMeta}>{formatBoardLabel(preset.levelId)}</Text>
                    <Text style={styles.copy}>{preset.description}</Text>
                  </View>
                  <AppButton
                    label="Create Invite"
                    size="sm"
                    loading={pendingAction === `invite:${preset.levelId}`}
                    disabled={createDisabled || pendingAction != null}
                    onPress={() => {
                      void handleCreateSession({
                        game: "reflex",
                        mode: "predefined",
                        levelId: preset.levelId,
                        maxPlayers: clampInviteMaxPlayers(inviteMaxPlayers),
                        seriesLength,
                      });
                    }}
                  />
                </View>
              ))}
            </View>
            {error ? <Text style={styles.error}>{error}</Text> : null}
          </Card>
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  toggleRow: {
    flexDirection: "row",
    gap: 10,
  },
  toggleButton: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    backgroundColor: colors.bgSecondary,
    paddingHorizontal: 14,
    paddingVertical: 12,
    alignItems: "center",
  },
  toggleButtonActive: {
    borderColor: colors.accent,
    backgroundColor: colors.accentSoft,
  },
  toggleLabel: {
    color: colors.textSecondary,
    fontSize: 14,
    fontWeight: "700",
  },
  toggleLabelActive: {
    color: colors.textPrimary,
  },
  segmentedRow: {
    flexDirection: "row",
    gap: 10,
  },
  segmentedButton: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    paddingHorizontal: 12,
    paddingVertical: 12,
    backgroundColor: colors.bgSecondary,
    alignItems: "center",
  },
  segmentedButtonActive: {
    borderColor: colors.accentTeal,
    backgroundColor: colors.successSoft,
  },
  segmentedLabel: {
    color: colors.textSecondary,
    fontSize: 13,
    fontWeight: "700",
  },
  segmentedLabelActive: {
    color: colors.textPrimary,
  },
  cardTitle: {
    color: colors.textPrimary,
    fontSize: 22,
    fontWeight: "700",
  },
  copy: {
    color: colors.textSecondary,
    fontSize: 14,
    lineHeight: 20,
  },
  stack: {
    gap: 12,
  },
  presetRow: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    backgroundColor: colors.bgSecondary,
    padding: 14,
    gap: 12,
  },
  presetCopy: {
    gap: 4,
  },
  presetTitle: {
    color: colors.textPrimary,
    fontSize: 18,
    fontWeight: "700",
  },
  presetMeta: {
    color: colors.accentTeal,
    fontSize: 13,
    fontWeight: "600",
  },
  signInBlock: {
    gap: 10,
  },
  error: {
    color: colors.error,
    fontSize: 14,
    lineHeight: 20,
  },
});
