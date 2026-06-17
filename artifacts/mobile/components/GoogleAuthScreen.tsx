import { Feather } from "@expo/vector-icons";
import * as Google from "expo-auth-session/providers/google";
import * as WebBrowser from "expo-web-browser";
import { LinearGradient } from "expo-linear-gradient";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Animated, Easing, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { OfficialWalletLogo } from "@/components/OfficialWalletLogo";
import { useUser } from "@/contexts/UserContext";
import { useColors } from "@/hooks/useColors";

WebBrowser.maybeCompleteAuthSession();

const gold = "#F2C94C";
const ink = "#050607";
const text = "#FFF9EA";
const muted = "#B8B0A0";

export function GoogleAuthScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { signInWithGoogle, signInWithGoogleToken, error } = useUser();
  const [busy, setBusy] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const float = useRef(new Animated.Value(0)).current;
  const rope = useRef(new Animated.Value(0)).current;

  const webClientId = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID;
  const androidClientId = process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID;
  const missingClientConfig = Platform.OS === "web" ? !webClientId : !androidClientId;

  const [request, response, promptAsync] = Google.useIdTokenAuthRequest({
    webClientId,
    androidClientId,
  });

  useEffect(() => {
    const loop = Animated.loop(
      Animated.parallel([
        Animated.sequence([
          Animated.timing(float, { toValue: 1, duration: 1500, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
          Animated.timing(float, { toValue: 0, duration: 1500, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        ]),
        Animated.sequence([
          Animated.timing(rope, { toValue: 1, duration: 1800, easing: Easing.inOut(Easing.cubic), useNativeDriver: true }),
          Animated.timing(rope, { toValue: 0, duration: 1800, easing: Easing.inOut(Easing.cubic), useNativeDriver: true }),
        ]),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [float, rope]);

  useEffect(() => {
    if (!response) return;
    if (response.type !== "success") {
      setBusy(false);
      if (response.type !== "dismiss") {
        setLocalError("Google sign-in was cancelled or failed. Please try again.");
      }
      return;
    }
    const idToken = (response.params as Record<string, string | undefined>).id_token;
    if (!idToken) {
      setBusy(false);
      setLocalError("Google sign-in did not return a valid token.");
      return;
    }
    setBusy(true);
    signInWithGoogleToken(idToken)
      .then(() => setLocalError(null))
      .catch((authError) => {
        const message = authError instanceof Error ? authError.message : String(authError);
        setLocalError(message);
      })
      .finally(() => setBusy(false));
  }, [response, signInWithGoogleToken]);

  const haloShift = float.interpolate({ inputRange: [0, 1], outputRange: [0, -10] });
  const cardLift = rope.interpolate({ inputRange: [0, 1], outputRange: [0, -6] });
  const glowOpacity = float.interpolate({ inputRange: [0, 1], outputRange: [0.22, 0.4] });

  const buttonLabel = useMemo(() => {
    if (busy) return "Securing account...";
    if (missingClientConfig) return "Google Setup Missing";
    return Platform.OS === "web" ? "Secure with Google" : "Continue with Google";
  }, [busy, missingClientConfig]);

  const handleGoogle = async () => {
    if (missingClientConfig || busy) return;
    setBusy(true);
    setLocalError(null);
    try {
      if (Platform.OS === "web") {
        await signInWithGoogle();
      } else if (request) {
        await promptAsync();
      } else {
        setLocalError("Google sign-in request is not ready yet. Please wait a moment and try again.");
      }
    } catch (authError) {
      const message = authError instanceof Error ? authError.message : String(authError);
      setLocalError(message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={[styles.root, { paddingTop: insets.top + 18, paddingBottom: insets.bottom + 22 }]}>
      <LinearGradient colors={[ink, "#101114", "#171100"]} style={StyleSheet.absoluteFillObject} />
      <View style={styles.goldGlow} />
      <View style={styles.deepGlow} />
      <Animated.View style={[styles.meshGlow, { opacity: glowOpacity, transform: [{ translateY: haloShift }] }]} />

      <View style={styles.topBar}>
        <OfficialWalletLogo size={44} />
        <View style={{ flex: 1 }}>
          <Text style={styles.brand}>Earn Daily</Text>
          <Text style={styles.brandSub}>Protected account access</Text>
        </View>
        <View style={styles.lockBadge}>
          <Feather name="lock" size={15} color={gold} />
        </View>
      </View>

      <View style={styles.heroWrap}>
        <Animated.View style={[styles.heroCard, { transform: [{ translateY: cardLift }] }]}>
          <LinearGradient colors={["rgba(255,255,255,0.08)", "rgba(255,255,255,0.03)"]} style={StyleSheet.absoluteFillObject} />
          <View style={styles.kickerRow}>
            <View style={styles.statusChip}>
              <Feather name="shield" size={13} color={gold} />
              <Text style={styles.statusChipText}>Google Protected</Text>
            </View>
            <View style={styles.liveDot} />
          </View>

          <Text style={styles.title}>Secure your rewards account</Text>
          <Text style={styles.subtitle}>Use Google once, then keep your coins, referrals, task history and withdrawals linked to one trusted identity.</Text>

          <View style={styles.benefitGrid}>
            <View style={styles.benefitCard}>
              <Feather name="award" size={18} color={gold} />
              <Text style={styles.benefitTitle}>Rewards stay safe</Text>
              <Text style={styles.benefitText}>No lost balance on reinstall</Text>
            </View>
            <View style={styles.benefitCard}>
              <Feather name="user-check" size={18} color={colors.green} />
              <Text style={styles.benefitTitle}>Verified access</Text>
              <Text style={styles.benefitText}>Fraud and fake sessions blocked</Text>
            </View>
          </View>

          <View style={styles.accountPreview}>
            <View style={styles.accountIcon}>
              <Feather name="briefcase" size={16} color={gold} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.accountTitle}>One account for all earnings</Text>
              <Text style={styles.accountText}>Home, referrals, payouts and support stay connected.</Text>
            </View>
          </View>
        </Animated.View>
      </View>

      <Pressable
        disabled={busy || missingClientConfig || (Platform.OS !== "web" && !request)}
        onPress={handleGoogle}
        style={({ pressed }) => [styles.googleButton, { opacity: pressed ? 0.88 : busy || missingClientConfig ? 0.58 : 1 }]}
      >
        <LinearGradient colors={["#FFF7D6", gold, "#F59E0B"]} style={styles.googleGradient}>
          {busy ? <ActivityIndicator color="#140A00" /> : <Feather name="user-check" size={20} color="#140A00" />}
          <Text style={styles.googleText}>{buttonLabel}</Text>
        </LinearGradient>
      </Pressable>

      {missingClientConfig ? (
        <Text style={styles.errorText}>
          {Platform.OS === "web"
            ? "Add EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID in Replit or EAS secrets for web sign-in."
            : "Add EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID in Replit or EAS secrets for Android sign-in."}
        </Text>
      ) : localError ? (
        <Text style={styles.errorText}>{localError}</Text>
      ) : error ? (
        <Text style={styles.errorText}>{error}</Text>
      ) : (
        <Text style={styles.footerText}>
          {Platform.OS === "web"
            ? "Google will open in this browser and return you back after verification."
            : "A secure Google verification window will open to protect your account."}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, paddingHorizontal: 20, justifyContent: "space-between", backgroundColor: ink },
  goldGlow: { position: "absolute", width: 320, height: 320, borderRadius: 320, backgroundColor: "rgba(242,201,76,0.12)", top: 94, right: -170 },
  deepGlow: { position: "absolute", width: 360, height: 360, borderRadius: 360, backgroundColor: "rgba(255,255,255,0.035)", bottom: -150, left: -150 },
  meshGlow: { position: "absolute", top: 156, left: 32, right: 32, height: 220, borderRadius: 40, backgroundColor: "rgba(242,201,76,0.11)" },
  topBar: { flexDirection: "row", alignItems: "center", gap: 12 },
  brand: { color: text, fontFamily: "Inter_800ExtraBold", fontSize: 18, lineHeight: 22 },
  brandSub: { color: muted, fontFamily: "Inter_500Medium", fontSize: 12, lineHeight: 16, marginTop: 1 },
  lockBadge: { width: 38, height: 38, borderRadius: 14, borderWidth: 1, borderColor: "rgba(242,201,76,0.4)", backgroundColor: "rgba(242,201,76,0.1)", alignItems: "center", justifyContent: "center" },
  heroWrap: { flex: 1, justifyContent: "center" },
  heroCard: { borderRadius: 28, borderWidth: 1, borderColor: "rgba(255,255,255,0.10)", backgroundColor: "rgba(11,11,13,0.66)", padding: 20, overflow: "hidden", gap: 18 },
  kickerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  statusChip: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999, backgroundColor: "rgba(242,201,76,0.12)", borderWidth: 1, borderColor: "rgba(242,201,76,0.24)" },
  statusChipText: { color: gold, fontFamily: "Inter_700Bold", fontSize: 12, lineHeight: 15 },
  liveDot: { width: 10, height: 10, borderRadius: 999, backgroundColor: "#22C55E" },
  title: { color: text, fontFamily: "Inter_800ExtraBold", fontSize: 32, lineHeight: 36 },
  subtitle: { color: muted, fontFamily: "Inter_500Medium", fontSize: 14, lineHeight: 21 },
  benefitGrid: { flexDirection: "row", gap: 10 },
  benefitCard: { flex: 1, borderWidth: 1, borderColor: "rgba(255,255,255,0.08)", borderRadius: 18, backgroundColor: "rgba(255,255,255,0.04)", padding: 14, gap: 8 },
  benefitTitle: { color: text, fontFamily: "Inter_700Bold", fontSize: 13, lineHeight: 17 },
  benefitText: { color: muted, fontFamily: "Inter_500Medium", fontSize: 11, lineHeight: 16 },
  accountPreview: { flexDirection: "row", gap: 12, alignItems: "center", borderWidth: 1, borderColor: "rgba(242,201,76,0.16)", borderRadius: 18, backgroundColor: "rgba(242,201,76,0.06)", padding: 14 },
  accountIcon: { width: 38, height: 38, borderRadius: 12, backgroundColor: "rgba(242,201,76,0.12)", alignItems: "center", justifyContent: "center" },
  accountTitle: { color: text, fontFamily: "Inter_700Bold", fontSize: 13, lineHeight: 17 },
  accountText: { color: muted, fontFamily: "Inter_500Medium", fontSize: 11, lineHeight: 16, marginTop: 2 },
  googleButton: { borderRadius: 18, overflow: "hidden", shadowColor: gold, shadowOpacity: 0.3, shadowRadius: 18, shadowOffset: { width: 0, height: 10 } },
  googleGradient: { minHeight: 56, borderRadius: 18, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10, paddingHorizontal: 16 },
  googleText: { color: "#140A00", fontFamily: "Inter_800ExtraBold", fontSize: 15, lineHeight: 19 },
  errorText: { color: "#FCA5A5", fontFamily: "Inter_600SemiBold", fontSize: 12, lineHeight: 17, textAlign: "center" },
  footerText: { color: muted, fontFamily: "Inter_500Medium", fontSize: 12, lineHeight: 17, textAlign: "center" },
});
