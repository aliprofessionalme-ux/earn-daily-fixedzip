import React, { useEffect, useRef } from "react";
import { Animated, Easing, StyleSheet, View } from "react-native";
import Svg, { Circle, Ellipse, G, Path, Rect } from "react-native-svg";

import { useColors } from "@/hooks/useColors";

export function AnimatedEarnerMascot({ size = 128 }: { size?: number }) {
  const colors = useColors();
  const bob = useRef(new Animated.Value(0)).current;
  const coin = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const bobLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(bob, { toValue: 1, duration: 1050, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(bob, { toValue: 0, duration: 1050, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      ]),
    );
    const coinLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(coin, { toValue: 1, duration: 1350, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(coin, { toValue: 0, duration: 950, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      ]),
    );
    bobLoop.start();
    coinLoop.start();
    return () => {
      bobLoop.stop();
      coinLoop.stop();
    };
  }, [bob, coin]);

  const translateY = bob.interpolate({ inputRange: [0, 1], outputRange: [0, -7] });
  const rotate = bob.interpolate({ inputRange: [0, 1], outputRange: ["-1.5deg", "2deg"] });
  const coinY = coin.interpolate({ inputRange: [0, 1], outputRange: [0, -13] });
  const coinScale = coin.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0.9, 1.08, 0.96] });
  const coinOpacity = coin.interpolate({ inputRange: [0, 0.2, 1], outputRange: [0.55, 1, 0.72] });

  return (
    <View style={[styles.wrap, { width: size, height: size * 1.18 }]}> 
      <Animated.View style={[styles.coin, { opacity: coinOpacity, transform: [{ translateY: coinY }, { scale: coinScale }] }]}> 
        <Svg width={size * 0.28} height={size * 0.28} viewBox="0 0 40 40">
          <Circle cx="20" cy="20" r="17" fill={colors.goldLight} />
          <Circle cx="20" cy="20" r="12" fill={colors.gold} />
          <Path d="M20 10v20M14 15c1.7-2.6 9.6-2.4 10.7 1.2 1.1 3.4-8.7 2.9-8.4 6.4.2 2.8 7.5 3.4 10.1.2" stroke="#5A3800" strokeWidth="2.2" strokeLinecap="round" fill="none" />
        </Svg>
      </Animated.View>

      <Animated.View style={{ transform: [{ translateY }, { rotate }] }}>
        <Svg width={size} height={size * 1.18} viewBox="0 0 140 165">
          <Ellipse cx="71" cy="151" rx="43" ry="8" fill="rgba(0,0,0,0.13)" />

          <G>
            <Path d="M49 82c-9 10-13 24-11 41l16-1c-1-16 2-27 8-34z" fill={colors.primary} />
            <Path d="M86 84c13 8 20 20 22 36l-15 4c-3-14-9-22-18-27z" fill={colors.primary} opacity="0.92" />
            <Path d="M55 78c12-8 38-7 49 6 3 22 0 43-11 62H50c-8-21-7-45 5-68z" fill={colors.primary} />
            <Path d="M61 85c9 5 22 5 32 0" stroke="rgba(255,255,255,0.48)" strokeWidth="3" strokeLinecap="round" fill="none" />
            <Rect x="53" y="132" width="44" height="9" rx="4" fill="#2B2116" />
            <Circle cx="76" cy="136.5" r="3" fill={colors.goldLight} />
          </G>

          <G>
            <Path d="M41 114c11 5 23 8 35 9" stroke="#E9A875" strokeWidth="12" strokeLinecap="round" fill="none" />
            <Circle cx="78" cy="123" r="7" fill="#E9A875" />
            <Path d="M90 108h27c3 0 6 3 6 6v20c0 7-6 13-13 13H97c-7 0-13-6-13-13v-20c0-3 3-6 6-6z" fill="#3B3024" />
            <Path d="M95 108h22v-6H95z" fill="#D8C7A7" />
            <Path d="M98 116h20" stroke={colors.goldLight} strokeWidth="3" strokeLinecap="round" />
          </G>

          <G>
            <Path d="M50 52c0-21 15-36 36-32 19 4 27 20 23 40-5 27-28 37-47 27-9-5-12-19-12-35z" fill="#F1B184" />
            <Path d="M53 49c7-21 24-30 48-20-3-16-23-25-39-15-13 8-17 20-14 36z" fill="#1D1B18" />
            <Path d="M82 45c7 1 12 7 15 15" stroke="#D98761" strokeWidth="4" strokeLinecap="round" fill="none" />
            <Circle cx="92" cy="57" r="2.4" fill="#1D1B18" />
            <Path d="M83 72c4 4 12 4 17 0" stroke="#8A4A38" strokeWidth="3" strokeLinecap="round" fill="none" />
            <Path d="M47 62c-8-2-13 4-10 12 3 7 10 6 13 1z" fill="#F1B184" />
          </G>

          <G opacity="0.9">
            <Circle cx="37" cy="52" r="5" fill={colors.goldLight} />
            <Circle cx="30" cy="68" r="3" fill={colors.primary} />
            <Circle cx="113" cy="71" r="4" fill={colors.gold} />
            <Path d="M25 43l6 2-5 4" stroke={colors.gold} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none" />
            <Path d="M113 46l8-2-3 8" stroke={colors.primary} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none" />
          </G>
        </Svg>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: "center",
    justifyContent: "flex-end",
    overflow: "visible",
  },
  coin: {
    position: "absolute",
    right: 10,
    top: 4,
    zIndex: 2,
  },
});
