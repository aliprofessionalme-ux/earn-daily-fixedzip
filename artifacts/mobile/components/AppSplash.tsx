import { Feather } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import React, { useEffect, useMemo, useRef } from "react";
import { ActivityIndicator, Animated, Easing, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { OfficialWalletLogo } from "@/components/OfficialWalletLogo";
import { useColors } from "@/hooks/useColors";

const splashText = "#FFF9EA";
const splashMuted = "#B8B0A0";
const splashGold = "#F2C94C";

function getFriendlyError(error?: string | null) {
  const text = String(error ?? "").toLowerCase();
  const backendOffline =
    text.includes("api url") ||
    text.includes("timed out") ||
    text.includes("failed to fetch") ||
    text.includes("network") ||
    text.includes("request failed") ||
    text.includes("backend");

  if (backendOffline) {
    return {
      title: "Backend is not connected",
      message: "Start the backend server, then tap Retry.",
    };
  }

  return {
    title: "Connection needs attention",
    message: "Please check the server connection and try again.",
  };
}

export function AppSplash({ error, onRetry }: { error?: string | null; onRetry?: () => void }) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const hasError = Boolean(error);
  const pulse = useRef(new Animated.Value(0)).current;
  const spin = useRef(new Animated.Value(0)).current;
  const friendlyError = useMemo(() => getFriendlyError(error), [error]);

  useEffect(() => {
    const pulseLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 1200, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0, duration: 1200, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      ]),
    );
    const spinLoop = Animated.loop(
      Animated.timing(spin, { toValue: 1, duration: 2200, easing: Easing.linear, useNativeDriver: true }),
    );
    pulseLoop.start();
    spinLoop.start();
    return () => {
      pulseLoop.stop();
      spinLoop.stop();
    };
  }, [pulse, spin]);

  const logoScale = pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.045] });
  const logoGlow = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.2, 0.42] });
  const spinRotate = spin.interpolate({ inputRange: [0, 1], outputRange: ["0deg", "360deg"] });

  return (
    <View style={[styles.root, { backgroundColor: "#050607", paddingTop: insets.top + 24, paddingBottom: insets.bottom + 24 }]}> 
      <LinearGradient colors={["#050607", "#0B0B0B", "#050607"]} style={StyleSheet.absoluteFillObject} />
      <View style={styles.glowGold} />
      <View style={styles.glowSoft} />

      <Animated.View style={[styles.logoWrap, { backgroundColor: "#111318", borderColor: splashGold + "77", opacity: hasError ? 0.92 : 1, transform: [{ scale: logoScale }] }]}> 
        <Animated.View style={[styles.logoRing, { borderColor: splashGold + "66", opacity: logoGlow, transform: [{ rotate: spinRotate }] }]} />
        <OfficialWalletLogo size={76} />
      </Animated.View>

      <View style={styles.brandPill}>
        <Feather name="shield" size={13} color={splashGold} />
        <Text style={styles.brandPillText}>SECURE REWARD WALLET</Text>
      </View>
      <Text style={[styles.title, { color: splashText }]}>Earn Daily</Text>
      <Text style={[styles.subtitle, { color: splashMuted }]}>Earn today. Secure tomorrow.</Text>
      <Text style={[styles.credit, { color: splashGold }]}>Design & Developed by Muhammad Ali Irfan Khan</Text>

      <View style={styles.trustRow}>
        <View style={styles.trustBadge}>
          <Feather name="check-circle" size={13} color={splashGold} />
          <Text style={styles.trustText}>Verified tasks</Text>
        </View>
        <View style={styles.trustBadge}>
          <Feather name="lock" size={13} color={splashGold} />
          <Text style={styles.trustText}>Protected wallet</Text>
        </View>
      </View>

      <View style={[styles.statusCard, { backgroundColor: "rgba(255,255,255,0.06)", borderColor: "rgba(255,255,255,0.10)" }]}> 
        {hasError ? (
          <>
            <Feather name="wifi-off" size={26} color={colors.destructive} />
            <Text style={[styles.errorTitle, { color: splashText }]}>{friendlyError.title}</Text>
            <Text style={[styles.errorText, { color: splashMuted }]}>{friendlyError.message}</Text>
            <Pressable onPress={onRetry} style={({ pressed }) => [styles.retryBtn, { backgroundColor: colors.primary, opacity: pressed ? 0.85 : 1 }]}> 
              <Feather name="refresh-cw" size={16} color="#fff" />
              <Text style={styles.retryText}>Retry</Text>
            </Pressable>
          </>
        ) : (
          <>
            <View style={styles.statusTop}>
              <Text style={styles.statusEyebrow}>SECURE SYNC</Text>
              <ActivityIndicator size="small" color={splashGold} />
            </View>
            <Text style={[styles.loadingText, { color: splashText }]}>Preparing your reward account</Text>
            <Text style={[styles.loadingSub, { color: splashMuted }]}>Checking wallet, tasks and security status.</Text>
            <View style={styles.progressTrack}>
              <Animated.View style={[styles.progressFill, { opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.56, 1] }) }]} />
            </View>
            <View style={styles.dotRow}>
              {[0, 1, 2].map((index) => (
                <Animated.View
                  key={index}
                  style={[
                    styles.dot,
                    {
                      backgroundColor: splashGold,
                      opacity: pulse.interpolate({ inputRange: [0, 0.5, 1], outputRange: index === 0 ? [1, 0.55, 0.3] : index === 1 ? [0.45, 1, 0.45] : [0.3, 0.55, 1] }),
                    },
                  ]}
                />
              ))}
            </View>
          </>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 24 },
  glowGold: { position: "absolute", width: 260, height: 260, borderRadius: 260, backgroundColor: "rgba(242,201,76,0.13)", top: 78, right: -88 },
  glowSoft: { position: "absolute", width: 320, height: 320, borderRadius: 320, backgroundColor: "rgba(255,255,255,0.045)", bottom: -96, left: -100 },
  logoWrap: { width: 92, height: 92, borderRadius: 28, borderWidth: 1, marginBottom: 20, alignItems: "center", justifyContent: "center", overflow: "hidden", shadowColor: "#F2C94C", shadowOpacity: 0.25, shadowRadius: 22, shadowOffset: { width: 0, height: 8 } },
  logoRing: { position: "absolute", width: 108, height: 108, borderRadius: 34, borderWidth: 2, borderLeftColor: "transparent", borderBottomColor: "transparent" },
  brandPill: { borderWidth: 1, borderColor: "rgba(242,201,76,0.45)", borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6, flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: "rgba(242,201,76,0.10)", marginBottom: 12 },
  brandPillText: { color: splashGold, fontFamily: "Inter_700Bold", fontSize: 10, lineHeight: 12, letterSpacing: 0 },
  title: { fontFamily: "Inter_700Bold", fontSize: 30, lineHeight: 36, letterSpacing: 0, textAlign: "center" },
  subtitle: { fontFamily: "Inter_400Regular", fontSize: 13, lineHeight: 18, marginTop: 5, textAlign: "center" },
  credit: { fontFamily: "Inter_600SemiBold", fontSize: 12, lineHeight: 16, marginTop: 8, textAlign: "center" },
  trustRow: { flexDirection: "row", flexWrap: "wrap", justifyContent: "center", gap: 8, marginTop: 14 },
  trustBadge: { borderWidth: 1, borderColor: "rgba(255,255,255,0.10)", borderRadius: 999, paddingHorizontal: 10, paddingVertical: 7, flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: "rgba(255,255,255,0.045)" },
  trustText: { color: splashText, fontFamily: "Inter_600SemiBold", fontSize: 11, lineHeight: 13 },
  statusCard: { width: "100%", maxWidth: 342, marginTop: 22, borderWidth: 1, borderRadius: 22, paddingVertical: 20, paddingHorizontal: 18, alignItems: "center", gap: 8 },
  statusTop: { width: "100%", flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 2 },
  statusEyebrow: { color: splashGold, fontFamily: "Inter_700Bold", fontSize: 10, lineHeight: 12, letterSpacing: 0 },
  loadingText: { fontFamily: "Inter_700Bold", fontSize: 16, lineHeight: 20, textAlign: "center", marginTop: 6 },
  loadingSub: { fontFamily: "Inter_400Regular", fontSize: 13, lineHeight: 19, textAlign: "center" },
  progressTrack: { width: "100%", height: 7, borderRadius: 999, overflow: "hidden", backgroundColor: "rgba(255,255,255,0.08)", marginTop: 6 },
  progressFill: { width: "72%", height: "100%", borderRadius: 999, backgroundColor: splashGold },
  dotRow: { flexDirection: "row", gap: 7, marginTop: 4 },
  dot: { width: 6, height: 6, borderRadius: 6 },
  errorTitle: { fontFamily: "Inter_700Bold", fontSize: 17, lineHeight: 21, marginTop: 4, textAlign: "center" },
  errorText: { fontFamily: "Inter_400Regular", fontSize: 13, lineHeight: 19, textAlign: "center" },
  retryBtn: { marginTop: 8, borderRadius: 999, paddingHorizontal: 18, paddingVertical: 12, flexDirection: "row", alignItems: "center", gap: 8 },
  retryText: { color: "#fff", fontFamily: "Inter_700Bold", fontSize: 14, lineHeight: 18 },
});
