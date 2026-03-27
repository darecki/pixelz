import type { PropsWithChildren, ReactNode } from "react";
import { SafeAreaView } from "react-native-safe-area-context";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { colors } from "../theme/tokens";

type ScreenProps = PropsWithChildren<{
  title: string;
  subtitle?: string;
  scroll?: boolean;
  right?: ReactNode;
}>;

export function Screen({ children, title, subtitle, scroll = true, right }: ScreenProps) {
  const content = (
    <View style={[styles.content, scroll ? null : styles.contentFill]}>
      <View style={styles.header}>
        <View style={styles.headerCopy}>
          <Text style={styles.title}>{title}</Text>
          {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
        </View>
        {right ? <View style={styles.headerAction}>{right}</View> : null}
      </View>
      {children}
    </View>
  );

  return (
    <SafeAreaView edges={["top", "left", "right"]} style={styles.safeArea}>
      {scroll ? (
        <ScrollView contentContainerStyle={styles.scrollContent}>{content}</ScrollView>
      ) : (
        <View style={styles.fill}>{content}</View>
      )}
    </SafeAreaView>
  );
}

export function CenteredMessage({
  title,
  message,
}: {
  title: string;
  message?: string;
}) {
  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.centered}>
        <Text style={styles.title}>{title}</Text>
        {message ? <Text style={styles.subtitle}>{message}</Text> : null}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.bgPrimary,
  },
  scrollContent: {
    flexGrow: 1,
  },
  fill: {
    flex: 1,
  },
  content: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 20,
    gap: 18,
  },
  contentFill: {
    flex: 1,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 12,
    alignItems: "flex-start",
  },
  headerCopy: {
    flex: 1,
    gap: 6,
  },
  headerAction: {
    flexShrink: 0,
    paddingTop: 2,
  },
  title: {
    color: colors.textPrimary,
    fontSize: 28,
    fontWeight: "700",
    letterSpacing: -0.6,
  },
  subtitle: {
    color: colors.textSecondary,
    fontSize: 15,
    lineHeight: 22,
  },
  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    padding: 24,
  },
});
