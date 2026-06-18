import React, { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

import colors from "@/constants/colors";
import { getStoredValue, setStoredValue } from "@/services/localStore";

export type ThemeKey = "primary" | "midnightGold" | "daylight";
type Palette = typeof colors.light;

const THEME_STORAGE_KEY = "earn_daily_theme_key";

export const themeOptions: Array<{
  key: ThemeKey;
  label: string;
  description: string;
  swatches: string[];
}> = [
  {
    key: "primary",
    label: "Primary",
    description: "Original purple and gold look",
    swatches: [colors.light.background, colors.light.primary, colors.light.gold],
  },
  {
    key: "midnightGold",
    label: "Earn Daily Gold",
    description: "Official black and gold wallet look",
    swatches: [colors.midnightGold.background, colors.midnightGold.gold, colors.midnightGold.foreground],
  },
  {
    key: "daylight",
    label: "Daylight",
    description: "Clean white theme with sky and gold accents",
    swatches: [colors.daylight.background, colors.daylight.primary, colors.daylight.gold],
  },
];

interface ThemeContextType {
  themeKey: ThemeKey;
  palette: Palette;
  radius: typeof colors.radius;
  setThemeKey: (key: ThemeKey) => Promise<void>;
}

const ThemeContext = createContext<ThemeContextType | null>(null);

function isThemeKey(value: string | null): value is ThemeKey {
  return value === "primary" || value === "midnightGold" || value === "daylight";
}

function getPalette(themeKey: ThemeKey): Palette {
  if (themeKey === "midnightGold") return colors.midnightGold;
  if (themeKey === "daylight") return colors.daylight;
  return colors.light;
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [themeKey, setThemeKeyState] = useState<ThemeKey>("midnightGold");

  useEffect(() => {
    let mounted = true;
    getStoredValue(THEME_STORAGE_KEY).then((stored) => {
      if (!mounted || !isThemeKey(stored)) return;
      setThemeKeyState(stored === "primary" ? "midnightGold" : stored);
    }).catch(() => {});
    return () => { mounted = false; };
  }, []);

  const setThemeKey = useCallback(async (nextThemeKey: ThemeKey) => {
    setThemeKeyState(nextThemeKey);
    await setStoredValue(THEME_STORAGE_KEY, nextThemeKey);
  }, []);

  const value = useMemo(() => ({
    themeKey,
    palette: getPalette(themeKey),
    radius: colors.radius,
    setThemeKey,
  }), [setThemeKey, themeKey]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextType {
  const context = useContext(ThemeContext);
  if (context) return context;
  return {
    themeKey: "midnightGold",
    palette: colors.midnightGold,
    radius: colors.radius,
    setThemeKey: async (_key: ThemeKey) => {},
  };
}
