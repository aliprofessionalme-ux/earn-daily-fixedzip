import { Feather } from "@expo/vector-icons";
import * as Google from "expo-auth-session/providers/google";
import * as WebBrowser from "expo-web-browser";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Animated, Easing, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { OfficialWalletLogo } from "@/components/OfficialWalletLogo";
import { useUser } from "@/contexts/UserContext";

WebBrowser.maybeCompleteAuthSession();

const ink = "#101114";
const muted = "#6B7280";
const soft = "#F4F5F7";
const line = "#D8DCE2";
const gold = "#D99A00";

function getFriendlyAuthMessage(message?: string | null) {
  const raw = String(message ?? "");
  const lower = raw.toLowerCase();
  if (!raw) return null;
  if (lower.includes("unauthorized-domain")) {
    return "Google setup needs one Firebase authorized domain.";
  }
  if (lower.includes("popup-closed") || lower.includes("cancel")) return "Google sign-in was cancelled. Try again.";
  if (lower.includes("popup")) return "Allow popups for this preview, then try again.";
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
        Animated.timing(float, { toValue: 1, duration: 1800, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(float, { toValue: 0, duration: 1800, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [float]);

  useEffect(() => {
    if (!response) return;
    if (response.type !== "success") {
      setBusy(false);
      if (response.type !== "dismiss") setLocalError("Google sign-in was cancelled. Try again.");
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

  const logoTranslate = float.interpolate({ inputRange: [0, 1], outputRange: [0, -5] });

  const buttonLabel = useMemo(() => {
    if (busy) return "Signing in";
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
      else setLocalError("Google sign-in is still preparing. Try again.");
    } catch (authError) {
      setLocalError(authError instanceof Error ? authError.message : String(authError));
    } finally {
      setBusy(false);
    }
  };

  const friendlyError = missingClientConfig
    ? Platform.OS === "web"
      ? "Google web client ID is missing."
      : "Google Android client ID is missing."
    : getFriendlyAuthMessage(localError ?? error);

  return (
    <View style={[styles.root, { paddingTop: insets.top + 18, paddingBottom: insets.bottom + 16 }]}>
      <View style={styles.topBar}>
        <View style={styles.brandMini}>
          <OfficialWalletLogo size={30} />
        </View>
        <Text style={styles.topTitle}>Earn Daily</Text>
        <View style={styles.secureBadge}>
          <Feather name="lock" size={15} color={ink} />
        </View>
      </View>

      <View style={styles.body}>
        <Animated.View style={[styles.logoWrap, { transform: [{ translateY: logoTranslate }] }]}>
          <OfficialWalletLogo size={74} />
        </Animated.View>

        <Text style={styles.title}>Sign in to Earn Daily</Text>
        <Text style={styles.subtitle}>Use your Google account to protect coins, energy, referrals and withdrawals.</Text>

        <View style={styles.form}>
          <Text style={styles.label}>Account</Text>
          <View style={styles.inputLike}>
            <Feather name="mail" size={16} color={muted} />
            <Text style={styles.inputText}>Google account</Text>
          </View>

          <Pressable
            disabled={busy || missingClientConfig || (Platform.OS !== "web" && !request)}
            onPress={handleGoogle}
            style={({ pressed }) => [
              styles.primaryButton,
              { opacity: pressed ? 0.88 : busy || missingClientConfig ? 0.58 : 1 },
            ]}
          >
            {busy ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <View style={styles.googleMark}>
                <Text style={styles.googleText}>G</Text>
              </View>
            )}
            <Text style={styles.primaryText}>{buttonLabel}</Text>
          </Pressable>

          {friendlyError ? (
            <View style={styles.notice}>
              <Feather name="info" size={14} color={gold} />
              <Text style={styles.noticeText}>{friendlyError}</Text>
            </View>
          ) : null}
        </View>

        <View style={styles.helperBox}>
          <Feather name="shield" size={16} color={ink} />
          <Text style={styles.helperText}>One secure account keeps your wallet recoverable on every device.</Text>
        </View>
      </View>

      <Text style={styles.legal}>By continuing, you agree to Earn Daily account security checks.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: soft, paddingHorizontal: 24 },
  topBar: { minHeight: 48, flexDirection: "row", alignItems: "center" },
  brandMini: { width: 38, height: 38, borderRadius: 13, backgroundColor: "#FFFFFF", alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: line },
  topTitle: { flex: 1, color: ink, fontFamily: "Inter_800ExtraBold", fontSize: 15, lineHeight: 19, marginLeft: 10 },
  secureBadge: { width: 36, height: 36, borderRadius: 18, borderWidth: 1, borderColor: line, backgroundColor: "#FFFFFF", alignItems: "center", justifyContent: "center" },
  body: { flex: 1, justifyContent: "center" },
  logoWrap: { width: 96, height: 96, borderRadius: 30, backgroundColor: "#FFFFFF", borderWidth: 1, borderColor: line, alignItems: "center", justifyContent: "center", alignSelf: "center", shadowColor: "#000000", shadowOpacity: 0.08, shadowRadius: 18, shadowOffset: { width: 0, height: 10 } },
  title: { color: ink, fontFamily: "Inter_800ExtraBold", fontSize: 31, lineHeight: 37, textAlign: "center", marginTop: 26 },
  subtitle: { color: muted, fontFamily: "Inter_500Medium", fontSize: 14, lineHeight: 21, textAlign: "center", marginTop: 10 },
  form: { marginTop: 34 },
  label: { color: ink, fontFamily: "Inter_700Bold", fontSize: 13, lineHeight: 17, marginBottom: 8 },
  inputLike: { minHeight: 52, borderRadius: 10, backgroundColor: "#FFFFFF", borderWidth: 1, borderColor: line, flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 14 },
  inputText: { color: muted, fontFamily: "Inter_500Medium", fontSize: 14, lineHeight: 18 },
  primaryButton: { minHeight: 54, borderRadius: 10, backgroundColor: ink, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 12, marginTop: 14, paddingHorizontal: 16 },
  googleMark: { width: 26, height: 26, borderRadius: 13, backgroundColor: "#FFFFFF", alignItems: "center", justifyContent: "center" },
  googleText: { color: "#4285F4", fontFamily: "Inter_800ExtraBold", fontSize: 17, lineHeight: 21 },
  primaryText: { color: "#FFFFFF", fontFamily: "Inter_800ExtraBold", fontSize: 15, lineHeight: 19 },
  notice: { minHeight: 42, borderRadius: 10, borderWidth: 1, borderColor: "#F2D27B", backgroundColor: "#FFF8E1", flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 12, marginTop: 12 },
  noticeText: { flex: 1, color: "#6B4A00", fontFamily: "Inter_600SemiBold", fontSize: 12, lineHeight: 16 },
  helperBox: { minHeight: 56, borderRadius: 13, backgroundColor: "#FFFFFF", borderWidth: 1, borderColor: line, flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 14, marginTop: 22 },
  helperText: { flex: 1, color: ink, fontFamily: "Inter_600SemiBold", fontSize: 12, lineHeight: 17 },
  legal: { color: "#8B929D", fontFamily: "Inter_500Medium", fontSize: 10, lineHeight: 14, textAlign: "center" },
});
