import { Feather } from "@expo/vector-icons";
import { router } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { WebView } from "react-native-webview";

import { useColors } from "@/hooks/useColors";
import { useUser } from "@/contexts/UserContext";
import { SectionTitle } from "@/components/SectionTitle";
import { getAppSettings, type ProviderLaunchStatus } from "@/services/api";

type ProviderKey = "game_tasks" | "high_reward_offers";
type OfferFilter = "all" | "open" | "fast" | "high" | "games" | "surveys" | "apps" | "energy" | "new";

const OFFER_FILTERS: Array<{ id: OfferFilter; label: string; icon: React.ComponentProps<typeof Feather>["name"] }> = [
  { id: "all", label: "All", icon: "grid" },
  { id: "open", label: "Open", icon: "unlock" },
  { id: "fast", label: "Fast", icon: "zap" },
  { id: "high", label: "High Reward", icon: "award" },
  { id: "games", label: "Games", icon: "play" },
  { id: "surveys", label: "Surveys", icon: "message-square" },
  { id: "apps", label: "Apps", icon: "download" },
  { id: "energy", label: "Energy", icon: "battery-charging" },
  { id: "new", label: "New", icon: "star" },
];

interface EarningCategory {
  id: ProviderKey | "survey_rewards" | "app_install_tasks" | "partner_tasks" | "watch_ads";
  title: string;
  subtitle: string;
  icon: React.ComponentProps<typeof Feather>["name"];
  rewardType: "pending_coins" | "energy";
  status: "available" | "coming_soon";
  provider?: ProviderKey;
  publicAppId?: string;
  gradient: [string, string];
  filters: OfferFilter[];
}

function monlixUrl(publicAppId: string | undefined, deviceId: string): string | null {
  if (!publicAppId || !deviceId) return null;
  return `https://offers.monlix.com/?app=${encodeURIComponent(publicAppId)}&user=${encodeURIComponent(deviceId)}`;
}

function openTag(enabled: boolean): OfferFilter[] {
  return enabled ? ["open"] : [];
}

function getCategories(providerLaunch?: ProviderLaunchStatus | null): EarningCategory[] {
  const gameReady = Boolean(providerLaunch?.gameTasks?.enabled && providerLaunch.gameTasks.publicAppId);
  const highRewardReady = Boolean(providerLaunch?.highRewardOffers?.enabled && providerLaunch.highRewardOffers.publicAppId);
  const appInstallReason = providerLaunch?.appInstallTasks?.reason;

  return [
    {
      id: "game_tasks",
      title: "Game Tasks",
      subtitle: gameReady ? "Complete game missions. Rewards enter Pending Coins first." : "Coming Soon until secure task callbacks are configured.",
      icon: "play",
      rewardType: "pending_coins",
      status: gameReady ? "available" : "coming_soon",
      provider: gameReady ? "game_tasks" : undefined,
      publicAppId: providerLaunch?.gameTasks?.publicAppId,
      gradient: ["#7C3AED", "#4C1D95"],
      filters: ["all", "fast", "games", "new", ...openTag(gameReady)],
    },
    {
      id: "survey_rewards",
      title: "Survey Rewards",
      subtitle: providerLaunch?.surveyRewards?.reason ?? "Survey tasks will open after secure callback verification is ready.",
      icon: "message-square",
      rewardType: "pending_coins",
      status: "coming_soon",
      gradient: ["#059669", "#047857"],
      filters: ["all", "surveys"],
    },
    {
      id: "app_install_tasks",
      title: "App Install Tasks",
      subtitle: appInstallReason ?? "Try partner apps after this task source is configured.",
      icon: "download",
      rewardType: "pending_coins",
      status: "coming_soon",
      gradient: ["#D97706", "#B45309"],
      filters: ["all", "apps", "new"],
    },
    {
      id: "high_reward_offers",
      title: "High Reward Offers",
      subtitle: highRewardReady ? "Higher-value offers may require extra verification or admin approval." : "Coming Soon until secure high-value task callbacks are configured.",
      icon: "award",
      rewardType: "pending_coins",
      status: highRewardReady ? "available" : "coming_soon",
      provider: highRewardReady ? "high_reward_offers" : undefined,
      publicAppId: providerLaunch?.highRewardOffers?.publicAppId,
      gradient: ["#DC2626", "#991B1B"],
      filters: ["all", "high", "new", ...openTag(highRewardReady)],
    },
    {
      id: "partner_tasks",
      title: "Partner Tasks",
      subtitle: providerLaunch?.partnerTasks?.reason ?? "More earning tasks will appear here after safe provider setup.",
      icon: "briefcase",
      rewardType: "pending_coins",
      status: "coming_soon",
      gradient: ["#2563EB", "#1E40AF"],
      filters: ["all", "fast"],
    },
    {
      id: "watch_ads",
      title: "Watch Ads & Earn Energy",
      subtitle: providerLaunch?.watchAdsEnergy?.reason ?? "Coming Soon until rewarded ad verification is implemented in the APK.",
      icon: "film",
      rewardType: "energy",
      status: "coming_soon",
      gradient: ["#0891B2", "#0E7490"],
      filters: ["all", "energy", "fast"],
    },
  ];
}

export default function OfferwallScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { deviceId } = useUser();
  const [activeWebviewUrl, setActiveWebviewUrl] = useState<string | null>(null);
  const [webviewLoading, setWebviewLoading] = useState(true);
  const [webviewError, setWebviewError] = useState(false);
  const [providerLaunch, setProviderLaunch] = useState<ProviderLaunchStatus | null>(null);
  const [activeFilter, setActiveFilter] = useState<OfferFilter>("all");

  useEffect(() => {
    let cancelled = false;
    getAppSettings()
      .then((settings) => {
        if (!cancelled) setProviderLaunch(settings.providerLaunch ?? null);
      })
      .catch(() => {
        if (!cancelled) setProviderLaunch(null);
      });
    return () => { cancelled = true; };
  }, []);

  const categories = useMemo(() => getCategories(providerLaunch), [providerLaunch]);
  const visibleCategories = useMemo(
    () => categories.filter((cat) => activeFilter === "all" || cat.filters.includes(activeFilter)),
    [activeFilter, categories],
  );
  const topPad = Platform.OS === "web" ? 20 : insets.top;

  const openOfferwall = (category: EarningCategory) => {
    if (category.status !== "available" || !category.provider) return;

    const url = monlixUrl(category.publicAppId, deviceId ?? "");
    if (!url) return;

    setActiveWebviewUrl(url);
    setWebviewLoading(true);
    setWebviewError(false);
  };

  if (activeWebviewUrl) {
    if (Platform.OS === "web") {
      return (
        <View style={[styles.root, { backgroundColor: colors.background, paddingTop: topPad }]}> 
          <View style={[styles.webHeader, { paddingTop: topPad + 8 }]}> 
            <Pressable onPress={() => setActiveWebviewUrl(null)} style={[styles.backBtn, { backgroundColor: colors.card, borderColor: colors.border }]}> 
              <Feather name="arrow-left" size={20} color={colors.foreground} />
            </Pressable>
            <Text style={[styles.headerTitle, { color: colors.foreground }]}>Complete Tasks</Text>
          </View>
          <View style={[styles.webPlaceholder, { backgroundColor: colors.card, borderColor: colors.border }]}> 
            <Feather name="smartphone" size={42} color={colors.mutedForeground} />
            <Text style={[styles.webMsg, { color: colors.mutedForeground }]}>Open on Android to access this task wall.</Text>
          </View>
        </View>
      );
    }

    return (
      <View style={[styles.root, { backgroundColor: colors.background }]}> 
        <View style={[styles.webHeader, { paddingTop: topPad + 8, backgroundColor: colors.card, borderBottomColor: colors.border }]}> 
          <Pressable onPress={() => setActiveWebviewUrl(null)} style={[styles.backBtn, { backgroundColor: colors.card, borderColor: colors.border }]}> 
            <Feather name="arrow-left" size={20} color={colors.foreground} />
          </Pressable>
          <Text style={[styles.headerTitle, { color: colors.foreground }]}>Complete Tasks</Text>
        </View>
        <View style={styles.webviewContainer}>
          <WebView
            source={{ uri: activeWebviewUrl }}
            style={{ flex: 1, backgroundColor: colors.background }}
            onLoadStart={() => { setWebviewLoading(true); setWebviewError(false); }}
            onLoadEnd={() => setWebviewLoading(false)}
            onError={() => { setWebviewLoading(false); setWebviewError(true); }}
            javaScriptEnabled
            domStorageEnabled
            startInLoadingState={false}
            allowsFullscreenVideo
          />
          {webviewLoading && (
            <View style={[styles.loadingOverlay, { backgroundColor: colors.background }]}> 
              <ActivityIndicator size="large" color={colors.primary} />
              <Text style={[styles.loadingText, { color: colors.mutedForeground }]}>Loading tasks...</Text>
            </View>
          )}
          {webviewError && (
            <View style={[styles.loadingOverlay, { backgroundColor: colors.background }]}> 
              <Feather name="wifi-off" size={42} color={colors.destructive} />
              <Text style={[styles.errorMsg, { color: colors.destructive }]}>Failed to load</Text>
              <Text style={[styles.errorSub, { color: colors.mutedForeground }]}>Check your connection and try again.</Text>
              <Pressable onPress={() => { setWebviewLoading(true); setWebviewError(false); }} style={[styles.retryBtn, { backgroundColor: colors.primary }]}> 
                <Text style={styles.retryBtnText}>Retry</Text>
              </Pressable>
            </View>
          )}
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}> 
      <ScrollView contentContainerStyle={{ paddingTop: topPad + 10, paddingBottom: Platform.OS === "web" ? 34 : 112 }} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <View style={styles.headerTop}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <SectionTitle title="Earning Tasks" />
              <Text style={[styles.headerSubtitle, { color: colors.mutedForeground }]}>Tasks earn Pending Coins. Verified rewards become Confirmed Coins later.</Text>
            </View>
            <Pressable onPress={() => router.push("/task-history")} style={[styles.historyBtn, { backgroundColor: colors.card, borderColor: colors.border }]}> 
              <Feather name="list" size={15} color={colors.gold} />
              <Text style={[styles.historyBtnText, { color: colors.gold }]}>History</Text>
            </Pressable>
          </View>
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow}>
          {OFFER_FILTERS.map((filter) => {
            const active = activeFilter === filter.id;
            return (
              <Pressable key={filter.id} onPress={() => setActiveFilter(filter.id)} style={[styles.filterChip, { backgroundColor: active ? colors.gold : colors.card, borderColor: active ? colors.gold : colors.border }]}> 
                <Feather name={filter.icon} size={13} color={active ? "#120900" : colors.mutedForeground} />
                <Text style={[styles.filterText, { color: active ? "#120900" : colors.mutedForeground }]}>{filter.label}</Text>
              </Pressable>
            );
          })}
        </ScrollView>

        <View style={styles.cardsContainer}>
          {visibleCategories.length === 0 ? (
            <View style={[styles.emptyCard, { backgroundColor: colors.card, borderColor: colors.border }]}> 
              <Feather name="filter" size={32} color={colors.mutedForeground} />
              <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>No tasks in this filter yet</Text>
            </View>
          ) : visibleCategories.map((cat) => (
            <Pressable
              key={cat.id}
              onPress={() => openOfferwall(cat)}
              disabled={cat.status === "coming_soon"}
              style={({ pressed }) => ({ opacity: pressed ? 0.9 : cat.status === "coming_soon" ? 0.58 : 1 })}
            >
              <LinearGradient colors={cat.gradient} style={[styles.card, { borderColor: cat.gradient[0] + "40" }]}> 
                <View style={styles.cardTop}>
                  <View style={styles.cardIconWrap}>
                    <Feather name={cat.icon} size={19} color="#fff" />
                  </View>
                  <View style={styles.cardTextWrap}>
                    <Text style={styles.cardTitle} numberOfLines={1}>{cat.title}</Text>
                    <Text style={styles.cardSubtitle} numberOfLines={2}>{cat.subtitle}</Text>
                  </View>
                </View>
                <View style={styles.cardBottom}>
                  <View style={[styles.badge, { backgroundColor: "rgba(255,255,255,0.15)" }]}> 
                    <Text style={styles.badgeText}>{cat.rewardType === "pending_coins" ? "Pending Coins" : "Energy"}</Text>
                  </View>
                  <View style={[styles.statusBadge, { backgroundColor: cat.status === "available" ? "rgba(16,185,129,0.2)" : "rgba(156,163,175,0.2)" }]}> 
                    <Text style={[styles.statusText, { color: cat.status === "available" ? "#6EE7B7" : "#D1D5DB" }]}>{cat.status === "available" ? "Open" : "Coming Soon"}</Text>
                  </View>
                </View>
              </LinearGradient>
            </Pressable>
          ))}
        </View>

        <View style={[styles.infoCard, { backgroundColor: colors.card, borderColor: colors.border }]}> 
          <View style={styles.infoRow}>
            <Feather name="shield" size={16} color={colors.gold} />
            <Text style={[styles.infoText, { color: colors.mutedForeground }]}>Provider task rewards are never confirmed instantly. They stay pending until verification, hold, or admin approval passes.</Text>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { paddingHorizontal: 16, paddingTop: 2, paddingBottom: 8 },
  headerTop: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 10 },
  historyBtn: { minHeight: 34, borderRadius: 999, borderWidth: 1, paddingHorizontal: 11, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, marginTop: 2 },
  historyBtnText: { fontFamily: "Inter_700Bold", fontSize: 11, lineHeight: 15 },
  webHeader: { paddingHorizontal: 16, paddingBottom: 8, borderBottomWidth: 1 },
  headerTitle: { fontFamily: "Inter_700Bold", fontSize: 19, lineHeight: 24 },
  headerSubtitle: { fontFamily: "Inter_400Regular", fontSize: 12, lineHeight: 17, marginTop: 2 },
  filterRow: { paddingHorizontal: 16, paddingBottom: 12, gap: 8 },
  filterChip: { minHeight: 34, borderRadius: 999, borderWidth: 1, paddingHorizontal: 12, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6 },
  filterText: { fontFamily: "Inter_700Bold", fontSize: 11, lineHeight: 15 },
  cardsContainer: { paddingHorizontal: 16, gap: 10 },
  card: { borderRadius: 15, borderWidth: 1, padding: 12, gap: 9 },
  cardTop: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
  cardIconWrap: { width: 36, height: 36, borderRadius: 11, backgroundColor: "rgba(255,255,255,0.15)", alignItems: "center", justifyContent: "center" },
  cardTextWrap: { flex: 1, minWidth: 0 },
  cardTitle: { fontFamily: "Inter_700Bold", fontSize: 14, lineHeight: 18, color: "#fff" },
  cardSubtitle: { fontFamily: "Inter_400Regular", fontSize: 11, lineHeight: 16, color: "rgba(255,255,255,0.76)", marginTop: 2 },
  cardBottom: { flexDirection: "row", alignItems: "center", gap: 7, flexWrap: "wrap" },
  badge: { paddingHorizontal: 9, paddingVertical: 4, borderRadius: 20 },
  badgeText: { fontFamily: "Inter_600SemiBold", fontSize: 10.5, lineHeight: 14, color: "#fff" },
  statusBadge: { paddingHorizontal: 9, paddingVertical: 4, borderRadius: 20 },
  statusText: { fontFamily: "Inter_600SemiBold", fontSize: 10.5, lineHeight: 14 },
  emptyCard: { minHeight: 120, borderWidth: 1, borderRadius: 16, alignItems: "center", justifyContent: "center", gap: 8, padding: 18 },
  emptyText: { fontFamily: "Inter_600SemiBold", fontSize: 13, lineHeight: 17, textAlign: "center" },
  infoCard: { marginHorizontal: 16, marginTop: 12, borderRadius: 14, borderWidth: 1, padding: 12 },
  infoRow: { flexDirection: "row", alignItems: "flex-start", gap: 9 },
  infoText: { fontFamily: "Inter_400Regular", fontSize: 12, lineHeight: 18, flex: 1 },
  webviewContainer: { flex: 1, position: "relative" },
  loadingOverlay: { ...StyleSheet.absoluteFillObject, alignItems: "center", justifyContent: "center", gap: 12 },
  loadingText: { fontFamily: "Inter_400Regular", fontSize: 14, lineHeight: 18 },
  errorMsg: { fontFamily: "Inter_600SemiBold", fontSize: 16, lineHeight: 20, marginTop: 12 },
  errorSub: { fontFamily: "Inter_400Regular", fontSize: 13, lineHeight: 19, textAlign: "center", paddingHorizontal: 32 },
  backBtn: { width: 38, height: 38, borderRadius: 12, borderWidth: 1, alignItems: "center", justifyContent: "center", marginBottom: 6 },
  webPlaceholder: { margin: 16, padding: 28, borderRadius: 16, borderWidth: 1, alignItems: "center", gap: 14 },
  webMsg: { fontFamily: "Inter_400Regular", fontSize: 14, lineHeight: 19, textAlign: "center" },
  retryBtn: { paddingHorizontal: 18, paddingVertical: 10, borderRadius: 12, marginTop: 8 },
  retryBtnText: { color: "#fff", fontFamily: "Inter_700Bold", fontSize: 14, lineHeight: 18 },
});
