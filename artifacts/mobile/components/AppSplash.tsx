import { Feather } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import React from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { OfficialWalletLogo } from "@/components/OfficialWalletLogo";
import { useColors } from "@/hooks/useColors";

export function AppSplash({ error, onRetry }: { error?: string | null; onRetry?: () => void }) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const hasError = Boolean(error);

  return (
    <View style={[styles.root, { backgroundColor: "#050607", paddingTop: insets.top + 20, paddingBottom: insets.bottom + 20 }]}> 
      <LinearGradient colors={["#050607", "#0B0B0B", "#010101"]} style={StyleSheet.absoluteFillObject} />
      <View style={styles.glowGold} />
      <View style={styles.glowSoft} />

      <View style={[styles.logoWrap, { backgroundColor: colors.card, borderColor: colors.gold + "77" }]}> 
        <OfficialWalletLogo size={76} />
      </View>

      <Text style={[styles.title, { color: colors.foreground }]}>Earn Daily</Text>
      <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>Earn today, secure tomorrow</Text>
      <Text style={[styles.credit, { color: colors.gold }]}>Design & Developed by Muhammad Ali Irfan Khan</Text>

      <View style={[styles.statusCard, { backgroundColor: "rgba(255,255,255,0.06)", borderColor: "rgba(255,255,255,0.10)" }]}> 
        {hasError ? (
          <>
            <Feather name="alert-circle" size={26} color={colors.destructive} />
            <Text style={[styles.errorTitle, { color: colors.foreground }]}>Setup needs attention</Text>
            <Text style={[styles.errorText, { color: colors.mutedForeground }]}>{error}</Text>
            <Pressable onPress={onRetry} style={({ pressed }) => [styles.retryBtn, { backgroundColor: colors.primary, opacity: pressed ? 0.85 : 1 }]}> 
              <Feather name="refresh-cw" size={16} color="#fff" />
              <Text style={styles.retryText}>Retry</Text>
            </Pressable>
          </>
        ) : (
          <>
            <ActivityIndicator size="large" color={colors.gold} />
            <Text style={[styles.loadingText, { color: colors.foreground }]}>Preparing your reward account</Text>
            <Text style={[styles.loadingSub, { color: colors.mutedForeground }]}>Initializing device ID, Firebase auth and wallet data...</Text>
          </>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 24 },
  glowGold: { position: "absolute", width: 260, height: 260, borderRadius: 260, backgroundColor: "rgba(242,201,76,0.16)", top: 80, right: -80 },
  glowSoft: { position: "absolute", width: 300, height: 300, borderRadius: 300, backgroundColor: "rgba(255,255,255,0.06)", bottom: -80, left: -90 },
  logoWrap: { width: 88, height: 88, borderRadius: 28, borderWidth: 1, marginBottom: 18, alignItems: "center", justifyContent: "center", overflow: "hidden", shadowColor: "#F2C94C", shadowOpacity: 0.28, shadowRadius: 20, shadowOffset: { width: 0, height: 6 } },
  title: { fontFamily: "Inter_700Bold", fontSize: 28, letterSpacing: 0, textAlign: "center" },
  subtitle: { fontFamily: "Inter_400Regular", fontSize: 13, marginTop: 6, textAlign: "center" },
  credit: { fontFamily: "Inter_600SemiBold", fontSize: 12, lineHeight: 16, marginTop: 8, textAlign: "center" },
  statusCard: { width: "100%", marginTop: 24, borderWidth: 1, borderRadius: 20, padding: 18, alignItems: "center", gap: 8 },
  loadingText: { fontFamily: "Inter_700Bold", fontSize: 16, lineHeight: 20, textAlign: "center", marginTop: 6 },
  loadingSub: { fontFamily: "Inter_400Regular", fontSize: 13, lineHeight: 19, textAlign: "center" },
  errorTitle: { fontFamily: "Inter_700Bold", fontSize: 17, lineHeight: 21, marginTop: 4, textAlign: "center" },
  errorText: { fontFamily: "Inter_400Regular", fontSize: 13, lineHeight: 19, textAlign: "center" },
  retryBtn: { marginTop: 8, borderRadius: 999, paddingHorizontal: 18, paddingVertical: 12, flexDirection: "row", alignItems: "center", gap: 8 },
  retryText: { color: "#fff", fontFamily: "Inter_700Bold", fontSize: 14, lineHeight: 18 },
});
