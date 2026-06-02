import { Feather } from "@expo/vector-icons";
import { router } from "expo-router";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, FlatList, Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useUser } from "@/contexts/UserContext";
import { useColors } from "@/hooks/useColors";
import { getOfferEvents, type OfferEventDocument } from "@/services/api";

type HistoryFilter = "all" | OfferEventDocument["status"];

const FILTERS: Array<{ id: HistoryFilter; label: string; icon: React.ComponentProps<typeof Feather>["name"] }> = [
  { id: "all", label: "All", icon: "grid" },
  { id: "pending_verification", label: "Pending", icon: "clock" },
  { id: "manual_review_required", label: "Review", icon: "eye" },
  { id: "confirmed", label: "Confirmed", icon: "check-circle" },
  { id: "rejected", label: "Rejected", icon: "x-circle" },
  { id: "reversed", label: "Reversed", icon: "rotate-ccw" },
];

function dateMs(value?: string | null): number {
  if (!value) return 0;
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatDate(value?: string | null): string {
  if (!value) return "-";
  try {
    return new Date(value).toLocaleString("en-PK", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
  } catch {
    return "-";
  }
}

function statusText(status: OfferEventDocument["status"]): string {
  if (status === "pending_verification") return "Pending Verification";
  if (status === "manual_review_required") return "Manual Review";
  if (status === "confirmed") return "Confirmed";
  if (status === "rejected") return "Rejected";
  if (status === "reversed") return "Reversed";
  return status;
}

function publicCategory(category: OfferEventDocument["offerCategory"]): string {
  if (category === "game") return "Game Task";
  if (category === "survey") return "Survey Reward";
  if (category === "app_install") return "App Install Task";
  if (category === "high_reward") return "High Reward Offer";
  if (category === "partner_task") return "Partner Task";
  return "Earning Task";
}

function statusColor(status: OfferEventDocument["status"], colors: ReturnType<typeof useColors>) {
  if (status === "confirmed") return colors.green;
  if (status === "rejected" || status === "reversed") return colors.destructive;
  if (status === "manual_review_required") return colors.orange;
  return colors.gold;
}

export default function TaskHistoryScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { deviceId } = useUser();
  const [items, setItems] = useState<OfferEventDocument[]>([]);
  const [filter, setFilter] = useState<HistoryFilter>("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const topPad = Platform.OS === "web" ? 28 : insets.top + 8;

  const load = useCallback(async () => {
    if (!deviceId) {
      setItems([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const loaded = await getOfferEvents(deviceId);
      setItems(loaded.sort((a, b) => dateMs(b.createdAt) - dateMs(a.createdAt)));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load task history.");
    } finally {
      setLoading(false);
    }
  }, [deviceId]);

  useEffect(() => { void load(); }, [load]);

  const visibleItems = useMemo(
    () => filter === "all" ? items : items.filter((item) => item.status === filter),
    [filter, items],
  );

  const totals = useMemo(() => {
    return items.reduce(
      (acc, item) => {
        acc.total += 1;
        if (item.status === "confirmed") acc.confirmed += item.coinsCalculated;
        if (item.status === "pending_verification" || item.status === "manual_review_required") acc.pending += item.coinsCalculated;
        return acc;
      },
      { total: 0, pending: 0, confirmed: 0 },
    );
  }, [items]);

  return (
    <View style={[styles.root, { backgroundColor: colors.background, paddingTop: topPad }]}> 
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={[styles.back, { backgroundColor: colors.card, borderColor: colors.border }]}> 
          <Feather name="arrow-left" size={20} color={colors.foreground} />
        </Pressable>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={[styles.title, { color: colors.foreground }]}>Task History</Text>
          <Text style={[styles.subtitle, { color: colors.mutedForeground }]} numberOfLines={1}>Track offer status, rewards and verification</Text>
        </View>
        <Pressable onPress={load} style={[styles.back, { backgroundColor: colors.card, borderColor: colors.border }]}> 
          <Feather name="refresh-cw" size={18} color={colors.mutedForeground} />
        </Pressable>
      </View>

      <View style={styles.summaryRow}>
        <View style={[styles.summaryCard, { backgroundColor: colors.card, borderColor: colors.border }]}> 
          <Text style={[styles.summaryValue, { color: colors.foreground }]}>{totals.total}</Text>
          <Text style={[styles.summaryLabel, { color: colors.mutedForeground }]}>Tasks</Text>
        </View>
        <View style={[styles.summaryCard, { backgroundColor: colors.card, borderColor: colors.border }]}> 
          <Text style={[styles.summaryValue, { color: colors.gold }]}>{totals.pending.toLocaleString()}</Text>
          <Text style={[styles.summaryLabel, { color: colors.mutedForeground }]}>Pending</Text>
        </View>
        <View style={[styles.summaryCard, { backgroundColor: colors.card, borderColor: colors.border }]}> 
          <Text style={[styles.summaryValue, { color: colors.green }]}>{totals.confirmed.toLocaleString()}</Text>
          <Text style={[styles.summaryLabel, { color: colors.mutedForeground }]}>Confirmed</Text>
        </View>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow}>
        {FILTERS.map((entry) => {
          const active = filter === entry.id;
          return (
            <Pressable key={entry.id} onPress={() => setFilter(entry.id)} style={[styles.filterChip, { backgroundColor: active ? colors.gold : colors.card, borderColor: active ? colors.gold : colors.border }]}> 
              <Feather name={entry.icon} size={13} color={active ? "#120900" : colors.mutedForeground} />
              <Text style={[styles.filterText, { color: active ? "#120900" : colors.mutedForeground }]}>{entry.label}</Text>
            </Pressable>
          );
        })}
      </ScrollView>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} />
          <Text style={[styles.empty, { color: colors.mutedForeground }]}>Loading task history...</Text>
        </View>
      ) : error ? (
        <View style={styles.center}>
          <Feather name="alert-circle" size={42} color={colors.destructive} />
          <Text style={[styles.empty, { color: colors.destructive }]}>{error}</Text>
          <Pressable onPress={load} style={[styles.retry, { backgroundColor: colors.primary }]}> 
            <Text style={styles.retryText}>Retry</Text>
          </Pressable>
        </View>
      ) : visibleItems.length === 0 ? (
        <View style={styles.center}>
          <Feather name="inbox" size={46} color={colors.mutedForeground} />
          <Text style={[styles.empty, { color: colors.mutedForeground }]}>No task records in this filter</Text>
        </View>
      ) : (
        <FlatList
          data={visibleItems}
          keyExtractor={(item) => item.eventId}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ padding: 16, paddingTop: 8, paddingBottom: 36 }}
          renderItem={({ item }) => {
            const accent = statusColor(item.status, colors);
            const reason = item.rejectionReason || item.reversalReason;
            const category = publicCategory(item.offerCategory);
            return (
              <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}> 
                <View style={styles.cardTop}>
                  <View style={[styles.iconWrap, { backgroundColor: accent + "18" }]}> 
                    <Feather name={item.status === "confirmed" ? "check-circle" : item.status === "rejected" || item.status === "reversed" ? "alert-triangle" : "clock"} size={17} color={accent} />
                  </View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={[styles.offerName, { color: colors.foreground }]} numberOfLines={1}>{item.offerName || category}</Text>
                    <Text style={[styles.offerSub, { color: colors.mutedForeground }]}>{category} - {formatDate(item.createdAt)}</Text>
                  </View>
                  <View style={[styles.statusBadge, { backgroundColor: accent + "18", borderColor: accent + "44" }]}> 
                    <Text style={[styles.statusText, { color: accent }]}>{statusText(item.status)}</Text>
                  </View>
                </View>
                <View style={styles.metaRow}>
                  <View style={styles.metaItem}>
                    <Text style={[styles.metaLabel, { color: colors.mutedForeground }]}>Reward</Text>
                    <Text style={[styles.metaValue, { color: colors.gold }]}>{item.coinsCalculated.toLocaleString()} coins</Text>
                  </View>
                  <View style={styles.metaItem}>
                    <Text style={[styles.metaLabel, { color: colors.mutedForeground }]}>Category</Text>
                    <Text style={[styles.metaValue, { color: colors.foreground }]} numberOfLines={1}>{category}</Text>
                  </View>
                </View>
                {item.verificationHoldUntil && item.status === "pending_verification" ? (
                  <Text style={[styles.note, { color: colors.gold }]}>Verification hold until {formatDate(item.verificationHoldUntil)}</Text>
                ) : null}
                {reason ? <Text style={[styles.note, { color: colors.destructive }]}>Reason: {reason}</Text> : null}
              </View>
            );
          }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 16, paddingBottom: 10 },
  back: { width: 40, height: 40, borderRadius: 12, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  title: { fontFamily: "Inter_700Bold", fontSize: 22, lineHeight: 28 },
  subtitle: { fontFamily: "Inter_400Regular", fontSize: 12, lineHeight: 16, marginTop: 2 },
  summaryRow: { flexDirection: "row", gap: 8, paddingHorizontal: 16, paddingBottom: 12 },
  summaryCard: { flex: 1, borderWidth: 1, borderRadius: 14, padding: 11, alignItems: "center" },
  summaryValue: { fontFamily: "Inter_700Bold", fontSize: 16, lineHeight: 21 },
  summaryLabel: { fontFamily: "Inter_500Medium", fontSize: 10.5, lineHeight: 14, marginTop: 2 },
  filterRow: { paddingHorizontal: 16, paddingBottom: 12, gap: 8 },
  filterChip: { minHeight: 34, borderRadius: 999, borderWidth: 1, paddingHorizontal: 12, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6 },
  filterText: { fontFamily: "Inter_700Bold", fontSize: 11, lineHeight: 15 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12, padding: 24 },
  empty: { fontFamily: "Inter_500Medium", fontSize: 14, lineHeight: 18, textAlign: "center" },
  retry: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 12 },
  retryText: { color: "#fff", fontFamily: "Inter_700Bold", fontSize: 13, lineHeight: 17 },
  card: { borderWidth: 1, borderRadius: 16, padding: 12, marginBottom: 10, gap: 10 },
  cardTop: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
  iconWrap: { width: 34, height: 34, borderRadius: 11, alignItems: "center", justifyContent: "center", marginTop: 2 },
  offerName: { fontFamily: "Inter_700Bold", fontSize: 14, lineHeight: 18 },
  offerSub: { fontFamily: "Inter_400Regular", fontSize: 11, lineHeight: 16, marginTop: 2 },
  statusBadge: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 4, maxWidth: 102 },
  statusText: { fontFamily: "Inter_700Bold", fontSize: 10, lineHeight: 14, textAlign: "center" },
  metaRow: { flexDirection: "row", gap: 8 },
  metaItem: { flex: 1, borderRadius: 12, backgroundColor: "rgba(255,255,255,0.04)", padding: 10 },
  metaLabel: { fontFamily: "Inter_500Medium", fontSize: 10.5, lineHeight: 14 },
  metaValue: { fontFamily: "Inter_700Bold", fontSize: 12, lineHeight: 16, marginTop: 2 },
  note: { fontFamily: "Inter_600SemiBold", fontSize: 11, lineHeight: 16 },
});
