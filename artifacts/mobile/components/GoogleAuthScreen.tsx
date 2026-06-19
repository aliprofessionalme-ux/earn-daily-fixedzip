import { Feather } from "@expo/vector-icons";
import * as Google from "expo-auth-session/providers/google";
import * as WebBrowser from "expo-web-browser";
import { LinearGradient } from "expo-linear-gradient";
import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { OfficialWalletLogo } from "@/components/OfficialWalletLogo";
import { useUser } from "@/contexts/UserContext";

WebBrowser.maybeCompleteAuthSession();

type AuthMode = "signIn" | "signUp";
type BusyAction = "email" | "google" | null;

const bg = "#050607";
const card = "#111318";
const cardSoft = "#17140D";
const line = "#3A3324";
const text = "#FFF9EA";
const muted = "#B8B0A0";
const gold = "#F2C94C";

function getFriendlyAuthMessage(message?: string | null) {
  const raw = String(message ?? "");
  const lower = raw.toLowerCase();
  if (!raw) return null;
  if (lower.includes("email-already-in-use")) return "This email already has an account. Use Sign in.";
  if (lower.includes("invalid-email")) return "Enter a valid email address.";
  if (lower.includes("invalid-credential") || lower.includes("wrong-password") || lower.includes("user-not-found")) {
    return "Email or password is incorrect.";
  }
  if (lower.includes("weak-password")) return "Password must be at least 6 characters.";
  if (lower.includes("operation-not-allowed")) return "Enable Email/Password sign-in in Firebase Authentication.";
  if (lower.includes("unauthorized-domain")) return "Google setup needs one Firebase authorized domain.";
  if (lower.includes("failed to fetch") || lower.includes("network request failed")) return "Server connection failed. Check backend API URL.";
  if (lower.includes("popup-closed") || lower.includes("cancel")) return "Google sign-in was cancelled. Try again.";
  if (lower.includes("popup")) return "Allow popups for this preview, then try again.";
  return raw.replace(/^Firebase:\s*/i, "").replace(/\s*\(auth\/[^)]+\)\.?$/i, ".");
}

export function GoogleAuthScreen() {
  const insets = useSafeAreaInsets();
  const { signInWithEmail, signInWithGoogle, signInWithGoogleToken, signUpWithEmail, error } = useUser();
  const [mode, setMode] = useState<AuthMode>("signIn");
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busyAction, setBusyAction] = useState<BusyAction>(null);
  const [localError, setLocalError] = useState<string | null>(null);

  const webClientId = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID;
  const androidClientId = process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID;
  const missingGoogleConfig = Platform.OS === "web" ? !webClientId : !androidClientId;

  const [request, response, promptAsync] = Google.useIdTokenAuthRequest({
    webClientId,
    androidClientId,
  });

  useEffect(() => {
    if (!response) return;
    if (response.type !== "success") {
      setBusyAction(null);
      if (response.type !== "dismiss") setLocalError("Google sign-in was cancelled. Try again.");
      return;
    }
    const idToken = (response.params as Record<string, string | undefined>).id_token;
    if (!idToken) {
      setBusyAction(null);
      setLocalError("Google did not return a valid account token.");
      return;
    }
    setBusyAction("google");
    signInWithGoogleToken(idToken)
      .then(() => setLocalError(null))
      .catch((authError) => setLocalError(authError instanceof Error ? authError.message : String(authError)))
      .finally(() => setBusyAction(null));
  }, [response, signInWithGoogleToken]);

  const heading = mode === "signIn" ? "Welcome back" : "Create your account";
  const subheading = mode === "signIn"
    ? "Sign in to continue earning securely."
    : "Create your Earn Daily wallet account.";

  const friendlyError = missingGoogleConfig && busyAction === "google"
    ? Platform.OS === "web"
      ? "Google web client ID is missing."
      : "Google Android client ID is missing."
    : getFriendlyAuthMessage(localError ?? error);

  const emailButtonLabel = useMemo(() => {
    if (busyAction === "email") return mode === "signIn" ? "Signing in" : "Creating account";
    return mode === "signIn" ? "Sign in" : "Sign up";
  }, [busyAction, mode]);

  const switchMode = (nextMode: AuthMode) => {
    setMode(nextMode);
    setLocalError(null);
  };

  const handleEmailAuth = async () => {
    if (busyAction) return;
    const cleanName = displayName.trim();
    const cleanEmail = email.trim();
    if (mode === "signUp" && cleanName.length < 2) {
      setLocalError("Enter your full name.");
      return;
    }
    if (!cleanEmail.includes("@")) {
      setLocalError("Enter a valid email address.");
      return;
    }
    if (password.length < 6) {
      setLocalError("Password must be at least 6 characters.");
      return;
    }

    setBusyAction("email");
    setLocalError(null);
    try {
      if (mode === "signIn") await signInWithEmail(cleanEmail, password);
      else await signUpWithEmail(cleanName, cleanEmail, password);
    } catch (authError) {
      setLocalError(authError instanceof Error ? authError.message : String(authError));
    } finally {
      setBusyAction(null);
    }
  };

  const handleGoogle = async () => {
    if (busyAction || missingGoogleConfig) return;
    setBusyAction("google");
    setLocalError(null);
    try {
      if (Platform.OS === "web") await signInWithGoogle();
      else if (request) await promptAsync();
      else setLocalError("Google sign-in is still preparing. Try again.");
    } catch (authError) {
      setLocalError(authError instanceof Error ? authError.message : String(authError));
    } finally {
      setBusyAction(null);
    }
  };

  return (
    <View style={[styles.root, { paddingTop: insets.top + 18, paddingBottom: insets.bottom + 16 }]}>
      <LinearGradient colors={[bg, "#0A0B0D", "#050607"]} style={StyleSheet.absoluteFillObject} />
      <View style={styles.glowGold} />

      <View style={styles.topBar}>
        <View style={styles.brandMini}>
          <OfficialWalletLogo size={30} />
        </View>
        <Text style={styles.topTitle}>Earn Daily</Text>
        <View style={styles.secureBadge}>
          <Feather name="lock" size={15} color={gold} />
        </View>
      </View>

      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.keyboard}>
        <ScrollView contentContainerStyle={styles.scrollBody} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <Text style={styles.title}>{heading}</Text>
          <Text style={styles.subtitle}>{subheading}</Text>

          <View style={styles.segment}>
            <Pressable onPress={() => switchMode("signIn")} style={[styles.segmentButton, mode === "signIn" && styles.segmentActive]}>
              <Text style={[styles.segmentText, mode === "signIn" && styles.segmentTextActive]}>Sign in</Text>
            </Pressable>
            <Pressable onPress={() => switchMode("signUp")} style={[styles.segmentButton, mode === "signUp" && styles.segmentActive]}>
              <Text style={[styles.segmentText, mode === "signUp" && styles.segmentTextActive]}>Sign up</Text>
            </Pressable>
          </View>

          <View style={styles.form}>
            {mode === "signUp" ? (
              <View style={styles.fieldGroup}>
                <Text style={styles.label}>Full name</Text>
                <View style={styles.inputWrap}>
                  <Feather name="user" size={16} color={muted} />
                  <TextInput
                    value={displayName}
                    onChangeText={setDisplayName}
                    placeholder="Muhammad Ali"
                    placeholderTextColor="#756D5C"
                    style={styles.input}
                    autoCapitalize="words"
                  />
                </View>
              </View>
            ) : null}

            <View style={styles.fieldGroup}>
              <Text style={styles.label}>Email</Text>
              <View style={styles.inputWrap}>
                <Feather name="mail" size={16} color={muted} />
                <TextInput
                  value={email}
                  onChangeText={setEmail}
                  placeholder="you@example.com"
                  placeholderTextColor="#756D5C"
                  style={styles.input}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                />
              </View>
            </View>

            <View style={styles.fieldGroup}>
              <Text style={styles.label}>Password</Text>
              <View style={styles.inputWrap}>
                <Feather name="key" size={16} color={muted} />
                <TextInput
                  value={password}
                  onChangeText={setPassword}
                  placeholder="Minimum 6 characters"
                  placeholderTextColor="#756D5C"
                  style={styles.input}
                  secureTextEntry
                />
              </View>
            </View>

            <Pressable
              disabled={Boolean(busyAction)}
              onPress={handleEmailAuth}
              style={({ pressed }) => [styles.primaryButton, { opacity: pressed ? 0.9 : busyAction ? 0.62 : 1 }]}
            >
              {busyAction === "email" ? <ActivityIndicator color="#100B02" /> : <Feather name="arrow-right" size={17} color="#100B02" />}
              <Text style={styles.primaryText}>{emailButtonLabel}</Text>
            </Pressable>

            <View style={styles.dividerRow}>
              <View style={styles.divider} />
              <Text style={styles.dividerText}>or</Text>
              <View style={styles.divider} />
            </View>

            <Pressable
              disabled={Boolean(busyAction) || missingGoogleConfig || (Platform.OS !== "web" && !request)}
              onPress={handleGoogle}
              style={({ pressed }) => [styles.googleButton, { opacity: pressed ? 0.9 : busyAction || missingGoogleConfig ? 0.58 : 1 }]}
            >
              {busyAction === "google" ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <View style={styles.googleMark}>
                  <Text style={styles.googleText}>G</Text>
                </View>
              )}
              <Text style={styles.googleButtonText}>Continue with Google</Text>
            </Pressable>

            {friendlyError ? (
              <View style={styles.notice}>
                <Feather name="info" size={14} color={gold} />
                <Text style={styles.noticeText}>{friendlyError}</Text>
              </View>
            ) : null}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: bg, paddingHorizontal: 22 },
  glowGold: { position: "absolute", width: 260, height: 260, borderRadius: 260, backgroundColor: "rgba(242,201,76,0.12)", top: 86, right: -100 },
  topBar: { minHeight: 48, flexDirection: "row", alignItems: "center" },
  brandMini: { width: 38, height: 38, borderRadius: 8, backgroundColor: card, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: line },
  topTitle: { flex: 1, color: text, fontFamily: "Inter_800ExtraBold", fontSize: 15, lineHeight: 19, marginLeft: 10 },
  secureBadge: { width: 36, height: 36, borderRadius: 8, borderWidth: 1, borderColor: line, backgroundColor: card, alignItems: "center", justifyContent: "center" },
  keyboard: { flex: 1 },
  scrollBody: { flexGrow: 1, justifyContent: "center", paddingBottom: 18 },
  title: { color: text, fontFamily: "Inter_800ExtraBold", fontSize: 31, lineHeight: 37, textAlign: "center" },
  subtitle: { color: muted, fontFamily: "Inter_500Medium", fontSize: 14, lineHeight: 21, textAlign: "center", marginTop: 10 },
  segment: { flexDirection: "row", backgroundColor: "rgba(255,255,255,0.055)", borderWidth: 1, borderColor: line, borderRadius: 8, padding: 4, marginTop: 26 },
  segmentButton: { flex: 1, minHeight: 42, borderRadius: 6, alignItems: "center", justifyContent: "center" },
  segmentActive: { backgroundColor: gold },
  segmentText: { color: muted, fontFamily: "Inter_800ExtraBold", fontSize: 13, lineHeight: 17 },
  segmentTextActive: { color: "#100B02" },
  form: { marginTop: 18 },
  fieldGroup: { marginTop: 12 },
  label: { color: text, fontFamily: "Inter_700Bold", fontSize: 13, lineHeight: 17, marginBottom: 8 },
  inputWrap: { minHeight: 52, borderRadius: 8, backgroundColor: card, borderWidth: 1, borderColor: line, flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 14 },
  input: { flex: 1, minHeight: 48, color: text, fontFamily: "Inter_600SemiBold", fontSize: 14, lineHeight: 18, paddingVertical: 0 },
  primaryButton: { minHeight: 54, borderRadius: 8, backgroundColor: gold, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10, marginTop: 16, paddingHorizontal: 16 },
  primaryText: { color: "#100B02", fontFamily: "Inter_800ExtraBold", fontSize: 15, lineHeight: 19 },
  dividerRow: { flexDirection: "row", alignItems: "center", gap: 10, marginVertical: 16 },
  divider: { flex: 1, height: 1, backgroundColor: line },
  dividerText: { color: muted, fontFamily: "Inter_600SemiBold", fontSize: 12, lineHeight: 16 },
  googleButton: { minHeight: 52, borderRadius: 8, backgroundColor: cardSoft, borderWidth: 1, borderColor: line, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 11, paddingHorizontal: 16 },
  googleMark: { width: 26, height: 26, borderRadius: 6, backgroundColor: "#FFFFFF", alignItems: "center", justifyContent: "center" },
  googleText: { color: "#4285F4", fontFamily: "Inter_800ExtraBold", fontSize: 17, lineHeight: 21 },
  googleButtonText: { color: text, fontFamily: "Inter_800ExtraBold", fontSize: 14, lineHeight: 18 },
  notice: { minHeight: 42, borderRadius: 8, borderWidth: 1, borderColor: "rgba(242,201,76,0.34)", backgroundColor: "rgba(242,201,76,0.12)", flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 12, marginTop: 12 },
  noticeText: { flex: 1, color: text, fontFamily: "Inter_600SemiBold", fontSize: 12, lineHeight: 16 },
});
