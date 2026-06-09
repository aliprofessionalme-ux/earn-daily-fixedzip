import { Feather } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";

import { useColors } from "@/hooks/useColors";
import { useTheme } from "@/contexts/ThemeContext";
import { useUser } from "@/contexts/UserContext";
import { getAppSettings, getWithdrawals, type WithdrawalDocument } from "@/services/api";
import { CompactStatCard } from "@/components/CompactStatCard";

const PAYMENT_METHODS = ["Easypaisa", "JazzCash"] as const;
const FALLBACK_MIN_WITHDRAWAL_PKR = 500;
type PaymentMethod = (typeof PAYMENT_METHODS)[number];
type WithdrawalFilter = "all" | WithdrawalDocument["status"];

const HISTORY_FILTERS: Array<{ id: WithdrawalFilter; label: string }> = [
  { id: "all", label: "All" },
  { id: "pending", label: "Pending" },
  { id: "review", label: "Review" },
  { id: "approved", label: "Approved" },
  { id: "paid", label: "Paid" },
  { id: "rejected", label: "Rejected" },
];

function formatPKR(n: number) {
  return "PKR " + Number(n || 0).toFixed(2);
}

function formatDate(ts: string | null | undefined): string {
  if (!ts) return "-";
  try {
    return new Date(ts).toLocaleDateString("en-PK", { day: "numeric", month: "short", year: "numeric" });
  } catch { return "-"; }
}

function todayKey() {
  try { return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Karachi" }); }
  catch { return new Date().toISOString().split("T")[0]; }
}

function statusLabel(status: string) {
  if (status === "pending") return "Pending Review";
  if (status === "review") return "In Review";
  if (status === "approved") return "Approved";
  if (status === "paid") return "Paid";
  if (status === "rejected") return "Rejected";
  return status.charAt(0).toUpperCase() + status.slice(1);
}

function StatusBadge({ status }: { status: string }) {
  const colors = useColors();
  const palette = status === "paid" || status === "approved" ? colors.green : status === "rejected" ? colors.destructive : colors.gold;
  return (
    <View style={[styles.badge, { backgroundColor: palette + "20", borderColor: palette + "44" }]}> 
      <Text style={[styles.badgeText, { color: palette }]}>{statusLabel(status)}</Text>
    </View>
  );
}

function timelineActiveIndex(status: WithdrawalDocument["status"]) {
  if (status === "approved") return 2;
  if (status === "paid") return 3;
  if (status === "rejected") return 2;
  return 1;
}

function WithdrawalTimeline({ item }: { item: WithdrawalDocument }) {
  const colors = useColors();
  const rejected = item.status === "rejected";
  const steps = rejected
    ? [
        { key: "requested", label: "Requested", date: item.createdAt, icon: "send" as const },
        { key: "review", label: "Review", date: item.processedAt, icon: "eye" as const },
        { key: "rejected", label: "Rejected", date: item.processedAt ?? item.updatedAt, icon: "x-circle" as const },
      ]
    : [
        { key: "requested", label: "Requested", date: item.createdAt, icon: "send" as const },
        { key: "review", label: "Review", date: item.status === "pending" || item.status === "review" ? item.updatedAt : item.processedAt, icon: "eye" as const },
        { key: "approved", label: "Approved", date: item.processedAt, icon: "check-circle" as const },
        { key: "paid", label: "Paid", date: item.paidAt, icon: "credit-card" as const },
      ];
  const activeIndex = timelineActiveIndex(item.status);

  return (
    <View style={[styles.timeline, { borderTopColor: colors.border }]}> 
      {steps.map((step, index) => {
        const done = index < activeIndex;
        const current = index === activeIndex;
        const waiting = index > activeIndex;
        const palette = step.key === "rejected" ? colors.destructive : done ? colors.green : current ? colors.gold : colors.mutedForeground;
        return (
          <View key={step.key} style={styles.timelineItem}> 
            <View style={styles.timelineRail}> 
              <View style={[styles.timelineDot, { backgroundColor: palette + (waiting ? "22" : "33"), borderColor: palette }]}> 
                <Feather name={step.icon} size={12} color={palette} />
              </View>
              {index < steps.length - 1 ? <View style={[styles.timelineLine, { backgroundColor: done ? colors.green + "66" : colors.border }]} /> : null}
            </View>
            <View style={styles.timelineTextWrap}>
              <Text style={[styles.timelineLabel, { color: current ? palette : colors.foreground }]}>{step.label}</Text>
              <Text style={[styles.timelineDate, { color: colors.mutedForeground }]}> 
                {step.date ? formatDate(step.date) : current ? "Now" : "Next"}
              </Text>
            </View>
          </View>
        );
      })}
    </View>
  );
}

export default function WalletScreen() {
  const colors = useColors();
  const { themeKey } = useTheme();
  const insets = useSafeAreaInsets();
  const { deviceId, user, submitWithdrawal } = useUser();

  const [activeTab, setActiveTab] = useState<"withdraw" | "history">("withdraw");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("Easypaisa");
  const [accountNumber, setAccountNumber] = useState("");
  const [accountTitle, setAccountTitle] = useState("");
  const [amountPKR, setAmountPKR] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<{ text: string; ok: boolean } | null>(null);
  const [history, setHistory] = useState<WithdrawalDocument[]>([]);
  const [historyFilter, setHistoryFilter] = useState<WithdrawalFilter>("all");
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [minWithdrawal, setMinWithdrawal] = useState<number>(0);
  const [coinRate, setCoinRate] = useState({ coins: 1000, pkr: 20 });

  const isDaylight = themeKey === "daylight";
  const headerGradient = useMemo(
    () => isDaylight ? ["#FFFDF8", "#EAF8FF"] as [string, string] : ["#064E3B", "#0D0D1A"] as [string, string],
    [isDaylight],
  );
  const statCardGradients = useMemo(
    () => isDaylight
      ? {
          confirmed: ["#EAFBF1", "#FFFFFF"] as [string, string],
          pending: ["#FFF1E8", "#FFFFFF"] as [string, string],
          energy: ["#FFF8DB", "#FFFFFF"] as [string, string],
        }
      : {
          confirmed: ["rgba(255,255,255,0.10)", "rgba(255,255,255,0.04)"] as [string, string],
          pending: ["rgba(255,255,255,0.10)", "rgba(255,255,255,0.04)"] as [string, string],
          energy: ["rgba(255,255,255,0.10)", "rgba(255,255,255,0.04)"] as [string, string],
        },
    [isDaylight],
  );
  const activeButtonText = isDaylight ? "#05131F" : "#FFFFFF";
  const submitGradient = isDaylight ? [colors.primary, "#0284C7"] as [string, string] : [colors.primary, colors.purpleDark] as [string, string];

  const topPad = Platform.OS === "web" ? 20 : insets.top;
  const confirmed = user?.confirmedCoinsBalance ?? user?.coinsBalance ?? 0;
  const pending = user?.pendingCoinsBalance ?? 0;
  const energy = user?.energyBalance ?? 0;
  const pkr = user?.pkrBalance ?? 0;
  const today = todayKey();
  const tasksToday = user?.lastDailyTaskDate === today ? user?.dailyTasksCompletedToday ?? 0 : 0;
  const streakActive = user?.lastDailyTaskDate === today && (user?.currentDailyStreak ?? 0) >= 1;
  const withdrawalReady = streakActive && tasksToday >= 5;
  const filteredHistory = useMemo(
    () => historyFilter === "all" ? history : history.filter((item) => item.status === historyFilter),
    [history, historyFilter],
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const settings = await getAppSettings();
        if (!cancelled) {
          const minimum = settings.minimumWithdrawalPKR ?? settings.minWithdrawalPKR ?? 0;
          setMinWithdrawal(minimum > 0 ? minimum : FALLBACK_MIN_WITHDRAWAL_PKR);
          setCoinRate({ coins: settings.coinRateCoins || 1000, pkr: settings.coinRatePKR || 20 });
        }
      } catch { if (!cancelled) setMinWithdrawal(FALLBACK_MIN_WITHDRAWAL_PKR); }
    })();
    return () => { cancelled = true; };
  }, []);

  const loadHistory = useCallback(async () => {
    if (!deviceId) return;
    setHistoryLoading(true);
    setHistoryError(null);
    try { setHistory(await getWithdrawals(deviceId)); }
    catch (error) { setHistoryError(error instanceof Error ? error.message : "Unable to load withdrawals."); }
    finally { setHistoryLoading(false); }
  }, [deviceId]);

  useEffect(() => { if (activeTab === "history") void loadHistory(); }, [activeTab, loadHistory]);

  const handleSubmit = useCallback(async () => {
    const amount = Number(amountPKR);
    if (!withdrawalReady) {
      setMessage({ text: "Withdrawal locked. Complete 5 valid tasks today and keep today's streak active before requesting withdrawal.", ok: false });
      return;
    }
    if (!accountNumber.trim() || !accountTitle.trim() || !Number.isFinite(amount)) {
      setMessage({ text: "Enter account number, title and valid amount.", ok: false });
      return;
    }
    if (amount < (minWithdrawal || FALLBACK_MIN_WITHDRAWAL_PKR)) {
      setMessage({ text: `Minimum withdrawal is PKR ${minWithdrawal || FALLBACK_MIN_WITHDRAWAL_PKR}.`, ok: false });
      return;
    }
    setSubmitting(true);
    setMessage(null);
    try {
      const result = await submitWithdrawal({ paymentMethod, accountNumber: accountNumber.trim(), accountTitle: accountTitle.trim(), amountPKR: amount });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      setMessage({ text: result.message, ok: true });
      setAccountNumber(""); setAccountTitle(""); setAmountPKR("");
      await loadHistory();
      setActiveTab("history");
    } catch (error) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
      setMessage({ text: error instanceof Error ? error.message : "Failed to submit withdrawal.", ok: false });
    } finally {
      setSubmitting(false);
    }
  }, [accountNumber, accountTitle, amountPKR, loadHistory, paymentMethod, submitWithdrawal, minWithdrawal, withdrawalReady]);

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}> 
      <LinearGradient colors={headerGradient} style={[styles.header, { paddingTop: topPad + 10 }, isDaylight && { borderBottomColor: colors.border, borderBottomWidth: 1 }]}> 
        <Text style={[styles.headerTitle, { color: colors.foreground }]}>Wallet</Text>
        <View style={styles.statsRow}>
          <CompactStatCard icon="check-circle" label="Confirmed" value={confirmed.toLocaleString()} sub={formatPKR(pkr)} colors={statCardGradients.confirmed} accent={colors.green} />
          <CompactStatCard icon="clock" label="Pending" value={pending.toLocaleString()} sub="Not withdrawable" colors={statCardGradients.pending} accent={colors.orange} />
          <CompactStatCard icon="zap" label="Energy" value={energy.toLocaleString()} sub="App benefits" colors={statCardGradients.energy} accent={colors.gold} />
        </View>
      </LinearGradient>

      <View style={[styles.tabRow, { backgroundColor: colors.card, borderColor: colors.border }]}> 
        {(["withdraw", "history"] as const).map((tab) => (
          <Pressable key={tab} onPress={() => { setActiveTab(tab); setMessage(null); }} style={[styles.tabBtn, activeTab === tab && { backgroundColor: colors.primary }]}> 
            <Text style={[styles.tabBtnText, { color: activeTab === tab ? activeButtonText : colors.mutedForeground }]}>{tab === "withdraw" ? "Withdraw" : "History"}</Text>
          </Pressable>
        ))}
      </View>

      {activeTab === "withdraw" ? (
        <ScrollView contentContainerStyle={[styles.form, { paddingBottom: Platform.OS === "web" ? 34 : 112 }]} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <View style={[styles.requireCard, { backgroundColor: withdrawalReady ? colors.green + "12" : colors.gold + "12", borderColor: withdrawalReady ? colors.green + "35" : colors.gold + "35" }]}> 
            <Feather name={withdrawalReady ? "check-circle" : "lock"} size={17} color={withdrawalReady ? colors.green : colors.gold} />
            <View style={{ flex: 1 }}>
              <Text style={[styles.requireTitle, { color: withdrawalReady ? colors.green : colors.gold }]}>{withdrawalReady ? "Withdrawal unlocked today" : "Withdrawal locked today"}</Text>
              <Text style={[styles.requireText, { color: colors.mutedForeground }]}>Daily streak: {streakActive ? "Active" : "Not active"} - Tasks: {Math.min(tasksToday, 5)}/5</Text>
            </View>
          </View>

          {pending > 0 && (
            <View style={[styles.infoBanner, { backgroundColor: colors.orange + "12", borderColor: colors.orange + "28" }]}> 
              <Feather name="clock" size={16} color={colors.orange} />
              <Text style={[styles.infoBannerText, { color: colors.orange }]}> 
                {pending.toLocaleString()} pending coins under verification. Only confirmed coins can be withdrawn.
              </Text>
            </View>
          )}

          <Text style={[styles.label, { color: colors.mutedForeground }]}>Payment Method</Text>
          <View style={styles.methodRow}>
            {PAYMENT_METHODS.map((m) => (
              <Pressable key={m} onPress={() => setPaymentMethod(m)} style={[styles.methodBtn, { backgroundColor: paymentMethod === m ? colors.primary : colors.card, borderColor: paymentMethod === m ? colors.primary : colors.border }]}> 
                <Text style={[styles.methodBtnText, { color: paymentMethod === m ? activeButtonText : colors.mutedForeground }]}>{m}</Text>
              </Pressable>
            ))}
          </View>

          <Text style={[styles.label, { color: colors.mutedForeground }]}>Account Number</Text>
          <TextInput value={accountNumber} onChangeText={setAccountNumber} placeholder="03xxxxxxxxx" placeholderTextColor={colors.mutedForeground} keyboardType="phone-pad" style={[styles.input, { backgroundColor: colors.card, borderColor: colors.border, color: colors.foreground }]} />

          <Text style={[styles.label, { color: colors.mutedForeground }]}>Account Title</Text>
          <TextInput value={accountTitle} onChangeText={setAccountTitle} placeholder="Your full name" placeholderTextColor={colors.mutedForeground} style={[styles.input, { backgroundColor: colors.card, borderColor: colors.border, color: colors.foreground }]} />

          <Text style={[styles.label, { color: colors.mutedForeground }]}>Amount (PKR)</Text>
          <TextInput value={amountPKR} onChangeText={setAmountPKR} placeholder={String(minWithdrawal || FALLBACK_MIN_WITHDRAWAL_PKR)} placeholderTextColor={colors.mutedForeground} keyboardType="number-pad" style={[styles.input, { backgroundColor: colors.card, borderColor: colors.border, color: colors.foreground }]} />

          {message ? <Text style={[styles.msgText, { color: message.ok ? colors.green : colors.destructive }]}>{message.text}</Text> : null}

          <Pressable disabled={submitting} onPress={handleSubmit} style={({ pressed }) => [{ opacity: pressed ? 0.86 : submitting ? 0.65 : 1 }]}> 
            <LinearGradient colors={submitGradient} style={styles.submitBtn}> 
              {submitting ? <ActivityIndicator color="#fff" /> : <Feather name="send" size={18} color="#fff" />}
              <Text style={styles.submitBtnText}>{submitting ? "Submitting..." : "Submit Withdrawal"}</Text>
            </LinearGradient>
          </Pressable>

          <View style={[styles.rulesCard, { backgroundColor: colors.card, borderColor: colors.border }]}> 
            <View style={styles.rulesHeader}>
              <Feather name="shield" size={16} color={colors.gold} />
              <Text style={[styles.rulesTitle, { color: colors.foreground }]}>Withdrawal rules</Text>
            </View>
            <Text style={[styles.ruleText, { color: colors.mutedForeground }]}>Complete 5 valid daily tasks and keep today's streak active before requesting withdrawal.</Text>
            <Text style={[styles.ruleText, { color: colors.mutedForeground }]}>Minimum withdrawal is PKR {minWithdrawal || FALLBACK_MIN_WITHDRAWAL_PKR}.</Text>
            <Text style={[styles.ruleText, { color: colors.mutedForeground }]}>Only confirmed coins are withdrawable.</Text>
            <Text style={[styles.ruleText, { color: colors.mutedForeground }]}>Rate: {coinRate.coins.toLocaleString()} confirmed coins = PKR {coinRate.pkr}.</Text>
            <Text style={[styles.ruleText, { color: colors.mutedForeground }]}>If you earn this month and submit a withdrawal request, payout is scheduled for next month.</Text>
            <Text style={[styles.ruleText, { color: colors.mutedForeground }]}>Reason for delay: advertiser payments arrive late, so withdrawals are paid after advertiser settlement.</Text>
            <Text style={[styles.ruleText, { color: colors.mutedForeground }]}>Rejected withdrawals show the admin reason and refund held coins when applicable.</Text>
          </View>
        </ScrollView>
      ) : (
        <View style={{ flex: 1 }}>
          {historyLoading ? (
            <View style={styles.center}><ActivityIndicator color={colors.primary} /><Text style={[styles.emptyText, { color: colors.mutedForeground }]}>Loading withdrawals...</Text></View>
          ) : historyError ? (
            <View style={styles.center}>
              <Feather name="alert-circle" size={42} color={colors.destructive} />
              <Text style={[styles.emptyText, { color: colors.destructive }]}>{historyError}</Text>
              <Pressable onPress={loadHistory} style={[styles.retrySmall, { backgroundColor: colors.primary }]}> 
                <Text style={styles.retrySmallText}>Retry</Text>
              </Pressable>
            </View>
          ) : history.length === 0 ? (
            <View style={styles.center}><Feather name="inbox" size={48} color={colors.mutedForeground} /><Text style={[styles.emptyText, { color: colors.mutedForeground }]}>No withdrawals yet</Text></View>
          ) : (
            <>
              <View style={styles.historyFilterWrap}>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.historyFilterRow}>
                  {HISTORY_FILTERS.map((filter) => {
                    const active = historyFilter === filter.id;
                    return (
                      <Pressable key={filter.id} onPress={() => setHistoryFilter(filter.id)} style={[styles.historyFilterChip, { backgroundColor: active ? colors.gold : colors.card, borderColor: active ? colors.gold : colors.border }]}> 
                        <Text style={[styles.historyFilterText, { color: active ? "#120900" : colors.mutedForeground }]}>{filter.label}</Text>
                      </Pressable>
                    );
                  })}
                </ScrollView>
              </View>
              {filteredHistory.length === 0 ? (
                <View style={styles.center}><Feather name="filter" size={42} color={colors.mutedForeground} /><Text style={[styles.emptyText, { color: colors.mutedForeground }]}>No withdrawals in this filter</Text></View>
              ) : (
                <FlatList
                  data={filteredHistory}
                  keyExtractor={(item) => item.withdrawalId}
                  contentContainerStyle={{ padding: 16, paddingTop: 8, paddingBottom: Platform.OS === "web" ? 34 : 112 }}
                  showsVerticalScrollIndicator={false}
                  renderItem={({ item }) => (
                    <View style={[styles.historyItem, { backgroundColor: colors.card, borderColor: colors.border }]}> 
                      <View style={styles.historyTop}>
                        <View style={styles.historyLeft}>
                          <Text style={[styles.historyMethod, { color: colors.foreground }]}>{item.paymentMethod}</Text>
                          <Text style={[styles.historyAccount, { color: colors.mutedForeground }]}>{item.accountNumber} - {item.accountTitle}</Text>
                          <Text style={[styles.historyDate, { color: colors.mutedForeground }]}>Requested: {formatDate(item.createdAt)}</Text>
                          {item.processedAt ? <Text style={[styles.historyDate, { color: colors.mutedForeground }]}>Updated: {formatDate(item.processedAt)}</Text> : null}
                          {item.rejectionReason ? <Text style={[styles.reason, { color: colors.destructive }]}>Reason: {item.rejectionReason}</Text> : null}
                          {item.adminNote ? <Text style={[styles.reason, { color: colors.gold }]}>Admin note: {item.adminNote}</Text> : null}
                        </View>
                        <View style={styles.historyRight}>
                          <Text style={[styles.historyAmount, { color: colors.green }]}>{formatPKR(item.amountPKR)}</Text>
                          <StatusBadge status={item.status} />
                        </View>
                      </View>
                      <WithdrawalTimeline item={item} />
                    </View>
                  )}
                />
              )}
            </>
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { paddingHorizontal: 14, paddingTop: 14, paddingBottom: 12, gap: 9 },
  headerTitle: { fontFamily: "Inter_700Bold", fontSize: 22, lineHeight: 28 },
  statsRow: { flexDirection: "row", gap: 7 },
  tabRow: { flexDirection: "row", margin: 16, marginBottom: 0, borderRadius: 14, borderWidth: 1, padding: 3 },
  tabBtn: { flex: 1, padding: 8, borderRadius: 10, alignItems: "center" },
  tabBtnText: { fontFamily: "Inter_700Bold", fontSize: 13, lineHeight: 17 },
  form: { padding: 16, gap: 6 },
  requireCard: { flexDirection: "row", alignItems: "flex-start", gap: 9, padding: 12, borderRadius: 12, borderWidth: 1, marginBottom: 4 },
  requireTitle: { fontFamily: "Inter_700Bold", fontSize: 13, lineHeight: 17 },
  requireText: { fontFamily: "Inter_400Regular", fontSize: 11, lineHeight: 16, marginTop: 2 },
  infoBanner: { flexDirection: "row", alignItems: "flex-start", gap: 8, padding: 12, borderRadius: 12, borderWidth: 1, marginBottom: 4 },
  infoBannerText: { fontFamily: "Inter_500Medium", fontSize: 11, lineHeight: 16, flex: 1 },
  label: { fontFamily: "Inter_600SemiBold", fontSize: 12, lineHeight: 16, marginTop: 6 },
  input: { borderWidth: 1, borderRadius: 12, padding: 12, fontFamily: "Inter_400Regular", fontSize: 14, lineHeight: 18 },
  methodRow: { flexDirection: "row", gap: 10 },
  methodBtn: { flex: 1, padding: 12, borderRadius: 12, borderWidth: 1, alignItems: "center" },
  methodBtnText: { fontFamily: "Inter_700Bold", fontSize: 14, lineHeight: 18 },
  msgText: { fontFamily: "Inter_600SemiBold", fontSize: 13, lineHeight: 17, textAlign: "center", marginTop: 6 },
  submitBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, padding: 14, borderRadius: 14, marginTop: 12 },
  submitBtnText: { fontFamily: "Inter_700Bold", fontSize: 15, lineHeight: 19, color: "#fff" },
  rulesCard: { marginTop: 14, borderRadius: 16, borderWidth: 1, padding: 14, gap: 5 },
  rulesHeader: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 2 },
  rulesTitle: { fontFamily: "Inter_700Bold", fontSize: 14, lineHeight: 18 },
  ruleText: { fontFamily: "Inter_400Regular", fontSize: 12, lineHeight: 17 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12, padding: 24 },
  emptyText: { fontFamily: "Inter_500Medium", fontSize: 14, lineHeight: 18, textAlign: "center" },
  retrySmall: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 12 },
  retrySmallText: { color: "#fff", fontFamily: "Inter_700Bold", fontSize: 13, lineHeight: 17 },
  historyFilterWrap: { paddingTop: 12 },
  historyFilterRow: { paddingHorizontal: 16, gap: 8 },
  historyFilterChip: { minHeight: 34, borderRadius: 999, borderWidth: 1, paddingHorizontal: 12, alignItems: "center", justifyContent: "center" },
  historyFilterText: { fontFamily: "Inter_700Bold", fontSize: 11, lineHeight: 15 },
  historyItem: { padding: 14, borderRadius: 16, borderWidth: 1, marginBottom: 10, gap: 12 },
  historyTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", gap: 10 },
  historyLeft: { flex: 1, gap: 2, minWidth: 0 },
  historyRight: { alignItems: "flex-end", gap: 6 },
  historyMethod: { fontFamily: "Inter_700Bold", fontSize: 15, lineHeight: 19 },
  historyAccount: { fontFamily: "Inter_400Regular", fontSize: 12, lineHeight: 16 },
  historyDate: { fontFamily: "Inter_400Regular", fontSize: 11, lineHeight: 15 },
  reason: { fontFamily: "Inter_600SemiBold", fontSize: 11, lineHeight: 16, marginTop: 2 },
  historyAmount: { fontFamily: "Inter_700Bold", fontSize: 15, lineHeight: 19 },
  badge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20, borderWidth: 1 },
  badgeText: { fontFamily: "Inter_700Bold", fontSize: 11, lineHeight: 15 },
  timeline: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: "rgba(255,255,255,0.10)", paddingTop: 10, gap: 0 },
  timelineItem: { flexDirection: "row", minHeight: 42 },
  timelineRail: { width: 30, alignItems: "center" },
  timelineDot: { width: 25, height: 25, borderRadius: 13, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  timelineLine: { width: 2, flex: 1, marginTop: 2, marginBottom: 2 },
  timelineTextWrap: { flex: 1, paddingBottom: 10 },
  timelineLabel: { fontFamily: "Inter_700Bold", fontSize: 12, lineHeight: 16 },
  timelineDate: { fontFamily: "Inter_400Regular", fontSize: 10.5, lineHeight: 14, marginTop: 1 },
});
