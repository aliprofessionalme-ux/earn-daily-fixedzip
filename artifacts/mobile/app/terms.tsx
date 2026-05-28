import { Feather } from "@expo/vector-icons";
import { router } from "expo-router";
import React from "react";
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";

const terms = [
  "No VPN, proxy or traffic masking is allowed.",
  "No emulator abuse, bots, automation, fake activity or scripted actions.",
  "One account/device/user only. Duplicate or suspicious accounts can be restricted.",
  "Suspicious activity may lead to ban, reward removal or withdrawal rejection.",
  "Withdrawals may be reviewed manually before approval and payment.",
  "Fake or fraud traffic is forbidden. Rewards depend on valid activity only.",
  "The app may reject suspicious withdrawals. Rejected withdrawals refund held coins when applicable.",
  "Offerwall rewards may require validation from the offer provider before credit is final.",
];
export default function TermsScreen() {
  const colors = useColors(); const insets = useSafeAreaInsets(); const topPad = Platform.OS === "web" ? 28 : insets.top + 8;
  return <View style={[styles.root, { backgroundColor: colors.background, paddingTop: topPad }]}><View style={styles.header}><Pressable onPress={() => router.back()} style={[styles.back, { backgroundColor: colors.card, borderColor: colors.border }]}><Feather name="arrow-left" size={20} color={colors.foreground} /></Pressable><View style={{ flex: 1 }}><Text style={[styles.title, { color: colors.foreground }]}>Terms & Conditions</Text><Text style={[styles.subtitle, { color: colors.mutedForeground }]}>Fair play and payout rules</Text></View></View><ScrollView contentContainerStyle={{ padding: 18, paddingBottom: 34 }} showsVerticalScrollIndicator={false}><View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>{terms.map((term, index) => <View key={term} style={styles.termRow}><View style={[styles.index, { backgroundColor: colors.gold + "18" }]}><Text style={[styles.indexText, { color: colors.gold }]}>{index + 1}</Text></View><Text style={[styles.termText, { color: colors.mutedForeground }]}>{term}</Text></View>)}</View></ScrollView></View>;
}
const styles = StyleSheet.create({ root: { flex: 1 }, header: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 16, paddingBottom: 10 }, back: { width: 40, height: 40, borderRadius: 12, borderWidth: 1, alignItems: "center", justifyContent: "center" }, title: { fontFamily: "Inter_700Bold", fontSize: 22, lineHeight: 28 }, subtitle: { fontFamily: "Inter_400Regular", fontSize: 12, lineHeight: 16, marginTop: 2 }, card: { borderWidth: 1, borderRadius: 18, padding: 14, gap: 12 }, termRow: { flexDirection: "row", gap: 12, alignItems: "flex-start" }, index: { width: 26, height: 26, borderRadius: 8, alignItems: "center", justifyContent: "center" }, indexText: { fontFamily: "Inter_700Bold", fontSize: 12, lineHeight: 16 }, termText: { flex: 1, fontFamily: "Inter_400Regular", fontSize: 13, lineHeight: 20 } });
