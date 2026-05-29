import { Feather } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Image, Platform, Pressable, ScrollView, Share, StyleSheet, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";
import { useUser } from "@/contexts/UserContext";
import { applyReferralCode, getReferralSummary, type ReferralSummary } from "@/services/api";
import { SectionTitle } from "@/components/SectionTitle";

export default function ReferralScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { deviceId, refreshUser } = useUser();
  const topPad = Platform.OS === "web" ? 28 : insets.top + 8;
  const [summary, setSummary] = useState<ReferralSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [codeInput, setCodeInput] = useState("");
  const [applying, setApplying] = useState(false);
  const [notice, setNotice] = useState<{ text: string; ok: boolean } | null>(null);

  const qrUrl = useMemo(() => {
    if (!summary?.referralUrl) return "";
    return `https://api.qrserver.com/v1/create-qr-code/?size=240x240&data=${encodeURIComponent(summary.referralUrl)}`;
  }, [summary?.referralUrl]);

  const load = useCallback(async () => {
    if (!deviceId) return;
    setLoading(true); setError(null);
    try { setSummary(await getReferralSummary(deviceId)); }
    catch (err) { setError(err instanceof Error ? err.message : "Unable to load referral."); }
    finally { setLoading(false); }
  }, [deviceId]);

  useEffect(() => { void load(); }, [load]);

  const shareReferral = async () => {
    if (!summary) return;
    await Share.share({
      message: `Join Earn Daily with my referral code ${summary.referralCode}. Bonus unlocks after 5 tasks and 5 Energy. ${summary.referralUrl}`,
    }).catch(() => {});
  };

  const submitReferral = async () => {
    if (!deviceId) return;
    if (codeInput.trim().length < 4) { setNotice({ text: "Enter a valid referral code.", ok: false }); return; }
    setApplying(true); setNotice(null);
    try {
      const result = await applyReferralCode(deviceId, codeInput.trim());
      setCodeInput("");
      setNotice({ text: result.message, ok: true });
      await refreshUser();
      await load();
    } catch (err) {
      setNotice({ text: err instanceof Error ? err.message : "Unable to apply referral.", ok: false });
    } finally {
      setApplying(false);
    }
  };

  return (
    <View style={[styles.root, { backgroundColor: colors.background, paddingTop: topPad }]}> 
      <LinearGradient colors={["#1A0A3A", "#0D0D1A"]} style={StyleSheet.absoluteFillObject} />
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={[styles.back, { backgroundColor: colors.card, borderColor: colors.border }]}> 
          <Feather name="arrow-left" size={20} color={colors.foreground} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={[styles.title, { color: colors.foreground }]}>Referral QR</Text>
          <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>Share, scan and track qualified bonuses</Text>
        </View>
        <Pressable onPress={() => void load()} style={[styles.back, { backgroundColor: colors.card, borderColor: colors.border }]}> 
          <Feather name="refresh-cw" size={18} color={colors.mutedForeground} />
        </Pressable>
      </View>

      {loading ? (
        <View style={styles.center}><ActivityIndicator color={colors.gold} /><Text style={[styles.empty, { color: colors.mutedForeground }]}>Loading referral...</Text></View>
      ) : error ? (
        <View style={styles.center}>
          <Feather name="alert-circle" size={42} color={colors.destructive} />
          <Text style={[styles.empty, { color: colors.destructive }]}>{error}</Text>
          <Pressable onPress={load} style={[styles.retry, { backgroundColor: colors.primary }]}><Text style={styles.retryText}>Retry</Text></Pressable>
        </View>
      ) : summary ? (
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: Platform.OS === "web" ? 34 : 112 }} showsVerticalScrollIndicator={false}>
          <View style={[styles.qrCard, { backgroundColor: colors.card, borderColor: colors.border }]}> 
            <View style={[styles.qrBox, { backgroundColor: "#fff" }]}>
              {qrUrl ? <Image source={{ uri: qrUrl }} style={styles.qrImage} /> : null}
            </View>
            <Text style={[styles.codeLabel, { color: colors.mutedForeground }]}>Your referral code</Text>
            <Text style={[styles.code, { color: colors.gold }]}>{summary.referralCode}</Text>
            <Pressable onPress={shareReferral} style={[styles.shareBtn, { backgroundColor: colors.primary }]}> 
              <Feather name="share-2" size={18} color="#fff" />
              <Text style={styles.shareText}>Share Referral</Text>
            </Pressable>
          </View>

          <View style={styles.statsRow}>
            <View style={[styles.stat, { backgroundColor: colors.card, borderColor: colors.border }]}> 
              <Text style={[styles.statValue, { color: colors.foreground }]}>{summary.totalReferred}</Text>
              <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>Referred</Text>
            </View>
            <View style={[styles.stat, { backgroundColor: colors.card, borderColor: colors.border }]}> 
              <Text style={[styles.statValue, { color: colors.green }]}>{summary.qualifiedReferrals}</Text>
              <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>Qualified</Text>
            </View>
            <View style={[styles.stat, { backgroundColor: colors.card, borderColor: colors.border }]}> 
              <Text style={[styles.statValue, { color: colors.gold }]}>{summary.bonusCoins}</Text>
              <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>Bonus coins</Text>
            </View>
          </View>

          <View style={[styles.ruleCard, { backgroundColor: colors.card, borderColor: colors.border }]}> 
            <View style={styles.ruleTop}>
              <Feather name="shield" size={17} color={colors.gold} />
              <Text style={[styles.ruleTitle, { color: colors.foreground }]}>Bonus rule</Text>
            </View>
            <Text style={[styles.ruleText, { color: colors.mutedForeground }]}>The referrer receives the bonus only after the referred user completes {summary.requiredTasks} valid tasks and earns {summary.requiredEnergy} Energy.</Text>
          </View>

          <SectionTitle title="Apply referral code" />
          <View style={[styles.applyCard, { backgroundColor: colors.card, borderColor: colors.border }]}> 
            <TextInput value={codeInput} onChangeText={setCodeInput} autoCapitalize="characters" placeholder="Enter referral code" placeholderTextColor={colors.mutedForeground} style={[styles.input, { backgroundColor: colors.background, borderColor: colors.border, color: colors.foreground }]} />
            <Pressable disabled={applying} onPress={submitReferral} style={[styles.applyBtn, { backgroundColor: colors.primary, opacity: applying ? 0.7 : 1 }]}> 
              {applying ? <ActivityIndicator color="#fff" /> : <Feather name="check" size={18} color="#fff" />}
              <Text style={styles.applyText}>Apply</Text>
            </Pressable>
            {notice ? <Text style={[styles.notice, { color: notice.ok ? colors.green : colors.destructive }]}>{notice.text}</Text> : null}
          </View>

          <SectionTitle title="Referral list" />
          {summary.referredUsers.length === 0 ? (
            <View style={[styles.emptyList, { backgroundColor: colors.card, borderColor: colors.border }]}> 
              <Feather name="users" size={34} color={colors.mutedForeground} />
              <Text style={[styles.empty, { color: colors.mutedForeground }]}>No referrals yet</Text>
            </View>
          ) : summary.referredUsers.map((item) => (
            <View key={item.maskedUserId} style={[styles.refRow, { backgroundColor: colors.card, borderColor: colors.border }]}> 
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={[styles.refName, { color: colors.foreground }]} numberOfLines={1}>{item.displayName}</Text>
                <Text style={[styles.refMeta, { color: colors.mutedForeground }]}>{item.maskedUserId} - {item.tasksToday}/5 tasks - {item.energyToday}/5 Energy</Text>
              </View>
              <View style={[styles.refBadge, { backgroundColor: (item.qualified ? colors.green : colors.gold) + "22" }]}> 
                <Text style={[styles.refBadgeText, { color: item.qualified ? colors.green : colors.gold }]}>{item.qualified ? "Qualified" : "Pending"}</Text>
              </View>
            </View>
          ))}
        </ScrollView>
      ) : null}
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
  retryText: { color: "#fff", fontFamily: "Inter_700Bold", fontSize: 13, lineHeight: 17 },
  qrCard: { borderWidth: 1, borderRadius: 18, padding: 16, alignItems: "center", marginBottom: 12 },
  qrBox: { width: 220, height: 220, borderRadius: 16, alignItems: "center", justifyContent: "center", padding: 10 },
  qrImage: { width: 200, height: 200 },
  codeLabel: { fontFamily: "Inter_500Medium", fontSize: 12, lineHeight: 16, marginTop: 12 },
  code: { fontFamily: "Inter_700Bold", fontSize: 24, lineHeight: 30, marginTop: 2, letterSpacing: 0 },
  shareBtn: { marginTop: 12, minHeight: 44, paddingHorizontal: 18, borderRadius: 14, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 },
  shareText: { color: "#fff", fontFamily: "Inter_700Bold", fontSize: 14, lineHeight: 18 },
  statsRow: { flexDirection: "row", gap: 8, marginBottom: 12 },
  stat: { flex: 1, borderWidth: 1, borderRadius: 14, padding: 12, alignItems: "center" },
  statValue: { fontFamily: "Inter_700Bold", fontSize: 18, lineHeight: 23 },
  statLabel: { fontFamily: "Inter_500Medium", fontSize: 10.5, lineHeight: 14, marginTop: 2, textAlign: "center" },
  ruleCard: { borderWidth: 1, borderRadius: 16, padding: 14, marginBottom: 14 },
  ruleTop: { flexDirection: "row", alignItems: "center", gap: 7, marginBottom: 5 },
  ruleTitle: { fontFamily: "Inter_700Bold", fontSize: 14, lineHeight: 18 },
  ruleText: { fontFamily: "Inter_400Regular", fontSize: 12, lineHeight: 18 },
  applyCard: { borderWidth: 1, borderRadius: 16, padding: 12, gap: 8, marginBottom: 14 },
  input: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 11, fontFamily: "Inter_600SemiBold", fontSize: 14, lineHeight: 18 },
  applyBtn: { minHeight: 44, borderRadius: 12, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 },
  applyText: { color: "#fff", fontFamily: "Inter_700Bold", fontSize: 14, lineHeight: 18 },
  notice: { fontFamily: "Inter_600SemiBold", fontSize: 12, lineHeight: 16, textAlign: "center" },
  emptyList: { borderWidth: 1, borderRadius: 16, padding: 20, alignItems: "center", gap: 8 },
  refRow: { borderWidth: 1, borderRadius: 14, padding: 12, marginBottom: 8, flexDirection: "row", alignItems: "center", gap: 10 },
  refName: { fontFamily: "Inter_700Bold", fontSize: 14, lineHeight: 18 },
  refMeta: { fontFamily: "Inter_400Regular", fontSize: 11, lineHeight: 16, marginTop: 2 },
  refBadge: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999 },
  refBadgeText: { fontFamily: "Inter_700Bold", fontSize: 11, lineHeight: 15 },
});
