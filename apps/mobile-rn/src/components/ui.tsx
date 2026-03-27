import type { PropsWithChildren } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { colors, radii } from "../theme/tokens";

export function Card({ children }: PropsWithChildren) {
  return <View style={styles.card}>{children}</View>;
}

export function SectionLabel({ children }: PropsWithChildren) {
  return <Text style={styles.sectionLabel}>{children}</Text>;
}

export function Badge({
  label,
  tone = "neutral",
}: {
  label: string;
  tone?: "neutral" | "success" | "accent" | "warning";
}) {
  return (
    <View
      style={[
        styles.badge,
        tone === "success" ? styles.badgeSuccess : null,
        tone === "accent" ? styles.badgeAccent : null,
        tone === "warning" ? styles.badgeWarning : null,
      ]}
    >
      <Text
        style={[
          styles.badgeLabel,
          tone === "success" ? styles.badgeLabelSuccess : null,
          tone === "accent" ? styles.badgeLabelAccent : null,
          tone === "warning" ? styles.badgeLabelWarning : null,
        ]}
      >
        {label}
      </Text>
    </View>
  );
}

export function AppButton({
  label,
  onPress,
  disabled,
  tone = "primary",
  loading = false,
  size = "md",
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  tone?: "primary" | "secondary" | "ghost";
  loading?: boolean;
  size?: "md" | "sm";
}) {
  return (
    <Pressable
      disabled={disabled || loading}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        size === "sm" ? styles.buttonSmall : null,
        tone === "secondary" ? styles.buttonSecondary : null,
        tone === "ghost" ? styles.buttonGhost : null,
        pressed ? styles.buttonPressed : null,
        disabled || loading ? styles.buttonDisabled : null,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={tone === "ghost" ? colors.textSecondary : colors.textOnAccent} />
      ) : (
        <Text
          style={[
            styles.buttonLabel,
            size === "sm" ? styles.buttonLabelSmall : null,
            tone === "ghost" ? styles.buttonGhostLabel : null,
          ]}
        >
          {label}
        </Text>
      )}
    </Pressable>
  );
}

export function StatRow({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <View style={styles.statRow}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={styles.statValue}>{value}</Text>
    </View>
  );
}

export function AppTextField({
  label,
  placeholder,
  value,
  secureTextEntry,
  onChangeText,
}: {
  label: string;
  placeholder: string;
  value: string;
  secureTextEntry?: boolean;
  onChangeText: (value: string) => void;
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        value={value}
        autoCapitalize="none"
        autoCorrect={false}
        placeholder={placeholder}
        placeholderTextColor={colors.textMuted}
        secureTextEntry={secureTextEntry}
        onChangeText={onChangeText}
        style={styles.input}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.bgCard,
    borderRadius: radii.lg,
    padding: 16,
    gap: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  sectionLabel: {
    color: colors.accentTeal,
    fontSize: 12,
    textTransform: "uppercase",
    letterSpacing: 1.1,
    fontWeight: "700",
  },
  badge: {
    alignSelf: "flex-start",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: radii.full,
    backgroundColor: colors.bgSecondary,
  },
  badgeSuccess: {
    backgroundColor: colors.successSoft,
  },
  badgeAccent: {
    backgroundColor: colors.accentSoft,
  },
  badgeWarning: {
    backgroundColor: colors.warningSoft,
  },
  badgeLabel: {
    color: colors.textSecondary,
    fontSize: 12,
    fontWeight: "600",
  },
  badgeLabelSuccess: {
    color: colors.success,
  },
  badgeLabelAccent: {
    color: colors.accent,
  },
  badgeLabelWarning: {
    color: colors.warning,
  },
  button: {
    borderRadius: radii.md,
    backgroundColor: colors.accent,
    minHeight: 48,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: colors.accent,
  },
  buttonSmall: {
    minHeight: 38,
    paddingHorizontal: 12,
  },
  buttonSecondary: {
    backgroundColor: colors.accentTeal,
    borderColor: colors.accentTeal,
  },
  buttonGhost: {
    backgroundColor: "transparent",
    borderWidth: 1,
    borderColor: colors.border,
  },
  buttonPressed: {
    opacity: 0.86,
  },
  buttonDisabled: {
    opacity: 0.55,
  },
  buttonLabel: {
    color: colors.textOnAccent,
    fontSize: 15,
    fontWeight: "700",
  },
  buttonLabelSmall: {
    fontSize: 14,
  },
  buttonGhostLabel: {
    color: colors.textSecondary,
  },
  statRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 12,
  },
  statLabel: {
    color: colors.textSecondary,
    fontSize: 14,
    flexShrink: 1,
    paddingRight: 12,
  },
  statValue: {
    color: colors.textPrimary,
    fontSize: 14,
    fontWeight: "700",
  },
  field: {
    gap: 8,
  },
  fieldLabel: {
    color: colors.textPrimary,
    fontSize: 14,
    fontWeight: "600",
  },
  input: {
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.borderInput,
    backgroundColor: colors.bgInput,
    color: colors.textPrimary,
    minHeight: 48,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
});
