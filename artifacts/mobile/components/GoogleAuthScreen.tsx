import { Feather } from "@expo/vector-icons";
import * as Google from "expo-auth-session/providers/google";
import * as WebBrowser from "expo-web-browser";
import { LinearGradient } from "expo-linear-gradient";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Animated, Easing, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { OfficialWalletLogo } from "@/components/OfficialWalletLogo";
import { useUser } from "@/contexts/UserContext";

WebBrowser.maybeCompleteAuthSession();

const gold = "#F2C94C";
const ink = "#050607";
const text = "#FFF9EA";
const muted = "#B8B0A0";

function getFriendlyAuthMessage(message?: string | null) {
  const raw = String(message ?? "");
  const lower = raw.toLowerCase();
  if (!raw) return null;
  if (lower.includes("unauthorized-domain")) {
    const host = Platform.OS === "web" && typeof window !== "undefined" ? window.location.hostname : "this app domain";
    return `Google sign-in is ready. Add ${host} in Firebase Auth > Settings > Authorized domains.`;
  }
  if (lower.includes("popup") || lower.includes("cancel")) return "Google sign-in was not completed. Please try again.";
  return raw.replace(/^Firebase:\s*/i, "").replace(/\s*\(auth\/[^)]+\)\.?$/i, ".");
}

export function GoogleAuthScreen() {
  const insets = useSafeAreaInsets();
  const { signInWithGoogle, signInWithGoogleToken, error } = useUser();
  const [busy, setBusy] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const pulse = useRef(new Animated.Value(0)).current;

  const webClientId = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID;
  const androidClientId = process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID;
  const missingClientConfig = Platform.OS === "web" ? !webClientId : !androidClientId;

  const [request, response, promptAsync] = Google.useIdTokenAuthRequest({
    webClientId,
    androidClientId,
  });

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 1600, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0, duration: 1600, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);

  useEffect(() => {
    if (!response) return;
    if (response.type !== "success") {
      setBusy(false);
      if (response.type !== "dismiss") setLocalError("Google sign-in was not completed. Please try again.");
      return;
    }
    const idToken = (response.params as Record<string, string | undefined>).id_token;
    if (!idToken) {
      setBusy(false);
      setLocalError("Google did not return a valid account token.");
      return;
    }
    setBusy(true);
    signInWithGoogleToken(idToken)
      .then(() => setLocalError(null))
      .catch((authError) => setLocalError(authError instanceof Error ? authError.message : String(authError)))
      .finally(() => setBusy(false));
  }, [response, signInWithGoogleToken]);

  const logoScale = pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.035] });
  const glowOpacity = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.2, 0.38] });

  const buttonLabel = useMemo(() => {
    if (busy) return "Signing in...";
    if (missingClientConfig) return "Google setup missing";
    return "Continue with Google";
  }, [busy, missingClientConfig]);

  const handleGoogle = async () => {
    if (missingClientConfig || busy) return;
    setBusy(true);
    setLocalError(null);
    try {
      if (Platform.OS === "web") await signInWithGoogle();
      else if (request) await promptAsync();
      else setLocalError("Google sign-in is still preparing. Please try again.");
    } catch (authError) {
      setLocalError(authError instanceof Error ? authError.message : String(authError));
    } finally {
      setBusy(false);
    }
  };

  const friendlyError = missingClientConfig
    ? Platform.OS === "web"
      ? "Add EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID in Replit secrets."
      : "Add EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID in Replit or EAS secrets."
    : getFriendlyAuthMessage(localError ?? error);

  return (
    <View style={[styles.root, { paddingTop: insets.top + 22, paddingBottom: insets.bottom + 22 }]}>
      <LinearGradient colors={[ink, "#0D0E10", "#151003"]} style={StyleSheet.absoluteFillObject} />
      <Animated.View style={[styles.goldGlow, { opacity: glowOpacity }]} />
      <View style={styles.softGlow} />

      <View style={styles.header}>
        <Animated.View style={[styles.logoFrame, { transform: [{ scale: logoScale }] }]}>
          <OfficialWalletLogo size={62} />
        </Animated.View>
        <Text style={styles.appName}>Earn Daily</Text>
        <Text style={styles.appSub}>Sign in to protect your wallet and rewards</Text>
      </View>

      <View style={styles.card}>
        <View style={styles.cardTopIcon}>
          <Feather name="lock" size={18} color={gold} />
        </View>
        <Text style={styles.title}>Sign in</Text>
        <Text style={styles.subtitle}>Use your Google account to continue. Your coins, referrals and withdrawals stay linked safely.</Text>

        <Pressable
          disabled={busy || missingClientConfig || (Platform.OS !== "web" && !request)}
          onPress={handleGoogle}
          style={({ pressed }) => [styles.googleButton, { opacity: pressed ? 0.9 : busy || missingClientConfig ? 0.6 : 1 }]}
        >
          {busy ? (
            <ActivityIndicator color="#1F1F1F" />
          ) : (
            <View style={styles.googleIcon}>
              <Text style={styles.googleIconText}>G</Text>
            </View>
          )}
          <Text style={styles.googleText}>{buttonLabel}</Text>
        </Pressable>

        <View style={styles.trustRow}>
          <View style={styles.trustItem}>
            <Feather name="shield" size={14} color={gold} />
            <Text style={styles.trustText}>Secure</Text>
          </View>
          <View style={styles.trustItem}>
            <Feather name="refresh-cw" size={14} color={gold} />
            <Text style={styles.trustText}>Recoverable</Text>
          </View>
          <View style={styles.trustItem}>
            <Feather name="check-circle" size={14} color={gold} />
            <Text style={styles.trustText}>Verified</Text>
          </View>
        </View>
      </View>

      <View style={styles.footer}>
        {friendlyError ? (
          <View style={styles.noticeBox}>
            <Feather name="info" size={15} color={gold} />
            <Text style={styles.noticeText}>{friendlyError}</Text>
          </View>
        ) : (
          <Text style={styles.footerText}>
            {Platform.OS === "web" ? "Google will return you to Earn Daily after verification." : "A secure Google screen will open for verification."}
          </Text>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, paddingHorizontal: 22, backgroundColor: ink },
  goldGlow: { position: "absolute", width: 260, height: 260, borderRadius: 260, backgroundColor: "rgba(242,201,76,0.24)", top: 88, right: -130 },
  softGlow: { position: "absolute", width: 300, height: 300, borderRadius: 300, backgroundColor: "rgba(255,255,255,0.035)", bottom: -120, left: -130 },
  header: { alignItems: "center", paddingTop: 8 },
  logoFrame: { width: 86, height: 86, borderRadius: 28, borderWidth: 1, borderColor: "rgba(242,201,76,0.55)", backgroundColor: "rgba(255,255,255,0.05)", alignItems: "center", justifyContent: "center", shadowColor: gold, shadowOpacity: 0.22, shadowRadius: 18, shadowOffset: { width: 0, height: 10 } },
  appName: { color: text, fontFamily: "Inter_800ExtraBold", fontSize: 30, lineHeight: 36, marginTop: 16, textAlign: "center" },
  appSub: { color: muted, fontFamily: "Inter_500Medium", fontSize: 13, lineHeight: 18, marginTop: 4, textAlign: "center" },
  card: { marginTop: 28, borderWidth: 1, borderColor: "rgba(255,255,255,0.11)", borderRadius: 24, backgroundColor: "rgba(255,255,255,0.065)", padding: 18, alignItems: "center" },
  cardTopIcon: { width: 42, height: 42, borderRadius: 14, borderWidth: 1, borderColor: "rgba(242,201,76,0.35)", backgroundColor: "rgba(242,201,76,0.1)", alignItems: "center", justifyContent: "center", marginBottom: 14 },
  title: { color: text, fontFamily: "Inter_800ExtraBold", fontSize: 28, lineHeight: 34, textAlign: "center" },
  subtitle: { color: muted, fontFamily: "Inter_500Medium", fontSize: 13, lineHeight: 20, marginTop: 8, textAlign: "center", maxWidth: 290 },
  googleButton: { width: "100%", minHeight: 54, borderRadius: 16, backgroundColor: "#FFFFFF", flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 12, marginTop: 20, paddingHorizontal: 16 },
  googleIcon: { width: 26, height: 26, borderRadius: 13, alignItems: "center", justifyContent: "center", backgroundColor: "#F8FAFC" },
  googleIconText: { color: "#4285F4", fontFamily: "Inter_800ExtraBold", fontSize: 18, lineHeight: 22 },
  googleText: { color: "#1F1F1F", fontFamily: "Inter_700Bold", fontSize: 15, lineHeight: 19 },
  trustRow: { width: "100%", flexDirection: "row", justifyContent: "space-between", gap: 8, marginTop: 16 },
  trustItem: { flex: 1, minHeight: 40, borderRadius: 14, backgroundColor: "rgba(255,255,255,0.045)", borderWidth: 1, borderColor: "rgba(255,255,255,0.08)", alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 5 },
  trustText: { color: text, fontFamily: "Inter_600SemiBold", fontSize: 11, lineHeight: 14 },
  footer: { flex: 1, justifyContent: "flex-end", paddingBottom: 2 },
  footerText: { color: muted, fontFamily: "Inter_500Medium", fontSize: 12, lineHeight: 17, textAlign: "center" },
  noticeBox: { flexDirection: "row", alignItems: "flex-start", gap: 8, borderWidth: 1, borderColor: "rgba(242,201,76,0.25)", borderRadius: 14, backgroundColor: "rgba(242,201,76,0.08)", padding: 12 },
  noticeText: { flex: 1, color: text, fontFamily: "Inter_600SemiBold", fontSize: 12, lineHeight: 17 },
});
