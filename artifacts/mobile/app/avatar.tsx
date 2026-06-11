import { Feather } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { EarnDailyAvatar } from "@/components/EarnDailyAvatar";
import { useColors } from "@/hooks/useColors";
import { useUser } from "@/contexts/UserContext";
import {
  buyAvatarItem,
  equipAvatarItem,
  getAvatar,
  type AvatarItem,
  type AvatarSlot,
  type AvatarState,
} from "@/services/api";

type SlotInfo = { slot: AvatarSlot; label: string; icon: React.ComponentProps<typeof Feather>["name"] };

const SLOTS: SlotInfo[] = [
  { slot: "skinTone", label: "Face", icon: "smile" },
  { slot: "hair", label: "Hair", icon: "scissors" },
  { slot: "outfit", label: "Clothes", icon: "user" },
  { slot: "background", label: "Background", icon: "image" },
  { slot: "frame", label: "Frame", icon: "circle" },
  { slot: "seat", label: "Style", icon: "award" },
];

function rarityColor(rarity: AvatarItem["rarity"], colors: ReturnType<typeof useColors>) {
  if (rarity === "royal") return colors.gold;
  if (rarity === "rare") return colors.purpleLight;
  if (rarity === "common") return colors.green;
  return colors.mutedForeground;
}

export default function AvatarScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { deviceId, user, refreshUser } = useUser();
  const [state, setState] = useState<AvatarState | null>(null);
  const [selectedSlot, setSelectedSlot] = useState<AvatarSlot>("skinTone");
  const [loading, setLoading] = useState(true);
  const [busyItem, setBusyItem] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ text: string; ok: boolean } | null>(null);
  const topPad = Platform.OS === "web" ? 24 : insets.top + 8;

  const load = useCallback(async () => {
    if (!deviceId) return;
    setLoading(true);
    setNotice(null);
    try {
      setState(await getAvatar(deviceId));
    } catch (err) {
      setNotice({ text: err instanceof Error ? err.message : "Unable to load avatar.", ok: false });
    } finally {
      setLoading(false);
    }
  }, [deviceId]);

  useEffect(() => { void load(); }, [load]);

  const owned = useMemo(() => new Set(state?.ownedItemIds ?? []), [state?.ownedItemIds]);
  const visibleItems = useMemo(
    () => (state?.catalog ?? []).filter((item) => item.slot === selectedSlot),
    [selectedSlot, state?.catalog],
  );
  const energy = state?.energyBalance ?? user?.energyBalance ?? 0;

  const handleItemPress = useCallback(async (item: AvatarItem) => {
    if (!deviceId || !state || busyItem) return;
    const isOwned = item.priceEnergy === 0 || owned.has(item.itemId);
    const isEquipped = state.equippedAvatar[item.slot] === item.itemId;
    if (isEquipped) return;
    if (!isOwned && energy < item.priceEnergy) {
      setNotice({ text: `Need ${item.priceEnergy} Energy to unlock ${item.label}.`, ok: false });
      return;
    }

    setBusyItem(item.itemId);
    setNotice(null);
    try {
      if (!isOwned) {
        await buyAvatarItem(deviceId, item.itemId);
      }
      const next = await equipAvatarItem(deviceId, item.slot, item.itemId);
      setState(next);
      await refreshUser();
      setNotice({ text: `${item.label} equipped.`, ok: true });
    } catch (err) {
      setNotice({ text: err instanceof Error ? err.message : "Unable to update avatar.", ok: false });
    } finally {
      setBusyItem(null);
    }
  }, [busyItem, deviceId, energy, owned, refreshUser, state]);

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}> 
      <ScrollView contentContainerStyle={{ paddingTop: topPad, paddingBottom: Platform.OS === "web" ? 34 : 42, paddingHorizontal: 16 }} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} style={[styles.iconButton, { backgroundColor: colors.card, borderColor: colors.border }]}> 
            <Feather name="arrow-left" size={20} color={colors.foreground} />
          </Pressable>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={[styles.title, { color: colors.foreground }]}>Edit Avatar</Text>
            <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>Buy clothes and styles with Energy</Text>
          </View>
          <View style={[styles.energyPill, { backgroundColor: colors.gold + "18", borderColor: colors.gold + "55" }]}> 
            <Feather name="zap" size={15} color={colors.gold} />
            <Text style={[styles.energyText, { color: colors.gold }]}>{energy.toLocaleString()}</Text>
          </View>
        </View>

        <LinearGradient colors={[colors.card, colors.background]} style={[styles.previewCard, { borderColor: colors.border }]}> 
          {loading ? (
            <View style={styles.previewLoading}>
              <ActivityIndicator color={colors.gold} />
              <Text style={[styles.previewText, { color: colors.mutedForeground }]}>Loading avatar...</Text>
            </View>
          ) : (
            <>
              <EarnDailyAvatar avatar={state?.equippedAvatar ?? user?.avatarEquipped} size={132} />
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={[styles.previewTitle, { color: colors.foreground }]}>Your Earn Daily look</Text>
                <Text style={[styles.previewBody, { color: colors.mutedForeground }]}>Phase one uses built-in SVG layers, so you do not need to upload assets. Rank #1 gets the crown takht automatically.</Text>
              </View>
            </>
          )}
        </LinearGradient>

        {notice ? <Text style={[styles.notice, { color: notice.ok ? colors.green : colors.destructive }]}>{notice.text}</Text> : null}

        <View style={styles.slotRow}>
          {SLOTS.map((slot) => {
            const active = slot.slot === selectedSlot;
            return (
              <Pressable key={slot.slot} onPress={() => setSelectedSlot(slot.slot)} style={[styles.slotChip, { backgroundColor: active ? colors.primary : colors.card, borderColor: active ? colors.primary : colors.border }]}> 
                <Feather name={slot.icon} size={14} color={active ? colors.primaryForeground : colors.mutedForeground} />
                <Text style={[styles.slotText, { color: active ? colors.primaryForeground : colors.foreground }]}>{slot.label}</Text>
              </Pressable>
            );
          })}
        </View>

        <View style={styles.itemGrid}>
          {visibleItems.map((item) => {
            const itemOwned = item.priceEnergy === 0 || owned.has(item.itemId);
            const equipped = state?.equippedAvatar[item.slot] === item.itemId;
            const locked = !itemOwned && energy < item.priceEnergy;
            const busy = busyItem === item.itemId;
            const accent = rarityColor(item.rarity, colors);
            const actionLabel = equipped ? "Equipped" : itemOwned ? "Use" : `${item.priceEnergy} Energy`;
            return (
              <Pressable
                key={item.itemId}
                disabled={Boolean(busyItem) || equipped}
                onPress={() => void handleItemPress(item)}
                style={({ pressed }) => [
                  styles.itemCard,
                  { backgroundColor: colors.card, borderColor: equipped ? colors.gold : colors.border, opacity: locked ? 0.58 : pressed ? 0.82 : 1 },
                ]}
              >
                <View style={styles.itemTop}>
                  <View style={[styles.swatch, { backgroundColor: item.swatch, borderColor: accent }]} />
                  <View style={[styles.rarityPill, { backgroundColor: accent + "18", borderColor: accent + "55" }]}> 
                    <Text style={[styles.rarityText, { color: accent }]}>{item.rarity}</Text>
                  </View>
                </View>
                <Text style={[styles.itemName, { color: colors.foreground }]} numberOfLines={1}>{item.label}</Text>
                <Text style={[styles.itemDescription, { color: colors.mutedForeground }]} numberOfLines={2}>{item.description}</Text>
                <View style={[styles.itemButton, { backgroundColor: equipped ? colors.gold + "22" : itemOwned ? colors.primary + "22" : colors.background, borderColor: equipped ? colors.gold + "66" : itemOwned ? colors.primary + "66" : colors.border }]}> 
                  {busy ? <ActivityIndicator color={colors.gold} size="small" /> : <Feather name={equipped ? "check" : itemOwned ? "arrow-up-circle" : "zap"} size={13} color={equipped ? colors.gold : itemOwned ? colors.primary : colors.mutedForeground} />}
                  <Text style={[styles.itemButtonText, { color: equipped ? colors.gold : itemOwned ? colors.primary : colors.foreground }]}>{actionLabel}</Text>
                </View>
              </Pressable>
            );
          })}
        </View>

        <View style={[styles.rankInfo, { backgroundColor: colors.card, borderColor: colors.border }]}> 
          <Feather name="award" size={18} color={colors.gold} />
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={[styles.rankInfoTitle, { color: colors.foreground }]}>Rank cosmetics</Text>
            <Text style={[styles.rankInfoBody, { color: colors.mutedForeground }]}>Top users get special effects automatically: #1 crown takht, #2 silver aura, #3 bronze aura.</Text>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 14 },
  iconButton: { width: 40, height: 40, borderRadius: 12, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  title: { fontFamily: "Inter_800ExtraBold", fontSize: 22, lineHeight: 28 },
  subtitle: { fontFamily: "Inter_400Regular", fontSize: 12, lineHeight: 16, marginTop: 1 },
  energyPill: { minHeight: 34, borderWidth: 1, borderRadius: 999, paddingHorizontal: 10, flexDirection: "row", alignItems: "center", gap: 5 },
  energyText: { fontFamily: "Inter_800ExtraBold", fontSize: 13, lineHeight: 17 },
  previewCard: { minHeight: 158, borderWidth: 1, borderRadius: 20, padding: 14, flexDirection: "row", alignItems: "center", gap: 14, marginBottom: 10 },
  previewLoading: { minHeight: 128, flex: 1, alignItems: "center", justifyContent: "center", gap: 8 },
  previewText: { fontFamily: "Inter_500Medium", fontSize: 12, lineHeight: 16 },
  previewTitle: { fontFamily: "Inter_800ExtraBold", fontSize: 18, lineHeight: 23 },
  previewBody: { fontFamily: "Inter_400Regular", fontSize: 12, lineHeight: 17, marginTop: 7 },
  notice: { fontFamily: "Inter_700Bold", fontSize: 12, lineHeight: 16, textAlign: "center", marginBottom: 10 },
  slotRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 12 },
  slotChip: { minHeight: 34, borderWidth: 1, borderRadius: 999, paddingHorizontal: 10, flexDirection: "row", alignItems: "center", gap: 6 },
  slotText: { fontFamily: "Inter_700Bold", fontSize: 11, lineHeight: 15 },
  itemGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  itemCard: { width: "48%", minHeight: 156, borderWidth: 1, borderRadius: 16, padding: 11 },
  itemTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 10 },
  swatch: { width: 34, height: 34, borderRadius: 12, borderWidth: 2 },
  rarityPill: { minHeight: 22, borderWidth: 1, borderRadius: 999, paddingHorizontal: 7, justifyContent: "center" },
  rarityText: { fontFamily: "Inter_700Bold", fontSize: 9, lineHeight: 12, textTransform: "uppercase" },
  itemName: { fontFamily: "Inter_800ExtraBold", fontSize: 14, lineHeight: 18 },
  itemDescription: { fontFamily: "Inter_400Regular", fontSize: 11, lineHeight: 15, marginTop: 4, minHeight: 30 },
  itemButton: { minHeight: 32, borderWidth: 1, borderRadius: 999, paddingHorizontal: 8, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 5, marginTop: "auto" },
  itemButtonText: { fontFamily: "Inter_700Bold", fontSize: 11, lineHeight: 15 },
  rankInfo: { borderWidth: 1, borderRadius: 16, padding: 12, flexDirection: "row", gap: 10, marginTop: 14 },
  rankInfoTitle: { fontFamily: "Inter_800ExtraBold", fontSize: 14, lineHeight: 18 },
  rankInfoBody: { fontFamily: "Inter_400Regular", fontSize: 12, lineHeight: 17, marginTop: 2 },
});
