import { Feather } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import React, { useCallback, useEffect, useState } from "react";
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
import { useUser } from "@/contexts/UserContext";
import { getAppSettings, getWithdrawals, type WithdrawalDocument } from "@/services/api";
import { CompactStatCard } from "@/components/CompactStatCard";
import { SectionTitle } from "@/components/SectionTitle";

const PAYMENT_METHODS = ["Easypaisa", "JazzCash"] as const;
const FALLBACK_MIN_WITHDRAWAL_PKR = 500;
type PaymentMethod = (typeof PAYMENT_METHODS)[number];

function formatPKR(n: number) {
  return "PKR " + Number(n || 0).toFixed(2);
}

function formatDate(ts: string | null | undefined): string {
  if (!ts) return "—";
  try {
    return new Date(ts).toLocaleDateString("en-PK", { day: "numeric", month: "short", year: "numeric" });
  } catch { return "—"; }
}

function StatusBadge({ status }: { status: string }) {
  const colors = useColors();
  const palette = status === "paid" || status === "approved" ? colors.green : status === "rejected" ? colors.destructive : colors.gold;
  return (
    <View style={[styles.badge, { backgroundColor: palette + "20", borderColor: palette + "44" }]}>
      <Text style={[styles.badgeText, { color: palette }]}>{status.charAt(0).toUpperCase() + status.slice(1)}</Text>
    </View>
  );
}

export default function WalletScreen() {
  const colors = useColors();
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
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [minWithdrawal, setMinWithdrawal] = useState<number>(0);
  const [coinRate, setCoinRate] = useState({ coins: 1000, pkr: 20 });

  const topPad = Platform.OS === "web" ? 20 : insets.top;
  const confirmed = user?.confirmedCoinsBalance ?? user?.coinsBalance ?? 0;
  const pending = user?.pendingCoinsBalance ?? 0;
  const energy = user?.energyBalance ?? 0;
  const pkr = user?.pkrBalance ?? 0;

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
    } catch (error) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
      setMessage({ text: error instanceof Error ? error.message : "Failed to submit withdrawal.", ok: false });
    } finally {
      setSubmitting(false);
    }
  }, [accountNumber, accountTitle, amountPKR, loadHistory, paymentMethod, submitWithdrawal, minWithdrawal]);

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <LinearGradient colors={["#064E3B", "#0D0D1A"]} style={[styles.header, { paddingTop: topPad + 10 }]}>
        <Text style={[styles.headerTitle, { color: colors.foreground }]}>Wallet</Text>
        <View style={styles.statsRow}>
          <CompactStatCard icon="check-circle" label="Confirmed" value={confirmed.toLocaleString()} sub={formatPKR(pkr)} colors={["rgba(255,255,255,0.10)", "rgba(255,255,255,0.04)"]} accent={colors.green} />
          <CompactStatCard icon="clock" label="Pending" value={pending.toLocaleString()} sub="Not withdrawable" colors={["rgba(255,255,255,0.10)", "rgba(255,255,255,0.04)"]} accent={colors.orange} />
          <CompactStatCard icon="zap" label="Energy" value={energy.toLocaleString()} sub="App benefits" colors={["rgba(255,255,255,0.10)", "rgba(255,255,255,0.04)"]} accent={colors.gold} />
        </View>
      </LinearGradient>

      <View style={[styles.tabRow, { backgroundColor: colors.card, borderColor: colors.border }]}>
        {(["withdraw", "history"] as const).map((tab) => (
          <Pressable key={tab} onPress={() => { setActiveTab(tab); setMessage(null); }} style={[styles.tabBtn, activeTab === tab && { backgroundColor: colors.primary }]}>
            <Text style={[styles.tabBtnText, { color: activeTab === tab ? "#fff" : colors.mutedForeground }]}>{tab === "withdraw" ? "Withdraw" : "History"}</Text>
          </Pressable>
        ))}
      </View>

      {activeTab === "withdraw" ? (
        <ScrollView contentContainerStyle={[styles.form, { paddingBottom: Platform.OS === "web" ? 34 : 112 }]} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
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
                <Text style={[styles.methodBtnText, { color: paymentMethod === m ? "#fff" : colors.mutedForeground }]}>{m}</Text>
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
            <LinearGradient colors={[colors.primary, colors.purpleDark]} style={styles.submitBtn}>
              {submitting ? <ActivityIndicator color="#fff" /> : <Feather name="send" size={18} color="#fff" />}
              <Text style={styles.submitBtnText}>{submitting ? "Submitting..." : "Submit Withdrawal"}</Text>
            </LinearGradient>
          </Pressable>

          <View style={[styles.rulesCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={styles.rulesHeader}>
              <Feather name="shield" size={16} color={colors.gold} />
              <Text style={[styles.rulesTitle, { color: colors.foreground }]}>Withdrawal rules</Text>
            </View>
            <Text style={[styles.ruleText, { color: colors.mutedForeground }]}>Minimum withdrawal is PKR {minWithdrawal || FALLBACK_MIN_WITHDRAWAL_PKR}.</Text>
            <Text style={[styles.ruleText, { color: colors.mutedForeground }]}>Only confirmed coins are withdrawable.</Text>
            <Text style={[styles.ruleText, { color: colors.mutedForeground }]}>Rate: {coinRate.coins.toLocaleString()} confirmed coins = PKR {coinRate.pkr}.</Text>
            <Text style={[styles.ruleText, { color: colors.mutedForeground }]}>Pending coins are not withdrawable until verified.</Text>
            <Text style={[styles.ruleText, { color: colors.mutedForeground }]}>Energy cannot be withdrawn.</Text>
            <Text style={[styles.ruleText, { color: colors.mutedForeground }]}>Only one pending withdrawal at a time.</Text>
            <Text style={[styles.ruleText, { color: colors.mutedForeground }]}>One withdrawal per calendar month.</Text>
            <Text style={[styles.ruleText, { color: colors.mutedForeground }]}>If rejected, confirmed coins are refunded automatically.</Text>
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
            <FlatList
              data={history}
              keyExtractor={(item) => item.withdrawalId}
              contentContainerStyle={{ padding: 16, paddingBottom: Platform.OS === "web" ? 34 : 112 }}
              showsVerticalScrollIndicator={false}
              renderItem={({ item }) => (
                <View style={[styles.historyItem, { backgroundColor: colors.card, borderColor: colors.border }]}>
                  <View style={styles.historyLeft}>
                    <Text style={[styles.historyMethod, { color: colors.foreground }]}>{item.paymentMethod}</Text>
                    <Text style={[styles.historyAccount, { color: colors.mutedForeground }]}>{item.accountNumber} · {item.accountTitle}</Text>
                    <Text style={[styles.historyDate, { color: colors.mutedForeground }]}>{formatDate(item.createdAt)}</Text>
                    {item.rejectionReason ? <Text style={[styles.historyDate, { color: colors.destructive }]}>Reason: {item.rejectionReason}</Text> : null}
                  </View>
                  <View style={styles.historyRight}>
                    <Text style={[styles.historyAmount, { color: colors.green }]}>{formatPKR(item.amountPKR)}</Text>
                    <StatusBadge status={item.status} />
                  </View>
                </View>
              )}
            />
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
  historyItem: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", padding: 14, borderRadius: 16, borderWidth: 1, marginBottom: 10, gap: 10 },
  historyLeft: { flex: 1, gap: 2 },
  historyRight: { alignItems: "flex-end", gap: 6 },
  historyMethod: { fontFamily: "Inter_700Bold", fontSize: 15, lineHeight: 19 },
  historyAccount: { fontFamily: "Inter_400Regular", fontSize: 12, lineHeight: 16 },
  historyDate: { fontFamily: "Inter_400Regular", fontSize: 11, lineHeight: 15 },
  historyAmount: { fontFamily: "Inter_700Bold", fontSize: 15, lineHeight: 19 },
  badge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20, borderWidth: 1 },
  badgeText: { fontFamily: "Inter_700Bold", fontSize: 11, lineHeight: 15 },
});
