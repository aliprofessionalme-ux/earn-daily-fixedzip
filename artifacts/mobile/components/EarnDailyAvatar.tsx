import React, { useMemo } from "react";
import Svg, { Circle, Defs, Ellipse, G, LinearGradient, Path, Polygon, Rect, Stop } from "react-native-svg";

import type { EquippedAvatar } from "@/services/api";

const DEFAULT_AVATAR: EquippedAvatar = {
  skinTone: "skin_warm",
  hair: "hair_clean",
  outfit: "outfit_basic",
  background: "bg_studio",
  frame: "frame_none",
  seat: "seat_none",
};

const SKIN: Record<string, string> = {
  skin_warm: "#D89B63",
  skin_light: "#F2C8A4",
  skin_brown: "#A8683D",
  skin_deep: "#6D3D2A",
};

const HAIR: Record<string, { fill: string; accent?: string }> = {
  hair_clean: { fill: "#24160F" },
  hair_wave: { fill: "#1F2937", accent: "#334155" },
  hair_fade: { fill: "#111827", accent: "#0F172A" },
  hair_gold_tip: { fill: "#17120A", accent: "#F2C94C" },
};

const OUTFIT: Record<string, { fill: string; accent: string }> = {
  outfit_basic: { fill: "#38BDF8", accent: "#0EA5E9" },
  outfit_runner: { fill: "#22C55E", accent: "#15803D" },
  outfit_business: { fill: "#334155", accent: "#CBD5E1" },
  outfit_royal_jacket: { fill: "#111318", accent: "#F2C94C" },
};

const BACKGROUND: Record<string, { start: string; end: string; glow: string }> = {
  bg_studio: { start: "#E0F2FE", end: "#7DD3FC", glow: "#FFFFFF" },
  bg_green: { start: "#DCFCE7", end: "#22C55E", glow: "#F0FDF4" },
  bg_gold_city: { start: "#FFF3BF", end: "#D97706", glow: "#FDE68A" },
  bg_night_vault: { start: "#050607", end: "#3A3324", glow: "#F2C94C" },
};

const FRAME: Record<string, string> = {
  frame_none: "rgba(255,255,255,0.72)",
  frame_green: "#22C55E",
  frame_gold: "#F2C94C",
};

function mergeAvatar(avatar?: EquippedAvatar | null): EquippedAvatar {
  return { ...DEFAULT_AVATAR, ...(avatar ?? {}) };
}

function rankColor(rank?: number | null) {
  if (rank === 1) return "#F2C94C";
  if (rank === 2) return "#CBD5E1";
  if (rank === 3) return "#FB923C";
  return null;
}

export function EarnDailyAvatar({ avatar, rank = null, size = 76 }: { avatar?: EquippedAvatar | null; rank?: number | null; size?: number }) {
  const merged = useMemo(() => mergeAvatar(avatar), [avatar]);
  const ids = useMemo(() => {
    const suffix = Math.random().toString(36).slice(2, 9);
    return { bg: `avatarBg_${suffix}`, gold: `avatarGold_${suffix}` };
  }, []);
  const skin = SKIN[merged.skinTone] ?? SKIN.skin_warm;
  const hair = HAIR[merged.hair] ?? HAIR.hair_clean;
  const outfit = OUTFIT[merged.outfit] ?? OUTFIT.outfit_basic;
  const bg = BACKGROUND[merged.background] ?? BACKGROUND.bg_studio;
  const frame = FRAME[merged.frame] ?? FRAME.frame_none;
  const medal = rankColor(rank);
  const royalRank = rank === 1;
  const seated = royalRank || merged.seat === "seat_stool" || merged.seat === "seat_lounge";

  return (
    <Svg width={size} height={size} viewBox="0 0 120 120">
      <Defs>
        <LinearGradient id={ids.bg} x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor={bg.start} />
          <Stop offset="1" stopColor={bg.end} />
        </LinearGradient>
        <LinearGradient id={ids.gold} x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor="#FFE68A" />
          <Stop offset="1" stopColor="#B8860B" />
        </LinearGradient>
      </Defs>

      <Circle cx="60" cy="60" r="57" fill={`url(#${ids.bg})`} />
      <Circle cx="84" cy="30" r="24" fill={bg.glow} opacity="0.22" />
      <Circle cx="34" cy="86" r="30" fill="#FFFFFF" opacity="0.14" />

      {royalRank ? (
        <G>
          <Rect x="20" y="54" width="80" height="52" rx="15" fill="#3A2507" opacity="0.94" />
          <Rect x="26" y="48" width="68" height="20" rx="10" fill={`url(#${ids.gold})`} />
          <Rect x="31" y="53" width="58" height="11" rx="6" fill="#1A1205" opacity="0.68" />
        </G>
      ) : seated ? (
        <G opacity="0.92">
          <Ellipse cx="60" cy="94" rx="35" ry="14" fill={merged.seat === "seat_lounge" ? "#7C2D12" : "#4C1D95"} />
          <Rect x="30" y="76" width="60" height="25" rx="13" fill={merged.seat === "seat_lounge" ? "#B45309" : "#8B5CF6"} />
        </G>
      ) : null}

      <Path d="M32 103 C36 79 45 68 60 68 C75 68 84 79 88 103 Z" fill={outfit.fill} />
      <Path d="M45 82 H75 L71 103 H49 Z" fill={outfit.accent} opacity="0.88" />
      <Path d="M56 70 L60 79 L64 70" fill="none" stroke="#FFFFFF" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" opacity="0.86" />

      <Circle cx="60" cy="50" r="23" fill={skin} />
      <Path d="M38 47 C39 27 51 18 66 23 C79 27 84 38 82 53 C74 39 55 43 44 39 C43 42 41 45 38 47 Z" fill={hair.fill} />
      {hair.accent ? <Path d="M47 31 C56 24 67 25 75 36" fill="none" stroke={hair.accent} strokeWidth="4" strokeLinecap="round" /> : null}
      {merged.hair === "hair_wave" ? <Path d="M43 38 C49 31 55 43 62 35 C68 29 73 35 77 40" fill="none" stroke="#64748B" strokeWidth="2.4" strokeLinecap="round" opacity="0.65" /> : null}
      {merged.hair === "hair_fade" ? <Rect x="37" y="39" width="9" height="18" rx="4" fill="#0B1120" opacity="0.88" /> : null}

      <Circle cx="51" cy="51" r="2.2" fill="#111827" opacity="0.85" />
      <Circle cx="68" cy="51" r="2.2" fill="#111827" opacity="0.85" />
      <Path d="M54 61 C58 65 64 65 68 61" fill="none" stroke="#7C2D12" strokeWidth="2.6" strokeLinecap="round" opacity="0.72" />

      {medal ? (
        <G>
          <Circle cx="90" cy="30" r="13" fill={medal} opacity="0.95" />
          <TextLikeRank rank={rank ?? 0} />
        </G>
      ) : null}

      {royalRank ? (
        <G>
          <Polygon points="40,27 48,13 57,27 65,12 73,27" fill={`url(#${ids.gold})`} />
          <Rect x="39" y="26" width="35" height="8" rx="4" fill={`url(#${ids.gold})`} />
          <Circle cx="48" cy="15" r="3" fill="#FFF3BF" />
          <Circle cx="65" cy="14" r="3" fill="#FFF3BF" />
        </G>
      ) : null}

      <Circle cx="60" cy="60" r="57" fill="none" stroke={medal ?? frame} strokeWidth={medal ? 4 : 2.5} />
      <Circle cx="60" cy="60" r="51" fill="none" stroke="#FFFFFF" strokeWidth="1" opacity="0.16" />
    </Svg>
  );
}

function TextLikeRank({ rank }: { rank: number }) {
  const first = rank === 1;
  return (
    <G>
      <Path d={first ? "M85 29 L89 24 L93 29" : "M85 34 H95"} fill="none" stroke="#111827" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
      <Path d={first ? "M89 24 V36" : "M90 24 V36"} fill="none" stroke="#111827" strokeWidth="2.2" strokeLinecap="round" />
    </G>
  );
}
