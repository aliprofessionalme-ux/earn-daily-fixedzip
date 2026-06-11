import { Feather } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import React, { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useColors } from "@/hooks/useColors";
import { useTheme } from "@/contexts/ThemeContext";
import { useUser } from "@/contexts/UserContext";
import { SectionTitle } from "@/components/SectionTitle";
import { getUnlockedBadges, getUserLevel, type BadgeIcon, type BadgeInfo } from "@/utils/badges";

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

function BadgePill({ badge }: { badge: BadgeInfo }) {
  const colors = useColors();
  return (
    <View style={[styles.badgePill, { backgroundColor: badge.color + "18", borderColor: badge.color + "55" }]}> 
      <Feather name={badge.icon as BadgeIcon} size={13} color={badge.color} />
      <Text style={[styles.badgePillText, { color: colors.foreground }]} numberOfLines={1}>{badge.label}</Text>
    </View>
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
  const { themeKey } = useTheme();
  const { user, deviceId, authVerified, updateProfile } = useUser();
  const topPad = Platform.OS === "web" ? 20 : insets.top;
  const [displayName, setDisplayName] = useState(user?.displayName ?? "");
  const [phone, setPhone] = useState(user?.phone ?? "");
  const [savingName, setSavingName] = useState(false);
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
    () => themeKey === "daylight"
      ? ["#F7FFF9", "#E9F8EE", "#DDF6E5"] as const
      : themeKey === "midnightGold"
        ? ["#111111", "#201703", "#0B0B0B"] as const
        : ["#2B1159", "#1A0A3A", "#0D0D1A"] as const,
    [themeKey],
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

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}> 
      <ScrollView contentContainerStyle={{ paddingTop: topPad + 12, paddingBottom: Platform.OS === "web" ? 34 : 112, paddingHorizontal: 16 }} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        <LinearGradient colors={profileGradient} style={[styles.heroCard, { borderColor: colors.border }]}> 
          <View style={styles.topActions}>
            <Pressable onPress={() => router.back()} style={({ pressed }) => [styles.iconButton, { backgroundColor: colors.card + "DD", borderColor: colors.border, opacity: pressed ? 0.72 : 1 }]}> 
              <Feather name="arrow-left" size={19} color={colors.foreground} />
            </Pressable>
            <Pressable onPress={() => router.push("/settings")} style={({ pressed }) => [styles.iconButton, { backgroundColor: colors.card + "DD", borderColor: colors.border, opacity: pressed ? 0.72 : 1 }]}> 
              <Feather name="settings" size={19} color={colors.foreground} />
            </Pressable>
          </View>

          <View style={styles.identityRow}>
            <View style={styles.avatarColumn}>
              <View style={[styles.profileAvatar, { backgroundColor: colors.background, borderColor: colors.gold + "66" }]}> 
                <Text style={[styles.profileAvatarText, { color: colors.gold }]}>{initialsFrom(publicName, deviceId)}</Text>
              </View>
              <Pressable disabled style={[styles.avatarEdit, { borderColor: colors.gold + "55", backgroundColor: colors.gold + "18" }]}> 
                <Feather name="edit-3" size={11} color={colors.gold} />
                <Text style={[styles.avatarEditText, { color: colors.gold }]}>Edit Avatar</Text>
              </Pressable>
            </View>
            <View style={styles.identityCopy}>
              <Text style={[styles.profileName, { color: colors.foreground }]} numberOfLines={1}>{publicName}</Text>
              <Text style={[styles.profilePhone, { color: colors.mutedForeground }]} numberOfLines={1}>{user?.phone || "Phone number not added"}</Text>
              <View style={[styles.statusPill, { backgroundColor: statusColor + "18", borderColor: statusColor + "55" }]}> 
                <Feather name={statusIcon} size={13} color={statusColor} />
                <Text style={[styles.statusPillText, { color: statusColor }]}>{statusTitle}</Text>
              </View>
              <Text style={[styles.identitySub, { color: colors.mutedForeground }]} numberOfLines={2}>{statusSubtitle}</Text>
            </View>
          </View>
        </LinearGradient>

        <View style={styles.balanceRow}>
          <MiniMetric icon="zap" label="Energy" value={energy.toLocaleString()} color={colors.gold} />
          <MiniMetric icon="clock" label="Pending" value={pending.toLocaleString()} color={colors.orange} />
          <MiniMetric icon="check-circle" label="Confirmed" value={confirmed.toLocaleString()} color={colors.green} />
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
          <SectionTitle title="Level & badges" />
          <View style={[styles.levelCard, { backgroundColor: colors.card, borderColor: colors.border }]}> 
            <View style={styles.levelTop}>
              <View style={[styles.levelIcon, { backgroundColor: level.color + "22" }]}> 
                <Feather name="award" size={22} color={level.color} />
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={[styles.levelName, { color: colors.foreground }]}>{level.name} Level</Text>
                <Text style={[styles.levelSub, { color: colors.mutedForeground }]}>{lifetimeCoins.toLocaleString()} lifetime coins - {formatPKR(pkr)}</Text>
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
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  heroCard: { borderWidth: 1, borderRadius: 22, padding: 14, marginBottom: 12, overflow: "hidden" },
  topActions: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 18 },
  iconButton: { width: 38, height: 38, borderRadius: 999, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  identityRow: { flexDirection: "row", alignItems: "center", gap: 14 },
  avatarColumn: { alignItems: "center", gap: 8 },
  profileAvatar: { width: 76, height: 76, borderRadius: 999, borderWidth: 2, alignItems: "center", justifyContent: "center" },
  profileAvatarText: { fontFamily: "Inter_800ExtraBold", fontSize: 25, lineHeight: 31 },
  avatarEdit: { minHeight: 28, borderRadius: 999, borderWidth: 1, paddingHorizontal: 9, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 5 },
  avatarEditText: { fontFamily: "Inter_700Bold", fontSize: 10, lineHeight: 13 },
  identityCopy: { flex: 1, minWidth: 0 },
  profileName: { fontFamily: "Inter_800ExtraBold", fontSize: 22, lineHeight: 28 },
  profilePhone: { fontFamily: "Inter_500Medium", fontSize: 12, lineHeight: 16, marginTop: 3 },
  statusPill: { alignSelf: "flex-start", minHeight: 28, borderWidth: 1, borderRadius: 999, paddingHorizontal: 9, marginTop: 9, flexDirection: "row", alignItems: "center", gap: 5 },
  statusPillText: { fontFamily: "Inter_700Bold", fontSize: 11, lineHeight: 14 },
  identitySub: { fontFamily: "Inter_400Regular", fontSize: 11, lineHeight: 16, marginTop: 8 },
  balanceRow: { flexDirection: "row", gap: 8, marginBottom: 14 },
  section: { marginBottom: 14 },
  editCard: { borderWidth: 1, borderRadius: 16, padding: 12, gap: 8 },
  input: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 11, fontFamily: "Inter_600SemiBold", fontSize: 14, lineHeight: 18 },
  saveBtn: { minHeight: 44, borderRadius: 12, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 },
  saveText: { color: "#fff", fontFamily: "Inter_700Bold", fontSize: 14, lineHeight: 18 },
  notice: { fontFamily: "Inter_600SemiBold", fontSize: 12, lineHeight: 16, textAlign: "center" },
  progressGrid: { flexDirection: "row", gap: 8 },
  miniMetric: { flex: 1, minHeight: 82, borderWidth: 1, borderRadius: 14, padding: 10, alignItems: "center", justifyContent: "center" },
  miniMetricIcon: { width: 30, height: 30, borderRadius: 10, alignItems: "center", justifyContent: "center", marginBottom: 6 },
  miniMetricValue: { fontFamily: "Inter_700Bold", fontSize: 17, lineHeight: 22 },
  miniMetricLabel: { fontFamily: "Inter_600SemiBold", fontSize: 10, lineHeight: 13, marginTop: 1, textAlign: "center" },
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
});