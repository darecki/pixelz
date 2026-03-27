import Constants from "expo-constants";
import { Platform } from "react-native";

type EnvExtra = {
  apiUrl?: string | null;
  supabaseUrl?: string | null;
  supabasePublishableKey?: string | null;
};

function normalizeEnvValue(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizeApiUrlForPlatform(value: string | null): string | null {
  if (!value) return null;
  if (Platform.OS !== "android") return value;

  try {
    const url = new URL(value);
    if (url.hostname === "localhost" || url.hostname === "127.0.0.1") {
      url.hostname = "10.0.2.2";
      return url.toString().replace(/\/$/, "");
    }
    return value;
  } catch {
    return value;
  }
}

const extra = (Constants.expoConfig?.extra ?? {}) as EnvExtra;

export const env = {
  apiUrl: normalizeApiUrlForPlatform(
    normalizeEnvValue(extra.apiUrl) ??
      normalizeEnvValue(process.env.EXPO_PUBLIC_API_URL) ??
      normalizeEnvValue(process.env.VITE_API_URL)
  ),
  supabaseUrl:
    normalizeEnvValue(extra.supabaseUrl) ??
    normalizeEnvValue(process.env.EXPO_PUBLIC_SUPABASE_URL) ??
    normalizeEnvValue(process.env.VITE_SUPABASE_URL) ??
    normalizeEnvValue(process.env.SUPABASE_URL),
  supabasePublishableKey:
    normalizeEnvValue(extra.supabasePublishableKey) ??
    normalizeEnvValue(process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY) ??
    normalizeEnvValue(process.env.VITE_SUPABASE_PUBLISHABLE_KEY) ??
    normalizeEnvValue(process.env.SUPABASE_PUBLISHABLE_KEY),
};

export const missingEnvKeys = [
  env.apiUrl ? null : "EXPO_PUBLIC_API_URL or VITE_API_URL",
  env.supabaseUrl ? null : "EXPO_PUBLIC_SUPABASE_URL or VITE_SUPABASE_URL or SUPABASE_URL",
  env.supabasePublishableKey
    ? null
    : "EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY or VITE_SUPABASE_PUBLISHABLE_KEY or SUPABASE_PUBLISHABLE_KEY",
].filter((value): value is string => value != null);

export const missingEnvMessage =
  "Set the mobile env vars in the repo root .env.local or apps/mobile-rn/.env.local, then restart Expo.";
