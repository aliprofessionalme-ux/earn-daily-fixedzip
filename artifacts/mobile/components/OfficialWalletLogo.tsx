import React from "react";
import { StyleSheet, Text, View } from "react-native";

type OfficialWalletLogoProps = {
  size?: number;
};

export function OfficialWalletLogo({ size = 88 }: OfficialWalletLogoProps) {
  const s = size / 96;

  return (
    <View style={[styles.root, { width: size, height: size, borderRadius: 24 * s }]}> 
      <View style={[styles.backGlow, { width: 76 * s, height: 76 * s, borderRadius: 38 * s, top: 6 * s, left: 10 * s }]} />
      <View style={[styles.ray, { width: 3 * s, height: 19 * s, top: 5 * s, left: 46.5 * s, borderRadius: 2 * s }]} />
      <View style={[styles.ray, { width: 3 * s, height: 17 * s, top: 14 * s, left: 25 * s, borderRadius: 2 * s, transform: [{ rotate: "-35deg" }] }]} />
      <View style={[styles.ray, { width: 3 * s, height: 17 * s, top: 14 * s, right: 25 * s, borderRadius: 2 * s, transform: [{ rotate: "35deg" }] }]} />
      <View style={[styles.ray, { width: 3 * s, height: 15 * s, top: 31 * s, left: 13 * s, borderRadius: 2 * s, transform: [{ rotate: "-76deg" }] }]} />
      <View style={[styles.ray, { width: 3 * s, height: 15 * s, top: 31 * s, right: 13 * s, borderRadius: 2 * s, transform: [{ rotate: "76deg" }] }]} />

      <View style={[styles.coinOuter, { width: 40 * s, height: 40 * s, borderRadius: 20 * s, top: 23 * s, left: 28 * s, borderWidth: 2 * s }]}>
        <View style={[styles.coinInner, { width: 31 * s, height: 31 * s, borderRadius: 16 * s }]}> 
          <Text style={[styles.coinText, { fontSize: 24 * s, lineHeight: 29 * s }]}>$</Text>
        </View>
      </View>

      <View style={[styles.walletBack, { width: 64 * s, height: 38 * s, borderRadius: 12 * s, left: 16 * s, top: 42 * s, borderWidth: 1.5 * s }]} />
      <View style={[styles.walletFront, { width: 72 * s, height: 34 * s, borderRadius: 13 * s, left: 12 * s, top: 50 * s, borderWidth: 1.5 * s }]} />
      <View style={[styles.walletLip, { width: 64 * s, height: 7 * s, borderRadius: 6 * s, left: 16 * s, top: 48 * s }]} />
      <View style={[styles.clasp, { width: 29 * s, height: 19 * s, borderRadius: 10 * s, right: 9 * s, top: 59 * s, borderWidth: 1.5 * s }]}>
        <View style={[styles.claspDot, { width: 9 * s, height: 9 * s, borderRadius: 5 * s }]} />
      </View>
      <View style={[styles.bottomStitch, { width: 52 * s, left: 22 * s, bottom: 10 * s }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    position: "relative",
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#070809",
    borderWidth: 1,
    borderColor: "rgba(244, 198, 67, 0.72)",
    shadowColor: "#F2C94C",
    shadowOpacity: 0.28,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 5 },
  },
  backGlow: {
    position: "absolute",
    backgroundColor: "rgba(242, 201, 76, 0.10)",
  },
  ray: {
    position: "absolute",
    backgroundColor: "#FFE97A",
    shadowColor: "#F2C94C",
    shadowOpacity: 0.8,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 0 },
  },
  coinOuter: {
    position: "absolute",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#C88B1E",
    borderColor: "#FFF1A6",
    shadowColor: "#F2C94C",
    shadowOpacity: 0.35,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
  },
  coinInner: {
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#E0AA2B",
    borderWidth: 1,
    borderColor: "rgba(86, 50, 3, 0.35)",
  },
  coinText: {
    color: "#FFF4B0",
    fontFamily: "Inter_700Bold",
    includeFontPadding: false,
    textAlign: "center",
    textShadowColor: "rgba(75, 40, 0, 0.45)",
    textShadowRadius: 2,
    textShadowOffset: { width: 0, height: 1 },
  },
  walletBack: {
    position: "absolute",
    backgroundColor: "#111315",
    borderColor: "#F4C643",
  },
  walletFront: {
    position: "absolute",
    backgroundColor: "#151719",
    borderColor: "#DCA72A",
  },
  walletLip: {
    position: "absolute",
    backgroundColor: "rgba(255, 232, 120, 0.38)",
  },
  clasp: {
    position: "absolute",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#141618",
    borderColor: "#DCA72A",
  },
  claspDot: {
    backgroundColor: "#FFD861",
    borderWidth: 1,
    borderColor: "#B87813",
  },
  bottomStitch: {
    position: "absolute",
    height: 1,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(244, 198, 67, 0.38)",
    borderStyle: "dashed",
  },
});
