import { startTransition, useEffect, useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { applyPixelzFloodFill, generatePixelzGrid, type PixelzBoardSpec } from "@pixelz/ts-game-core";
import { AppButton, Card, SectionLabel } from "./ui";
import { colors, radii } from "../theme/tokens";
import { PIXELZ_COLORS } from "../features/pixelz/colors";

type PixelzReplayViewerProps = {
  board: PixelzBoardSpec;
  moveSequence: number[];
  title?: string;
  subtitle?: string;
};

function formatMoveLabel(move: number | undefined) {
  if (move == null) return "Opening board";
  return `Color ${move + 1}`;
}

export function PixelzReplayViewer({
  board,
  moveSequence,
  title = "Replay",
  subtitle,
}: PixelzReplayViewerProps) {
  const [step, setStep] = useState(0);
  const [playing, setPlaying] = useState(false);

  const frames = useMemo(() => {
    const initial = generatePixelzGrid(board);
    const nextFrames = [initial];
    let current = initial;

    for (const move of moveSequence) {
      current = applyPixelzFloodFill(current, current[0][0], move);
      nextFrames.push(current);
    }

    return nextFrames;
  }, [board, moveSequence]);

  useEffect(() => {
    setStep(0);
    setPlaying(false);
  }, [board, moveSequence]);

  useEffect(() => {
    if (!playing || step >= moveSequence.length) return;

    const id = setTimeout(() => {
      const nextStep = Math.min(step + 1, moveSequence.length);
      startTransition(() => {
        setStep(nextStep);
      });
      if (nextStep >= moveSequence.length) {
        setPlaying(false);
      }
    }, 420);

    return () => {
      clearTimeout(id);
    };
  }, [moveSequence.length, playing, step]);

  if (moveSequence.length === 0) return null;

  const currentGrid = frames[Math.min(step, frames.length - 1)];
  const currentMove = step > 0 ? moveSequence[step - 1] : undefined;
  const cellSize = Math.min(24, Math.floor(220 / board.width), Math.floor(220 / board.height));

  return (
    <Card>
      <SectionLabel>Replay</SectionLabel>
      <Text style={styles.title}>{title}</Text>
      {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}

      <View style={styles.metrics}>
        <Metric label="Step" value={`${step} / ${moveSequence.length}`} />
        <Metric label="Move" value={formatMoveLabel(currentMove)} />
      </View>

      <View style={styles.boardShell}>
        <View style={[styles.board, { width: board.width * cellSize }]}>
          {currentGrid.map((row, y) => (
            <View key={y} style={styles.boardRow}>
              {row.map((colorIndex, x) => (
                <Pressable
                  key={`${y}-${x}`}
                  disabled
                  style={[
                    styles.cell,
                    {
                      width: cellSize,
                      height: cellSize,
                      backgroundColor: PIXELZ_COLORS[colorIndex] ?? colors.textSecondary,
                    },
                  ]}
                />
              ))}
            </View>
          ))}
        </View>
      </View>

      <View style={styles.controls}>
        <AppButton
          label="Restart"
          size="sm"
          tone="ghost"
          onPress={() => {
            setStep(0);
            setPlaying(false);
          }}
        />
        <AppButton
          label="Back"
          size="sm"
          tone="ghost"
          disabled={step === 0}
          onPress={() => {
            setPlaying(false);
            setStep((current) => Math.max(0, current - 1));
          }}
        />
        <AppButton
          label={playing ? "Pause" : step >= moveSequence.length ? "Replay Again" : "Autoplay"}
          size="sm"
          disabled={moveSequence.length === 0}
          onPress={() => {
            if (step >= moveSequence.length) {
              setStep(0);
            }
            setPlaying((current) => !current);
          }}
        />
        <AppButton
          label="Next"
          size="sm"
          tone="ghost"
          disabled={step >= moveSequence.length}
          onPress={() => {
            setPlaying(false);
            setStep((current) => Math.min(moveSequence.length, current + 1));
          }}
        />
      </View>

      <Text style={styles.help}>
        Replay uses the exact board seed and move sequence from this solve. Let autoplay run, or step through the finish one move at a time.
      </Text>
    </Card>
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
  title: {
    color: colors.textPrimary,
    fontSize: 20,
    fontWeight: "700",
  },
  subtitle: {
    color: colors.textSecondary,
    fontSize: 14,
    lineHeight: 20,
  },
  metrics: {
    flexDirection: "row",
    gap: 12,
  },
  metric: {
    flex: 1,
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 10,
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
    fontSize: 15,
    fontWeight: "700",
  },
  boardShell: {
    alignItems: "center",
  },
  board: {
    gap: 2,
    backgroundColor: colors.gameBoardBg,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.gameBoardBorder,
    padding: 4,
  },
  boardRow: {
    flexDirection: "row",
    gap: 2,
  },
  cell: {
    borderRadius: 4,
  },
  controls: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  help: {
    color: colors.textSecondary,
    fontSize: 13,
    lineHeight: 19,
  },
});
