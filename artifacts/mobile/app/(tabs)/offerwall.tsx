import { Feather } from "@expo/vector-icons";
import { router } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import React, { useCallback, useEffect, useMemo, useState } from "react";
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
import { getAppSettings, getTaskSlotStatus, type ProviderLaunchItem, type ProviderLaunchStatus, type TaskSlotStatus } from "@/services/api";

type CategoryId = "game_tasks" | "survey_rewards" | "research_surveys" | "app_install_tasks" | "high_reward_offers" | "partner_tasks" | "watch_ads";
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
  id: CategoryId;
  title: string;
  subtitle: string;
  icon: React.ComponentProps<typeof Feather>["name"];
  rewardType: "pending_coins" | "energy";
  status: "available" | "coming_soon";
  launchItem?: ProviderLaunchItem | null;
  gradient: [string, string];
  filters: OfferFilter[];
}

type ProviderLaunchStatusWithResearch = ProviderLaunchStatus & {
  researchSurveys?: ProviderLaunchItem;
};

function isWebLaunchReady(item?: ProviderLaunchItem | null): boolean {
  return Boolean(item?.enabled && item.launchType === "webview" && item.launchUrl);
}

function resolveLaunchUrl(item: ProviderLaunchItem | null | undefined, deviceId: string): string | null {
  if (!item?.launchUrl || !deviceId) return null;
  return item.launchUrl.split("{deviceId}").join(encodeURIComponent(deviceId));
}

function openTag(enabled: boolean): OfferFilter[] {
  return enabled ? ["open"] : [];
}

function getCategories(providerLaunch?: ProviderLaunchStatusWithResearch | null): EarningCategory[] {
  const gameItem = providerLaunch?.gameTasks ?? null;
  const surveyItem = providerLaunch?.surveyRewards ?? null;
  const researchSurveyItem = providerLaunch?.researchSurveys ?? null;
  const appInstallItem = providerLaunch?.appInstallTasks ?? null;
  const highRewardItem = providerLaunch?.highRewardOffers ?? null;
  const partnerItem = providerLaunch?.partnerTasks ?? null;
  const watchAdsItem = providerLaunch?.watchAdsEnergy ?? null;

  const gameReady = isWebLaunchReady(gameItem);
  const surveyReady = isWebLaunchReady(surveyItem);
  const researchSurveyReady = isWebLaunchReady(researchSurveyItem);
  const appInstallReady = isWebLaunchReady(appInstallItem);
  const highRewardReady = isWebLaunchReady(highRewardItem);
  const partnerReady = isWebLaunchReady(partnerItem);

  return [
    {
      id: "game_tasks",
      title: "Game Tasks",
      subtitle: gameReady ? "Complete game missions. Rewards enter Pending Coins first." : "Game missions are being prepared. Please check back soon.",
      icon: "play",
      rewardType: "pending_coins",
      status: gameReady ? "available" : "coming_soon",
      launchItem: gameItem,
      gradient: ["#7C3AED", "#4C1D95"],
      filters: ["all", "fast", "games", "new", ...openTag(gameReady)],
    },
    {
      id: "survey_rewards",
      title: "Survey Rewards",
      subtitle: surveyReady ? "Answer partner surveys. Rewards stay pending until verified." : "Survey rewards are being prepared. Please check back soon.",
      icon: "message-square",
      rewardType: "pending_coins",
      status: surveyReady ? "available" : "coming_soon",
      launchItem: surveyItem,
      gradient: ["#059669", "#047857"],
      filters: ["all", "surveys", ...openTag(surveyReady)],
    },
    {
      id: "research_surveys",
      title: "Research Surveys",
      subtitle: researchSurveyReady ? "Complete research surveys for verified pending rewards." : "Research surveys are being prepared. Please check back soon.",
      icon: "clipboard",
      rewardType: "pending_coins",
      status: researchSurveyReady ? "available" : "coming_soon",
      launchItem: researchSurveyItem,
      gradient: ["#0EA5E9", "#075985"],
      filters: ["all", "surveys", "new", ...openTag(researchSurveyReady)],
    },
    {
      id: "app_install_tasks",
      title: "App Install Tasks",
      subtitle: appInstallReady ? "Install apps and complete missions for verified rewards." : "App install rewards are being prepared. Please check back soon.",
      icon: "download",
      rewardType: "pending_coins",
      status: appInstallReady ? "available" : "coming_soon",
      launchItem: appInstallItem,
      gradient: ["#D97706", "#B45309"],
      filters: ["all", "apps", "new", ...openTag(appInstallReady)],
    },
    {
      id: "high_reward_offers",
      title: "High Reward Offers",
      subtitle: highRewardReady ? "Higher-value offers may require extra verification or admin approval." : "High reward offers are being prepared. Please check back soon.",
      icon: "award",
      rewardType: "pending_coins",
      status: highRewardReady ? "available" : "coming_soon",
      launchItem: highRewardItem,
      gradient: ["#DC2626", "#991B1B"],
      filters: ["all", "high", "new", ...openTag(highRewardReady)],
    },
    {
      id: "partner_tasks",
      title: "Partner Tasks",
      subtitle: partnerReady ? "Complete partner tasks from approved earning networks." : "Partner earning tasks are being prepared. Please check back soon.",
      icon: "briefcase",
      rewardType: "pending_coins",
      status: partnerReady ? "available" : "coming_soon",
      launchItem: partnerItem,
      gradient: ["#2563EB", "#1E40AF"],
      filters: ["all", "fast", ...openTag(partnerReady)],
    },
    {
      id: "watch_ads",
      title: "Watch Ads & Earn Energy",
      subtitle: "Rewarded ads are being prepared. Please check back soon.",
      icon: "film",
      rewardType: "energy",
      status: "coming_soon",
      launchItem: watchAdsItem,
      gradient: ["#0891B2", "#0E7490"],
      filters: ["all", "energy", "fast"],
    },
  ];
}

export default function OfferwallScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { deviceId, user, unlockExtraTaskSlot } = useUser();
  const [activeWebviewUrl, setActiveWebviewUrl] = useState<string | null>(null);
  const [webviewLoading, setWebviewLoading] = useState(true);
  const [webviewError, setWebviewError] = useState(false);
  const [providerLaunch, setProviderLaunch] = useState<ProviderLaunchStatusWithResearch | null>(null);
  const [activeFilter, setActiveFilter] = useState<OfferFilter>("all");
  const [taskSlots, setTaskSlots] = useState<TaskSlotStatus | null>(null);
  const [taskSlotMessage, setTaskSlotMessage] = useState<string | null>(null);
  const [unlockingSlot, setUnlockingSlot] = useState(false);

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

  const refreshTaskSlots = useCallback(async () => {
    if (!deviceId) return;
    try {
      const status = await getTaskSlotStatus(deviceId);
      setTaskSlots(status);
      setTaskSlotMessage(null);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unable to load task slots.";
      setTaskSlotMessage(message);
    }
  }, [deviceId]);

  useEffect(() => {
    void refreshTaskSlots();
  }, [refreshTaskSlots, user?.energyBalance, user?.extraSlotsUnlocked, user?.lastTaskSlotResetDate, user?.taskSlotsUsedToday]);

  const categories = useMemo(() => getCategories(providerLaunch), [providerLaunch]);
  const visibleCategories = useMemo(
    () => categories.filter((cat) => activeFilter === "all" || cat.filters.includes(activeFilter)),
    [activeFilter, categories],
  );
  const topPad = Platform.OS === "web" ? 20 : insets.top;

  const handleUnlockSlot = async () => {
    if (unlockingSlot) return;
    setUnlockingSlot(true);
    setTaskSlotMessage(null);
    try {
      const result = await unlockExtraTaskSlot();
      setTaskSlots(result.taskSlots);
      setTaskSlotMessage(result.message);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unable to unlock task slot.";
      setTaskSlotMessage(message);
    } finally {
      setUnlockingSlot(false);
    }
  };

  const openOfferwall = (category: EarningCategory) => {
    if (category.status !== "available") return;

    if (category.rewardType === "pending_coins" && taskSlots?.locked) {
      setTaskSlotMessage(`Daily task slots finished. Unlock 1 more task with ${taskSlots.energyPerExtraSlot} Energy.`);
      return;
    }

    const url = resolveLaunchUrl(category.launchItem, deviceId ?? "");
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

  const progressPercent = taskSlots ? Math.min(100, Math.round((taskSlots.usedToday / Math.max(1, taskSlots.totalSlots)) * 100)) : 0;
  const unlockDisabled = !taskSlots?.locked || !taskSlots.canUnlock || unlockingSlot;
  const unlockLabel = !taskSlots?.locked
    ? "Slots available"
    : taskSlots.canUnlock
      ? `Unlock 1 Task - ${taskSlots.energyPerExtraSlot} Energy`
      : `Need ${taskSlots.nextUnlockEnergyNeeded} Energy`;

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

        <View style={[styles.slotCard, { backgroundColor: colors.card, borderColor: taskSlots?.locked ? colors.gold : colors.border }]}> 
          <View style={styles.slotTopRow}>
            <View style={styles.slotTitleWrap}>
              <View style={[styles.slotIcon, { backgroundColor: colors.gold + "22" }]}> 
                <Feather name={taskSlots?.locked ? "lock" : "unlock"} size={16} color={colors.gold} />
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={[styles.slotTitle, { color: colors.foreground }]}>Daily Task Slots</Text>
                <Text style={[styles.slotSub, { color: colors.mutedForeground }]}>3 free tasks daily. Extra tasks unlock with Energy.</Text>
              </View>
            </View>
            <Text style={[styles.slotCounter, { color: colors.gold }]}>{taskSlots ? `${taskSlots.slotsRemaining}/${taskSlots.totalSlots}` : "--"}</Text>
          </View>
          <View style={[styles.progressTrack, { backgroundColor: colors.border }]}> 
            <View style={[styles.progressFill, { width: `${progressPercent}%`, backgroundColor: taskSlots?.locked ? colors.gold : "#10B981" }]} />
          </View>
          <View style={styles.slotStatsRow}>
            <View style={styles.slotStat}>
              <Text style={[styles.slotStatValue, { color: colors.foreground }]}>{taskSlots?.usedToday ?? user?.taskSlotsUsedToday ?? 0}</Text>
              <Text style={[styles.slotStatLabel, { color: colors.mutedForeground }]}>Used</Text>
            </View>
            <View style={styles.slotStat}>
              <Text style={[styles.slotStatValue, { color: colors.foreground }]}>{taskSlots?.extraSlotsUnlocked ?? user?.extraSlotsUnlocked ?? 0}</Text>
              <Text style={[styles.slotStatLabel, { color: colors.mutedForeground }]}>Extra</Text>
            </View>
            <View style={styles.slotStat}>
              <Text style={[styles.slotStatValue, { color: colors.foreground }]}>{taskSlots?.energyBalance ?? user?.energyBalance ?? 0}</Text>
              <Text style={[styles.slotStatLabel, { color: colors.mutedForeground }]}>Energy</Text>
            </View>
          </View>
          <Pressable
            onPress={handleUnlockSlot}
            disabled={unlockDisabled}
            style={[styles.unlockBtn, { backgroundColor: unlockDisabled ? colors.border : colors.gold, opacity: unlockingSlot ? 0.7 : 1 }]}
          >
            {unlockingSlot ? <ActivityIndicator size="small" color="#120900" /> : <Feather name="zap" size={14} color={unlockDisabled ? colors.mutedForeground : "#120900"} />}
            <Text style={[styles.unlockBtnText, { color: unlockDisabled ? colors.mutedForeground : "#120900" }]} numberOfLines={1}>{unlockingSlot ? "Unlocking..." : unlockLabel}</Text>
          </Pressable>
          {taskSlotMessage ? <Text style={[styles.slotMessage, { color: taskSlotMessage.toLowerCase().includes("unable") || taskSlotMessage.toLowerCase().includes("need") ? colors.destructive : colors.mutedForeground }]}>{taskSlotMessage}</Text> : null}
        </View>

        <View style={styles.cardsContainer}>
          {visibleCategories.length === 0 ? (
            <View style={[styles.emptyCard, { backgroundColor: colors.card, borderColor: colors.border }]}> 
              <Feather name="filter" size={32} color={colors.mutedForeground} />
              <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>No tasks in this filter yet</Text>
            </View>
          ) : visibleCategories.map((cat) => {
            const lockedBySlot = cat.rewardType === "pending_coins" && Boolean(taskSlots?.locked);
            const disabled = cat.status === "coming_soon" || lockedBySlot;
            const statusLabel = cat.status === "coming_soon" ? "Coming Soon" : lockedBySlot ? "Locked" : "Open";
            const statusColor = cat.status === "coming_soon" ? "#D1D5DB" : lockedBySlot ? "#FBBF24" : "#6EE7B7";
            const statusBg = cat.status === "coming_soon" ? "rgba(156,163,175,0.2)" : lockedBySlot ? "rgba(251,191,36,0.2)" : "rgba(16,185,129,0.2)";
            return (
              <Pressable
                key={cat.id}
                onPress={() => openOfferwall(cat)}
                disabled={disabled}
                style={({ pressed }) => ({ opacity: pressed ? 0.9 : disabled ? 0.58 : 1 })}
              >
                <LinearGradient colors={cat.gradient} style={[styles.card, { borderColor: cat.gradient[0] + "40" }]}> 
                  <View style={styles.cardTop}>
                    <View style={styles.cardIconWrap}>
                      <Feather name={lockedBySlot ? "lock" : cat.icon} size={19} color="#fff" />
                    </View>
                    <View style={styles.cardTextWrap}>
                      <Text style={styles.cardTitle} numberOfLines={1}>{cat.title}</Text>
                      <Text style={styles.cardSubtitle} numberOfLines={2}>{lockedBySlot ? `Unlock 1 more task with ${taskSlots?.energyPerExtraSlot ?? 10} Energy.` : cat.subtitle}</Text>
                    </View>
                  </View>
                  <View style={styles.cardBottom}>
                    <View style={[styles.badge, { backgroundColor: "rgba(255,255,255,0.15)" }]}> 
                      <Text style={styles.badgeText}>{cat.rewardType === "pending_coins" ? "Pending Coins" : "Energy"}</Text>
                    </View>
                    <View style={[styles.statusBadge, { backgroundColor: statusBg }]}> 
                      <Text style={[styles.statusText, { color: statusColor }]}>{statusLabel}</Text>
                    </View>
                  </View>
                </LinearGradient>
              </Pressable>
            );
          })}
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
  slotCard: { marginHorizontal: 16, marginBottom: 12, borderRadius: 14, borderWidth: 1, padding: 12, gap: 10 },
  slotTopRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 },
  slotTitleWrap: { flex: 1, minWidth: 0, flexDirection: "row", alignItems: "center", gap: 10 },
  slotIcon: { width: 34, height: 34, borderRadius: 11, alignItems: "center", justifyContent: "center" },
  slotTitle: { fontFamily: "Inter_700Bold", fontSize: 14, lineHeight: 18 },
  slotSub: { fontFamily: "Inter_400Regular", fontSize: 11, lineHeight: 15, marginTop: 1 },
  slotCounter: { fontFamily: "Inter_800ExtraBold", fontSize: 18, lineHeight: 22 },
  progressTrack: { height: 7, borderRadius: 999, overflow: "hidden" },
  progressFill: { height: 7, borderRadius: 999 },
  slotStatsRow: { flexDirection: "row", gap: 8 },
  slotStat: { flex: 1, minHeight: 48, borderRadius: 11, backgroundColor: "rgba(255,255,255,0.05)", alignItems: "center", justifyContent: "center", paddingVertical: 6 },
  slotStatValue: { fontFamily: "Inter_800ExtraBold", fontSize: 15, lineHeight: 18 },
  slotStatLabel: { fontFamily: "Inter_600SemiBold", fontSize: 10, lineHeight: 13, marginTop: 2 },
  unlockBtn: { minHeight: 38, borderRadius: 12, paddingHorizontal: 12, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7 },
  unlockBtnText: { flexShrink: 1, fontFamily: "Inter_800ExtraBold", fontSize: 12, lineHeight: 16, textAlign: "center" },
  slotMessage: { fontFamily: "Inter_600SemiBold", fontSize: 11, lineHeight: 15, textAlign: "center" },
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
