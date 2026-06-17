import { Feather } from "@expo/vector-icons";
import { router } from "expo-router";
import React, { useState } from "react";
import { ActivityIndicator, Linking, Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { OFFICIAL_WHATSAPP_CHANNEL_URL } from "@/constants/brand";
import { themeOptions, useTheme, type ThemeKey } from "@/contexts/ThemeContext";
import { useUser } from "@/contexts/UserContext";
import { useColors } from "@/hooks/useColors";
import { SectionTitle } from "@/components/SectionTitle";

function truncate(value?: string | null) {
  if (!value) return "-";
  return value.length > 22 ? `${value.slice(0, 10)}...${value.slice(-8)}` : value;
}

function InfoRow({ label, value }: { label: string; value: string }) {
  const colors = useColors();
  return (
    <View style={styles.infoRow}>
      <Text style={[styles.infoLabel, { color: colors.mutedForeground }]}>{label}</Text>
      <Text style={[styles.infoValue, { color: colors.foreground }]} numberOfLines={1}>{value}</Text>
    </View>
  );
}

function ToolRow({ icon, title, subtitle, onPress }: { icon: React.ComponentProps<typeof Feather>["name"]; title: string; subtitle: string; onPress: () => void }) {
  const colors = useColors();
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.toolRow, { backgroundColor: colors.card, borderColor: colors.border, opacity: pressed ? 0.86 : 1 }]}> 
      <View style={[styles.toolIcon, { backgroundColor: colors.gold + "18" }]}> 
        <Feather name={icon} size={18} color={colors.gold} />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={[styles.toolTitle, { color: colors.foreground }]} numberOfLines={1}>{title}</Text>
        <Text style={[styles.toolSubtitle, { color: colors.mutedForeground }]} numberOfLines={2}>{subtitle}</Text>
      </View>
      <Feather name="chevron-right" size={18} color={colors.mutedForeground} />
    </Pressable>
  );
}

export default function SettingsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { themeKey, setThemeKey } = useTheme();
  const { user, deviceId, installId, firebaseUid, authMode, googleEmail, googleDisplayName, logout } = useUser();
  const [savingTheme, setSavingTheme] = useState<ThemeKey | null>(null);
  const [signingOut, setSigningOut] = useState(false);
  const topPad = Platform.OS === "web" ? 20 : insets.top;

  const chooseTheme = async (nextThemeKey: ThemeKey) => {
    if (savingTheme || nextThemeKey === themeKey) return;
    setSavingTheme(nextThemeKey);
    try {
      await setThemeKey(nextThemeKey);
    } finally {
      setSavingTheme(null);
    }
  };

  const openWhatsAppChannel = () => {
    void Linking.openURL(OFFICIAL_WHATSAPP_CHANNEL_URL);
  };

  const signOut = async () => {
    if (signingOut) return;
    setSigningOut(true);
    try {
      await logout();
    } finally {
      setSigningOut(false);
    }
  };

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}> 
      <ScrollView contentContainerStyle={{ paddingTop: topPad + 12, paddingBottom: Platform.OS === "web" ? 34 : 112, paddingHorizontal: 16 }} showsVerticalScrollIndicator={false}>
        <View style={styles.headerRow}>
          <Pressable onPress={() => router.back()} style={({ pressed }) => [styles.iconButton, { backgroundColor: colors.card, borderColor: colors.border, opacity: pressed ? 0.72 : 1 }]}> 
            <Feather name="arrow-left" size={19} color={colors.foreground} />
          </Pressable>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={[styles.title, { color: colors.foreground }]}>Settings</Text>
            <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>Theme, support and account info</Text>
          </View>
        </View>

        <View style={styles.section}>
          <SectionTitle title="Appearance" />
          <View style={styles.themeGrid}>
            {themeOptions.map((option) => {
              const active = option.key === themeKey;
              return (
                <Pressable
                  key={option.key}
                  disabled={savingTheme !== null}
                  onPress={() => void chooseTheme(option.key)}
                  style={({ pressed }) => [
                    styles.themeOption,
                    {
                      backgroundColor: colors.card,
                      borderColor: active ? colors.primary : colors.border,
                      opacity: pressed ? 0.86 : savingTheme && savingTheme !== option.key ? 0.62 : 1,
                    },
                  ]}
                >
                  <View style={styles.themeTop}>
                    <View style={styles.themeSwatches}>
                      {option.swatches.map((swatch) => <View key={swatch} style={[styles.themeSwatch, { backgroundColor: swatch }]} />)}
                    </View>
                    {savingTheme === option.key ? <ActivityIndicator size="small" color={colors.primary} /> : active ? <Feather name="check-circle" size={17} color={colors.primary} /> : null}
                  </View>
                  <Text style={[styles.themeTitle, { color: active ? colors.primary : colors.foreground }]} numberOfLines={1}>{option.label}</Text>
                  <Text style={[styles.themeText, { color: colors.mutedForeground }]} numberOfLines={2}>{option.description}</Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        <View style={styles.section}>
          <SectionTitle title="App tools" />
          <View style={styles.toolsList}>
            <ToolRow icon="bell" title="Notifications" subtitle="Withdrawals, rewards and support replies" onPress={() => router.push("/notifications")} />
            <ToolRow icon="list" title="Transactions" subtitle="Balance changes and reward history" onPress={() => router.push("/transactions")} />
            <ToolRow icon="message-circle" title="Support" subtitle="Send a ticket and view admin replies" onPress={() => router.push("/support")} />
            <ToolRow icon="send" title="Official WhatsApp Channel" subtitle="Earn Daily official updates" onPress={openWhatsAppChannel} />
          </View>
        </View>

        <View style={styles.section}>
          <SectionTitle title="Help & rules" />
          <View style={styles.toolsList}>
            <ToolRow icon="help-circle" title="How it works" subtitle="Rewards, verification and payout timing" onPress={() => router.push("/how-it-works")} />
            <ToolRow icon="file-text" title="Terms & Conditions" subtitle="Fair play, VPN, fraud and withdrawal rules" onPress={() => router.push("/terms")} />
          </View>
        </View>

        <View style={styles.section}>
          <SectionTitle title="Private account info" />
          <View style={[styles.infoCard, { backgroundColor: colors.card, borderColor: colors.border }]}> 
            <InfoRow label="Google account" value={googleEmail ?? "Not connected"} />
            <InfoRow label="Google name" value={googleDisplayName ?? user?.displayName ?? "-"} />
            <InfoRow label="Referral code" value={user?.referralCode ?? "Open Referral to create"} />
            <InfoRow label="Device ID" value={truncate(deviceId)} />
            <InfoRow label="Install ID" value={truncate(installId)} />
            <InfoRow label="Firebase UID" value={truncate(firebaseUid ?? user?.firebaseUid)} />
            <InfoRow label="Auth mode" value={authMode} />
          </View>
          <Pressable
            disabled={signingOut}
            onPress={signOut}
            style={({ pressed }) => [
              styles.signOutButton,
              { borderColor: colors.destructive + "66", backgroundColor: colors.destructive + "14", opacity: pressed || signingOut ? 0.74 : 1 },
            ]}
          >
            {signingOut ? <ActivityIndicator size="small" color={colors.destructive} /> : <Feather name="log-out" size={16} color={colors.destructive} />}
            <Text style={[styles.signOutText, { color: colors.destructive }]}>Sign out of Google</Text>
          </Pressable>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  headerRow: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 16 },
  iconButton: { width: 38, height: 38, borderRadius: 999, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  title: { fontFamily: "Inter_800ExtraBold", fontSize: 25, lineHeight: 31 },
  subtitle: { fontFamily: "Inter_400Regular", fontSize: 12, lineHeight: 16, marginTop: 2 },
  section: { marginBottom: 14 },
  toolsList: { gap: 8 },
  toolRow: { borderWidth: 1, borderRadius: 14, padding: 12, flexDirection: "row", alignItems: "center", gap: 10 },
  toolIcon: { width: 36, height: 36, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  toolTitle: { fontFamily: "Inter_700Bold", fontSize: 14, lineHeight: 18 },
  toolSubtitle: { fontFamily: "Inter_400Regular", fontSize: 11, lineHeight: 16, marginTop: 1 },
  themeGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  themeOption: { width: "48.6%", minHeight: 118, borderWidth: 1, borderRadius: 16, padding: 12, gap: 8 },
  themeTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  themeSwatches: { flexDirection: "row", alignItems: "center" },
  themeSwatch: { width: 22, height: 22, borderRadius: 999, borderWidth: 1, borderColor: "rgba(255,255,255,0.24)", marginRight: -5 },
  themeTitle: { fontFamily: "Inter_700Bold", fontSize: 13, lineHeight: 17 },
  themeText: { fontFamily: "Inter_400Regular", fontSize: 11, lineHeight: 15 },
  infoCard: { borderWidth: 1, borderRadius: 16, overflow: "hidden" },
  infoRow: { paddingHorizontal: 14, paddingVertical: 11, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: "rgba(255,255,255,0.09)" },
  infoLabel: { fontFamily: "Inter_500Medium", fontSize: 11, lineHeight: 15, marginBottom: 2 },
  infoValue: { fontFamily: "Inter_600SemiBold", fontSize: 12, lineHeight: 16 },
  signOutButton: { minHeight: 46, borderRadius: 14, borderWidth: 1, marginTop: 10, paddingHorizontal: 14, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 },
  signOutText: { fontFamily: "Inter_800ExtraBold", fontSize: 13, lineHeight: 17 },
});
