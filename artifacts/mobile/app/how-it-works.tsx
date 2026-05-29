import { Feather } from "@expo/vector-icons";
import { router } from "expo-router";
import React, { useEffect, useState } from "react";
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";
import { SectionTitle } from "@/components/SectionTitle";
import { getAppSettings, type ProviderCallbackUrls } from "@/services/api";

const sections = [
  { icon: "zap" as const, title: "Energy rewards", body: "Daily check-in, Spin and Scratch earn Energy only. Energy helps unlock app benefits and is not withdrawable." },
  { icon: "clock" as const, title: "Pending Coins", body: "Earning tasks first add Pending Coins after a valid provider callback. They are not withdrawable yet." },
  { icon: "check-circle" as const, title: "Confirmed Coins", body: "Pending Coins become Confirmed Coins only after verification, hold period, or admin approval." },
  { icon: "repeat" as const, title: "Conversion", body: "Provider task value uses 1 USD = 5,000 user coins. Withdrawal conversion uses the app settings shown in Wallet." },
  { icon: "target" as const, title: "Daily requirements", body: "Withdrawal unlocks only after 5 valid tasks today and an active daily streak." },
  { icon: "share-2" as const, title: "Referral bonus", body: "The referrer bonus is paid only when the referred user completes 5 valid tasks and earns 5 Energy." },
  { icon: "credit-card" as const, title: "Withdrawals", body: "Withdrawals use Confirmed Coins only. This month's earned withdrawal requests are scheduled for next month because advertiser payments arrive late." },
  { icon: "shield" as const, title: "Fair usage", body: "Do not use VPN, proxy, bots, emulators or fake activity. Fraud can cause manual review, reversals, bans, and rejected withdrawals." },
];

export default function HowItWorksScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const topPad = Platform.OS === "web" ? 28 : insets.top + 8;
  const [callbacks, setCallbacks] = useState<ProviderCallbackUrls | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const settings = await getAppSettings();
        if (!cancelled) setCallbacks(settings.providerCallbackUrls ?? null);
      } catch { if (!cancelled) setCallbacks(null); }
    })();
    return () => { cancelled = true; };
  }, []);

  return (
    <View style={[styles.root, { backgroundColor: colors.background, paddingTop: topPad }]}> 
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={[styles.back, { backgroundColor: colors.card, borderColor: colors.border }]}> 
          <Feather name="arrow-left" size={20} color={colors.foreground} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={[styles.title, { color: colors.foreground }]}>How It Works</Text>
          <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>Energy, pending rewards and payouts</Text>
        </View>
      </View>
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 34 }} showsVerticalScrollIndicator={false}>
        {sections.map((item) => (
          <View key={item.title} style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}> 
            <View style={[styles.icon, { backgroundColor: colors.gold + "18" }]}> 
              <Feather name={item.icon} size={20} color={colors.gold} />
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={[styles.cardTitle, { color: colors.foreground }]}>{item.title}</Text>
              <Text style={[styles.cardBody, { color: colors.mutedForeground }]}>{item.body}</Text>
            </View>
          </View>
        ))}

        {callbacks ? (
          <>
            <SectionTitle title="Provider callbacks" />
            {Object.entries(callbacks).map(([provider, url]) => (
              <View key={provider} style={[styles.callbackRow, { backgroundColor: colors.card, borderColor: colors.border }]}> 
                <Text style={[styles.callbackProvider, { color: colors.gold }]}>{provider.toUpperCase()}</Text>
                <Text style={[styles.callbackUrl, { color: colors.mutedForeground }]} selectable>{url}</Text>
              </View>
            ))}
          </>
        ) : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 16, paddingBottom: 10 },
  back: { width: 40, height: 40, borderRadius: 12, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  title: { fontFamily: "Inter_700Bold", fontSize: 22, lineHeight: 28 },
  subtitle: { fontFamily: "Inter_400Regular", fontSize: 12, lineHeight: 16, marginTop: 2 },
  card: { borderWidth: 1, borderRadius: 15, padding: 13, flexDirection: "row", gap: 11, marginBottom: 9 },
  icon: { width: 40, height: 40, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  cardTitle: { fontFamily: "Inter_700Bold", fontSize: 15, lineHeight: 19 },
  cardBody: { fontFamily: "Inter_400Regular", fontSize: 12.5, lineHeight: 18, marginTop: 3 },
  callbackRow: { borderWidth: 1, borderRadius: 14, padding: 12, marginBottom: 8 },
  callbackProvider: { fontFamily: "Inter_700Bold", fontSize: 12, lineHeight: 16, marginBottom: 4 },
  callbackUrl: { fontFamily: "Inter_400Regular", fontSize: 11, lineHeight: 16 },
});
