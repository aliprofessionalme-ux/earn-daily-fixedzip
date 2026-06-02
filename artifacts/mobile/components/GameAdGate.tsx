import { Feather } from "@expo/vector-icons";
import React, { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";

import { useUser } from "@/contexts/UserContext";
import { useColors } from "@/hooks/useColors";
import { getAppSettings, recordUnityInterstitialShown, type ProviderLaunchItem } from "@/services/api";

interface GameAdGateProps {
  spinsLeft: number;
  scratchLeft: number;
}

function friendlyError(error: unknown) {
  const text = error instanceof Error ? error.message : String(error || "Unable to record required ad.");
  if (text.toLowerCase().includes("not configured")) return "Required ad is being prepared. Please try again later.";
  if (text.toLowerCase().includes("firebase")) return "Connection issue. Please try again.";
  return text;
}

export function GameAdGate({ spinsLeft, scratchLeft }: GameAdGateProps) {
  const colors = useColors();
  const { deviceId } = useUser();
  const [adGate, setAdGate] = useState<ProviderLaunchItem | null>(null);
  const [loadingSettings, setLoadingSettings] = useState(false);
  const [busy, setBusy] = useState(false);
  const [recorded, setRecorded] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const gateRequired = spinsLeft <= 0 && scratchLeft <= 0;
  const ready = Boolean(adGate?.enabled && adGate.placementId);

  useEffect(() => {
    if (!gateRequired) return;
    let cancelled = false;
    setLoadingSettings(true);
    getAppSettings()
      .then((settings) => {
        if (!cancelled) setAdGate(settings.providerLaunch?.dailyGameAdGate ?? null);
      })
      .catch(() => {
        if (!cancelled) setAdGate(null);
      })
      .finally(() => {
        if (!cancelled) setLoadingSettings(false);
      });
    return () => {
      cancelled = true;
    };
  }, [gateRequired]);

  const bodyText = useMemo(() => {
    if (recorded) return "Today’s game session ad is done.";
    if (loadingSettings) return "Preparing the required ad...";
    return "You completed 5 spins and 5 scratches. Watch one ad to finish today’s game session.";
  }, [loadingSettings, recorded]);

  const onWatchRequiredAd = async () => {
    if (!gateRequired || busy || recorded) return;
    if (!deviceId) {
      setMessage("User session is still loading. Please try again.");
      return;
    }
    if (!ready) {
      setMessage("Required ad is being prepared. Please try again later.");
      return;
    }

    setBusy(true);
    setMessage(null);
    try {
      // In the native APK, show the interstitial SDK first, then call this after the ad closes.
      const result = await recordUnityInterstitialShown(deviceId, adGate?.placementId);
      setRecorded(true);
      setMessage(result.message || "Required ad view recorded.");
    } catch (error) {
      setMessage(friendlyError(error));
    } finally {
      setBusy(false);
    }
  };

  if (!gateRequired) return null;

  return (
    <View style={[styles.card, { backgroundColor: "rgba(245,158,11,0.10)", borderColor: colors.gold + "55" }]}> 
      <View style={styles.headerRow}>
        <View style={[styles.iconWrap, { backgroundColor: colors.gold + "22" }]}> 
          <Feather name="film" size={17} color={colors.gold} />
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={[styles.title, { color: colors.foreground }]}>Required ad</Text>
          <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>{bodyText}</Text>
        </View>
      </View>

      <Pressable
        disabled={busy || recorded || loadingSettings}
        onPress={onWatchRequiredAd}
        style={({ pressed }) => [
          styles.button,
          { backgroundColor: recorded ? "rgba(16,185,129,0.18)" : colors.gold, opacity: pressed ? 0.92 : busy || loadingSettings ? 0.7 : 1 },
        ]}
      >
        {busy || loadingSettings ? (
          <ActivityIndicator color="#170B00" />
        ) : (
          <>
            <Feather name={recorded ? "check-circle" : "play-circle"} size={15} color={recorded ? "#6EE7B7" : "#170B00"} />
            <Text style={[styles.buttonText, { color: recorded ? "#6EE7B7" : "#170B00" }]}>{recorded ? "Ad completed" : "Watch required ad"}</Text>
          </>
        )}
      </Pressable>

      {message ? <Text style={[styles.message, { color: recorded ? colors.gold : colors.mutedForeground }]}>{message}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { width: "100%", borderWidth: 1, borderRadius: 18, padding: 13, gap: 12, marginBottom: 12 },
  headerRow: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
  iconWrap: { width: 34, height: 34, borderRadius: 11, alignItems: "center", justifyContent: "center" },
  title: { fontFamily: "Inter_700Bold", fontSize: 14, lineHeight: 18 },
  subtitle: { fontFamily: "Inter_400Regular", fontSize: 11.5, lineHeight: 17, marginTop: 2 },
  button: { minHeight: 42, borderRadius: 999, paddingHorizontal: 14, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7 },
  buttonText: { fontFamily: "Inter_700Bold", fontSize: 12.5, lineHeight: 16 },
  message: { fontFamily: "Inter_500Medium", fontSize: 11.5, lineHeight: 16, textAlign: "center" },
});
