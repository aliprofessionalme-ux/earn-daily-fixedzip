import { Feather } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import React, { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";
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

export default function ProfileScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { user, deviceId, installId, firebaseUid, authMode, authVerified, refreshUser, updateProfile } = useUser();
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
  const today = todayKey();
  const tasksToday = user?.lastDailyTaskDate === today ? user?.dailyTasksCompletedToday ?? 0 : 0;
  const energyToday = user?.lastDailyEnergyDate === today ? user?.dailyEnergyEarnedToday ?? 0 : 0;
  const streak = user?.lastDailyTaskDate === today ? user?.currentDailyStreak ?? 0 : 0;
  const level = useMemo(() => getUserLevel(user), [user]);
  const badges = useMemo(() => getUnlockedBadges(user, 6), [user]);
  const levelProgress = Math.round(level.progress * 100);

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
      <LinearGradient colors={["#1A0A3A", "#0D0D1A"]} style={StyleSheet.absoluteFillObject} />
      <ScrollView contentContainerStyle={{ paddingTop: topPad + 14, paddingBottom: Platform.OS === "web" ? 34 : 112, paddingHorizontal: 16 }} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        <View style={styles.headerRow}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.title, { color: colors.foreground }]}>Profile</Text>
            <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>Settings, referrals and account tools</Text>
          </View>
          <Pressable onPress={() => void refreshUser()} style={[styles.refresh, { backgroundColor: colors.card, borderColor: colors.border }]}> 
            <Feather name="refresh-cw" size={18} color={colors.mutedForeground} />
          </Pressable>
        </View>

        <View style={styles.balanceRow}>
          <CompactStatCard icon="zap" label="Energy" value={energy.toLocaleString()} sub="App benefits" colors={["rgba(255,255,255,0.08)", "rgba(255,255,255,0.03)"]} accent={colors.gold} />
          <CompactStatCard icon="clock" label="Pending" value={pending.toLocaleString()} sub="Under verification" colors={["rgba(255,255,255,0.08)", "rgba(255,255,255,0.03)"]} accent={colors.orange} />
          <CompactStatCard icon="check-circle" label="Confirmed" value={confirmed.toLocaleString()} sub={formatPKR(pkr)} colors={["rgba(255,255,255,0.08)", "rgba(255,255,255,0.03)"]} accent={colors.green} />
        </View>

        <View style={styles.section}>
          <SectionTitle title="Your details" />
          <View style={[styles.nameCard, { backgroundColor: colors.card, borderColor: colors.border }]}> 
            <TextInput
              value={displayName}
              onChangeText={setDisplayName}
              placeholder="Set your public name"
              placeholderTextColor={colors.mutedForeground}
              maxLength={40}
              style={[styles.nameInput, { backgroundColor: colors.background, borderColor: colors.border, color: colors.foreground }]}
            />
            <TextInput
              value={phone}
              onChangeText={setPhone}
              keyboardType="phone-pad"
              placeholder="Phone number (optional)"
              placeholderTextColor={colors.mutedForeground}
              maxLength={30}
              style={[styles.nameInput, { backgroundColor: colors.background, borderColor: colors.border, color: colors.foreground }]}
            />
            <Pressable disabled={savingName} onPress={saveProfile} style={[styles.saveBtn, { backgroundColor: colors.primary, opacity: savingName ? 0.7 : 1 }]}> 
              {savingName ? <ActivityIndicator color="#fff" /> : <Feather name="save" size={17} color="#fff" />}
              <Text style={styles.saveText}>Save</Text>
            </Pressable>
            {nameNotice ? <Text style={[styles.notice, { color: nameNotice.ok ? colors.green : colors.destructive }]}>{nameNotice.text}</Text> : null}
          </View>
        </View>

        <View style={styles.progressGrid}>
          <View style={[styles.progressCard, { backgroundColor: colors.card, borderColor: colors.border }]}> 
            <Text style={[styles.progressValue, { color: colors.gold }]}>{streak}</Text>
            <Text style={[styles.progressLabel, { color: colors.mutedForeground }]}>Daily streak</Text>
          </View>
          <View style={[styles.progressCard, { backgroundColor: colors.card, borderColor: colors.border }]}> 
            <Text style={[styles.progressValue, { color: colors.green }]}>{Math.min(tasksToday, 5)}/5</Text>
            <Text style={[styles.progressLabel, { color: colors.mutedForeground }]}>Tasks today</Text>
          </View>
          <View style={[styles.progressCard, { backgroundColor: colors.card, borderColor: colors.border }]}> 
            <Text style={[styles.progressValue, { color: colors.orange }]}>{energyToday}</Text>
            <Text style={[styles.progressLabel, { color: colors.mutedForeground }]}>Energy today</Text>
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
                <Text style={[styles.levelSub, { color: colors.mutedForeground }]}>{level.coins.toLocaleString()} lifetime coins</Text>
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
          <SectionTitle title="Account status" />
          <View style={[styles.statusCard, { backgroundColor: colors.card, borderColor: colors.border }]}> 
            <View style={[styles.avatar, { backgroundColor: (user?.isBanned ? colors.destructive : colors.green) + "20" }]}> 
              <Feather name={user?.isBanned ? "x-octagon" : "shield"} size={24} color={user?.isBanned ? colors.destructive : colors.green} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.statusTitle, { color: colors.foreground }]}>{user?.isBanned ? "Account banned" : "Account active"}</Text>
              <Text style={[styles.statusSub, { color: colors.mutedForeground }]}> 
                {user?.isBanned
                  ? user?.banReason || "Rewards and withdrawals are blocked."
                  : `${authMode === "firebase-anonymous" ? "Firebase anonymous auth" : "Device-only fallback"} - ${authVerified ? "verified" : "not verified"}`}
              </Text>
            </View>
          </View>
        </View>

        <View style={styles.section}>
          <SectionTitle title="Account info" />
          <View style={[styles.infoCard, { backgroundColor: colors.card, borderColor: colors.border }]}> 
            <InfoRow label="Device ID" value={truncate(deviceId)} />
            <InfoRow label="Referral code" value={user?.referralCode ?? "Open Referral to create"} />
            <InfoRow label="Phone" value={user?.phone || "Not added"} />
            <InfoRow label="Install ID" value={truncate(installId)} />
            <InfoRow label="Firebase UID" value={truncate(firebaseUid ?? user?.firebaseUid)} />
            <InfoRow label="Auth mode" value={authMode} />
          </View>
        </View>

        <View style={styles.section}>
          <SectionTitle title="Account tools" />
          <View style={styles.toolsList}>
            <ToolRow icon="award" title="Top users" subtitle="Leaderboard with hidden user IDs and coin ranking" onPress={() => router.push("/leaderboard")} />
            <ToolRow icon="share-2" title="Referral QR" subtitle="Share your referral code and track qualified bonuses" onPress={() => router.push("/referral")} />
            <ToolRow icon="gift" title="Earn Rewards" subtitle="Complete verified tasks for Pending Coins" onPress={() => router.push("/(tabs)/offerwall")} />
            <ToolRow icon="list" title="Transactions" subtitle="View all balance changes and rewards history" onPress={() => router.push("/transactions")} />
            <ToolRow icon="message-circle" title="Support" subtitle="Submit an issue and view previous tickets" onPress={() => router.push("/support")} />
            <ToolRow icon="help-circle" title="How it works" subtitle="Learn earning, conversion, payout review and fair usage" onPress={() => router.push("/how-it-works")} />
            <ToolRow icon="file-text" title="Terms & Conditions" subtitle="Fair play, fraud rules and withdrawal review terms" onPress={() => router.push("/terms")} />
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
  balanceRow: { flexDirection: "row", gap: 8, marginBottom: 14 },
  section: { marginBottom: 14 },
  nameCard: { borderWidth: 1, borderRadius: 16, padding: 12, gap: 8 },
  nameInput: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 11, fontFamily: "Inter_600SemiBold", fontSize: 14, lineHeight: 18 },
  saveBtn: { minHeight: 44, borderRadius: 12, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 },
  saveText: { color: "#fff", fontFamily: "Inter_700Bold", fontSize: 14, lineHeight: 18 },
  notice: { fontFamily: "Inter_600SemiBold", fontSize: 12, lineHeight: 16, textAlign: "center" },
  progressGrid: { flexDirection: "row", gap: 8, marginBottom: 14 },
  progressCard: { flex: 1, borderWidth: 1, borderRadius: 14, padding: 12, alignItems: "center" },
  progressValue: { fontFamily: "Inter_700Bold", fontSize: 18, lineHeight: 23 },
  progressLabel: { fontFamily: "Inter_500Medium", fontSize: 10.5, lineHeight: 14, marginTop: 2, textAlign: "center" },
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
  statusCard: { borderWidth: 1, borderRadius: 16, padding: 14, flexDirection: "row", gap: 12, alignItems: "center" },
  avatar: { width: 46, height: 46, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  statusTitle: { fontFamily: "Inter_700Bold", fontSize: 16, lineHeight: 20 },
  statusSub: { fontFamily: "Inter_400Regular", fontSize: 12, lineHeight: 18, marginTop: 3 },
  infoCard: { borderWidth: 1, borderRadius: 16, overflow: "hidden" },
  infoRow: { paddingHorizontal: 14, paddingVertical: 11, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: "rgba(255,255,255,0.09)" },
  infoLabel: { fontFamily: "Inter_500Medium", fontSize: 11, lineHeight: 15, marginBottom: 2 },
  infoValue: { fontFamily: "Inter_600SemiBold", fontSize: 12, lineHeight: 16 },
  toolsList: { gap: 8 },
  toolRow: { borderWidth: 1, borderRadius: 14, padding: 12, flexDirection: "row", alignItems: "center", gap: 10 },
  toolIcon: { width: 36, height: 36, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  toolTitle: { fontFamily: "Inter_700Bold", fontSize: 14, lineHeight: 18 },
  toolSubtitle: { fontFamily: "Inter_400Regular", fontSize: 11, lineHeight: 16, marginTop: 1 },
});
