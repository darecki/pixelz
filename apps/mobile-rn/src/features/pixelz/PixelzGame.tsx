import { useEffect, useState } from "react";
import * as Haptics from "expo-haptics";
import { Pressable, StyleSheet, Text, View } from "react-native";
import {
  applyPixelzFloodFill,
  computePixelzScore,
  generatePixelzGrid,
  isPixelzFilled,
  type PixelzBoardSpec,
} from "@pixelz/ts-game-core";
import { Card, SectionLabel } from "../../components/ui";
import { colors, radii } from "../../theme/tokens";
import { PIXELZ_COLORS } from "./colors";

export type PixelzCompletionResult = {
  score: number;
  moves: number;
  timeMs: number;
  moveSequence: number[];
};

export function PixelzGame({
  board,
  onComplete,
  onProgress,
}: {
  board: PixelzBoardSpec;
  onComplete: (result: PixelzCompletionResult) => Promise<void> | void;
  onProgress?: (progress: { moves: number; timeMs: number }) => void;
}) {
  const boardKey = `${board.width}:${board.height}:${board.numColors}:${board.seed}`;
  const [grid, setGrid] = useState(() => generatePixelzGrid(board));
  const [moves, setMoves] = useState(0);
  const [moveSequence, setMoveSequence] = useState<number[]>([]);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [solved, setSolved] = useState(false);
  const [completionError, setCompletionError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    setGrid(generatePixelzGrid(board));
    setMoves(0);
    setMoveSequence([]);
    setStartedAt(null);
    setElapsed(0);
    setSolved(false);
    setCompletionError(null);
    setSubmitting(false);
  }, [boardKey]);

  useEffect(() => {
    if (startedAt == null || solved) return;
    const timer = setInterval(() => {
      setElapsed(Date.now() - startedAt);
    }, 100);
    return () => clearInterval(timer);
  }, [solved, startedAt]);

  async function handleColorPress(colorIndex: number) {
    if (solved || submitting) return;
    const currentColor = grid[0]?.[0];
    if (currentColor == null || colorIndex === currentColor) return;

    const baseline = startedAt ?? Date.now();
    if (startedAt == null) {
      setStartedAt(baseline);
    }

    const nextGrid = applyPixelzFloodFill(grid, currentColor, colorIndex);
    const nextMoves = moves + 1;
    const nextElapsed = Date.now() - baseline;
    const nextSequence = [...moveSequence, colorIndex];

    setGrid(nextGrid);
    setMoves(nextMoves);
    setMoveSequence(nextSequence);
    setElapsed(nextElapsed);
    onProgress?.({ moves: nextMoves, timeMs: nextElapsed });
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});

    if (isPixelzFilled(nextGrid)) {
      setSolved(true);
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      setSubmitting(true);
      setCompletionError(null);
      try {
        await onComplete({
          score: computePixelzScore(nextMoves, nextElapsed),
          moves: nextMoves,
          timeMs: nextElapsed,
          moveSequence: nextSequence,
        });
      } catch (error) {
        setCompletionError(
          error instanceof Error ? error.message : "Run completed, but saving the result failed."
        );
      } finally {
        setSubmitting(false);
      }
    }
  }

  const cellSize = Math.min(30, Math.floor(240 / board.width), Math.floor(300 / board.height));

  return (
    <View style={styles.container}>
      <Card>
        <SectionLabel>Run</SectionLabel>
        <View style={styles.metrics}>
          <Metric label="Moves" value={`${moves}`} />
          <Metric label="Time" value={`${(elapsed / 1000).toFixed(2)}s`} />
          <Metric label="Colors" value={`${board.numColors}`} />
        </View>
      </Card>

      <Card>
        <SectionLabel>Board</SectionLabel>
        <View
          style={[
            styles.board,
            {
              width: board.width * cellSize,
            },
          ]}
        >
          {grid.map((row: number[], y: number) => (
            <View key={y} style={styles.boardRow}>
              {row.map((value: number, x: number) => (
                <View
                  key={`${y}-${x}`}
                  style={[
                    styles.cell,
                    {
                      width: cellSize,
                      height: cellSize,
                      backgroundColor: PIXELZ_COLORS[value] ?? colors.textSecondary,
                    },
                  ]}
                />
              ))}
            </View>
          ))}
        </View>
      </Card>

      <Card>
        <SectionLabel>Palette</SectionLabel>
        <View style={styles.palette}>
          {Array.from({ length: board.numColors }, (_, colorIndex) => (
            <Pressable
              key={colorIndex}
              disabled={submitting}
              onPress={() => handleColorPress(colorIndex)}
              style={[
                styles.swatch,
                {
                  backgroundColor: PIXELZ_COLORS[colorIndex] ?? colors.textSecondary,
                  opacity: submitting || grid[0]?.[0] === colorIndex ? 0.45 : 1,
                },
              ]}
            >
              <Text style={styles.swatchLabel}>{colorIndex + 1}</Text>
            </Pressable>
          ))}
        </View>
        {completionError ? <Text style={styles.error}>{completionError}</Text> : null}
      </Card>
    </View>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.metric}>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={styles.metricValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 16,
  },
  metrics: {
    flexDirection: "row",
    gap: 12,
  },
  metric: {
    flex: 1,
    gap: 4,
    padding: 12,
    borderRadius: radii.md,
    backgroundColor: colors.bgSecondary,
  },
  metricLabel: {
    color: colors.textSecondary,
    fontSize: 12,
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  metricValue: {
    color: colors.textPrimary,
    fontSize: 18,
    fontWeight: "700",
  },
  board: {
    alignSelf: "center",
    gap: 2,
    backgroundColor: colors.gameBoardBg,
    borderWidth: 1,
    borderColor: colors.gameBoardBorder,
    borderRadius: radii.md,
    padding: 4,
  },
  boardRow: {
    flexDirection: "row",
    gap: 2,
  },
  cell: {
    borderRadius: 4,
  },
  palette: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  swatch: {
    width: 54,
    height: 54,
    borderRadius: 12,
    borderWidth: 3,
    borderColor: colors.gameButtonBorder,
    alignItems: "center",
    justifyContent: "center",
  },
  swatchLabel: {
    color: colors.bgPrimary,
    fontSize: 16,
    fontWeight: "800",
  },
  error: {
    color: colors.error,
    fontSize: 14,
    lineHeight: 20,
  },
});
