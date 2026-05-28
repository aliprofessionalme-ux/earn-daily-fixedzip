import { Feather } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import React, { useState, useCallback, useEffect } from "react";
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

function truncateId(id: string) {
  if (id.length <= 16) return id;
  return id.slice(0, 8) + "..." + id.slice(-6);
}

export default function DashboardScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { deviceId, user, isLoading, error, refreshUser, checkIn } = useUser();
  const [checkInLoading, setCheckInLoading] = useState(false);
  const [checkInMessage, setCheckInMessage] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [coinRate, setCoinRate] = useState({ coins: 1000, pkr: 20 });


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

  const navCards = [
    { title: "Mini Games", subtitle: "Spin & Scratch", icon: "zap" as const, gradient: [colors.purple, colors.purpleDark] as [string, string], route: "/(tabs)/games" as const },
    { title: "Earn Rewards", subtitle: "Tasks & Offers", icon: "gift" as const, gradient: [colors.blue, "#1D4ED8"] as [string, string], route: "/(tabs)/offerwall" as const },
    { title: "Wallet", subtitle: "Withdraw PKR", icon: "credit-card" as const, gradient: [colors.green, "#047857"] as [string, string], route: "/(tabs)/wallet" as const },
    { title: "Profile", subtitle: "Account tools", icon: "user" as const, gradient: [colors.gold, colors.orange] as [string, string], route: "/(tabs)/profile" as const },
  ];

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

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <ScrollView
        contentContainerStyle={{ paddingTop: topPad, paddingBottom: Platform.OS === "web" ? 34 : 110 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <LinearGradient colors={["#1A0A3A", "#0D0D1A"]} style={styles.headerBg}>
          <View style={styles.headerTop}>
            <View>
              <Text style={[styles.headerLabel, { color: colors.mutedForeground }]}>Account ID</Text>
              <Text style={[styles.headerId, { color: colors.purpleLight }]}>{deviceId ? truncateId(deviceId) : "—"}</Text>
            </View>
            <Pressable onPress={onRefresh} style={({ pressed }) => [styles.refreshBtn, { opacity: pressed ? 0.6 : 1 }]}>
              <Feather name="refresh-cw" size={18} color={colors.mutedForeground} />
            </Pressable>
          </View>

          {/* Stats Row */}
          <View style={styles.statsRow}>
            <CompactStatCard
              icon="zap"
              label="Energy"
              value={formatCoins(energy)}
              colors={["#2D1B69", "#1A0A3A"]}
              accent={colors.gold}
            />
            <CompactStatCard
              icon="check-circle"
              label="Confirmed"
              value={formatCoins(confirmed)}
              sub={formatPKR(pkr)}
              colors={["#064E3B", "#0D0D1A"]}
              accent={colors.green}
            />
            <CompactStatCard
              icon="clock"
              label="Pending"
              value={formatCoins(pending)}
              colors={["#7C2D12", "#0D0D1A"]}
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

        {/* Daily Check-In */}
        <View style={styles.section}>
          <Pressable onPress={handleCheckIn} disabled={checkInLoading} style={({ pressed }) => ({ opacity: pressed ? 0.85 : 1 })}>
            <LinearGradient colors={[colors.gold, colors.orange]} style={styles.checkInBtn}>
              {checkInLoading ? <ActivityIndicator color="#000" size="small" /> : <Feather name="sun" size={22} color="#000" />}
              <Text style={styles.checkInText}>{checkInLoading ? "Claiming..." : "Daily Check-In · +1 Energy"}</Text>
            </LinearGradient>
          </Pressable>
          {checkInMessage ? (
            <Text style={[styles.checkInMsg, { color: checkInMessage.includes("successful") ? colors.green : colors.mutedForeground }]}>
              {checkInMessage}
            </Text>
          ) : null}
        </View>

        {/* Navigation Cards */}
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

        {/* Today's Activity */}
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
  headerBg: { paddingHorizontal: 14, paddingTop: 14, paddingBottom: 12 },
  headerTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 14 },
  headerLabel: { fontFamily: "Inter_400Regular", fontSize: 11, lineHeight: 15, letterSpacing: 0.5 },
  headerId: { fontFamily: "Inter_600SemiBold", fontSize: 13, lineHeight: 17, marginTop: 2 },
  refreshBtn: { padding: 6 },
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
