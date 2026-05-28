import { Feather } from "@expo/vector-icons";
import { router } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, FlatList, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";
import { useUser } from "@/contexts/UserContext";
import { getTransactions, type TransactionDocument, type TransactionType } from "@/services/api";
import { SectionTitle } from "@/components/SectionTitle";

const TYPE_LABELS: Record<TransactionType, string> = {
  checkin: "Daily Check-In",
  spin: "Spin Wheel",
  scratch: "Scratch Card",
  offerwall_pending: "Pending Verification",
  offerwall_confirmed: "Confirmed Reward",
  offerwall_rejected: "Rejected Reward",
  offerwall_reversed: "Reversed Reward",
  unity_reward_energy: "Watch Ad Energy",
  unity_interstitial: "Ad Viewed",
  withdrawal_hold: "Withdrawal Hold",
  withdrawal_refund: "Withdrawal Refund",
  admin_adjustment: "Admin Adjustment",
  energy_purchase_slot: "Extra Task Slot",
};

function getStatusColor(status: string, colors: ReturnType<typeof useColors>): string {
  if (["credited", "confirmed", "approved", "paid"].includes(status)) return colors.green;
  if (["rejected", "reversed", "failed"].includes(status)) return colors.destructive;
  if (["pending", "pending_verification", "held", "manual_review_required"].includes(status)) return colors.orange;
  return colors.mutedForeground;
}

function getIconForType(type: string): React.ComponentProps<typeof Feather>["name"] {
  if (type.includes("checkin")) return "sun";
  if (type.includes("spin")) return "zap";
  if (type.includes("scratch")) return "layers";
  if (type.includes("offerwall")) return "gift";
  if (type.includes("unity")) return "film";
  if (type.includes("withdrawal")) return "credit-card";
  if (type.includes("admin")) return "settings";
  if (type.includes("energy")) return "battery";
  return "activity";
}

function formatDate(ts: string) {
  try { return new Date(ts).toLocaleString("en-PK", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }); } catch { return "—"; }
}
function signed(n: number, suffix = "") { return `${n > 0 ? "+" : ""}${n}${suffix}`; }

export default function TransactionsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { deviceId } = useUser();
  const [items, setItems] = useState<TransactionDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const topPad = Platform.OS === "web" ? 28 : insets.top + 8;

  const load = useCallback(async () => {
    if (!deviceId) return;
    setLoading(true); setError(null);
    try { setItems(await getTransactions(deviceId)); }
    catch (err) { setError(err instanceof Error ? err.message : "Unable to load transactions."); }
    finally { setLoading(false); }
  }, [deviceId]);

  useEffect(() => { void load(); }, [load]);

  return (
    <View style={[styles.root, { backgroundColor: colors.background, paddingTop: topPad }]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={[styles.back, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Feather name="arrow-left" size={20} color={colors.foreground} />
        </Pressable>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={[styles.title, { color: colors.foreground }]}>Transactions</Text>
          <Text style={[styles.subtitle, { color: colors.mutedForeground }]} numberOfLines={1}>All balance changes from rewards, offers, withdrawals and admin actions</Text>
        </View>
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} />
          <Text style={[styles.empty, { color: colors.mutedForeground }]}>Loading history...</Text>
        </View>
      ) : error ? (
        <View style={styles.center}>
          <Feather name="alert-circle" size={42} color={colors.destructive} />
          <Text style={[styles.empty, { color: colors.destructive }]}>{error}</Text>
          <Pressable onPress={load} style={[styles.retry, { backgroundColor: colors.primary }]}>
            <Text style={styles.retryText}>Retry</Text>
          </Pressable>
        </View>
      ) : items.length === 0 ? (
        <View style={styles.center}>
          <Feather name="inbox" size={46} color={colors.mutedForeground} />
          <Text style={[styles.empty, { color: colors.mutedForeground }]}>No transactions yet</Text>
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(item) => item.transactionId}
          contentContainerStyle={{ padding: 16, paddingBottom: 36 }}
          showsVerticalScrollIndicator={false}
          renderItem={({ item }) => {
            const label = TYPE_LABELS[item.type as TransactionType] || item.type.replace(/_/g, " ").replace(/\b\w/g, (m) => m.toUpperCase());
            const statusColor = getStatusColor(item.status, colors);
            const icon = getIconForType(item.type);
            const isEnergyOnly = item.coinsChange === 0 && item.pkrChange === 0;
            const energyFromMeta = item.metadata?.energyAwarded ?? item.metadata?.energyChange ?? item.metadata?.energyGiven ?? 0;

            return (
              <View style={[styles.row, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <View style={[styles.icon, { backgroundColor: statusColor + "18" }]}>
                  <Feather name={icon} size={16} color={statusColor} />
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={[styles.rowTitle, { color: colors.foreground }]} numberOfLines={1}>{label}</Text>
                  <Text style={[styles.rowSub, { color: colors.mutedForeground }]}>{formatDate(item.createdAt)} · <Text style={{ color: statusColor }}>{item.status}</Text></Text>
                  {typeof item.balanceAfterCoins === "number" ? (
                    <Text style={[styles.rowSub, { color: colors.mutedForeground }]}>Balance: {item.balanceAfterCoins.toLocaleString()} coins · PKR {Number(item.balanceAfterPKR ?? 0).toFixed(2)}</Text>
                  ) : null}
                  {item.type === "offerwall_pending" && (
                    <Text style={[styles.pendingNote, { color: colors.orange }]}>Pending rewards are under advertiser verification and are not withdrawable yet.</Text>
                  )}
                </View>
                <View style={styles.amounts}>
                  {!isEnergyOnly && item.coinsChange !== 0 && (
                    <Text style={[styles.coins, { color: item.coinsChange >= 0 ? colors.green : colors.destructive }]}>{signed(item.coinsChange)}</Text>
                  )}
                  {item.pkrChange !== 0 && (
                    <Text style={[styles.pkr, { color: colors.mutedForeground }]}>{signed(Number(item.pkrChange.toFixed(2)), " PKR")}</Text>
                  )}
                  {isEnergyOnly && energyFromMeta !== 0 && (
                    <Text style={[styles.coins, { color: colors.gold }]}>{signed(Number(energyFromMeta), " Energy")}</Text>
                  )}
                </View>
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
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12, padding: 24 },
  empty: { fontFamily: "Inter_500Medium", fontSize: 14, lineHeight: 18, textAlign: "center" },
  retry: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 12 },
  retryText: { color: "#fff", fontFamily: "Inter_700Bold", fontSize: 14, lineHeight: 18 },
  row: { borderWidth: 1, borderRadius: 16, padding: 12, marginBottom: 10, flexDirection: "row", gap: 10, alignItems: "flex-start" },
  icon: { width: 32, height: 32, borderRadius: 10, alignItems: "center", justifyContent: "center", marginTop: 2 },
  rowTitle: { fontFamily: "Inter_700Bold", fontSize: 13, lineHeight: 17 },
  rowSub: { fontFamily: "Inter_400Regular", fontSize: 11, lineHeight: 15, marginTop: 2 },
  pendingNote: { fontFamily: "Inter_500Medium", fontSize: 11, lineHeight: 15, marginTop: 4 },
  amounts: { alignItems: "flex-end", gap: 2, minWidth: 60 },
  coins: { fontFamily: "Inter_700Bold", fontSize: 14, lineHeight: 18 },
  pkr: { fontFamily: "Inter_500Medium", fontSize: 11, lineHeight: 15 },
});
