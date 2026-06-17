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

const gold = "#F6C945";
const amber = "#F59E0B";
const ink = "#050607";
const panel = "#101114";
const line = "rgba(255,255,255,0.11)";
const text = "#FFF9EA";
const muted = "#B8B0A0";

function getFriendlyAuthMessage(message?: string | null) {
  const raw = String(message ?? "");
  const lower = raw.toLowerCase();
  if (!raw) return null;
  if (lower.includes("unauthorized-domain")) {
    const host = Platform.OS === "web" && typeof window !== "undefined" ? window.location.hostname : "this app domain";
    return `Setup needed: add ${host} in Firebase Authentication > Settings > Authorized domains.`;
  }
  if (lower.includes("popup-closed") || lower.includes("cancel")) return "Google sign-in was cancelled. Tap the button to try again.";
  if (lower.includes("popup")) return "Allow popups for this preview, then try Google sign-in again.";
  return raw.replace(/^Firebase:\s*/i, "").replace(/\s*\(auth\/[^)]+\)\.?$/i, ".");
}

export function GoogleAuthScreen() {
  const insets = useSafeAreaInsets();
  const { signInWithGoogle, signInWithGoogleToken, error } = useUser();
  const [busy, setBusy] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const float = useRef(new Animated.Value(0)).current;

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
        Animated.timing(float, { toValue: 1, duration: 1700, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(float, { toValue: 0, duration: 1700, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [float]);

  useEffect(() => {
    if (!response) return;
    if (response.type !== "success") {
      setBusy(false);
      if (response.type !== "dismiss") setLocalError("Google sign-in was cancelled. Tap the button to try again.");
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

  const coinLift = float.interpolate({ inputRange: [0, 1], outputRange: [0, -9] });
  const haloOpacity = float.interpolate({ inputRange: [0, 1], outputRange: [0.18, 0.34] });

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
    <View style={[styles.root, { paddingTop: insets.top + 18, paddingBottom: insets.bottom + 18 }]}>
      <LinearGradient colors={[ink, "#0B0C0E", "#171104"]} style={StyleSheet.absoluteFillObject} />
      <Animated.View style={[styles.halo, { opacity: haloOpacity }]} />
      <View style={styles.cornerGlow} />

      <View style={styles.topBar}>
        <View style={styles.brandRow}>
          <View style={styles.smallLogo}>
            <OfficialWalletLogo size={32} />
          </View>
          <View>
            <Text style={styles.brandName}>Earn Daily</Text>
            <Text style={styles.brandSub}>Protected rewards account</Text>
          </View>
        </View>
        <View style={styles.lockBadge}>
          <Feather name="lock" size={17} color={gold} />
        </View>
      </View>

      <View style={styles.content}>
        <Animated.View style={[styles.heroBadge, { transform: [{ translateY: coinLift }] }]}>
          <View style={styles.heroCoinBack} />
          <View style={styles.heroCoin}>
            <Text style={styles.heroCoinText}>$</Text>
          </View>
          <View style={styles.heroCard}>
            <View style={styles.heroLine} />
            <Text style={styles.heroCardText}>Verified Wallet</Text>
          </View>
        </Animated.View>

        <View style={styles.loginPanel}>
          <Text style={styles.eyebrow}>GOOGLE SIGN IN</Text>
          <Text style={styles.title}>Welcome back</Text>
          <Text style={styles.subtitle}>
            Sign in once and keep your coins, energy, referrals and withdrawals attached to one secure account.
          </Text>

          <Pressable
            disabled={busy || missingClientConfig || (Platform.OS !== "web" && !request)}
            onPress={handleGoogle}
            style={({ pressed }) => [
              styles.googleButton,
              { opacity: pressed ? 0.92 : busy || missingClientConfig ? 0.62 : 1 },
            ]}
          >
            {busy ? (
              <ActivityIndicator color="#202124" />
            ) : (
              <View style={styles.googleMark}>
                <Text style={styles.googleMarkText}>G</Text>
              </View>
            )}
            <Text style={styles.googleText}>{buttonLabel}</Text>
          </Pressable>

          <View style={styles.benefitRow}>
            <View style={styles.benefit}>
              <Feather name="shield" size={15} color={gold} />
              <Text style={styles.benefitText}>Fraud checked</Text>
            </View>
            <View style={styles.benefit}>
              <Feather name="credit-card" size={15} color={gold} />
              <Text style={styles.benefitText}>Wallet secured</Text>
            </View>
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
            {Platform.OS === "web" ? "A Google popup will open and return you here." : "A secure Google screen will open for verification."}
          </Text>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, paddingHorizontal: 20, backgroundColor: ink },
  halo: { position: "absolute", width: 300, height: 300, borderRadius: 300, backgroundColor: "rgba(246,201,69,0.24)", top: 82, right: -135 },
  cornerGlow: { position: "absolute", width: 240, height: 240, borderRadius: 240, backgroundColor: "rgba(255,255,255,0.04)", bottom: -105, left: -110 },
  topBar: { minHeight: 54, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  brandRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  smallLogo: { width: 44, height: 44, borderRadius: 14, borderWidth: 1, borderColor: "rgba(246,201,69,0.58)", backgroundColor: "rgba(255,255,255,0.06)", alignItems: "center", justifyContent: "center" },
  brandName: { color: text, fontFamily: "Inter_800ExtraBold", fontSize: 16, lineHeight: 20 },
  brandSub: { color: muted, fontFamily: "Inter_500Medium", fontSize: 11, lineHeight: 15, marginTop: 1 },
  lockBadge: { width: 40, height: 40, borderRadius: 14, borderWidth: 1, borderColor: "rgba(246,201,69,0.45)", backgroundColor: "rgba(246,201,69,0.08)", alignItems: "center", justifyContent: "center" },
  content: { flex: 1, justifyContent: "center", paddingBottom: 8 },
  heroBadge: { alignSelf: "center", width: 210, height: 160, alignItems: "center", justifyContent: "flex-end", marginBottom: 12 },
  heroCoinBack: { position: "absolute", top: 14, width: 86, height: 86, borderRadius: 43, backgroundColor: "rgba(246,201,69,0.48)", right: 47 },
  heroCoin: { position: "absolute", top: 0, width: 82, height: 82, borderRadius: 41, backgroundColor: gold, borderWidth: 3, borderColor: "#FFE899", alignItems: "center", justifyContent: "center", shadowColor: gold, shadowOpacity: 0.36, shadowRadius: 22, shadowOffset: { width: 0, height: 12 } },
  heroCoinText: { color: "#4A3200", fontFamily: "Inter_800ExtraBold", fontSize: 25, lineHeight: 30 },
  heroCard: { width: 198, minHeight: 88, borderRadius: 24, borderWidth: 1, borderColor: "rgba(246,201,69,0.55)", backgroundColor: panel, alignItems: "center", justifyContent: "center", paddingTop: 14 },
  heroLine: { position: "absolute", top: 25, left: 28, right: 28, height: 1, backgroundColor: "rgba(246,201,69,0.7)" },
  heroCardText: { color: text, fontFamily: "Inter_800ExtraBold", fontSize: 15, lineHeight: 20, marginTop: 16 },
  loginPanel: { borderWidth: 1, borderColor: line, borderRadius: 26, backgroundColor: "rgba(255,255,255,0.065)", padding: 18 },
  eyebrow: { color: gold, fontFamily: "Inter_800ExtraBold", fontSize: 11, lineHeight: 14, letterSpacing: 0, textAlign: "center" },
  title: { color: text, fontFamily: "Inter_800ExtraBold", fontSize: 32, lineHeight: 38, marginTop: 8, textAlign: "center" },
  subtitle: { color: muted, fontFamily: "Inter_500Medium", fontSize: 13, lineHeight: 20, marginTop: 8, textAlign: "center" },
  googleButton: { width: "100%", minHeight: 56, borderRadius: 18, backgroundColor: "#FFFFFF", flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 12, marginTop: 20, paddingHorizontal: 16, shadowColor: amber, shadowOpacity: 0.25, shadowRadius: 14, shadowOffset: { width: 0, height: 8 } },
  googleMark: { width: 28, height: 28, borderRadius: 14, alignItems: "center", justifyContent: "center", backgroundColor: "#F8FAFC" },
  googleMarkText: { color: "#4285F4", fontFamily: "Inter_800ExtraBold", fontSize: 18, lineHeight: 22 },
  googleText: { color: "#202124", fontFamily: "Inter_800ExtraBold", fontSize: 15, lineHeight: 19 },
  benefitRow: { flexDirection: "row", gap: 10, marginTop: 14 },
  benefit: { flex: 1, minHeight: 44, borderRadius: 15, backgroundColor: "rgba(255,255,255,0.045)", borderWidth: 1, borderColor: "rgba(255,255,255,0.08)", flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingHorizontal: 8 },
  benefitText: { color: text, fontFamily: "Inter_700Bold", fontSize: 11, lineHeight: 14 },
  footer: { minHeight: 50, justifyContent: "flex-end" },
  footerText: { color: muted, fontFamily: "Inter_500Medium", fontSize: 12, lineHeight: 17, textAlign: "center" },
  noticeBox: { flexDirection: "row", alignItems: "flex-start", gap: 8, borderWidth: 1, borderColor: "rgba(246,201,69,0.28)", borderRadius: 15, backgroundColor: "rgba(246,201,69,0.09)", padding: 12 },
  noticeText: { flex: 1, color: text, fontFamily: "Inter_600SemiBold", fontSize: 12, lineHeight: 17 },
});
