import { useState } from "react";
import { useRouter } from "expo-router";
import { StyleSheet, Text } from "react-native";
import { Screen } from "../../src/components/Screen";
import { AppButton, AppTextField, Card, SectionLabel } from "../../src/components/ui";
import { signInWithPassword, signUpWithPassword } from "../../src/lib/api";
import { colors } from "../../src/theme/tokens";

export default function SignInScreen() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function run(action: "sign-in" | "sign-up") {
    setLoading(true);
    setError(null);
    try {
      if (action === "sign-in") {
        await signInWithPassword(email.trim(), password);
      } else {
        await signUpWithPassword(email.trim(), password);
      }
      router.replace("/(tabs)");
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Authentication failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Screen
      title="Sign In"
      subtitle="Sign in or create an account to sync your mobile progress and session results."
    >
      <Card>
        <SectionLabel>Credentials</SectionLabel>
        <AppTextField
          label="Email"
          placeholder="you@example.com"
          value={email}
          onChangeText={setEmail}
        />
        <AppTextField
          label="Password"
          placeholder="••••••••"
          value={password}
          secureTextEntry
          onChangeText={setPassword}
        />
        {error ? <Text style={styles.error}>{error}</Text> : null}
        <AppButton label="Sign In" loading={loading} onPress={() => { void run("sign-in"); }} />
        <AppButton
          label="Create Account"
          tone="ghost"
          disabled={loading}
          onPress={() => {
            void run("sign-up");
          }}
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
