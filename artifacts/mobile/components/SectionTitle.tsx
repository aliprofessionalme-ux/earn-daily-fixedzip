import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { useColors } from "@/hooks/useColors";

export function SectionTitle({ title, right }: { title: string; right?: React.ReactNode }) {
  const colors = useColors();
  return (
    <View style={styles.row}>
      <Text style={[styles.text, { color: colors.foreground }]} numberOfLines={1}>
        {title}
      </Text>
      {right ? <View style={styles.right}>{right}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 10, gap: 8 },
  text: { fontFamily: "Inter_600SemiBold", fontSize: 15, lineHeight: 20, flexShrink: 1 },
  right: { flexShrink: 0 },
});
