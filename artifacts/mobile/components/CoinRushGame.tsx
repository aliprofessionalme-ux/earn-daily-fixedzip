import { Feather } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import * as Haptics from "expo-haptics";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Animated, Easing, Pressable, StyleSheet, Text, View } from "react-native";

import { useColors } from "@/hooks/useColors";
import type { CoinRushStartResult } from "@/services/api";

const RUSH_ENERGY_COST = 3;
const RUSH_SECONDS = 30;
const LANES = [0, 1, 2] as const;

type RushTargetKind = "coin" | "gem" | "trap";

type RushTarget = {
  id: number;
  lane: number;
  kind: RushTargetKind;
};

function nextTarget(id: number): RushTarget {
  const roll = Math.random();
  const kind: RushTargetKind = roll > 0.84 ? "trap" : roll > 0.62 ? "gem" : "coin";
  return {
    id,
    lane: Math.floor(Math.random() * LANES.length),
    kind,
  };
}

function targetMeta(kind: RushTargetKind) {
  if (kind === "trap") return { icon: "x-circle" as const, label: "Avoid", points: -20, colors: ["#F97316", "#EF4444"] as [string, string] };
  if (kind === "gem") return { icon: "star" as const, label: "+20", points: 20, colors: ["#22D3EE", "#3B82F6"] as [string, string] };
  return { icon: "target" as const, label: "+10", points: 10, colors: ["#FDE68A", "#F59E0B"] as [string, string] };
}

function readableError(error: unknown) {
  const message = error instanceof Error ? error.message : "Unable to start Coin Rush. Please try again.";
  if (message.includes("404")) return "Backend update pending. Redeploy the latest AWS backend, then try again.";
  return message;
}

export function CoinRushGame({
  energy,
  onStartGame,
}: {
  energy: number;
  onStartGame: () => Promise<CoinRushStartResult>;
}) {
  const colors = useColors();
  const pulse = useRef(new Animated.Value(0)).current;
  const targetIdRef = useRef(1);
  const scoreRef = useRef(0);
  const [busy, setBusy] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [timeLeft, setTimeLeft] = useState(RUSH_SECONDS);
  const [score, setScore] = useState(0);
  const [combo, setCombo] = useState(0);
  const [bestScore, setBestScore] = useState(0);
  const [target, setTarget] = useState<RushTarget | null>(null);
  const [message, setMessage] = useState("Tap the glowing lane. Score only, no coins or PKR.");

  const canStart = energy >= RUSH_ENERGY_COST;
  const pulseScale = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.9, 1.08] });

  useEffect(() => {
    scoreRef.current = score;
  }, [score]);

  const spawnTarget = useCallback(() => {
    setTarget(nextTarget(targetIdRef.current++));
    pulse.setValue(0);
    Animated.timing(pulse, {
      toValue: 1,
      duration: 420,
      easing: Easing.out(Easing.back(1.4)),
      useNativeDriver: true,
    }).start();
  }, [pulse]);

  const finishRun = useCallback(() => {
    const finalScore = scoreRef.current;
    setPlaying(false);
    setTarget(null);
    setBestScore((current) => Math.max(current, finalScore));
    setMessage(`Run complete. Score ${finalScore}. No coins or PKR were added.`);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
  }, []);

  useEffect(() => {
    if (!playing) return undefined;
    const timer = setInterval(() => {
      setTimeLeft((current) => {
        if (current <= 1) {
          finishRun();
          return 0;
        }
        return current - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [finishRun, playing]);

  useEffect(() => {
    if (!playing) return undefined;
    const targetTimer = setInterval(spawnTarget, 850);
    return () => clearInterval(targetTimer);
  }, [playing, spawnTarget]);

  const startGame = useCallback(async () => {
    if (busy || playing) return;
    if (!canStart) {
      setMessage(`Need ${RUSH_ENERGY_COST} Energy to play Coin Rush.`);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
      return;
    }

    setBusy(true);
    try {
      const result = await onStartGame();
      setScore(0);
      scoreRef.current = 0;
      setCombo(0);
      setTimeLeft(RUSH_SECONDS);
      setPlaying(true);
      setMessage(result.message);
      spawnTarget();
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    } catch (error) {
      setMessage(readableError(error));
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
    } finally {
      setBusy(false);
    }
  }, [busy, canStart, onStartGame, playing, spawnTarget]);

  const tapLane = useCallback((lane: number) => {
    if (!playing || !target) return;

    if (lane !== target.lane) {
      setScore((current) => Math.max(0, current - 4));
      setCombo(0);
      setMessage("Missed lane. Keep your streak clean.");
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
      spawnTarget();
      return;
    }

    const meta = targetMeta(target.kind);
    if (target.kind === "trap") {
      setScore((current) => Math.max(0, current + meta.points));
      setCombo(0);
      setMessage("Trap hit. Score dropped, wallet still safe.");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
    } else {
      setCombo((currentCombo) => {
        const nextCombo = currentCombo + 1;
        const comboBonus = Math.min(15, Math.floor(nextCombo / 3) * 3);
        setScore((current) => current + meta.points + comboBonus);
        setMessage(`Nice hit! Combo x${nextCombo}${comboBonus ? `, +${comboBonus} bonus` : ""}.`);
        return nextCombo;
      });
      Haptics.selectionAsync().catch(() => {});
    }
    spawnTarget();
  }, [playing, spawnTarget, target]);

  const statusCards = useMemo(() => ([
    { label: "Energy", value: String(energy), icon: "zap" as const, color: colors.gold },
    { label: "Entry", value: `${RUSH_ENERGY_COST}E`, icon: "unlock" as const, color: colors.purple },
    { label: "Best", value: String(bestScore), icon: "award" as const, color: colors.green },
  ]), [bestScore, colors.gold, colors.green, colors.purple, energy]);

  return (
    <View style={styles.wrap}>
      <View style={styles.heroPanel}>
        <LinearGradient colors={["rgba(245,158,11,0.20)", "rgba(124,58,237,0.14)", "rgba(15,23,42,0.05)"]} style={StyleSheet.absoluteFillObject} />
        <View style={styles.headerRow}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={[styles.eyebrow, { color: colors.gold }]}>ENERGY GAME</Text>
            <Text style={[styles.title, { color: colors.foreground }]}>Coin Rush</Text>
            <Text style={[styles.subline, { color: colors.mutedForeground }]}>Fast lane taps. Score only.</Text>
          </View>
          <View style={[styles.timerPill, { borderColor: colors.gold + "55", backgroundColor: colors.card }]}> 
            <Feather name="clock" size={14} color={colors.gold} />
            <Text style={[styles.timerText, { color: colors.foreground }]}>{timeLeft}s</Text>
          </View>
        </View>
      </View>

      <View style={styles.statusGrid}>
        {statusCards.map((item) => (
          <View key={item.label} style={[styles.statusCard, { borderColor: item.color + "44", backgroundColor: colors.card }]}> 
            <Feather name={item.icon} size={15} color={item.color} />
            <Text style={[styles.statusValue, { color: item.color }]}>{item.value}</Text>
            <Text style={[styles.statusLabel, { color: colors.mutedForeground }]}>{item.label}</Text>
          </View>
        ))}
      </View>

      <View style={[styles.instructionStrip, { borderColor: colors.gold + "33", backgroundColor: colors.card }]}> 
        <Feather name="target" size={15} color={colors.gold} />
        <Text style={[styles.instructionText, { color: colors.foreground }]}>Tap the lit lane. Hit gold/blue targets, avoid red traps.</Text>
      </View>

      <View style={[styles.scoreBoard, { borderColor: colors.border, backgroundColor: colors.card }]}> 
        <View>
          <Text style={[styles.scoreLabel, { color: colors.mutedForeground }]}>Score</Text>
          <Text style={[styles.scoreValue, { color: colors.foreground }]}>{score}</Text>
        </View>
        <View style={[styles.comboBox, { backgroundColor: colors.gold + "18" }]}> 
          <Feather name="activity" size={14} color={colors.gold} />
          <Text style={[styles.comboText, { color: colors.gold }]}>Combo x{combo}</Text>
        </View>
      </View>

      <View style={styles.lanes}>
        {LANES.map((lane) => {
          const active = target?.lane === lane;
          const meta = target ? targetMeta(target.kind) : null;
          return (
            <Pressable
              key={lane}
              onPress={() => tapLane(lane)}
              style={({ pressed }) => [
                styles.lane,
                {
                  borderColor: active ? colors.gold : colors.border,
                  backgroundColor: active ? colors.gold + "12" : colors.card,
                  opacity: pressed ? 0.92 : 1,
                },
              ]}
            >
              <Text style={[styles.laneKicker, { color: active ? colors.gold : colors.mutedForeground }]}>LANE {lane + 1}</Text>
              {active && meta ? (
                <Animated.View style={[styles.targetOrb, { transform: [{ scale: pulseScale }] }]}> 
                  <LinearGradient colors={meta.colors} style={styles.targetGradient}>
                    <Feather name={meta.icon} size={28} color="#111827" />
                    <Text style={styles.targetText}>{meta.label}</Text>
                  </LinearGradient>
                </Animated.View>
              ) : (
                <View style={[styles.emptyOrb, { borderColor: colors.border, backgroundColor: colors.background }]}> 
                  <Feather name="circle" size={18} color={colors.mutedForeground} />
                </View>
              )}
              <Text style={[styles.laneText, { color: active ? colors.foreground : colors.mutedForeground }]}>{playing ? "Ready" : "Tap"}</Text>
            </Pressable>
          );
        })}
      </View>

      <View style={[styles.buttonShell, { borderColor: canStart ? colors.gold + "88" : colors.border }]}> 
        <Pressable disabled={busy || playing} onPress={startGame} style={({ pressed }) => [styles.startPressable, { opacity: pressed ? 0.9 : 1, transform: [{ scale: pressed ? 0.98 : 1 }] }]}> 
          <LinearGradient colors={canStart ? ["#FDE68A", "#F59E0B", "#7C3AED"] : ["#475569", "#334155"]} style={styles.startButton}>
            {busy ? (
              <ActivityIndicator color="#111827" />
            ) : (
              <>
                <Feather name={playing ? "check-circle" : "play"} size={16} color="#111827" />
                <Text style={styles.startText}>{playing ? "Run Active" : canStart ? "Start 30s Run - 3 Energy" : "Need More Energy"}</Text>
              </>
            )}
          </LinearGradient>
        </Pressable>
      </View>

      <Text style={[styles.message, { color: colors.mutedForeground }]}>{message}</Text>
      <View style={[styles.safeNote, { borderColor: colors.border, backgroundColor: colors.card }]}> 
        <Feather name="shield" size={15} color={colors.green} />
        <Text style={[styles.safeText, { color: colors.mutedForeground }]}>Coins, PKR, withdrawals, and offerwall rewards are not changed.</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { width: "100%", gap: 12 },
  heroPanel: { borderRadius: 20, overflow: "hidden", padding: 12 },
  headerRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", gap: 12 },
  eyebrow: { fontFamily: "Inter_700Bold", fontSize: 11, lineHeight: 14, letterSpacing: 0.8 },
  title: { fontFamily: "Inter_700Bold", fontSize: 25, lineHeight: 31 },
  subline: { fontFamily: "Inter_500Medium", fontSize: 12, lineHeight: 16, marginTop: 2 },
  timerPill: { flexDirection: "row", alignItems: "center", gap: 6, borderWidth: 1, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 7 },
  timerText: { fontFamily: "Inter_700Bold", fontSize: 13, lineHeight: 17 },
  statusGrid: { flexDirection: "row", gap: 8 },
  statusCard: { flex: 1, alignItems: "center", gap: 2, borderWidth: 1, borderRadius: 16, paddingVertical: 10, paddingHorizontal: 6 },
  statusValue: { fontFamily: "Inter_700Bold", fontSize: 18, lineHeight: 22 },
  statusLabel: { fontFamily: "Inter_600SemiBold", fontSize: 10, lineHeight: 13 },
  instructionStrip: { flexDirection: "row", alignItems: "center", gap: 8, borderWidth: 1, borderRadius: 16, paddingHorizontal: 11, paddingVertical: 9 },
  instructionText: { flex: 1, fontFamily: "Inter_600SemiBold", fontSize: 11, lineHeight: 15 },
  scoreBoard: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", borderWidth: 1, borderRadius: 18, padding: 12 },
  scoreLabel: { fontFamily: "Inter_600SemiBold", fontSize: 11, lineHeight: 14 },
  scoreValue: { fontFamily: "Inter_700Bold", fontSize: 30, lineHeight: 36 },
  comboBox: { flexDirection: "row", alignItems: "center", gap: 6, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 7 },
  comboText: { fontFamily: "Inter_700Bold", fontSize: 13, lineHeight: 17 },
  lanes: { flexDirection: "row", gap: 8 },
  lane: { flex: 1, minHeight: 126, borderWidth: 1.5, borderRadius: 20, alignItems: "center", justifyContent: "center", padding: 8, gap: 8 },
  laneKicker: { fontFamily: "Inter_700Bold", fontSize: 9, lineHeight: 12, letterSpacing: 0.8 },
  targetOrb: { width: 72, height: 72, borderRadius: 24, overflow: "hidden", shadowColor: "#F59E0B", shadowOpacity: 0.3, shadowRadius: 12, shadowOffset: { width: 0, height: 6 } },
  targetGradient: { flex: 1, alignItems: "center", justifyContent: "center", gap: 2 },
  targetText: { color: "#111827", fontFamily: "Inter_700Bold", fontSize: 12, lineHeight: 15 },
  emptyOrb: { width: 60, height: 60, borderRadius: 20, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  laneText: { fontFamily: "Inter_700Bold", fontSize: 11, lineHeight: 14 },
  buttonShell: { borderWidth: 1, borderRadius: 22, padding: 2, backgroundColor: "rgba(255,255,255,0.06)" },
  startPressable: { borderRadius: 20, overflow: "hidden" },
  startButton: { minHeight: 50, borderRadius: 20, alignItems: "center", justifyContent: "center", paddingHorizontal: 18, flexDirection: "row", gap: 8 },
  startText: { color: "#111827", fontFamily: "Inter_700Bold", fontSize: 14, lineHeight: 18 },
  message: { fontFamily: "Inter_600SemiBold", fontSize: 12, lineHeight: 17, textAlign: "center" },
  safeNote: { flexDirection: "row", alignItems: "flex-start", gap: 8, borderWidth: 1, borderRadius: 14, padding: 10 },
  safeText: { flex: 1, fontFamily: "Inter_400Regular", fontSize: 11, lineHeight: 16 },
});
