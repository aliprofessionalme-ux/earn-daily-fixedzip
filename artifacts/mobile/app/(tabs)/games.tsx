import { Feather } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import React, { useCallback, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  Dimensions,
  Easing,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import Svg, { Circle, G, Path, Text as SvgText } from "react-native-svg";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";

import { useColors } from "@/hooks/useColors";
import { useUser } from "@/contexts/UserContext";
import type { RewardResult } from "@/services/api";

const SCREEN_WIDTH = Dimensions.get("window").width;
const WHEEL_SIZE = Math.min(260, Math.max(200, SCREEN_WIDTH - 80));
const SPIN_REWARDS = [1, 2, 3, 4, 5, 8] as const;
const SCRATCH_REWARDS = [1, 2, 3, 4, 6, 10] as const;
const SPIN_COLORS = ["#EC4899", "#F59E0B", "#3B82F6", "#8B5CF6", "#10B981", "#EF4444"];
const SCRATCH_LIMIT = 5;
const SPIN_LIMIT = 5;

function polarToCartesian(cx: number, cy: number, r: number, angleDeg: number) {
  const angle = ((angleDeg - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(angle), y: cy + r * Math.sin(angle) };
}

function describeArc(cx: number, cy: number, r: number, startAngle: number, endAngle: number) {
  const start = polarToCartesian(cx, cy, r, endAngle);
  const end = polarToCartesian(cx, cy, r, startAngle);
  const largeArcFlag = endAngle - startAngle <= 180 ? "0" : "1";
  return `M ${cx} ${cy} L ${start.x} ${start.y} A ${r} ${r} 0 ${largeArcFlag} 0 ${end.x} ${end.y} Z`;
}

function friendlyError(error: unknown, fallback: string) {
  const text = error instanceof Error ? error.message : String(error || fallback);
  if (text.toLowerCase().includes("firebase")) return "Backend/Firebase is not configured correctly. Check server env variables and try again.";
  return text || fallback;
}

function SpinWheel({ disabled, onBackendSpin }: { disabled: boolean; onBackendSpin: () => Promise<RewardResult> }) {
  const colors = useColors();
  const spinAnim = useRef(new Animated.Value(0)).current;
  const turnRef = useRef(0);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [lastReward, setLastReward] = useState<number | null>(null);

  const center = WHEEL_SIZE / 2;
  const radius = center - 8;
  const segmentAngle = 360 / SPIN_REWARDS.length;

  const rotation = spinAnim.interpolate({ inputRange: [0, 360], outputRange: ["0deg", "360deg"] });

  const runSpin = useCallback(async () => {
    if (disabled || busy) return;
    setBusy(true);
    setMessage(null);
    setLastReward(null);
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
      const result = await onBackendSpin();
      const reward = result.energyAwarded ?? 1;
      const rewardIndex = Math.max(0, SPIN_REWARDS.findIndex((item) => item === reward));
      const currentRotation = turnRef.current % 360;
      const segmentCenter = rewardIndex * segmentAngle + segmentAngle / 2;
      const pointerAngle = 0;
      const targetWithinOneTurn = (360 + pointerAngle - segmentCenter - currentRotation) % 360;
      const targetRotation = turnRef.current + 5 * 360 + targetWithinOneTurn;

      Animated.timing(spinAnim, {
        toValue: targetRotation,
        duration: 3300,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }).start(() => {
        turnRef.current = targetRotation;
        setLastReward(reward);
        setMessage(result.message);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
        setBusy(false);
      });
    } catch (error) {
      setMessage(friendlyError(error, "Spin reward failed. Please try again."));
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
      setBusy(false);
    }
  }, [busy, disabled, onBackendSpin, segmentAngle, spinAnim]);

  return (
    <View style={styles.gameBlock}>
      <View style={styles.pointerWrap}>
        <View style={[styles.pointer, { borderTopColor: colors.gold }]} />
      </View>
      <Animated.View style={[styles.wheelContainer, { transform: [{ rotate: rotation }] }]}>
        <Svg width={WHEEL_SIZE} height={WHEEL_SIZE} viewBox={`0 0 ${WHEEL_SIZE} ${WHEEL_SIZE}`}>
          <G>
            {SPIN_REWARDS.map((reward, index) => {
              const start = index * segmentAngle;
              const end = start + segmentAngle;
              const labelPoint = polarToCartesian(center, center, radius * 0.62, start + segmentAngle / 2);
              return (
                <G key={index}>
                  <Path d={describeArc(center, center, radius, start, end)} fill={SPIN_COLORS[index]} stroke="#111827" strokeWidth={2} />
                  <SvgText
                    x={labelPoint.x}
                    y={labelPoint.y + 5}
                    fill="#fff"
                    fontSize="16"
                    fontWeight="800"
                    textAnchor="middle"
                    rotation={start + segmentAngle / 2}
                    originX={labelPoint.x}
                    originY={labelPoint.y}
                  >
                    +{reward}E
                  </SvgText>
                </G>
              );
            })}
            <Circle cx={center} cy={center} r={center - 4} fill="none" stroke="#F59E0B" strokeWidth={6} />
            <Circle cx={center} cy={center} r={44} fill="#0D0D1A" stroke="#FDE68A" strokeWidth={4} />
            <SvgText x={center} y={center - 2} fill="#FDE68A" fontSize="13" fontWeight="800" textAnchor="middle">WIN</SvgText>
            <SvgText x={center} y={center + 17} fill="#fff" fontSize="10" fontWeight="700" textAnchor="middle">ENERGY</SvgText>
          </G>
        </Svg>
      </Animated.View>

      <Pressable disabled={disabled || busy} onPress={runSpin} style={({ pressed }) => [{ opacity: pressed ? 0.9 : 1, transform: [{ scale: pressed ? 0.98 : 1 }] }]}>
        <LinearGradient colors={["#FDE68A", "#F59E0B", "#B45309"]} style={styles.primaryButton}>
          {busy ? <ActivityIndicator color="#140900" /> : <Text style={styles.primaryButtonText}>{disabled ? "No Spins Left" : "SPIN NOW"}</Text>}
        </LinearGradient>
      </Pressable>

      {lastReward !== null ? (
        <View style={[styles.winPill, { borderColor: colors.gold + "55" }]}>
          <Feather name="zap" size={16} color={colors.gold} />
          <Text style={[styles.winText, { color: colors.gold }]}>+{lastReward} Energy earned!</Text>
        </View>
      ) : null}
      {message ? <Text style={[styles.message, { color: message.includes("won") || message.includes("Energy") ? colors.gold : colors.mutedForeground }]}>{message}</Text> : null}
    </View>
  );
}

function ScratchCard({ disabled, onBackendScratch }: { disabled: boolean; onBackendScratch: () => Promise<RewardResult> }) {
  const colors = useColors();
  const [busy, setBusy] = useState(false);
  const [reward, setReward] = useState<number | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const revealAnim = useRef(new Animated.Value(0)).current;

  const revealScale = revealAnim.interpolate({ inputRange: [0, 1], outputRange: [0.92, 1] });

  const reveal = useCallback(async () => {
    if (disabled || busy) return;
    setBusy(true);
    setMessage(null);
    setReward(null);
    revealAnim.setValue(0);
    try {
      const result = await onBackendScratch();
      setReward(result.energyAwarded ?? 1);
      setMessage(result.message);
      Animated.spring(revealAnim, { toValue: 1, friction: 7, tension: 80, useNativeDriver: true }).start();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    } catch (error) {
      setMessage(friendlyError(error, "Scratch reward failed. Please try again."));
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
    } finally {
      setBusy(false);
    }
  }, [busy, disabled, onBackendScratch, revealAnim]);

  return (
    <View style={styles.gameBlock}>
      <View style={[styles.ticket, { borderColor: colors.gold + "55" }]}>
        <LinearGradient colors={["#291B05", "#0D0D1A", "#1A0A3A"]} style={StyleSheet.absoluteFillObject} />
        <View style={styles.ticketHeader}>
          <Feather name="award" size={20} color={colors.gold} />
          <Text style={[styles.ticketTitle, { color: colors.foreground }]}>Premium Scratch Ticket</Text>
        </View>
        <Pressable disabled={disabled || busy} onPress={reveal} style={({ pressed }) => [{ opacity: pressed ? 0.92 : 1 }]}>
          <LinearGradient colors={reward === null ? ["#E5E7EB", "#9CA3AF", "#F3F4F6"] : ["#111827", "#1F2937"]} style={styles.scratchArea}>
            {busy ? (
              <>
                <ActivityIndicator color="#111827" />
                <Text style={styles.silverText}>Contacting backend...</Text>
              </>
            ) : reward === null ? (
              <>
                <Feather name="mouse-pointer" size={28} color="#111827" />
                <Text style={styles.silverTitle}>{disabled ? "Daily limit reached" : "TAP TO REVEAL"}</Text>
                <Text style={styles.silverText}>Earn {SCRATCH_REWARDS[0]}-{SCRATCH_REWARDS[SCRATCH_REWARDS.length - 1]} Energy rewards</Text>
              </>
            ) : (
              <Animated.View style={{ alignItems: "center", transform: [{ scale: revealScale }] }}>
                <Text style={[styles.rewardValue, { color: colors.gold }]}>+{reward}</Text>
                <Text style={[styles.rewardLabel, { color: colors.foreground }]}>ENERGY EARNED</Text>
              </Animated.View>
            )}
          </LinearGradient>
        </Pressable>
      </View>
      {message ? <Text style={[styles.message, { color: reward !== null ? colors.gold : colors.mutedForeground }]}>{message}</Text> : null}
    </View>
  );
}

export default function GamesScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { user, spin, scratch } = useUser();
  const [activeTab, setActiveTab] = useState<"spin" | "scratch">("spin");

  const topPad = Platform.OS === "web" ? 20 : insets.top;
  const spinsUsed = user?.lastSpinResetDate === new Date().toISOString().split("T")[0] ? user?.dailySpinsUsed ?? 0 : 0;
  const scratchesUsed = user?.lastScratchResetDate === new Date().toISOString().split("T")[0] ? user?.dailyScratchUsed ?? 0 : 0;
  const spinsLeft = Math.max(0, SPIN_LIMIT - spinsUsed);
  const scratchLeft = Math.max(0, SCRATCH_LIMIT - scratchesUsed);

  const activeDescription = useMemo(() => activeTab === "spin" ? "Spin the wheel to earn random Energy for app benefits." : "Tap to reveal and earn random Energy rewards.", [activeTab]);

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <LinearGradient colors={["#0D0D1A", "#131326", "#090911"]} style={StyleSheet.absoluteFillObject} />
      <View style={styles.bgGlowA} />
      <View style={styles.bgGlowB} />

      <ScrollView contentContainerStyle={{ paddingTop: topPad + 16, paddingBottom: Platform.OS === "web" ? 34 : 106, paddingHorizontal: 18 }} showsVerticalScrollIndicator={false}>
        <Text style={[styles.title, { color: colors.foreground }]}>Mini Games</Text>
        <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>{activeDescription}</Text>

        <View style={[styles.tabs, { borderColor: colors.border, backgroundColor: "rgba(255,255,255,0.04)" }]}>
          {(["spin", "scratch"] as const).map((tab) => (
            <Pressable key={tab} onPress={() => setActiveTab(tab)} style={[styles.tabButton, activeTab === tab && { backgroundColor: colors.primary }]}>
              <Text style={[styles.tabText, { color: activeTab === tab ? "#fff" : colors.mutedForeground }]}>{tab === "spin" ? "Spin" : "Scratch"}</Text>
            </Pressable>
          ))}
        </View>

        <View style={styles.limitRow}>
          <View style={[styles.limitBadge, { borderColor: colors.purple + "44" }]}>
            <Feather name="zap" size={14} color={colors.purple} />
            <Text style={[styles.limitText, { color: colors.purple }]}>{spinsLeft}/5 spins left</Text>
          </View>
          <View style={[styles.limitBadge, { borderColor: colors.blue + "44" }]}>
            <Feather name="layers" size={14} color={colors.blue} />
            <Text style={[styles.limitText, { color: colors.blue }]}>{scratchLeft}/5 scratches left</Text>
          </View>
        </View>

        <View style={[styles.cardFrame, { borderColor: "rgba(255,255,255,0.10)" }]}>
          {activeTab === "spin" ? (
            <SpinWheel disabled={spinsLeft <= 0} onBackendSpin={spin} />
          ) : (
            <ScratchCard disabled={scratchLeft <= 0} onBackendScratch={scratch} />
          )}
        </View>

        <View style={[styles.infoBox, { borderColor: colors.border, backgroundColor: "rgba(255,255,255,0.04)" }]}>
          <Feather name="zap" size={18} color={colors.gold} />
          <Text style={[styles.infoText, { color: colors.mutedForeground }]}>Spin and Scratch now earn random Energy only. Energy unlocks extra task slots and app benefits. It cannot be withdrawn.</Text>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  bgGlowA: { position: "absolute", width: 240, height: 240, borderRadius: 240, top: -60, left: -80, backgroundColor: "rgba(124,58,237,0.16)" },
  bgGlowB: { position: "absolute", width: 220, height: 220, borderRadius: 220, top: 220, right: -80, backgroundColor: "rgba(245,158,11,0.12)" },
  title: { fontFamily: "Inter_700Bold", fontSize: 24, lineHeight: 30, marginBottom: 4 },
  subtitle: { fontFamily: "Inter_400Regular", fontSize: 12, lineHeight: 17, marginBottom: 12 },
  tabs: { flexDirection: "row", borderRadius: 16, borderWidth: 1, padding: 3, marginBottom: 12 },
  tabButton: { flex: 1, paddingVertical: 10, borderRadius: 12, alignItems: "center" },
  tabText: { fontFamily: "Inter_700Bold", fontSize: 13, lineHeight: 17 },
  limitRow: { flexDirection: "row", gap: 10, marginBottom: 16, flexWrap: "wrap" },
  limitBadge: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, borderWidth: 1, backgroundColor: "rgba(255,255,255,0.04)" },
  limitText: { fontFamily: "Inter_700Bold", fontSize: 11, lineHeight: 15 },
  cardFrame: { borderRadius: 24, borderWidth: 1, padding: 14, backgroundColor: "rgba(255,255,255,0.04)", alignItems: "center", marginBottom: 12, overflow: "hidden" },
  gameBlock: { width: "100%", alignItems: "center", gap: 14 },
  pointerWrap: { height: 24, alignItems: "center", justifyContent: "flex-end", zIndex: 2, marginBottom: -6 },
  pointer: { width: 0, height: 0, borderLeftWidth: 13, borderRightWidth: 13, borderTopWidth: 24, borderLeftColor: "transparent", borderRightColor: "transparent" },
  wheelContainer: { width: WHEEL_SIZE, height: WHEEL_SIZE, alignItems: "center", justifyContent: "center", shadowColor: "#F59E0B", shadowOpacity: 0.25, shadowRadius: 18, shadowOffset: { width: 0, height: 8 } },
  primaryButton: { minWidth: 160, borderRadius: 999, paddingVertical: 12, paddingHorizontal: 22, alignItems: "center", justifyContent: "center" },
  primaryButtonText: { color: "#140900", fontFamily: "Inter_700Bold", fontSize: 14, lineHeight: 18, letterSpacing: 0.6 },
  winPill: { flexDirection: "row", alignItems: "center", gap: 8, borderWidth: 1, backgroundColor: "rgba(245,158,11,0.10)", borderRadius: 999, paddingHorizontal: 12, paddingVertical: 8 },
  winText: { fontFamily: "Inter_700Bold", fontSize: 13, lineHeight: 17 },
  message: { fontFamily: "Inter_500Medium", fontSize: 13, textAlign: "center", lineHeight: 18, paddingHorizontal: 8 },
  ticket: { width: "100%", borderRadius: 22, borderWidth: 1, overflow: "hidden", padding: 14, gap: 12 },
  ticketHeader: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6 },
  ticketTitle: { fontFamily: "Inter_700Bold", fontSize: 15, lineHeight: 19 },
  scratchArea: { minHeight: 160, borderRadius: 20, alignItems: "center", justifyContent: "center", gap: 6, padding: 16 },
  silverTitle: { color: "#111827", fontFamily: "Inter_700Bold", fontSize: 18, lineHeight: 22, letterSpacing: 1.2 },
  silverText: { color: "rgba(17,24,39,0.72)", fontFamily: "Inter_500Medium", fontSize: 12, lineHeight: 16, textAlign: "center" },
  rewardValue: { fontFamily: "Inter_700Bold", fontSize: 46, lineHeight: 52 },
  rewardLabel: { fontFamily: "Inter_700Bold", fontSize: 14, lineHeight: 18, letterSpacing: 1.2 },
  infoBox: { flexDirection: "row", gap: 8, borderWidth: 1, borderRadius: 16, padding: 12, alignItems: "flex-start" },
  infoText: { flex: 1, fontFamily: "Inter_400Regular", fontSize: 11, lineHeight: 16 },
});
