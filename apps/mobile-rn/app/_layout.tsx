import { useEffect } from "react";
import { AppState } from "react-native";
import { QueryClientProvider } from "@tanstack/react-query";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { CenteredMessage } from "../src/components/Screen";
import { initializeDatabase } from "../src/lib/db";
import { mergeAnonymousProgress } from "../src/lib/api";
import { missingEnvKeys, missingEnvMessage } from "../src/lib/env";
import { queryClient } from "../src/lib/query-client";
import { supabase } from "../src/lib/supabase";
import { colors } from "../src/theme/tokens";
import { useAuthStore } from "../src/stores/auth-store";
import { useQueueStore } from "../src/stores/queue-store";

function Bootstrap() {
  const initialized = useAuthStore((state) => state.initialized);
  const setInitialized = useAuthStore((state) => state.setInitialized);
  const setSession = useAuthStore((state) => state.setSession);
  const refreshPendingCount = useQueueStore((state) => state.refreshPendingCount);
  const hasRequiredEnv = missingEnvKeys.length === 0;

  useEffect(() => {
    if (!hasRequiredEnv) {
      setInitialized(true);
      return;
    }

    void initializeDatabase()
      .then(() => refreshPendingCount())
      .catch(() => {})
      .finally(() => {
        void supabase.auth.getSession().then(({ data: { session } }) => {
          setSession(session);
          if (session?.access_token) {
            void mergeAnonymousProgress(session.access_token).catch(() => {});
          }
          setInitialized(true);
        });
      });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      if (session?.access_token) {
        void mergeAnonymousProgress(session.access_token).catch(() => {});
      }
    });

    const appStateSubscription = AppState.addEventListener("change", (state) => {
      if (state === "active") {
        supabase.auth.startAutoRefresh();
        void refreshPendingCount();
      } else {
        supabase.auth.stopAutoRefresh();
      }
    });

    return () => {
      subscription.unsubscribe();
      appStateSubscription.remove();
    };
  }, [hasRequiredEnv, refreshPendingCount, setInitialized, setSession]);

  if (!hasRequiredEnv) {
    return (
      <CenteredMessage
        title="Mobile env missing"
        message={`${missingEnvKeys.join(", ")}. ${missingEnvMessage}`}
      />
    );
  }

  if (!initialized) {
    return (
      <CenteredMessage
        title="Pixelz Mobile"
        message="Bootstrapping auth, storage, and your offline queue."
      />
    );
  }

  return (
    <>
      <StatusBar style="light" />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: colors.bgPrimary },
        }}
      />
    </>
  );
}

export default function RootLayout() {
  return (
    <QueryClientProvider client={queryClient}>
      <Bootstrap />
    </QueryClientProvider>
  );
}
