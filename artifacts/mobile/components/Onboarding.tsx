import { Feather } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import React, { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { OfficialWalletLogo } from "@/components/OfficialWalletLogo";
import { ReferralCodeScanner } from "@/components/ReferralCodeScanner";
import { useUser } from "@/contexts/UserContext";
import { useColors } from "@/hooks/useColors";
import { applyReferralCode } from "@/services/api";
import { normalizeReferralCode } from "@/utils/referralCode";

const steps = [
  { icon: "star" as const, title: "Earn safely", body: "Check-in, Spin and Scratch earn Energy. Earning tasks add Pending Coins after provider verification." },
  { icon: "repeat" as const, title: "Confirm rewards", body: "Pending Coins become Confirmed Coins after hold, verification, or admin approval." },
  { icon: "credit-card" as const, title: "Withdraw safely", body: "Withdrawals use Confirmed Coins only and follow the backend minimum and conversion rate." },
  { icon: "shield" as const, title: "Fair play", body: "No VPN/proxy, bots, fake activity or multiple accounts. Suspicious activity can block rewards and withdrawals." },
];

export function Onboarding({ onDone }: { onDone: () => void | Promise<void> }) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { deviceId, user, updateProfile, refreshUser } = useUser();
  const [displayName, setDisplayName] = useState(user?.displayName ?? "");
  const [phone, setPhone] = useState(user?.phone ?? "");
  const [referralCode, setReferralCode] = useState(user?.referredByCode ?? "");
  const [scannerOpen, setScannerOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<{ text: string; ok: boolean } | null>(null);

  useEffect(() => {
    if (user?.displayName) setDisplayName(user.displayName);
  }, [user?.displayName]);

  useEffect(() => {
    setPhone(user?.phone ?? "");
  }, [user?.phone]);

  const cleanName = useMemo(() => displayName.trim().replace(/\s+/g, " "), [displayName]);
  const cleanPhone = useMemo(() => phone.trim().replace(/\s+/g, " "), [phone]);
  const cleanReferralCode = useMemo(() => normalizeReferralCode(referralCode), [referralCode]);
  const canContinue = cleanName.length >= 2 && !saving;

  const handleScannedCode = (code: string) => {
    setReferralCode(code);
    setNotice({ text: "Referral QR scanned. Save profile to apply it.", ok: true });
  };

  const submit = async () => {
    if (!deviceId) {
      setNotice({ text: "Account is still loading. Please try again.", ok: false });
      return;
    }
    if (cleanName.length < 2) {
      setNotice({ text: "Username is required. Enter at least 2 characters.", ok: false });
      return;
    }

    setSaving(true);
    setNotice(null);
    try {
      await updateProfile(cleanName, cleanPhone || null);

      if (cleanReferralCode && !user?.referredByDeviceId) {
        const result = await applyReferralCode(deviceId, cleanReferralCode);
        setNotice({ text: result.message, ok: true });
      }

      await refreshUser();
      await onDone();
    } catch (err) {
      setNotice({ text: err instanceof Error ? err.message : "Unable to save profile.", ok: false });
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}> 
      <LinearGradient colors={["#050607", "#111318", "#181205"]} style={StyleSheet.absoluteFillObject} />
      <ScrollView contentContainerStyle={{ paddingTop: insets.top + 24, paddingBottom: insets.bottom + 28, paddingHorizontal: 20 }} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        <View style={[styles.hero, { borderColor: colors.gold + "44" }]}> 
          <View style={[styles.heroBadge, { backgroundColor: colors.gold + "18", borderColor: colors.gold + "55" }]}> 
            <Feather name="shield" size={13} color={colors.gold} />
            <Text style={[styles.heroBadgeText, { color: colors.gold }]}>SECURE ACCOUNT SETUP</Text>
          </View>
          <OfficialWalletLogo size={76} />
          <Text style={[styles.title, { color: colors.foreground }]}>Create your Earn Daily profile</Text>
          <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>Set your public name now. Phone and referral details can be updated from Profile later.</Text>
        </View>

        <View style={[styles.setupCard, { backgroundColor: colors.card, borderColor: colors.border }]}> 
          <Text style={[styles.inputLabel, { color: colors.foreground }]}>Username *</Text>
          <TextInput
            value={displayName}
            onChangeText={setDisplayName}
            placeholder="Enter your public name"
            placeholderTextColor={colors.mutedForeground}
            maxLength={40}
            style={[styles.input, { backgroundColor: colors.background, borderColor: colors.border, color: colors.foreground }]}
          />

          <Text style={[styles.inputLabel, { color: colors.foreground }]}>Phone number</Text>
          <TextInput
            value={phone}
            onChangeText={setPhone}
            keyboardType="phone-pad"
            placeholder="Optional - add now or later"
            placeholderTextColor={colors.mutedForeground}
            maxLength={30}
            style={[styles.input, { backgroundColor: colors.background, borderColor: colors.border, color: colors.foreground }]}
          />

          <Text style={[styles.inputLabel, { color: colors.foreground }]}>Referral code</Text>
          <View style={styles.referralRow}>
            <TextInput
              value={referralCode}
              onChangeText={(value) => setReferralCode(value.toUpperCase())}
              autoCapitalize="characters"
              placeholder="Paste referral code"
              placeholderTextColor={colors.mutedForeground}
              style={[styles.referralInput, { backgroundColor: colors.background, borderColor: colors.border, color: colors.foreground }]}
            />
            <Pressable onPress={() => setScannerOpen(true)} style={[styles.scanBtn, { backgroundColor: colors.gold + "18", borderColor: colors.gold + "66" }]}> 
              <Feather name="camera" size={18} color={colors.gold} />
              <Text style={[styles.scanText, { color: colors.gold }]}>Scan</Text>
            </Pressable>
          </View>

          {notice ? <Text style={[styles.notice, { color: notice.ok ? colors.green : colors.destructive }]}>{notice.text}</Text> : null}

          <Pressable disabled={!canContinue} onPress={() => void submit()} style={({ pressed }) => [{ opacity: !canContinue ? 0.55 : pressed ? 0.88 : 1, transform: [{ scale: pressed && canContinue ? 0.99 : 1 }] }]}> 
            <LinearGradient colors={[colors.goldLight, colors.gold, colors.orange]} style={styles.button}>
              {saving ? <ActivityIndicator color="#120900" /> : <Text style={styles.buttonText}>Save Profile - Start Earning</Text>}
              {!saving ? <Feather name="arrow-right" size={18} color="#120900" /> : null}
            </LinearGradient>
          </Pressable>
        </View>

        <View style={styles.list}>
          {steps.map((step) => (
            <View key={step.title} style={[styles.step, { backgroundColor: colors.card, borderColor: colors.border }]}> 
              <View style={[styles.iconBox, { backgroundColor: colors.gold + "18" }]}> 
                <Feather name={step.icon} size={20} color={colors.gold} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.stepTitle, { color: colors.foreground }]}>{step.title}</Text>
                <Text style={[styles.stepBody, { color: colors.mutedForeground }]}>{step.body}</Text>
              </View>
            </View>
          ))}
        </View>
      </ScrollView>

      <ReferralCodeScanner visible={scannerOpen} onClose={() => setScannerOpen(false)} onCode={handleScannedCode} title="Scan referral QR" />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  hero: { borderWidth: 1, borderRadius: 22, padding: 18, alignItems: "center", backgroundColor: "rgba(255,255,255,0.055)", marginBottom: 14 },
  heroBadge: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6, flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 12 },
  heroBadgeText: { fontFamily: "Inter_700Bold", fontSize: 10, lineHeight: 12, letterSpacing: 0 },
  title: { fontFamily: "Inter_700Bold", fontSize: 24, lineHeight: 30, textAlign: "center", marginTop: 10 },
  subtitle: { fontFamily: "Inter_400Regular", fontSize: 13, lineHeight: 18, textAlign: "center", marginTop: 6 },
  setupCard: { borderWidth: 1, borderRadius: 18, padding: 14, gap: 8, marginBottom: 14 },
  inputLabel: { fontFamily: "Inter_700Bold", fontSize: 12, lineHeight: 16, marginTop: 2 },
  input: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: Platform.OS === "web" ? 12 : 11, fontFamily: "Inter_600SemiBold", fontSize: 14, lineHeight: 18 },
  referralRow: { flexDirection: "row", gap: 8, alignItems: "center" },
  referralInput: { flex: 1, minWidth: 0, borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: Platform.OS === "web" ? 12 : 11, fontFamily: "Inter_600SemiBold", fontSize: 14, lineHeight: 18 },
  scanBtn: { minHeight: 44, borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6 },
  scanText: { fontFamily: "Inter_700Bold", fontSize: 12, lineHeight: 16 },
  notice: { fontFamily: "Inter_600SemiBold", fontSize: 12, lineHeight: 16, textAlign: "center", marginTop: 2 },
  button: { minHeight: 46, borderRadius: 14, padding: 14, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 8, marginTop: 2 },
  buttonText: { fontFamily: "Inter_700Bold", fontSize: 14, lineHeight: 18, color: "#120900" },
  list: { gap: 10 },
  step: { flexDirection: "row", gap: 12, borderWidth: 1, borderRadius: 16, padding: 14 },
  iconBox: { width: 38, height: 38, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  stepTitle: { fontFamily: "Inter_700Bold", fontSize: 14, lineHeight: 18, marginBottom: 3 },
  stepBody: { fontFamily: "Inter_400Regular", fontSize: 12, lineHeight: 17 },
});
