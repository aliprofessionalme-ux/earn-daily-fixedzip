import { Feather } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import React, { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Linking, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";
import { OFFICIAL_WHATSAPP_CHANNEL_URL } from "@/constants/brand";
import { themeOptions, useTheme, type ThemeKey } from "@/contexts/ThemeContext";
import { useUser } from "@/contexts/UserContext";
import { CompactStatCard } from "@/components/CompactStatCard";
import { SectionTitle } from "@/components/SectionTitle";
import { getUnlockedBadges, getUserLevel, type BadgeIcon, type BadgeInfo } from "@/utils/badges";

function truncate(value?: string | null) {
  if (!value) return "-";
  return value.length > 22 ? `${value.slice(0, 10)}...${value.slice(-8)}` : value;
}

function todayKey() {
  try { return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Karachi" }); }
  catch { return new Date().toISOString().split("T")[0]; }
}

function formatPKR(n: number) { return `PKR ${Number(n || 0).toFixed(2)}`; }

function initialsFrom(name?: string | null, fallback?: string | null) {
  const source = (name || fallback || "ED").trim();
  const parts = source.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  return source.slice(0, 2).toUpperCase();
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

function BadgePill({ badge }: { badge: BadgeInfo }) {
  const colors = useColors();
  return (
    <View style={[styles.badgePill, { backgroundColor: badge.color + "18", borderColor: badge.color + "55" }]}> 
      <Feather name={badge.icon as BadgeIcon} size={13} color={badge.color} />
      <Text style={[styles.badgePillText, { color: colors.foreground }]} numberOfLines={1}>{badge.label}</Text>
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

function MiniMetric({ icon, label, value, color }: { icon: React.ComponentProps<typeof Feather>["name"]; label: string; value: string; color: string }) {
  const colors = useColors();
  return (
    <View style={[styles.miniMetric, { backgroundColor: colors.card, borderColor: colors.border }]}> 
      <View style={[styles.miniMetricIcon, { backgroundColor: color + "18" }]}> 
        <Feather name={icon} size={15} color={color} />
      </View>
      <Text style={[styles.miniMetricValue, { color }]} numberOfLines={1}>{value}</Text>
      <Text style={[styles.miniMetricLabel, { color: colors.mutedForeground }]} numberOfLines={1}>{label}</Text>
    </View>
  );
}

export default function ProfileScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { themeKey, setThemeKey } = useTheme();
  const { user, deviceId, installId, firebaseUid, authMode, authVerified, refreshUser, updateProfile } = useUser();
  const topPad = Platform.OS === "web" ? 20 : insets.top;
  const [displayName, setDisplayName] = useState(user?.displayName ?? "");
  const [phone, setPhone] = useState(user?.phone ?? "");
  const [savingName, setSavingName] = useState(false);
  const [savingTheme, setSavingTheme] = useState<ThemeKey | null>(null);
  const [nameNotice, setNameNotice] = useState<{ text: string; ok: boolean } | null>(null);

  useEffect(() => { setDisplayName(user?.displayName ?? ""); }, [user?.displayName]);
  useEffect(() => { setPhone(user?.phone ?? ""); }, [user?.phone]);

  const energy = user?.energyBalance ?? 0;
  const pending = user?.pendingCoinsBalance ?? 0;
  const confirmed = user?.confirmedCoinsBalance ?? user?.coinsBalance ?? 0;
  const pkr = user?.pkrBalance ?? 0;
  const lifetimeCoins = user?.totalEarnedCoins ?? confirmed;
  const today = todayKey();
  const tasksToday = user?.lastDailyTaskDate === today ? user?.dailyTasksCompletedToday ?? 0 : 0;
  const energyToday = user?.lastDailyEnergyDate === today ? user?.dailyEnergyEarnedToday ?? 0 : 0;
  const streak = user?.lastDailyTaskDate === today ? user?.currentDailyStreak ?? 0 : 0;
  const level = useMemo(() => getUserLevel(user), [user]);
  const badges = useMemo(() => getUnlockedBadges(user, 6), [user]);
  const levelProgress = Math.max(0, Math.min(100, Math.round(level.progress * 100)));
  const publicName = (user?.displayName || displayName || "Earn Daily User").trim();
  const profileGradient = useMemo(
    () => themeKey === "primary" ? ["#1A0A3A", "#0D0D1A"] as const : [colors.purpleDark, colors.background] as const,
    [colors.background, colors.purpleDark, themeKey],
  );
  const statusIcon: React.ComponentProps<typeof Feather>["name"] = user?.isBanned ? "x-octagon" : "shield";
  const statusColor = user?.isBanned ? colors.destructive : colors.green;
  const statusTitle = user?.isBanned ? "Restricted" : "Active";
  const statusSubtitle = user?.isBanned
    ? user?.banReason || "Rewards and withdrawals are blocked."
    : authVerified ? "Firebase verified account" : "Device account pending verification";

  const saveProfile = async () => {
    const name = displayName.trim().replace(/\s+/g, " ");
    const phoneValue = phone.trim().replace(/\s+/g, " ");
    if (name.length < 2) { setNameNotice({ text: "Enter at least 2 characters.", ok: false }); return; }
    setSavingName(true); setNameNotice(null);
    try {
      await updateProfile(name, phoneValue || null);
      setNameNotice({ text: "Profile updated.", ok: true });
    } catch (err) {
      setNameNotice({ text: err instanceof Error ? err.message : "Unable to update profile.", ok: false });
    } finally {
      setSavingName(false);
    }
  };

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

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}> 
      <LinearGradient colors={profileGradient} style={StyleSheet.absoluteFillObject} />
      <ScrollView contentContainerStyle={{ paddingTop: topPad + 14, paddingBottom: Platform.OS === "web" ? 34 : 112, paddingHorizontal: 16 }} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        <View style={styles.headerRow}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.title, { color: colors.foreground }]}>Profile</Text>
            <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>Personal account and app preferences</Text>
          </View>
          <Pressable onPress={() => void refreshUser()} style={[styles.refresh, { backgroundColor: colors.card, borderColor: colors.border }]}> 
            <Feather name="refresh-cw" size={18} color={colors.mutedForeground} />
          </Pressable>
        </View>

        <LinearGradient colors={[colors.gold + "20", "rgba(255,255,255,0.04)"]} style={[styles.identityCard, { borderColor: colors.border }]}> 
          <View style={styles.identityRow}>
            <View style={[styles.profileMark, { backgroundColor: colors.background, borderColor: colors.gold + "55" }]}> 
              <Text style={[styles.profileMarkText, { color: colors.gold }]}>{initialsFrom(publicName, deviceId)}</Text>
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={[styles.profileName, { color: colors.foreground }]} numberOfLines={1}>{publicName}</Text>
              <Text style={[styles.profilePhone, { color: colors.mutedForeground }]} numberOfLines={1}>{user?.phone || "Phone number not added"}</Text>
            </View>
            <View style={[styles.statusPill, { backgroundColor: statusColor + "18", borderColor: statusColor + "55" }]}> 
              <Feather name={statusIcon} size={13} color={statusColor} />
              <Text style={[styles.statusPillText, { color: statusColor }]}>{statusTitle}</Text>
            </View>
          </View>
          <Text style={[styles.identitySub, { color: colors.mutedForeground }]} numberOfLines={2}>{statusSubtitle}</Text>
        </LinearGradient>

        <View style={styles.balanceRow}>
          <CompactStatCard icon="zap" label="Energy" value={energy.toLocaleString()} sub="App benefits" colors={["rgba(255,255,255,0.08)", "rgba(255,255,255,0.03)"]} accent={colors.gold} />
          <CompactStatCard icon="clock" label="Pending" value={pending.toLocaleString()} sub="Under verification" colors={["rgba(255,255,255,0.08)", "rgba(255,255,255,0.03)"]} accent={colors.orange} />
          <CompactStatCard icon="check-circle" label="Confirmed" value={confirmed.toLocaleString()} sub={formatPKR(pkr)} colors={["rgba(255,255,255,0.08)", "rgba(255,255,255,0.03)"]} accent={colors.green} />
        </View>

        <View style={styles.section}>
          <SectionTitle title="Personal details" />
          <View style={[styles.editCard, { backgroundColor: colors.card, borderColor: colors.border }]}> 
            <TextInput
              value={displayName}
              onChangeText={setDisplayName}
              placeholder="Set your public name"
              placeholderTextColor={colors.mutedForeground}
              maxLength={40}
              style={[styles.input, { backgroundColor: colors.background, borderColor: colors.border, color: colors.foreground }]}
            />
            <TextInput
              value={phone}
              onChangeText={setPhone}
              keyboardType="phone-pad"
              placeholder="Phone number"
              placeholderTextColor={colors.mutedForeground}
              maxLength={30}
              style={[styles.input, { backgroundColor: colors.background, borderColor: colors.border, color: colors.foreground }]}
            />
            <Pressable disabled={savingName} onPress={saveProfile} style={[styles.saveBtn, { backgroundColor: colors.primary, opacity: savingName ? 0.7 : 1 }]}> 
              {savingName ? <ActivityIndicator color="#fff" /> : <Feather name="save" size={17} color="#fff" />}
              <Text style={styles.saveText}>Save profile</Text>
            </Pressable>
            {nameNotice ? <Text style={[styles.notice, { color: nameNotice.ok ? colors.green : colors.destructive }]}>{nameNotice.text}</Text> : null}
          </View>
        </View>

        <View style={styles.section}>
          <SectionTitle title="Daily progress" />
          <View style={styles.progressGrid}>
            <MiniMetric icon="target" label="Tasks" value={`${Math.min(tasksToday, 5)}/5`} color={colors.green} />
            <MiniMetric icon="zap" label="Energy" value={energyToday.toLocaleString()} color={colors.gold} />
            <MiniMetric icon="activity" label="Streak" value={streak.toLocaleString()} color={colors.orange} />
          </View>
        </View>

        <View style={styles.section}>
          <SectionTitle title="Account tools" />
          <View style={styles.toolsList}>
            <ToolRow icon="award" title="Top users" subtitle="Leaderboard with hidden account IDs" onPress={() => router.push("/leaderboard")} />
            <ToolRow icon="share-2" title="Referral QR" subtitle="Share, scan and track qualified referral bonuses" onPress={() => router.push("/referral")} />
            <ToolRow icon="bell" title="Notifications" subtitle="Withdrawals, rewards and support replies" onPress={() => router.push("/notifications")} />
            <ToolRow icon="list" title="Transactions" subtitle="Balance changes and reward history" onPress={() => router.push("/transactions")} />
            <ToolRow icon="message-circle" title="Support" subtitle="Send a ticket and view admin replies" onPress={() => router.push("/support")} />
            <ToolRow icon="send" title="Official WhatsApp Channel" subtitle="Earn Daily official updates" onPress={openWhatsAppChannel} />
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
          <SectionTitle title="Level & badges" />
          <View style={[styles.levelCard, { backgroundColor: colors.card, borderColor: colors.border }]}> 
            <View style={styles.levelTop}>
              <View style={[styles.levelIcon, { backgroundColor: level.color + "22" }]}> 
                <Feather name="award" size={22} color={level.color} />
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={[styles.levelName, { color: colors.foreground }]}>{level.name} Level</Text>
                <Text style={[styles.levelSub, { color: colors.mutedForeground }]}>{lifetimeCoins.toLocaleString()} lifetime coins</Text>
              </View>
              <Text style={[styles.levelPercent, { color: level.color }]}>{levelProgress}%</Text>
            </View>
            <View style={[styles.progressTrack, { backgroundColor: colors.background }]}> 
              <View style={[styles.progressFill, { width: `${levelProgress}%`, backgroundColor: level.color }]} />
            </View>
            <Text style={[styles.levelHint, { color: colors.mutedForeground }]}> 
              {level.nextName ? `${level.coinsToNext.toLocaleString()} coins to ${level.nextName}` : "Highest level unlocked"}
            </Text>
            <View style={styles.badgesGrid}>
              {badges.map((badge) => <BadgePill key={badge.id} badge={badge} />)}
            </View>
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
            <InfoRow label="Referral code" value={user?.referralCode ?? "Open Referral to create"} />
            <InfoRow label="Device ID" value={truncate(deviceId)} />
            <InfoRow label="Install ID" value={truncate(installId)} />
            <InfoRow label="Firebase UID" value={truncate(firebaseUid ?? user?.firebaseUid)} />
            <InfoRow label="Auth mode" value={authMode} />
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  headerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 14, gap: 10 },
  title: { fontFamily: "Inter_700Bold", fontSize: 24, lineHeight: 30 },
  subtitle: { fontFamily: "Inter_400Regular", fontSize: 12, lineHeight: 16, marginTop: 2 },
  refresh: { width: 40, height: 40, borderRadius: 12, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  identityCard: { borderWidth: 1, borderRadius: 18, padding: 14, marginBottom: 12, overflow: "hidden" },
  identityRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  profileMark: { width: 58, height: 58, borderRadius: 18, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  profileMarkText: { fontFamily: "Inter_700Bold", fontSize: 20, lineHeight: 25 },
  profileName: { fontFamily: "Inter_700Bold", fontSize: 18, lineHeight: 23 },
  profilePhone: { fontFamily: "Inter_500Medium", fontSize: 12, lineHeight: 16, marginTop: 2 },
  statusPill: { minHeight: 28, borderWidth: 1, borderRadius: 999, paddingHorizontal: 9, flexDirection: "row", alignItems: "center", gap: 5 },
  statusPillText: { fontFamily: "Inter_700Bold", fontSize: 11, lineHeight: 14 },
  identitySub: { fontFamily: "Inter_400Regular", fontSize: 11, lineHeight: 16, marginTop: 10 },
  balanceRow: { flexDirection: "row", gap: 8, marginBottom: 14 },
  section: { marginBottom: 14 },
  editCard: { borderWidth: 1, borderRadius: 16, padding: 12, gap: 8 },
  input: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 11, fontFamily: "Inter_600SemiBold", fontSize: 14, lineHeight: 18 },
  saveBtn: { minHeight: 44, borderRadius: 12, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 },
  saveText: { color: "#fff", fontFamily: "Inter_700Bold", fontSize: 14, lineHeight: 18 },
  notice: { fontFamily: "Inter_600SemiBold", fontSize: 12, lineHeight: 16, textAlign: "center" },
  progressGrid: { flexDirection: "row", gap: 8 },
  miniMetric: { flex: 1, minHeight: 88, borderWidth: 1, borderRadius: 14, padding: 10, alignItems: "center", justifyContent: "center" },
  miniMetricIcon: { width: 30, height: 30, borderRadius: 10, alignItems: "center", justifyContent: "center", marginBottom: 6 },
  miniMetricValue: { fontFamily: "Inter_700Bold", fontSize: 17, lineHeight: 22 },
  miniMetricLabel: { fontFamily: "Inter_600SemiBold", fontSize: 10, lineHeight: 13, marginTop: 1, textAlign: "center" },
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
  levelCard: { borderWidth: 1, borderRadius: 16, padding: 14, gap: 10 },
  levelTop: { flexDirection: "row", alignItems: "center", gap: 10 },
  levelIcon: { width: 44, height: 44, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  levelName: { fontFamily: "Inter_700Bold", fontSize: 16, lineHeight: 20 },
  levelSub: { fontFamily: "Inter_400Regular", fontSize: 12, lineHeight: 16, marginTop: 2 },
  levelPercent: { fontFamily: "Inter_700Bold", fontSize: 14, lineHeight: 18 },
  progressTrack: { height: 8, borderRadius: 999, overflow: "hidden" },
  progressFill: { height: "100%", borderRadius: 999 },
  levelHint: { fontFamily: "Inter_500Medium", fontSize: 11, lineHeight: 15 },
  badgesGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  badgePill: { minHeight: 30, borderWidth: 1, borderRadius: 999, paddingHorizontal: 10, flexDirection: "row", alignItems: "center", gap: 6, maxWidth: "48%" },
  badgePillText: { fontFamily: "Inter_700Bold", fontSize: 11, lineHeight: 15, flexShrink: 1 },
  infoCard: { borderWidth: 1, borderRadius: 16, overflow: "hidden" },
  infoRow: { paddingHorizontal: 14, paddingVertical: 11, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: "rgba(255,255,255,0.09)" },
  infoLabel: { fontFamily: "Inter_500Medium", fontSize: 11, lineHeight: 15, marginBottom: 2 },
  infoValue: { fontFamily: "Inter_600SemiBold", fontSize: 12, lineHeight: 16 },
});
