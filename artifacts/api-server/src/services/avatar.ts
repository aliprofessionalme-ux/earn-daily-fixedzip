import admin from "firebase-admin";
import { getFirestoreDb, HttpError, nowTs } from "./firebase-admin.js";

export type AvatarSlot = "skinTone" | "hair" | "outfit" | "background" | "frame" | "seat";
export type AvatarRarity = "free" | "common" | "rare" | "royal";

export interface AvatarItem {
  itemId: string;
  slot: AvatarSlot;
  label: string;
  description: string;
  priceEnergy: number;
  rarity: AvatarRarity;
  swatch: string;
}

export interface EquippedAvatar {
  skinTone: string;
  hair: string;
  outfit: string;
  background: string;
  frame: string;
  seat: string;
}

export interface AvatarState {
  catalog: AvatarItem[];
  ownedItemIds: string[];
  equippedAvatar: EquippedAvatar;
  energyBalance: number;
  rankPerks: Array<{ rank: number; label: string; description: string }>;
}

export const DEFAULT_AVATAR_EQUIPPED: EquippedAvatar = {
  skinTone: "skin_warm",
  hair: "hair_clean",
  outfit: "outfit_basic",
  background: "bg_studio",
  frame: "frame_none",
  seat: "seat_none",
};

export const AVATAR_CATALOG: AvatarItem[] = [
  { itemId: "skin_warm", slot: "skinTone", label: "Warm", description: "Default warm skin tone.", priceEnergy: 0, rarity: "free", swatch: "#D89B63" },
  { itemId: "skin_light", slot: "skinTone", label: "Light", description: "Clean light skin tone.", priceEnergy: 0, rarity: "free", swatch: "#F2C8A4" },
  { itemId: "skin_brown", slot: "skinTone", label: "Brown", description: "Rich brown skin tone.", priceEnergy: 0, rarity: "free", swatch: "#A8683D" },
  { itemId: "skin_deep", slot: "skinTone", label: "Deep", description: "Deep skin tone.", priceEnergy: 0, rarity: "free", swatch: "#6D3D2A" },

  { itemId: "hair_clean", slot: "hair", label: "Clean Cut", description: "Simple everyday hair.", priceEnergy: 0, rarity: "free", swatch: "#24160F" },
  { itemId: "hair_wave", slot: "hair", label: "Soft Waves", description: "A polished wavy style.", priceEnergy: 35, rarity: "common", swatch: "#1F2937" },
  { itemId: "hair_fade", slot: "hair", label: "Sharp Fade", description: "Crisp side fade look.", priceEnergy: 60, rarity: "common", swatch: "#111827" },
  { itemId: "hair_gold_tip", slot: "hair", label: "Gold Tip", description: "Premium gold highlight hair.", priceEnergy: 120, rarity: "rare", swatch: "#F2C94C" },

  { itemId: "outfit_basic", slot: "outfit", label: "Daily Fit", description: "Clean Earn Daily outfit.", priceEnergy: 0, rarity: "free", swatch: "#38BDF8" },
  { itemId: "outfit_runner", slot: "outfit", label: "Runner", description: "Sporty active outfit.", priceEnergy: 80, rarity: "common", swatch: "#22C55E" },
  { itemId: "outfit_business", slot: "outfit", label: "Smart Vest", description: "Professional reward hunter look.", priceEnergy: 140, rarity: "rare", swatch: "#334155" },
  { itemId: "outfit_royal_jacket", slot: "outfit", label: "Royal Jacket", description: "Black and gold premium jacket.", priceEnergy: 180, rarity: "royal", swatch: "#D6A62C" },

  { itemId: "bg_studio", slot: "background", label: "Studio", description: "Clean default backdrop.", priceEnergy: 0, rarity: "free", swatch: "#0EA5E9" },
  { itemId: "bg_green", slot: "background", label: "Fresh Green", description: "Light growth-themed backdrop.", priceEnergy: 60, rarity: "common", swatch: "#16A34A" },
  { itemId: "bg_gold_city", slot: "background", label: "Gold City", description: "Premium earning city glow.", priceEnergy: 140, rarity: "rare", swatch: "#F59E0B" },
  { itemId: "bg_night_vault", slot: "background", label: "Night Vault", description: "Dark gold vault backdrop.", priceEnergy: 220, rarity: "royal", swatch: "#111318" },

  { itemId: "frame_none", slot: "frame", label: "No Frame", description: "Clean avatar edge.", priceEnergy: 0, rarity: "free", swatch: "#E5E7EB" },
  { itemId: "frame_green", slot: "frame", label: "Green Ring", description: "Fresh progress ring.", priceEnergy: 70, rarity: "common", swatch: "#22C55E" },
  { itemId: "frame_gold", slot: "frame", label: "Gold Ring", description: "Premium gold avatar ring.", priceEnergy: 180, rarity: "rare", swatch: "#F2C94C" },

  { itemId: "seat_none", slot: "seat", label: "Standing", description: "Default standing pose.", priceEnergy: 0, rarity: "free", swatch: "#94A3B8" },
  { itemId: "seat_stool", slot: "seat", label: "Creator Stool", description: "Casual seated pose.", priceEnergy: 100, rarity: "common", swatch: "#8B5CF6" },
  { itemId: "seat_lounge", slot: "seat", label: "Lounge Seat", description: "Comfort reward seat.", priceEnergy: 180, rarity: "rare", swatch: "#B45309" },
];

export const AVATAR_SLOTS: AvatarSlot[] = ["skinTone", "hair", "outfit", "background", "frame", "seat"];

const CATALOG_BY_ID = new Map(AVATAR_CATALOG.map((item) => [item.itemId, item]));
const DEFAULT_OWNED_IDS = AVATAR_CATALOG.filter((item) => item.priceEnergy === 0).map((item) => item.itemId);

function numberValue(value: unknown): number {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

export function isAvatarSlot(value: unknown): value is AvatarSlot {
  return typeof value === "string" && AVATAR_SLOTS.includes(value as AvatarSlot);
}

function normalizeOwnedItemIds(value: unknown): string[] {
  const raw = Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
  return Array.from(new Set([...DEFAULT_OWNED_IDS, ...raw])).filter((itemId) => CATALOG_BY_ID.has(itemId));
}

function normalizeEquippedAvatar(value: unknown, ownedItemIds: string[]): EquippedAvatar {
  const owned = new Set(ownedItemIds);
  const raw = value && typeof value === "object" ? value as Partial<EquippedAvatar> : {};
  const next = { ...DEFAULT_AVATAR_EQUIPPED };

  for (const slot of AVATAR_SLOTS) {
    const candidate = raw[slot];
    const item = typeof candidate === "string" ? CATALOG_BY_ID.get(candidate) : null;
    if (item && item.slot === slot && (item.priceEnergy === 0 || owned.has(item.itemId))) {
      next[slot] = item.itemId;
    }
  }

  return next;
}

function getCatalogItem(itemId: string): AvatarItem {
  const item = CATALOG_BY_ID.get(String(itemId || ""));
  if (!item) throw new HttpError(404, "Avatar item not found.", "avatar_item_not_found");
  return item;
}

function rankPerks() {
  return [
    { rank: 1, label: "Crown Takht", description: "Rank #1 automatically appears with a crown and royal takht." },
    { rank: 2, label: "Silver Aura", description: "Rank #2 receives a silver spotlight frame." },
    { rank: 3, label: "Bronze Aura", description: "Rank #3 receives a bronze spotlight frame." },
  ];
}

export async function getAvatarState(deviceId: string): Promise<AvatarState> {
  const db = getFirestoreDb();
  const ref = db.collection("users").doc(deviceId);
  const snap = await ref.get();
  if (!snap.exists) throw new HttpError(404, "User not found.", "user_not_found");
  const user = snap.data() ?? {};
  const ownedItemIds = normalizeOwnedItemIds(user.avatarOwnedItemIds);
  const equippedAvatar = normalizeEquippedAvatar(user.avatarEquipped, ownedItemIds);

  if (!Array.isArray(user.avatarOwnedItemIds) || !user.avatarEquipped) {
    await ref.set({ avatarOwnedItemIds: ownedItemIds, avatarEquipped: equippedAvatar, updatedAt: nowTs() }, { merge: true });
  }

  return {
    catalog: AVATAR_CATALOG,
    ownedItemIds,
    equippedAvatar,
    energyBalance: numberValue(user.energyBalance),
    rankPerks: rankPerks(),
  };
}

export async function buyAvatarItem(deviceId: string, itemId: string): Promise<AvatarState> {
  const item = getCatalogItem(itemId);
  const db = getFirestoreDb();
  const ref = db.collection("users").doc(deviceId);

  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new HttpError(404, "User not found.", "user_not_found");
    const user = snap.data() ?? {};
    if (user.isBanned) throw new HttpError(403, "Account is restricted.", "user_banned");

    const ownedItemIds = normalizeOwnedItemIds(user.avatarOwnedItemIds);
    if (ownedItemIds.includes(item.itemId)) return;

    const energyBalance = numberValue(user.energyBalance);
    if (energyBalance < item.priceEnergy) {
      throw new HttpError(400, `You need ${item.priceEnergy} Energy for ${item.label}.`, "not_enough_energy");
    }

    tx.set(ref, {
      avatarOwnedItemIds: [...ownedItemIds, item.itemId],
      avatarEnergySpent: admin.firestore.FieldValue.increment(item.priceEnergy),
      energyBalance: admin.firestore.FieldValue.increment(-item.priceEnergy),
      updatedAt: nowTs(),
      lastActiveAt: nowTs(),
    }, { merge: true });
  });

  return getAvatarState(deviceId);
}

export async function equipAvatarItem(deviceId: string, slot: AvatarSlot, itemId: string): Promise<AvatarState> {
  const item = getCatalogItem(itemId);
  if (item.slot !== slot) throw new HttpError(400, "Avatar item does not match this slot.", "avatar_slot_mismatch");

  const db = getFirestoreDb();
  const ref = db.collection("users").doc(deviceId);

  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new HttpError(404, "User not found.", "user_not_found");
    const user = snap.data() ?? {};
    if (user.isBanned) throw new HttpError(403, "Account is restricted.", "user_banned");

    const ownedItemIds = normalizeOwnedItemIds(user.avatarOwnedItemIds);
    if (item.priceEnergy > 0 && !ownedItemIds.includes(item.itemId)) {
      throw new HttpError(403, "Buy this avatar item before equipping it.", "avatar_item_not_owned");
    }

    const equippedAvatar = normalizeEquippedAvatar(user.avatarEquipped, ownedItemIds);
    tx.set(ref, {
      avatarOwnedItemIds: ownedItemIds,
      avatarEquipped: { ...equippedAvatar, [slot]: item.itemId },
      updatedAt: nowTs(),
      lastActiveAt: nowTs(),
    }, { merge: true });
  });

  return getAvatarState(deviceId);
}
