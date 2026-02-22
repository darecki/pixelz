/**
 * Extensible skin engine.
 *
 * Each "skin" is a named set of CSS variable overrides. The two free skins
 * (light & dark) are built into index.css via [data-theme]. Premium skins
 * layer on top by setting additional custom properties on <html>.
 */

export interface Skin {
  id: string;
  name: string;
  baseTheme: "light" | "dark";
  premium: boolean;
  /** CSS variable overrides applied on top of the base theme. */
  vars: Record<string, string>;
}

export const SKINS: Skin[] = [
  {
    id: "default-light",
    name: "Minimal Light",
    baseTheme: "light",
    premium: false,
    vars: {},
  },
  {
    id: "default-dark",
    name: "Minimal Dark",
    baseTheme: "dark",
    premium: false,
    vars: {},
  },
  // Future premium skins go here, e.g.:
  // {
  //   id: "neon-glow",
  //   name: "Neon Glow",
  //   baseTheme: "dark",
  //   premium: true,
  //   vars: {
  //     "--accent": "#00E5FF",
  //     "--accent-hover": "#00B8D4",
  //     "--bg-primary": "#0D0D1A",
  //     "--bg-card": "rgba(255,255,255,0.06)",
  //   },
  // },
];

const SKIN_STORAGE_KEY = "pixelz_skin";

export function getSkinById(id: string): Skin | undefined {
  return SKINS.find((s) => s.id === id);
}

/**
 * Apply a skin by ID. Sets data-theme for the base and applies CSS variable
 * overrides. Persists the choice to localStorage.
 */
export function applySkin(skinId: string): void {
  const skin = getSkinById(skinId);
  if (!skin) return;

  const root = document.documentElement;
  // Set base theme
  root.setAttribute("data-theme", skin.baseTheme);
  localStorage.setItem("pixelz_theme", skin.baseTheme);

  // Clear previous skin overrides
  const prev = localStorage.getItem(SKIN_STORAGE_KEY);
  if (prev) {
    const prevSkin = getSkinById(prev);
    if (prevSkin) {
      for (const key of Object.keys(prevSkin.vars)) {
        root.style.removeProperty(key);
      }
    }
  }

  // Apply new overrides
  for (const [key, value] of Object.entries(skin.vars)) {
    root.style.setProperty(key, value);
  }

  localStorage.setItem(SKIN_STORAGE_KEY, skinId);
}

export function getCurrentSkinId(): string {
  if (typeof localStorage !== "undefined") {
    return localStorage.getItem(SKIN_STORAGE_KEY) ?? "default-light";
  }
  return "default-light";
}
