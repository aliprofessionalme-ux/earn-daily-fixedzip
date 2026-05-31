import React, { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

import colors from "@/constants/colors";
import { getStoredValue, setStoredValue } from "@/services/localStore";

export type ThemeKey = "primary" | "midnightGold";
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
    label: "Midnight Gold",
    description: "Matte black with premium gold accents",
    swatches: [colors.midnightGold.background, colors.midnightGold.primary, colors.midnightGold.secondary],
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
  return value === "primary" || value === "midnightGold";
}

function getPalette(themeKey: ThemeKey): Palette {
  return themeKey === "midnightGold" ? colors.midnightGold : colors.light;
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [themeKey, setThemeKeyState] = useState<ThemeKey>("primary");

  useEffect(() => {
    let mounted = true;
    getStoredValue(THEME_STORAGE_KEY).then((stored) => {
      if (mounted && isThemeKey(stored)) setThemeKeyState(stored);
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
    themeKey: "primary",
    palette: colors.light,
    radius: colors.radius,
    setThemeKey: async (_key: ThemeKey) => {},
  };
}
