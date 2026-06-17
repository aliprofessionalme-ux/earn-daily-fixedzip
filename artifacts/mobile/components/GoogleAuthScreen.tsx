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
  const float = useRef(new Animated.Value(0)).current;
  const rope = useRef(new Animated.Value(0)).current;

  const webClientId = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID;
  const androidClientId = process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID;
  const missingNativeClient = Platform.OS !== "web" && !androidClientId;

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
      return;
    }
    const idToken = (response.params as Record<string, string | undefined>).id_token;
    if (!idToken) {
      setBusy(false);
      return;
    }
    setBusy(true);
    signInWithGoogleToken(idToken).finally(() => setBusy(false));
  }, [response, signInWithGoogleToken]);

  const coinTranslate = float.interpolate({ inputRange: [0, 1], outputRange: [0, -14] });
  const ropeTranslate = rope.interpolate({ inputRange: [0, 1], outputRange: [-6, 8] });
  const glowOpacity = float.interpolate({ inputRange: [0, 1], outputRange: [0.18, 0.42] });

  const buttonLabel = useMemo(() => {
    if (busy) return "Securing account...";
    if (missingNativeClient) return "Google Client ID Missing";
    return Platform.OS === "web" ? "Continue with Google" : "Continue with Google";
  }, [busy, missingNativeClient]);

  const handleGoogle = async () => {
    if (missingNativeClient || busy) return;
    setBusy(true);
    try {
      if (Platform.OS === "web") {
        await signInWithGoogle();
      } else {
        await promptAsync();
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={[styles.root, { paddingTop: insets.top + 18, paddingBottom: insets.bottom + 22 }]}> 
      <LinearGradient colors={[ink, "#101114", "#171100"]} style={StyleSheet.absoluteFillObject} />
      <View style={styles.goldGlow} />
      <View style={styles.deepGlow} />

      <View style={styles.topBar}>
        <OfficialWalletLogo size={44} />
        <View style={{ flex: 1 }}>
          <Text style={styles.brand}>Earn Daily</Text>
          <Text style={styles.brandSub}>Secure earning account</Text>
        </View>
        <View style={styles.lockBadge}>
          <Feather name="lock" size={15} color={gold} />
        </View>
      </View>

      <View style={styles.stage}>
        <Animated.View style={[styles.stageGlow, { opacity: glowOpacity }]} />
        <Animated.View style={[styles.rope, { transform: [{ translateY: ropeTranslate }] }]} />
        <Animated.View style={[styles.coin, styles.coinOne, { transform: [{ translateY: coinTranslate }] }]}>
          <Text style={styles.coinText}>$</Text>
        </Animated.View>
        <Animated.View style={[styles.coin, styles.coinTwo, { transform: [{ translateY: ropeTranslate }] }]}>
          <Text style={styles.coinText}>PKR</Text>
        </Animated.View>
        <View style={styles.wallet}>
          <LinearGradient colors={["#2A2A2C", "#0B0B0D"]} style={StyleSheet.absoluteFillObject} />
          <View style={styles.walletLine} />
          <Text style={styles.walletText}>Verified Wallet</Text>
        </View>
      </View>

      <View style={styles.copyBlock}>
        <Text style={styles.kicker}>GOOGLE PROTECTED</Text>
        <Text style={styles.title}>Your rewards now follow you.</Text>
        <Text style={styles.subtitle}>Sign in once and keep your coins, energy, referrals and withdrawals protected on every device.</Text>
      </View>

      <View style={styles.securityRow}>
        <View style={styles.securityCard}>
          <Feather name="shield" size={17} color={colors.green} />
          <Text style={styles.securityText}>Fraud checked</Text>
        </View>
        <View style={styles.securityCard}>
          <Feather name="credit-card" size={17} color={gold} />
          <Text style={styles.securityText}>Wallet secured</Text>
        </View>
      </View>

      <Pressable
        disabled={busy || missingNativeClient || (Platform.OS !== "web" && !request)}
        onPress={handleGoogle}
        style={({ pressed }) => [styles.googleButton, { opacity: pressed ? 0.88 : busy || missingNativeClient ? 0.58 : 1 }]}
      >
        <LinearGradient colors={["#FFF7D6", gold, "#F59E0B"]} style={styles.googleGradient}>
          {busy ? <ActivityIndicator color="#140A00" /> : <Feather name="user-check" size={20} color="#140A00" />}
          <Text style={styles.googleText}>{buttonLabel}</Text>
        </LinearGradient>
      </Pressable>

      {missingNativeClient ? (
        <Text style={styles.errorText}>Add EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID in Replit/EAS secrets for Android sign-in.</Text>
      ) : error ? (
        <Text style={styles.errorText}>{error}</Text>
      ) : (
        <Text style={styles.footerText}>No password. No anonymous account. Just your verified Google identity.</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, paddingHorizontal: 20, justifyContent: "space-between", backgroundColor: ink },
  goldGlow: { position: "absolute", width: 320, height: 320, borderRadius: 320, backgroundColor: "rgba(242,201,76,0.16)", top: 68, right: -160 },
  deepGlow: { position: "absolute", width: 360, height: 360, borderRadius: 360, backgroundColor: "rgba(255,255,255,0.045)", bottom: -130, left: -140 },
  topBar: { flexDirection: "row", alignItems: "center", gap: 12 },
  brand: { color: text, fontFamily: "Inter_800ExtraBold", fontSize: 18, lineHeight: 22 },
  brandSub: { color: muted, fontFamily: "Inter_500Medium", fontSize: 12, lineHeight: 16, marginTop: 1 },
  lockBadge: { width: 38, height: 38, borderRadius: 14, borderWidth: 1, borderColor: "rgba(242,201,76,0.4)", backgroundColor: "rgba(242,201,76,0.1)", alignItems: "center", justifyContent: "center" },
  stage: { minHeight: 250, alignItems: "center", justifyContent: "center" },
  stageGlow: { position: "absolute", width: 210, height: 210, borderRadius: 210, backgroundColor: gold },
  rope: { position: "absolute", top: 22, width: 3, height: 118, borderRadius: 999, backgroundColor: "rgba(242,201,76,0.65)" },
  coin: { position: "absolute", width: 78, height: 78, borderRadius: 78, borderWidth: 3, borderColor: "#FFEAA0", backgroundColor: gold, alignItems: "center", justifyContent: "center", shadowColor: gold, shadowOpacity: 0.35, shadowRadius: 16, shadowOffset: { width: 0, height: 8 } },
  coinOne: { top: 50, left: "31%" },
  coinTwo: { top: 90, right: "27%", width: 68, height: 68, borderRadius: 68 },
  coinText: { color: "#3B2200", fontFamily: "Inter_800ExtraBold", fontSize: 19, lineHeight: 22 },
  wallet: { width: 214, height: 118, borderRadius: 30, overflow: "hidden", borderWidth: 1, borderColor: "rgba(242,201,76,0.58)", alignItems: "center", justifyContent: "flex-end", paddingBottom: 22, marginTop: 96 },
  walletLine: { position: "absolute", top: 28, left: 28, right: 28, height: 2, borderRadius: 999, backgroundColor: "rgba(242,201,76,0.55)" },
  walletText: { color: text, fontFamily: "Inter_700Bold", fontSize: 15, lineHeight: 18 },
  copyBlock: { alignItems: "center" },
  kicker: { color: gold, fontFamily: "Inter_800ExtraBold", fontSize: 11, lineHeight: 14, letterSpacing: 0 },
  title: { color: text, fontFamily: "Inter_800ExtraBold", fontSize: 35, lineHeight: 39, textAlign: "center", marginTop: 8 },
  subtitle: { color: muted, fontFamily: "Inter_500Medium", fontSize: 14, lineHeight: 21, textAlign: "center", marginTop: 10, maxWidth: 330 },
  securityRow: { flexDirection: "row", gap: 10 },
  securityCard: { flex: 1, minHeight: 54, borderWidth: 1, borderColor: "rgba(255,255,255,0.10)", borderRadius: 16, backgroundColor: "rgba(255,255,255,0.055)", flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 },
  securityText: { color: text, fontFamily: "Inter_700Bold", fontSize: 12, lineHeight: 15 },
  googleButton: { borderRadius: 18, overflow: "hidden", shadowColor: gold, shadowOpacity: 0.3, shadowRadius: 18, shadowOffset: { width: 0, height: 10 } },
  googleGradient: { minHeight: 56, borderRadius: 18, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10, paddingHorizontal: 16 },
  googleText: { color: "#140A00", fontFamily: "Inter_800ExtraBold", fontSize: 15, lineHeight: 19 },
  errorText: { color: "#FCA5A5", fontFamily: "Inter_600SemiBold", fontSize: 12, lineHeight: 17, textAlign: "center" },
  footerText: { color: muted, fontFamily: "Inter_500Medium", fontSize: 12, lineHeight: 17, textAlign: "center" },
});
