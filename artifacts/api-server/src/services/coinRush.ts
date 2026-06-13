import admin from "firebase-admin";

import { getFirestoreDb, HttpError, nowTs, requireUser } from "./firebase-admin.js";

const DEFAULT_COIN_RUSH_ENERGY_COST = 3;

function getCoinRushEnergyCost() {
  const raw = Number(process.env["COIN_RUSH_ENERGY_COST"] ?? DEFAULT_COIN_RUSH_ENERGY_COST);
  return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : DEFAULT_COIN_RUSH_ENERGY_COST;
}

export async function startCoinRushGame(deviceId: string) {
  const db = getFirestoreDb();
  const energyCost = getCoinRushEnergyCost();

  return db.runTransaction(async (tx) => {
    const { ref, user } = await requireUser(tx, deviceId);
    const currentEnergy = user.energyBalance ?? 0;

    if (currentEnergy < energyCost) {
      throw new HttpError(
        400,
        `Need ${energyCost} Energy to play Coin Rush. You have ${currentEnergy}.`,
        "insufficient_energy",
      );
    }

    const now = nowTs();
    const energyAfter = currentEnergy - energyCost;
    const txRef = db.collection("coinTransactions").doc();

    tx.update(ref, {
      energyBalance: energyAfter,
      coinRushGamesPlayed: admin.firestore.FieldValue.increment(1),
      updatedAt: now,
      lastActiveAt: now,
    });

    tx.set(txRef, {
      transactionId: txRef.id,
      deviceId,
      type: "game_energy_spend",
      coinsChange: 0,
      pkrChange: 0,
      balanceAfterCoins: user.confirmedCoinsBalance ?? user.coinsBalance ?? 0,
      balanceAfterPKR: user.pkrBalance ?? 0,
      source: "coin_rush",
      status: "spent",
      metadata: {
        energyCost,
        rewardType: "score_only",
        payoutCoins: 0,
        payoutPKR: 0,
        purpose: "coin_rush_entry",
      },
      createdAt: now,
    });

    return {
      success: true,
      message: `Coin Rush started. ${energyCost} Energy used. Score only, no wallet coins awarded.`,
      energyCost,
      energyAfter,
    };
  });
}
