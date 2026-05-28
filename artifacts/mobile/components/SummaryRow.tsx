import { Feather } from "@expo/vector-icons";
import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { useColors } from "@/hooks/useColors";

export function SummaryRow({ lines }: { lines: string[] }) {
  const colors = useColors();
  return (
    <View style={[styles.wrap, { backgroundColor: colors.card + "60", borderColor: colors.border + "60" }]}>
      <Feather name="info" size={14} color={colors.mutedForeground} />
      <View style={styles.textWrap}>
        {lines.map((line, i) => (
          <Text key={i} style={[styles.text, { color: colors.mutedForeground }]} numberOfLines={2}>
            {line}
          </Text>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    borderRadius: 10,
    borderWidth: 1,
    padding: 9,
    marginTop: 10,
  },
  textWrap: { flex: 1, gap: 2 },
  text: {
    fontFamily: "Inter_400Regular",
    fontSize: 11,
    lineHeight: 16,
  },
});
