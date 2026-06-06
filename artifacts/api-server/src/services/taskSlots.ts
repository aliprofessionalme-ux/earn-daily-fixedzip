import {
  getAppSettings,
  getFirestoreDb,
  getTodayString,
  HttpError,
  nowTs,
  requireUser,
  type AppSettings,
  type FirestoreUser,
} from "./firebase-admin.js";

const DEFAULT_FREE_TASK_SLOTS = 3;
const DEFAULT_ENERGY_PER_EXTRA_SLOT = 10;
const DEFAULT_MAX_EXTRA_SLOTS = 3;

type Provider = "monlix" | "tapjoy" | "ayet" | "pubscale";

export interface TaskSlotPolicy {
  freeTaskSlots: number;
  energyPerExtraSlot: number;
  maxExtraSlots: number;
}

export interface TaskSlotStatus extends TaskSlotPolicy {
  resetDate: string;
  usedToday: number;
  extraSlotsUnlocked: number;
  totalSlots: number;
  slotsRemaining: number;
  locked: boolean;
  canUnlock: boolean;
  energyBalance: number;
  nextUnlockEnergyNeeded: number;
}

export interface TaskSlotReservationResult {
  reserved: boolean;
  duplicate: boolean;
  reservationId: string;
  taskSlots: TaskSlotStatus | null;
  message: string;
}

function numberValue(value: unknown, fallback = 0): number {
  const n = Number(value ?? fallback);
  return Number.isFinite(n) ? n : fallback;
}

function positiveInt(value: unknown, fallback: number): number {
  const n = Math.floor(numberValue(value, fallback));
  return n > 0 ? n : fallback;
}

function envValue(name: string): string | undefined {
  const value = String(process.env[name] ?? "").trim();
  return value || undefined;
}

export function getTaskSlotPolicy(settings: Partial<Pick<AppSettings, "freeTaskSlots" | "energyPerExtraSlot" | "maxExtraSlots">> = {}): TaskSlotPolicy {
  const configuredCost =
    envValue("TASK_SLOT_ENERGY_COST") ??
    envValue("ENERGY_PER_EXTRA_TASK_SLOT") ??
    (Number(settings.energyPerExtraSlot) > DEFAULT_ENERGY_PER_EXTRA_SLOT ? String(settings.energyPerExtraSlot) : undefined);

  return {
    freeTaskSlots: positiveInt(envValue("TASK_SLOT_FREE_DAILY") ?? settings.freeTaskSlots, DEFAULT_FREE_TASK_SLOTS),
    energyPerExtraSlot: positiveInt(configuredCost, DEFAULT_ENERGY_PER_EXTRA_SLOT),
    maxExtraSlots: positiveInt(envValue("TASK_SLOT_MAX_EXTRA") ?? settings.maxExtraSlots, DEFAULT_MAX_EXTRA_SLOTS),
  };
}

export function withTaskSlotPolicy<T extends Partial<AppSettings>>(settings: T): T & TaskSlotPolicy {
  return { ...settings, ...getTaskSlotPolicy(settings) };
}

function dailyCounters(user: Partial<FirestoreUser>, today: string) {
  const sameDay = user.lastTaskSlotResetDate === today;
  return {
    usedToday: sameDay ? Math.max(0, Math.floor(numberValue(user.taskSlotsUsedToday))) : 0,
    extraSlotsUnlocked: sameDay ? Math.max(0, Math.floor(numberValue(user.extraSlotsUnlocked))) : 0,
  };
}

function buildTaskSlotStatus(user: Partial<FirestoreUser>, policy: TaskSlotPolicy, today: string): TaskSlotStatus {
  const counters = dailyCounters(user, today);
  const extraSlotsUnlocked = Math.min(counters.extraSlotsUnlocked, policy.maxExtraSlots);
  const totalSlots = policy.freeTaskSlots + extraSlotsUnlocked;
  const usedToday = Math.min(counters.usedToday, totalSlots);
  const slotsRemaining = Math.max(0, totalSlots - usedToday);
  const energyBalance = Math.max(0, Math.floor(numberValue(user.energyBalance)));
  const canUnlock = extraSlotsUnlocked < policy.maxExtraSlots && energyBalance >= policy.energyPerExtraSlot;

  return {
    ...policy,
    resetDate: today,
    usedToday,
    extraSlotsUnlocked,
    totalSlots,
    slotsRemaining,
    locked: slotsRemaining <= 0,
    canUnlock,
    energyBalance,
    nextUnlockEnergyNeeded: Math.max(0, policy.energyPerExtraSlot - energyBalance),
  };
}

export async function getTaskSlotStatus(deviceId: string): Promise<TaskSlotStatus> {
  const db = getFirestoreDb();
  const settings = await getAppSettings();
  const policy = getTaskSlotPolicy(settings);
  const today = getTodayString(process.env["APP_TIMEZONE"] || "Asia/Karachi");

  return db.runTransaction(async (tx) => {
    const { ref, user } = await requireUser(tx, deviceId);
    const status = buildTaskSlotStatus(user, policy, today);

    if (user.lastTaskSlotResetDate !== today) {
      tx.set(ref, {
        taskSlotsUsedToday: 0,
        extraSlotsUnlocked: 0,
        lastTaskSlotResetDate: today,
        updatedAt: nowTs(),
      }, { merge: true });
    }

    return status;
  });
}

export async function unlockExtraTaskSlot(deviceId: string) {
  const db = getFirestoreDb();
  const settings = await getAppSettings();
  const policy = getTaskSlotPolicy(settings);
  const today = getTodayString(process.env["APP_TIMEZONE"] || "Asia/Karachi");

  return db.runTransaction(async (tx) => {
    const { ref, user } = await requireUser(tx, deviceId);
    const currentStatus = buildTaskSlotStatus(user, policy, today);

    if (currentStatus.extraSlotsUnlocked >= policy.maxExtraSlots) {
      throw new HttpError(400, `Maximum extra slots reached (${policy.maxExtraSlots}).`, "max_extra_slots_reached");
    }

    if (currentStatus.energyBalance < policy.energyPerExtraSlot) {
      throw new HttpError(
        400,
        `Need ${policy.energyPerExtraSlot} Energy to unlock 1 more task. You have ${currentStatus.energyBalance}.`,
        "insufficient_energy",
      );
    }

    const energyAfter = currentStatus.energyBalance - policy.energyPerExtraSlot;
    const extraSlotsAfter = currentStatus.extraSlotsUnlocked + 1;
    const userAfter: Partial<FirestoreUser> = {
      ...user,
      energyBalance: energyAfter,
      taskSlotsUsedToday: currentStatus.usedToday,
      extraSlotsUnlocked: extraSlotsAfter,
      lastTaskSlotResetDate: today,
    };
    const taskSlots = buildTaskSlotStatus(userAfter, policy, today);

    tx.set(ref, {
      energyBalance: energyAfter,
      taskSlotsUsedToday: currentStatus.usedToday,
      extraSlotsUnlocked: extraSlotsAfter,
      lastTaskSlotResetDate: today,
      updatedAt: nowTs(),
      lastActiveAt: nowTs(),
    }, { merge: true });

    const ledgerRef = db.collection("coinTransactions").doc();
    tx.set(ledgerRef, {
      transactionId: ledgerRef.id,
      deviceId,
      type: "energy_purchase_slot",
      coinsChange: 0,
      pkrChange: 0,
      balanceAfterCoins: user.confirmedCoinsBalance ?? user.coinsBalance ?? 0,
      balanceAfterPKR: user.pkrBalance ?? 0,
      source: "task_slot",
      status: "spent",
      metadata: {
        energyCost: policy.energyPerExtraSlot,
        freeTaskSlots: policy.freeTaskSlots,
        maxExtraSlots: policy.maxExtraSlots,
        usedToday: currentStatus.usedToday,
        extraSlotsAfter,
        totalSlotsAfter: taskSlots.totalSlots,
      },
      createdAt: nowTs(),
    });

    return {
      success: true,
      message: `Unlocked 1 extra task for ${policy.energyPerExtraSlot} Energy!`,
      energyAfter,
      extraSlots: extraSlotsAfter,
      taskSlots,
    };
  });
}

export async function reserveProviderTaskSlot(params: {
  deviceId: string;
  provider: Provider;
  externalTransactionId: string;
}): Promise<TaskSlotReservationResult> {
  const db = getFirestoreDb();
  const settings = await getAppSettings();
  const policy = getTaskSlotPolicy(settings);
  const today = getTodayString(process.env["APP_TIMEZONE"] || "Asia/Karachi");
  const reservationId = `${params.provider}:${params.externalTransactionId}`;
  const reservationRef = db.collection("taskSlotReservations").doc(reservationId);
  const rewardDedupeRef = db.collection("webhookDedupe").doc(reservationId);

  return db.runTransaction(async (tx) => {
    const rewardDedupeSnap = await tx.get(rewardDedupeRef);
    const reservationSnap = await tx.get(reservationRef);

    if (rewardDedupeSnap.exists) {
      return {
        reserved: false,
        duplicate: true,
        reservationId,
        taskSlots: null,
        message: "Duplicate provider reward already processed.",
      };
    }

    if (reservationSnap.exists) {
      const previous = reservationSnap.data() ?? {};
      if (previous.status === "credited") {
        return {
          reserved: false,
          duplicate: true,
          reservationId,
          taskSlots: null,
          message: "Duplicate task slot reservation ignored.",
        };
      }
      if (previous.status === "reserved") {
        return {
          reserved: false,
          duplicate: false,
          reservationId,
          taskSlots: null,
          message: "Existing task slot reservation reused.",
        };
      }
    }

    const { ref, user } = await requireUser(tx, params.deviceId);
    const currentStatus = buildTaskSlotStatus(user, policy, today);

    if (currentStatus.locked) {
      throw new HttpError(
        429,
        `Daily task limit reached. Unlock 1 more task with ${policy.energyPerExtraSlot} Energy.`,
        "daily_task_slots_exhausted",
      );
    }

    const usedAfter = currentStatus.usedToday + 1;
    const userAfter: Partial<FirestoreUser> = {
      ...user,
      taskSlotsUsedToday: usedAfter,
      extraSlotsUnlocked: currentStatus.extraSlotsUnlocked,
      lastTaskSlotResetDate: today,
    };
    const taskSlots = buildTaskSlotStatus(userAfter, policy, today);

    tx.set(ref, {
      taskSlotsUsedToday: usedAfter,
      extraSlotsUnlocked: currentStatus.extraSlotsUnlocked,
      lastTaskSlotResetDate: today,
      updatedAt: nowTs(),
      lastActiveAt: nowTs(),
    }, { merge: true });

    tx.set(reservationRef, {
      reservationId,
      deviceId: params.deviceId,
      provider: params.provider,
      externalTransactionId: params.externalTransactionId,
      status: "reserved",
      usedTodayAfter: usedAfter,
      freeTaskSlots: policy.freeTaskSlots,
      extraSlotsUnlocked: currentStatus.extraSlotsUnlocked,
      totalSlots: taskSlots.totalSlots,
      createdAt: nowTs(),
      updatedAt: nowTs(),
    });

    return {
      reserved: true,
      duplicate: false,
      reservationId,
      taskSlots,
      message: `Task slot ${usedAfter}/${taskSlots.totalSlots} reserved.`,
    };
  });
}

export async function markProviderTaskSlotCredited(reservationId: string) {
  if (!reservationId) return;
  const db = getFirestoreDb();
  await db.collection("taskSlotReservations").doc(reservationId).set({
    status: "credited",
    creditedAt: nowTs(),
    updatedAt: nowTs(),
  }, { merge: true });
}

export async function releaseProviderTaskSlotReservation(reservationId: string, reason: string) {
  if (!reservationId) return;
  const db = getFirestoreDb();
  const today = getTodayString(process.env["APP_TIMEZONE"] || "Asia/Karachi");
  const reservationRef = db.collection("taskSlotReservations").doc(reservationId);

  await db.runTransaction(async (tx) => {
    const reservationSnap = await tx.get(reservationRef);
    if (!reservationSnap.exists) return;
    const reservation = reservationSnap.data() ?? {};
    if (reservation.status !== "reserved") return;

    const deviceId = String(reservation.deviceId ?? "");
    if (deviceId) {
      const userRef = db.collection("users").doc(deviceId);
      const userSnap = await tx.get(userRef);
      if (userSnap.exists) {
        const user = userSnap.data() as Partial<FirestoreUser>;
        const usedToday = user.lastTaskSlotResetDate === today ? Math.max(0, Math.floor(numberValue(user.taskSlotsUsedToday))) : 0;
        tx.set(userRef, {
          taskSlotsUsedToday: Math.max(0, usedToday - 1),
          updatedAt: nowTs(),
        }, { merge: true });
      }
    }

    tx.set(reservationRef, {
      status: "released",
      releaseReason: reason,
      releasedAt: nowTs(),
      updatedAt: nowTs(),
    }, { merge: true });
  });
}
