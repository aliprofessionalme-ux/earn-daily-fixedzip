import { Feather } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import React from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";

const steps = [
  { icon: "star" as const, title: "Earn safely", body: "Check-in, Spin and Scratch earn Energy. Earning tasks add Pending Coins after provider verification." },
  { icon: "repeat" as const, title: "Confirm rewards", body: "Pending Coins become Confirmed Coins after hold, verification, or admin approval." },
  { icon: "credit-card" as const, title: "Withdraw safely", body: "Withdrawals use Confirmed Coins only and follow the backend minimum and conversion rate." },
  { icon: "shield" as const, title: "Fair play", body: "No VPN/proxy, bots, fake activity or multiple accounts. Suspicious activity can block rewards and withdrawals." },
];

export function Onboarding({ onDone }: { onDone: () => void }) {
  const colors = useColors();
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}> 
      <LinearGradient colors={["#1A0A3A", "#0D0D1A"]} style={StyleSheet.absoluteFillObject} />
      <ScrollView contentContainerStyle={{ paddingTop: insets.top + 28, paddingBottom: insets.bottom + 28, paddingHorizontal: 20 }} showsVerticalScrollIndicator={false}>
        <View style={[styles.hero, { borderColor: colors.gold + "44" }]}> 
          <Feather name="gift" size={34} color={colors.gold} />
          <Text style={[styles.title, { color: colors.foreground }]}>Welcome to Earn Daily</Text>
          <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>Earn Energy from daily actions, complete tasks for Pending Coins, and withdraw only Confirmed Coins.</Text>
        </View>

        <View style={styles.list}>
          {steps.map((step) => (
            <View key={step.title} style={[styles.step, { backgroundColor: colors.card, borderColor: colors.border }]}> 
              <View style={[styles.iconBox, { backgroundColor: colors.gold + "18" }]}> 
                <Feather name={step.icon} size={20} color={colors.gold} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.stepTitle, { color: colors.foreground }]}>{step.title}</Text>
                <Text style={[styles.stepBody, { color: colors.mutedForeground }]}>{step.body}</Text>
              </View>
            </View>
          ))}
        </View>

        <Pressable onPress={onDone} style={({ pressed }) => [{ opacity: pressed ? 0.88 : 1, transform: [{ scale: pressed ? 0.99 : 1 }] }]}> 
          <LinearGradient colors={[colors.goldLight, colors.gold, colors.orange]} style={styles.button}>
            <Text style={styles.buttonText}>I Understand · Start Earning</Text>
            <Feather name="arrow-right" size={18} color="#120900" />
          </LinearGradient>
        </Pressable>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  hero: { borderWidth: 1, borderRadius: 24, padding: 18, alignItems: "center", backgroundColor: "rgba(255,255,255,0.05)", marginBottom: 14 },
  title: { fontFamily: "Inter_700Bold", fontSize: 24, lineHeight: 30, textAlign: "center", marginTop: 10 },
  subtitle: { fontFamily: "Inter_400Regular", fontSize: 13, lineHeight: 18, textAlign: "center", marginTop: 6 },
  list: { gap: 10, marginBottom: 16 },
  step: { flexDirection: "row", gap: 12, borderWidth: 1, borderRadius: 16, padding: 14 },
  iconBox: { width: 38, height: 38, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  stepTitle: { fontFamily: "Inter_700Bold", fontSize: 14, lineHeight: 18, marginBottom: 3 },
  stepBody: { fontFamily: "Inter_400Regular", fontSize: 12, lineHeight: 17 },
  button: { borderRadius: 16, padding: 14, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 8 },
  buttonText: { fontFamily: "Inter_700Bold", fontSize: 14, lineHeight: 18, color: "#120900" },
});
