import { Feather } from "@expo/vector-icons";
import React from "react";
import { Image, StyleSheet, Text, View } from "react-native";

import { useColors } from "@/hooks/useColors";

function initialsFrom(name?: string | null, fallback?: string | null) {
  const source = (name || fallback || "ED").trim();
  const parts = source.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  return source.slice(0, 2).toUpperCase();
}

export function ProfilePhotoAvatar({
  uri,
  name,
  fallback,
  size = 76,
  borderColor,
}: {
  uri?: string | null;
  name?: string | null;
  fallback?: string | null;
  size?: number;
  borderColor?: string;
}) {
  const colors = useColors();
  const radius = size / 2;
  const fontSize = Math.max(12, Math.round(size * 0.34));

  return (
    <View
      style={[
        styles.wrap,
        {
          width: size,
          height: size,
          borderRadius: radius,
          backgroundColor: colors.card,
          borderColor: borderColor ?? colors.gold + "66",
        },
      ]}
    >
      {uri ? (
        <Image source={{ uri }} style={{ width: size, height: size, borderRadius: radius }} resizeMode="cover" />
      ) : (
        <View style={[styles.fallback, { width: size, height: size, borderRadius: radius, backgroundColor: colors.background }]}> 
          <Feather name="user" size={Math.max(18, Math.round(size * 0.36))} color={colors.gold} />
          <Text style={[styles.initials, { color: colors.gold, fontSize, lineHeight: fontSize + 4 }]} numberOfLines={1}>
            {initialsFrom(name, fallback)}
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { borderWidth: 2, alignItems: "center", justifyContent: "center", overflow: "hidden" },
  fallback: { alignItems: "center", justifyContent: "center" },
  initials: { fontFamily: "Inter_800ExtraBold", marginTop: 1 },
});
