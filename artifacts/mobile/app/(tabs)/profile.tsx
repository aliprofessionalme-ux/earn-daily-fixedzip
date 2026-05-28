import { Feather } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import React from "react";
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";
import { useUser } from "@/contexts/UserContext";
import { CompactStatCard } from "@/components/CompactStatCard";
import { SectionTitle } from "@/components/SectionTitle";

function truncate(value?: string | null) {
  if (!value) return "—";
  return value.length > 22 ? `${value.slice(0, 10)}…${value.slice(-8)}` : value;
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
  const { user, deviceId, installId, firebaseUid, authMode, authVerified, refreshUser } = useUser();
  const topPad = Platform.OS === "web" ? 20 : insets.top;

  const energy = user?.energyBalance ?? 0;
  const pending = user?.pendingCoinsBalance ?? 0;
  const confirmed = user?.confirmedCoinsBalance ?? user?.coinsBalance ?? 0;
  const pkr = user?.pkrBalance ?? 0;

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <LinearGradient colors={["#1A0A3A", "#0D0D1A"]} style={StyleSheet.absoluteFillObject} />
      <ScrollView contentContainerStyle={{ paddingTop: topPad + 14, paddingBottom: Platform.OS === "web" ? 34 : 112, paddingHorizontal: 16 }} showsVerticalScrollIndicator={false}>
        <View style={styles.headerRow}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.title, { color: colors.foreground }]}>Profile</Text>
            <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>Account, wallet and support tools</Text>
          </View>
          <Pressable onPress={() => void refreshUser()} style={[styles.refresh, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Feather name="refresh-cw" size={18} color={colors.mutedForeground} />
          </Pressable>
        </View>

        {/* Balance summary */}
        <View style={styles.balanceRow}>
          <CompactStatCard icon="zap" label="Energy" value={energy.toLocaleString()} sub="App benefits" colors={["rgba(255,255,255,0.08)", "rgba(255,255,255,0.03)"]} accent={colors.gold} />
          <CompactStatCard icon="clock" label="Pending" value={pending.toLocaleString()} sub="Under verification" colors={["rgba(255,255,255,0.08)", "rgba(255,255,255,0.03)"]} accent={colors.orange} />
          <CompactStatCard icon="check-circle" label="Confirmed" value={confirmed.toLocaleString()} sub={formatPKR(pkr)} colors={["rgba(255,255,255,0.08)", "rgba(255,255,255,0.03)"]} accent={colors.green} />
        </View>

        {/* Account status */}
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
                  : `${authMode === "firebase-anonymous" ? "Firebase anonymous auth" : "Device-only fallback"} · ${authVerified ? "verified" : "not verified"}`}
              </Text>
            </View>
          </View>
        </View>

        {/* Account info */}
        <View style={styles.section}>
          <SectionTitle title="Account info" />
          <View style={[styles.infoCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <InfoRow label="Device ID" value={truncate(deviceId)} />
            <InfoRow label="Install ID" value={truncate(installId)} />
            <InfoRow label="Firebase UID" value={truncate(firebaseUid ?? user?.firebaseUid)} />
            <InfoRow label="Auth mode" value={authMode} />
          </View>
        </View>

        {/* Account tools */}
        <View style={styles.section}>
          <SectionTitle title="Account tools" />
          <View style={styles.toolsList}>
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
