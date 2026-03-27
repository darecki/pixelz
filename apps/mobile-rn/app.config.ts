import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { config as loadDotEnv } from "dotenv";
import type { ExpoConfig } from "expo/config";

const workspaceRoot = resolve(process.cwd(), "../..");

for (const filename of [".env.local", ".env"]) {
  const envPath = resolve(workspaceRoot, filename);
  if (existsSync(envPath)) {
    loadDotEnv({ path: envPath, override: false });
  }
}

const config: ExpoConfig & { newArchEnabled?: boolean } = {
  name: "Pixelz Mobile",
  slug: "pixelz-mobile",
  scheme: "pixelz",
  version: "1.0.0",
  orientation: "portrait",
  userInterfaceStyle: "automatic",
  newArchEnabled: true,
  plugins: ["expo-router", "expo-secure-store"],
  experiments: {
    typedRoutes: true,
  },
  ios: {
    supportsTablet: true,
    bundleIdentifier: "com.pixelz.mobile",
  },
  android: {
    package: "com.pixelz.mobile",
  },
  extra: {
    apiUrl: process.env.EXPO_PUBLIC_API_URL ?? process.env.VITE_API_URL ?? null,
    supabaseUrl:
      process.env.EXPO_PUBLIC_SUPABASE_URL ??
      process.env.VITE_SUPABASE_URL ??
      process.env.SUPABASE_URL ??
      null,
    supabasePublishableKey:
      process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
      process.env.VITE_SUPABASE_PUBLISHABLE_KEY ??
      process.env.SUPABASE_PUBLISHABLE_KEY ??
      null,
  },
};

export default config;
