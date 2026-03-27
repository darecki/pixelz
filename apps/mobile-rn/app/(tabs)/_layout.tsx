import { Tabs } from "expo-router";
import { colors } from "../../src/theme/tokens";

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: colors.navBg,
          borderTopColor: colors.border,
          borderTopWidth: 1,
        },
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.textSecondary,
        tabBarLabelStyle: {
          fontSize: 12,
          fontWeight: "600",
        },
      }}
    >
      <Tabs.Screen name="index" options={{ title: "Home", tabBarIcon: () => null }} />
      <Tabs.Screen
        name="leaderboard"
        options={{ title: "Leaderboard", tabBarIcon: () => null }}
      />
      <Tabs.Screen name="profile" options={{ title: "Profile", tabBarIcon: () => null }} />
    </Tabs>
  );
}
