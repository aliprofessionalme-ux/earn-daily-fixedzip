import { Feather } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { useColors } from "@/hooks/useColors";

export function CompactStatCard({
  icon,
  label,
  value,
  sub,
  colors: gradientColors,
  accent,
}: {
  icon: React.ComponentProps<typeof Feather>["name"];
  label: string;
  value: string;
  sub?: string;
  colors: [string, string];
  accent: string;
}) {
  const theme = useColors();
  return (
    <LinearGradient
      colors={gradientColors}
      style={[styles.card, { borderColor: accent + "30" }]}
    >
      <View style={styles.iconWrap}>
        <Feather name={icon} size={14} color={accent} />
      </View>
      <Text style={[styles.label, { color: theme.mutedForeground }]} numberOfLines={1}>
        {label}
      </Text>
      <Text style={[styles.value, { color: accent }]} numberOfLines={1}>
        {value}
      </Text>
      {sub ? (
        <Text style={[styles.sub, { color: theme.mutedForeground }]} numberOfLines={1}>
          {sub}
        </Text>
      ) : null}
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  card: {
    flex: 1,
    borderRadius: 12,
    borderWidth: 1,
    paddingVertical: 8,
    paddingHorizontal: 5,
    gap: 2,
    alignItems: "center",
    justifyContent: "center",
    minWidth: 0,
    minHeight: 72,
  },
  iconWrap: {
    width: 24,
    height: 24,
    borderRadius: 8,
    backgroundColor: "rgba(255,255,255,0.08)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 2,
  },
  label: {
    fontFamily: "Inter_500Medium",
    fontSize: 10.5,
    lineHeight: 13,
    textAlign: "center",
    includeFontPadding: false,
  },
  value: {
    fontFamily: "Inter_700Bold",
    fontSize: 15,
    lineHeight: 18,
    textAlign: "center",
    includeFontPadding: false,
  },
  sub: {
    fontFamily: "Inter_400Regular",
    fontSize: 9.5,
    lineHeight: 12,
    textAlign: "center",
    includeFontPadding: false,
  },
});
