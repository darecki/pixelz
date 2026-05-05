import { create } from "zustand";
import type { Session } from "@supabase/supabase-js";

type AuthState = {
  initialized: boolean;
  session: Session | null;
  setInitialized: (value: boolean) => void;
  setSession: (session: Session | null) => void;
};

export const useAuthStore = create<AuthState>((set) => ({
  initialized: false,
  session: null,
  setInitialized: (initialized) => set({ initialized }),
  setSession: (session) => set({ session }),
}));
