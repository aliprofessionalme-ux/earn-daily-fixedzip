import { Feather } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, FlatList, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useColors } from "@/hooks/useColors";
import { getLeaderboard, type LeaderboardUser } from "@/services/api";
import { getUnlockedBadges, getUserLevel, type BadgeIcon } from "@/utils/badges";

function medal(rank: number) {
  if (rank === 1) return "#FACC15";
  if (rank === 2) return "#CBD5E1";
  if (rank === 3) return "#FB923C";
  return "rgba(255,255,255,0.12)";
}

export default function LeaderboardScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const topPad = Platform.OS === "web" ? 28 : insets.top + 8;
  const [users, setUsers] = useState<LeaderboardUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try { setUsers(await getLeaderboard(50)); }
    catch (err) { setError(err instanceof Error ? err.message : "Unable to load top users."); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  return (
    <View style={[styles.root, { backgroundColor: colors.background, paddingTop: topPad }]}> 
      <LinearGradient colors={["#111827", "#0D0D1A"]} style={StyleSheet.absoluteFillObject} />
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={[styles.back, { backgroundColor: colors.card, borderColor: colors.border }]}> 
          <Feather name="arrow-left" size={20} color={colors.foreground} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={[styles.title, { color: colors.foreground }]}>Top Users</Text>
          <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>Coin ranking with hidden account IDs</Text>
        </View>
        <Pressable onPress={() => void load()} style={[styles.back, { backgroundColor: colors.card, borderColor: colors.border }]}> 
          <Feather name="refresh-cw" size={18} color={colors.mutedForeground} />
        </Pressable>
      </View>

      {loading ? (
        <View style={styles.center}><ActivityIndicator color={colors.gold} /><Text style={[styles.empty, { color: colors.mutedForeground }]}>Loading leaderboard...</Text></View>
      ) : error ? (
        <View style={styles.center}>
          <Feather name="alert-circle" size={42} color={colors.destructive} />
          <Text style={[styles.empty, { color: colors.destructive }]}>{error}</Text>
          <Pressable onPress={load} style={[styles.retry, { backgroundColor: colors.primary }]}><Text style={styles.retryText}>Retry</Text></Pressable>
        </View>
      ) : users.length === 0 ? (
        <View style={styles.center}><Feather name="award" size={48} color={colors.mutedForeground} /><Text style={[styles.empty, { color: colors.mutedForeground }]}>No ranked users yet</Text></View>
      ) : (
        <FlatList
          data={users}
          keyExtractor={(item) => `${item.rank}-${item.maskedUserId}`}
          contentContainerStyle={{ padding: 16, paddingBottom: Platform.OS === "web" ? 34 : 112 }}
          showsVerticalScrollIndicator={false}
          renderItem={({ item }) => {
            const level = getUserLevel({
              confirmedCoinsBalance: item.confirmedCoinsBalance,
              pendingCoinsBalance: item.pendingCoinsBalance,
              currentDailyStreak: item.currentDailyStreak,
              dailyTasksCompletedToday: item.dailyTasksCompletedToday,
            });
            const primaryBadge = getUnlockedBadges({
              rank: item.rank,
              confirmedCoinsBalance: item.confirmedCoinsBalance,
              pendingCoinsBalance: item.pendingCoinsBalance,
              currentDailyStreak: item.currentDailyStreak,
              dailyTasksCompletedToday: item.dailyTasksCompletedToday,
            }, 2)[0];

            return (
              <View style={[styles.row, { backgroundColor: colors.card, borderColor: item.rank <= 3 ? medal(item.rank) : colors.border }]}> 
                <View style={[styles.rank, { backgroundColor: medal(item.rank) }]}> 
                  <Text style={[styles.rankText, { color: item.rank <= 3 ? "#111827" : colors.foreground }]}>{item.rank}</Text>
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={[styles.name, { color: colors.foreground }]} numberOfLines={1}>{item.displayName}</Text>
                  <Text style={[styles.masked, { color: colors.mutedForeground }]} numberOfLines={1}>{item.maskedUserId}</Text>
                  <View style={styles.badgeRow}>
                    <View style={[styles.levelPill, { backgroundColor: level.color + "1F", borderColor: level.color + "66" }]}> 
                      <Feather name="award" size={11} color={level.color} />
                      <Text style={[styles.levelPillText, { color: level.color }]}>{level.name}</Text>
                    </View>
                    {primaryBadge ? (
                      <View style={[styles.levelPill, { backgroundColor: primaryBadge.color + "18", borderColor: primaryBadge.color + "55" }]}> 
                        <Feather name={primaryBadge.icon as BadgeIcon} size={11} color={primaryBadge.color} />
                        <Text style={[styles.levelPillText, { color: primaryBadge.color }]} numberOfLines={1}>{primaryBadge.label}</Text>
                      </View>
                    ) : null}
                  </View>
                </View>
                <View style={styles.right}>
                  <Text style={[styles.coins, { color: colors.gold }]}>{item.confirmedCoinsBalance.toLocaleString()}</Text>
                  <Text style={[styles.meta, { color: colors.mutedForeground }]}>{item.currentDailyStreak} streak</Text>
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
  retryText: { color: "#fff", fontFamily: "Inter_700Bold", fontSize: 13, lineHeight: 17 },
  row: { flexDirection: "row", alignItems: "center", gap: 12, borderWidth: 1, borderRadius: 16, padding: 12, marginBottom: 10 },
  rank: { width: 38, height: 38, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  rankText: { fontFamily: "Inter_800ExtraBold", fontSize: 15, lineHeight: 19 },
  name: { fontFamily: "Inter_700Bold", fontSize: 15, lineHeight: 19 },
  masked: { fontFamily: "Inter_400Regular", fontSize: 11, lineHeight: 15, marginTop: 2 },
  badgeRow: { flexDirection: "row", flexWrap: "wrap", gap: 5, marginTop: 7 },
  levelPill: { minHeight: 23, maxWidth: 105, borderWidth: 1, borderRadius: 999, paddingHorizontal: 7, flexDirection: "row", alignItems: "center", gap: 4 },
  levelPillText: { fontFamily: "Inter_700Bold", fontSize: 9.5, lineHeight: 13, flexShrink: 1 },
  right: { alignItems: "flex-end" },
  coins: { fontFamily: "Inter_700Bold", fontSize: 15, lineHeight: 19 },
  meta: { fontFamily: "Inter_500Medium", fontSize: 11, lineHeight: 15, marginTop: 2 },
});