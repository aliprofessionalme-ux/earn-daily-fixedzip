import { Feather } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import React, { useState, useCallback, useEffect, useMemo } from "react";
import {
  ActivityIndicator,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";

import { useColors } from "@/hooks/useColors";
import { useTheme } from "@/contexts/ThemeContext";
import { useUser } from "@/contexts/UserContext";
import { CompactStatCard } from "@/components/CompactStatCard";
import { SummaryRow } from "@/components/SummaryRow";
import { SectionTitle } from "@/components/SectionTitle";
import { getAppSettings } from "@/services/api";

function formatCoins(n: number) {
  return n.toLocaleString();
}

function formatPKR(n: number) {
  return "PKR " + n.toFixed(2);
}

function initialsFrom(name?: string | null, fallback?: string | null) {
  const source = (name || fallback || "ED").trim();
  const parts = source.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  return source.slice(0, 2).toUpperCase();
}

export default function DashboardScreen() {
  const colors = useColors();
  const { themeKey } = useTheme();
  const insets = useSafeAreaInsets();
  const { deviceId, user, isLoading, error, refreshUser, checkIn } = useUser();
  const [checkInLoading, setCheckInLoading] = useState(false);
  const [checkInMessage, setCheckInMessage] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [coinRate, setCoinRate] = useState({ coins: 1000, pkr: 20 });

  const isDaylight = themeKey === "daylight";
  const headerGradient = useMemo(
    () => isDaylight
      ? ["#FFFDF8", "#EAF8FF", "#FFF6D8"] as [string, string, string]
      : ["#1A0A3A", "#0D0D1A", "#0D0D1A"] as [string, string, string],
    [isDaylight],
  );
  const statGradients = useMemo(
    () => isDaylight
      ? {
          energy: ["#FFF8DB", "#FFFFFF"] as [string, string],
          confirmed: ["#EAFBF1", "#FFFFFF"] as [string, string],
          pending: ["#FFF1E8", "#FFFFFF"] as [string, string],
        }
      : {
          energy: ["#2D1B69", "#1A0A3A"] as [string, string],
          confirmed: ["#064E3B", "#0D0D1A"] as [string, string],
          pending: ["#7C2D12", "#0D0D1A"] as [string, string],
        },
    [isDaylight],
  );

  useEffect(() => {
    let cancelled = false;
    getAppSettings()
      .then((settings) => {
        if (!cancelled) {
          setCoinRate({ coins: settings.coinRateCoins || 1000, pkr: settings.coinRatePKR || 20 });
        }
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  const handleCheckIn = useCallback(async () => {
    if (!deviceId || checkInLoading) return;
    setCheckInLoading(true);
    setCheckInMessage(null);
    try {
      const result = await checkIn();
      setCheckInMessage(result.message);
      if (result.success) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        await refreshUser();
      } else {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      }
    } catch {
      setCheckInMessage("Something went wrong. Try again.");
    } finally {
      setCheckInLoading(false);
    }
  }, [deviceId, checkInLoading, checkIn, refreshUser]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refreshUser();
    setRefreshing(false);
  }, [refreshUser]);

  const navCards = useMemo(() => [
    { title: "Mini Games", subtitle: "Spin & Scratch", icon: "zap" as const, gradient: [colors.purple, isDaylight ? "#6D28D9" : colors.purpleDark] as [string, string], route: "/(tabs)/games" as const },
    { title: "Earn Rewards", subtitle: "Tasks & Offers", icon: "gift" as const, gradient: [colors.blue, isDaylight ? "#0369A1" : "#1D4ED8"] as [string, string], route: "/(tabs)/offerwall" as const },
    { title: "Wallet", subtitle: "Withdraw PKR", icon: "credit-card" as const, gradient: [colors.green, "#047857"] as [string, string], route: "/(tabs)/wallet" as const },
  ], [colors.blue, colors.green, colors.purple, colors.purpleDark, isDaylight]);

  const topPad = Platform.OS === "web" ? 20 : insets.top;

  if (isLoading) {
    return (
      <View style={[styles.root, { backgroundColor: colors.background }]}> 
        <View style={styles.loadingBox}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={[styles.loadingText, { color: colors.mutedForeground }]}>Setting up your account...</Text>
        </View>
      </View>
    );
  }

  if (error) {
    const isNetworkError = error.includes("unavailable") || error.includes("network");
    return (
      <View style={[styles.root, { backgroundColor: colors.background }]}> 
        <View style={styles.loadingBox}>
          <Feather name="smartphone" size={48} color={colors.primary} />
          <Text style={[styles.errorTitle, { color: colors.foreground }]}>{isNetworkError ? "Open on Android" : "Connection Error"}</Text>
          <Text style={[styles.errorBody, { color: colors.mutedForeground }]}>{isNetworkError ? "Scan the QR code with Expo Go on your Android device to use the full app" : error}</Text>
        </View>
      </View>
    );
  }

  const energy = user?.energyBalance ?? 0;
  const pending = user?.pendingCoinsBalance ?? 0;
  const confirmed = user?.confirmedCoinsBalance ?? user?.coinsBalance ?? 0;
  const pkr = user?.pkrBalance ?? 0;
  const publicName = (user?.displayName || "Earn Daily User").trim();

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}> 
      <ScrollView
        contentContainerStyle={{ paddingTop: topPad, paddingBottom: Platform.OS === "web" ? 34 : 110 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
        showsVerticalScrollIndicator={false}
      >
        <LinearGradient colors={headerGradient} style={[styles.headerBg, isDaylight && { borderBottomColor: colors.border, borderBottomWidth: 1 }]}> 
          <View style={styles.headerTop}>
            <Pressable
              onPress={() => router.push("/(tabs)/profile")}
              style={({ pressed }) => [styles.profileTrigger, { opacity: pressed ? 0.72 : 1 }]}
            >
              <View style={[styles.headerAvatar, { backgroundColor: colors.card, borderColor: colors.gold + "66" }]}> 
                <Text style={[styles.avatarText, { color: colors.gold }]}>{initialsFrom(publicName, deviceId)}</Text>
              </View>
              <View style={{ minWidth: 0 }}>
                <Text style={[styles.profileEyebrow, { color: colors.mutedForeground }]}>Profile</Text>
                <Text style={[styles.profileNameSmall, { color: colors.foreground }]} numberOfLines={1}>{publicName}</Text>
              </View>
            </Pressable>
            <Pressable onPress={onRefresh} style={({ pressed }) => [styles.refreshBtn, { opacity: pressed ? 0.6 : 1, backgroundColor: isDaylight ? "rgba(255,255,255,0.72)" : "transparent", borderColor: isDaylight ? colors.border : "transparent" }]}> 
              <Feather name="refresh-cw" size={18} color={colors.mutedForeground} />
            </Pressable>
          </View>

          <View style={styles.heroRow}>
            <Text style={[styles.heroKicker, { color: colors.gold }]}>Earn Daily</Text>
            <Text style={[styles.heroTitle, { color: colors.foreground }]}>Earn today, secure tomorrow.</Text>
            <Text style={[styles.heroSubtitle, { color: colors.mutedForeground }]}>Complete tasks, build energy and cash out.</Text>
          </View>

          <View style={styles.statsRow}>
            <CompactStatCard
              icon="zap"
              label="Energy"
              value={formatCoins(energy)}
              colors={statGradients.energy}
              accent={colors.gold}
            />
            <CompactStatCard
              icon="check-circle"
              label="Confirmed"
              value={formatCoins(confirmed)}
              sub={formatPKR(pkr)}
              colors={statGradients.confirmed}
              accent={colors.green}
            />
            <CompactStatCard
              icon="clock"
              label="Pending"
              value={formatCoins(pending)}
              colors={statGradients.pending}
              accent={colors.orange}
            />
          </View>

          <SummaryRow
            lines={[
              `${formatPKR(pkr)} withdrawable`,
              `${coinRate.coins.toLocaleString()} confirmed coins = PKR ${coinRate.pkr}`,
            ]}
          />
          {pending > 0 ? (
            <Text style={[styles.pendingBanner, { color: colors.orange }]}> 
              {formatCoins(pending)} coins pending verification. Not withdrawable yet.
            </Text>
          ) : null}
        </LinearGradient>

        <View style={styles.section}>
          <Pressable onPress={handleCheckIn} disabled={checkInLoading} style={({ pressed }) => ({ opacity: pressed ? 0.85 : 1 })}>
            <LinearGradient colors={[colors.gold, colors.orange]} style={styles.checkInBtn}>
              {checkInLoading ? <ActivityIndicator color="#000" size="small" /> : <Feather name="sun" size={22} color="#000" />}
              <Text style={styles.checkInText}>{checkInLoading ? "Claiming..." : "Daily Check-In . +1 Energy"}</Text>
            </LinearGradient>
          </Pressable>
          {checkInMessage ? (
            <Text style={[styles.checkInMsg, { color: checkInMessage.includes("successful") ? colors.green : colors.mutedForeground }]}> 
              {checkInMessage}
            </Text>
          ) : null}
        </View>

        <View style={styles.section}>
          <SectionTitle title="Earn More" />
          <View style={styles.navList}>
            {navCards.map((card) => (
              <Pressable
                key={card.title}
                onPress={() => { Haptics.selectionAsync(); router.push(card.route); }}
                style={({ pressed }) => ({ opacity: pressed ? 0.85 : 1, transform: [{ scale: pressed ? 0.99 : 1 }] })}
              >
                <LinearGradient colors={card.gradient} style={[styles.navCard, { borderColor: card.gradient[0] + "40" }]}> 
                  <Feather name={card.icon} size={24} color="#fff" />
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={styles.navTitle} numberOfLines={1}>{card.title}</Text>
                    <Text style={styles.navSubtitle} numberOfLines={1}>{card.subtitle}</Text>
                  </View>
                  <Feather name="chevron-right" size={20} color="rgba(255,255,255,0.7)" />
                </LinearGradient>
              </Pressable>
            ))}
          </View>
        </View>

        <View style={styles.section}>
          <SectionTitle title="Today's Activity" />
          <View style={[styles.activityCard, { backgroundColor: colors.card, borderColor: colors.border }]}> 
            <ActivityRow icon="zap" label="Spins Used" value={`${user?.dailySpinsUsed ?? 0} / 5`} color={colors.purple} />
            <View style={[styles.divider, { backgroundColor: colors.border }]} />
            <ActivityRow icon="layers" label="Scratches Used" value={`${user?.dailyScratchUsed ?? 0} / 5`} color={colors.blue} />
            <View style={[styles.divider, { backgroundColor: colors.border }]} />
            <ActivityRow icon="battery" label="Energy Balance" value={`${energy}`} color={colors.gold} />
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

function ActivityRow({ icon, label, value, color }: { icon: React.ComponentProps<typeof Feather>["name"]; label: string; value: string; color: string }) {
  const colors = useColors();
  return (
    <View style={styles.activityRow}>
      <View style={[styles.activityIcon, { backgroundColor: color + "18" }]}> 
        <Feather name={icon} size={16} color={color} />
      </View>
      <Text style={[styles.activityLabel, { color: colors.mutedForeground }]} numberOfLines={1}>{label}</Text>
      <Text style={[styles.activityValue, { color: colors.foreground }]} numberOfLines={1}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  loadingBox: { flex: 1, alignItems: "center", justifyContent: "center", gap: 14, padding: 32 },
  loadingText: { fontFamily: "Inter_400Regular", fontSize: 15, lineHeight: 20, textAlign: "center" },
  errorTitle: { fontFamily: "Inter_700Bold", fontSize: 18, lineHeight: 24, marginTop: 12, textAlign: "center" },
  errorBody: { fontFamily: "Inter_400Regular", fontSize: 13, lineHeight: 18, textAlign: "center", paddingHorizontal: 24 },
  headerBg: { paddingHorizontal: 14, paddingTop: 12, paddingBottom: 12 },
  headerTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 12, gap: 10 },
  profileTrigger: { flexDirection: "row", alignItems: "center", gap: 9, flex: 1, minWidth: 0 },
  headerAvatar: { width: 42, height: 42, borderRadius: 999, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  avatarText: { fontFamily: "Inter_800ExtraBold", fontSize: 14, lineHeight: 18 },
  profileEyebrow: { fontFamily: "Inter_500Medium", fontSize: 11, lineHeight: 14 },
  profileNameSmall: { fontFamily: "Inter_800ExtraBold", fontSize: 15, lineHeight: 19, marginTop: 1 },
  refreshBtn: { width: 34, height: 34, borderRadius: 12, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  heroRow: { minHeight: 86, justifyContent: "center", marginBottom: 12 },
  heroKicker: { fontFamily: "Inter_800ExtraBold", fontSize: 12, lineHeight: 16, textTransform: "uppercase" },
  heroTitle: { fontFamily: "Inter_800ExtraBold", fontSize: 23, lineHeight: 29, marginTop: 4 },
  heroSubtitle: { fontFamily: "Inter_500Medium", fontSize: 12, lineHeight: 17, marginTop: 5 },
  statsRow: { flexDirection: "row", gap: 7 },
  pendingBanner: { fontFamily: "Inter_500Medium", fontSize: 11, lineHeight: 15, marginTop: 8, textAlign: "center" },
  section: { paddingHorizontal: 16, marginTop: 14 },
  checkInBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 12, paddingHorizontal: 14, borderRadius: 14 },
  checkInText: { fontFamily: "Inter_700Bold", fontSize: 14, lineHeight: 18, color: "#000" },
  checkInMsg: { fontFamily: "Inter_400Regular", fontSize: 12, lineHeight: 16, textAlign: "center", marginTop: 10 },
  navList: { gap: 10 },
  navCard: { borderRadius: 14, borderWidth: 1, padding: 12, flexDirection: "row", alignItems: "center", gap: 10 },
  navTitle: { fontFamily: "Inter_700Bold", fontSize: 14, lineHeight: 18, color: "#fff" },
  navSubtitle: { fontFamily: "Inter_400Regular", fontSize: 11, lineHeight: 15, color: "rgba(255,255,255,0.72)" },
  activityCard: { borderRadius: 14, borderWidth: 1, overflow: "hidden" },
  activityRow: { flexDirection: "row", alignItems: "center", padding: 12, gap: 10 },
  activityIcon: { width: 30, height: 30, borderRadius: 8, alignItems: "center", justifyContent: "center" },
  activityLabel: { flex: 1, fontFamily: "Inter_400Regular", fontSize: 13, lineHeight: 17 },
  activityValue: { fontFamily: "Inter_600SemiBold", fontSize: 13, lineHeight: 17 },
  divider: { height: 1, marginHorizontal: 16 },
});