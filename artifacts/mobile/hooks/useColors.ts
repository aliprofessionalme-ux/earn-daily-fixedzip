import { useTheme } from "@/contexts/ThemeContext";

/**
 * Returns the design tokens for the selected app theme.
 *
 * The primary palette remains the default, and user-selected alternate
 * palettes are stored locally through ThemeContext.
 */
export function useColors() {
  const { palette, radius } = useTheme();
  return { ...palette, radius };
}
